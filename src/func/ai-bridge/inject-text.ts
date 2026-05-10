/**
 * webview 文本注入
 *
 * 本文件包含两段运行在不同执行上下文的代码，由分隔线明确分开：
 *
 *   ┌─ 主进程上下文（普通模块代码） ──────────┐
 *   │  injectTextToWebview()                  │
 *   └─────────────────────────────────────────┘
 *                      ↓ webview.executeJavaScript(serialized)
 *   ┌─ webview 渲染进程上下文（被序列化注入） ┐
 *   │  injectTextScript()                     │
 *   └─────────────────────────────────────────┘
 */

// =====================================================================
//  ▼▼▼  以下函数运行在 webview 的隔离上下文中（通过 .toString() 序列化注入）
//  ▼▼▼  禁止：① 引用模块顶层任何 import / 变量；② 在主进程直接调用本函数
//  ▼▼▼  必须保持纯函数，所有依赖通过参数传入
// =====================================================================

/**
 * 注入脚本主体。返回 'point' / 'focused' / 'selector' / false。
 *
 * 三级定位策略（由精到粗）：
 *   1. 鼠标落点处元素（向上遍历最多 8 层父元素）
 *   2. 当前焦点元素
 *   3. 页面常用输入选择器兜底
 *
 * 文本插入策略：
 *   1. document.execCommand('insertText') —— 触发原生 input 事件，
 *      跨框架（React/Vue/SolidJS）兼容
 *   2. 降级：手动拼接 value + 派发 input/change 事件（仅 textarea/input）
 */
function injectTextScript(text: string, x: number, y: number): string | false {
    function isEditable(el: any): boolean {
        if (!el || el === document.body) return false;
        const tag = el.tagName;
        if (tag === 'TEXTAREA') return true;
        if (tag === 'INPUT' && !/checkbox|radio|button|submit|reset|file|image/i.test(el.type || '')) return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function insert(el: any): boolean {
        if (!isEditable(el)) return false;
        el.focus();
        // execCommand('insertText') 触发原生 input 事件，兼容所有前端框架
        const ok = document.execCommand('insertText', false, text);
        if (ok) return true;
        // execCommand 不可用时降级（textarea/input only）
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            const s = el.selectionStart ?? el.value.length;
            const e2 = el.selectionEnd ?? el.value.length;
            el.value = el.value.slice(0, s) + text + el.value.slice(e2);
            el.selectionStart = el.selectionEnd = s + text.length;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        return false;
    }

    // 1. 鼠标落点处元素（向上遍历，优先精确定位）
    let node: any = document.elementFromPoint(x, y);
    for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
        if (insert(node)) return 'point';
    }

    // 2. 当前焦点元素
    if (insert(document.activeElement)) return 'focused';

    // 3. 页面常用输入选择器（contenteditable 优先，现代 AI 工具多用富文本编辑器）
    const selectors = [
        '[contenteditable="true"]',
        'textarea',
        '[role="textbox"]',
        'input[type="text"]',
        'input:not([type])',
    ];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (insert(el)) return 'selector';
    }

    return false;
}

// =====================================================================
//  ▲▲▲  webview 隔离上下文代码到此结束
//  ▼▼▼  以下为主进程代码，可正常 import / 调用
// =====================================================================

/**
 * 向 webview 注入脚本，在光标/落点/常用选择器处插入文本。
 *
 * @param webview  Electron <webview> 元素（需有 executeJavaScript 方法）
 * @param text     要插入的文本
 * @param clientX  视口坐标 X（自动转换为 webview 内部坐标）
 * @param clientY  视口坐标 Y
 * @returns 'ok' 表示成功插入；'clipboard' 表示失败，调用方应降级到剪贴板
 */
export const injectTextToWebview = async (
    webview: any,
    text: string,
    clientX: number,
    clientY: number,
): Promise<'ok' | 'clipboard'> => {
    if (!webview || typeof webview.executeJavaScript !== 'function') return 'clipboard';

    const rect = (webview as HTMLElement).getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // execCommand('insertText') 是跨框架文本插入的标准做法：
    // - 同时兼容 textarea/input 和 contenteditable
    // - 会触发原生 beforeinput/input 事件，React/Vue/SolidJS 均能响应
    // - 比手动操作 DOM 节点更可靠
    //
    // 通过 IIFE 把参数烘焙进函数源码，注入后立即执行
    const script = `(${injectTextScript.toString()})(${JSON.stringify(text)}, ${x}, ${y})`;

    try {
        const result = await webview.executeJavaScript(script);
        return result ? 'ok' : 'clipboard';
    } catch (e) {
        console.warn('[AI Bridge] executeJavaScript failed:', e);
        return 'clipboard';
    }
};
