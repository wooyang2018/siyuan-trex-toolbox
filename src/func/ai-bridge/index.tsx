/**
 * AI Bridge 模块
 * @description 在侧边栏嵌入 AI Agent 网页，支持多 URL 切换、拖拽块 ID 直接插入网页输入框、提示词预设
 */
import type FMiscPlugin from "@/index";
import { For, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import Form from "@/libs/components/Form";
import { showMessage } from "siyuan";
import { getBlockByID } from "@/api";
import { getActiveDoc } from "@frostime/siyuan-plugin-kits";

// ===== 类型 =====
interface AIBridgeUrl { name: string; url: string; }

interface PromptPreset {
    id: string;
    icon: string;
    name: string;
    template: string;
}

interface DockLayout {
    tabBar: HTMLDivElement;
    promptBar: HTMLDivElement;
    chipsContainer: HTMLDivElement;
    toggleBtn: HTMLButtonElement;
    mediaContainer: HTMLDivElement;
    dropHint: HTMLDivElement;
    waitingEl: HTMLDivElement;
    errorEl: HTMLDivElement;
    retryBtn: HTMLButtonElement;
}

// ===== 常量 =====
const DOCK_TYPE = 'ai-agent-bridge-dock';
const BLOCK_ID_TEXT_TYPE = 'text/siyuan-block-id';
const BLOCK_ID_PATTERN = /\b\d{14}-[0-9a-z]{7}\b/i;
const CONFIG_STORAGE_NAME = 'ai-bridge-config.json';

const DEFAULT_PROMPTS: PromptPreset[] = [
    { id: 'translate', icon: '🌐', name: '翻译',
      template: '请将以下内容翻译成中文：\n\n{{selection}}' },
    { id: 'research', icon: '🔬', name: 'Research & Summarize',
      template: 'Please research and summarize the following topic:\n\n{{selection}}' },
    { id: 'diagram', icon: '📊', name: 'Generate Diagram',
      template: 'Please generate a Mermaid diagram to illustrate:\n\n{{selection}}' },
    { id: 'polish', icon: '✨', name: '润色',
      template: '请润色以下内容，使其更加流畅自然：\n\n{{selection}}' },
];

// ===== 模块元数据 =====
export const name = 'AIBridge';
export let enabled = false;

export const declareToggleEnabled = {
    title: '🤖 AI 助手侧边栏',
    description: '在侧边栏嵌入 AI Agent 网页，支持多地址切换、拖拽块 ID 到 AI 输入框、提示词预设',
    defaultEnabled: false,
};

// ===== 模块配置 =====
const config = {
    urls: [{ name: 'OpenCode', url: 'http://localhost:4096' }] as AIBridgeUrl[],
    activeIndex: 0,
    prompts: [...DEFAULT_PROMPTS] as PromptPreset[],
    promptBarOpen: true,
};

// ===== 辅助：提取块 ID =====
const extractBlockId = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const m = value.match(BLOCK_ID_PATTERN);
    return m ? m[0] : null;
};

const blockIdFromElement = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null;
    return target.closest('[data-node-id]')?.getAttribute('data-node-id') ?? null;
};

const blockIdFromTransfer = (dt: DataTransfer | null): string | null => {
    if (!dt) return null;
    for (const t of [BLOCK_ID_TEXT_TYPE, 'application/x-siyuan-node-id',
                     'application/x-siyuan-block-id', 'text/plain', 'text/uri-list', 'text/html']) {
        try { const id = extractBlockId(dt.getData(t)); if (id) return id; } catch {}
    }
    return null;
};

// ===== 辅助：剪贴板降级 =====
const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {
        const ta = Object.assign(document.createElement('textarea'),
            { value: text, style: 'position:fixed;top:-9999px;left:-9999px;' });
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        ta.remove();
    });
};

// ===== 辅助：Electron webview 检测 =====
const isElectronEnv = (): boolean => /electron/i.test(navigator.userAgent);

/**
 * 向 webview 注入脚本，在光标/落点/常用选择器处插入文本。
 */
const injectTextToWebview = async (
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
    const script = `
(function(){
    const text = ${JSON.stringify(text)};

    function isEditable(el) {
        if (!el || el === document.body) return false;
        const tag = el.tagName;
        if (tag === 'TEXTAREA') return true;
        if (tag === 'INPUT' && !/checkbox|radio|button|submit|reset|file|image/i.test(el.type || '')) return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function insert(el) {
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
            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            return true;
        }
        return false;
    }

    // 1. 鼠标落点处元素（向上遍历，优先精确定位）
    let node = document.elementFromPoint(${x}, ${y});
    for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
        if (insert(node)) return 'point';
    }

    // 2. 当前焦点元素
    if (insert(document.activeElement)) return 'focused';

    // 3. 页面常用输入选择器（contenteditable 优先，现代 AI 工具多用富文本编辑器）
    for (const sel of [
        '[contenteditable="true"]',
        'textarea',
        '[role="textbox"]',
        'input[type="text"]',
        'input:not([type])'
    ]) {
        const el = document.querySelector(sel);
        if (insert(el)) return 'selector';
    }

    return false;
})()`;

    try {
        const result = await webview.executeJavaScript(script);
        return result ? 'ok' : 'clipboard';
    } catch (e) {
        console.warn('[AI Bridge] executeJavaScript failed:', e);
        return 'clipboard';
    }
};

// ===== 辅助：模板变量解析 =====
/**
 * 解析提示词模板，替换以下变量：
 * - {{selection}} 当前选中文本
 * - {{docId}}     当前文档 ID
 * - {{docTitle}}  当前文档标题
 */
const resolveTemplate = async (template: string): Promise<string> => {
    let result = template;

    if (result.includes('{{selection}}')) {
        const sel = window.getSelection()?.toString() ?? '';
        result = result.replace(/\{\{selection\}\}/g, sel);
    }

    if (result.includes('{{docId}}') || result.includes('{{docTitle}}')) {
        const docId = getActiveDoc() ?? '';
        result = result.replace(/\{\{docId\}\}/g, docId);

        if (result.includes('{{docTitle}}')) {
            let title = '';
            if (docId) {
                try {
                    const doc = await getBlockByID(docId);
                    title = doc?.content ?? '';
                } catch { /* ignore */ }
            }
            result = result.replace(/\{\{docTitle\}\}/g, title);
        }
    }

    return result;
};

// ===== 模块状态 =====
let plugin_: FMiscPlugin | null = null;
let dockCleanup: (() => void) | null = null;

// ===== 配置持久化 =====
const saveConfig = async () => {
    if (!plugin_) return;
    await plugin_.saveData(CONFIG_STORAGE_NAME, {
        urls: config.urls,
        activeIndex: config.activeIndex,
        prompts: config.prompts,
        promptBarOpen: config.promptBarOpen,
    });
};

// ===== 设置面板 =====
function AIBridgeSettingPanel(): JSX.Element {
    // createStore 细粒度追踪：更新单个字段时 <For> 行不重建，焦点不会丢失
    const [urls, setUrls] = createStore<AIBridgeUrl[]>([...config.urls]);

    const syncUrlsAndSave = () => { config.urls = [...urls]; saveConfig(); };

    const handleUrlChange = (i: number, field: keyof AIBridgeUrl, v: string) => {
        setUrls(i, field, v); syncUrlsAndSave();
    };
    const handleUrlAdd = () => {
        setUrls(urls.length, { name: '', url: 'http://localhost:' });
        syncUrlsAndSave();
    };
    const handleUrlDelete = (i: number) => {
        if (urls.length <= 1) { showMessage('至少保留一个地址', 2000, 'error'); return; }
        setUrls(prev => prev.filter((_, idx) => idx !== i));
        if (config.activeIndex >= urls.length) config.activeIndex = urls.length - 1;
        syncUrlsAndSave();
    };

    // ── 提示词设置 ──
    const [prompts, setPrompts] = createStore<PromptPreset[]>([...config.prompts]);

    const syncPromptsAndSave = () => { config.prompts = [...prompts]; saveConfig(); };

    const handlePromptChange = (i: number, field: keyof PromptPreset, v: string) => {
        setPrompts(i, field, v); syncPromptsAndSave();
    };
    const handlePromptAdd = () => {
        setPrompts(prompts.length, {
            id: Date.now().toString(),
            icon: '💬', name: '', template: ''
        });
        syncPromptsAndSave();
    };
    const handlePromptDelete = (i: number) => {
        setPrompts(prev => prev.filter((_, idx) => idx !== i));
        syncPromptsAndSave();
    };
    const handleResetPrompts = () => {
        const defaults = DEFAULT_PROMPTS.map(p => ({ ...p }));
        setPrompts(defaults);
        config.prompts = [...defaults];
        saveConfig();
    };

    return (
        <div class="config__tab-container">
            {/* ── URL 列表 ── */}
            <Form.Wrap
                title="AI 网页地址列表"
                description="支持多个地址；有多个时 Dock 顶部显示标签栏切换（修改后需重新开关模块生效）"
                direction="row"
            >
                <For each={urls}>
                    {(entry, i) => (
                        <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
                            <Form.Input type="textinput" key={`name-${i()}`}
                                value={entry.name} placeholder="名称"
                                style={{ width: '100px' }} fn_size={false}
                                changed={(v) => handleUrlChange(i(), 'name', v)} />
                            <Form.Input type="textinput" key={`url-${i()}`}
                                value={entry.url} placeholder="http://localhost:4096"
                                style={{ width: '230px' }} fn_size={false}
                                changed={(v) => handleUrlChange(i(), 'url', v)} />
                            <button class="b3-button b3-button--outline"
                                style={{ padding: '2px 10px', height: '26px', 'flex-shrink': '0' }}
                                onClick={() => handleUrlDelete(i())}>删除</button>
                        </div>
                    )}
                </For>
                <button class="b3-button b3-button--outline"
                    style={{ 'margin-top': '2px', width: 'fit-content' }}
                    onClick={handleUrlAdd}>+ 添加地址</button>
            </Form.Wrap>

            {/* ── 提示词预设 ── */}
            <Form.Wrap
                title="提示词预设"
                description="点击侧边栏中的提示词芯片，模板内容会被解析后发送到 AI。支持变量：{{selection}} 当前选中文本、{{docTitle}} 文档标题、{{docId}} 文档 ID"
                direction="row"
            >
                <For each={prompts}>
                    {(entry, i) => (
                        <div style={{
                            display: 'flex', gap: '6px', 'align-items': 'flex-start',
                            'margin-bottom': '8px', 'padding-bottom': '8px',
                            'border-bottom': '1px dashed var(--b3-border-color)'
                        }}>
                            {/* 图标 */}
                            <Form.Input type="textinput" key={`picon-${i()}`}
                                value={entry.icon} placeholder="🔬"
                                style={{ width: '48px', 'text-align': 'center' }} fn_size={false}
                                changed={(v) => handlePromptChange(i(), 'icon', v)} />
                            {/* 名称 */}
                            <Form.Input type="textinput" key={`pname-${i()}`}
                                value={entry.name} placeholder="提示词名称"
                                style={{ width: '120px' }} fn_size={false}
                                changed={(v) => handlePromptChange(i(), 'name', v)} />
                            {/* 模板 */}
                            <textarea
                                style={{
                                    flex: '1',
                                    'min-height': '60px',
                                    'font-size': '12px',
                                    padding: '4px 6px',
                                    resize: 'vertical',
                                    background: 'var(--b3-theme-background)',
                                    color: 'var(--b3-theme-on-surface)',
                                    border: '1px solid var(--b3-border-color)',
                                    'border-radius': '4px',
                                    'line-height': '1.4',
                                    'font-family': 'var(--b3-font-family-code)',
                                }}
                                placeholder={"模板内容，支持 {{selection}} {{docTitle}} {{docId}}"}
                                value={entry.template}
                                onInput={(e) => handlePromptChange(i(), 'template', e.currentTarget.value)}
                            />
                            {/* 删除 */}
                            <button class="b3-button b3-button--outline"
                                style={{ padding: '2px 8px', height: '26px', 'flex-shrink': '0' }}
                                onClick={() => handlePromptDelete(i())}>删除</button>
                        </div>
                    )}
                </For>
                <div style={{ display: 'flex', gap: '8px', 'margin-top': '4px' }}>
                    <button class="b3-button b3-button--outline"
                        style={{ width: 'fit-content' }}
                        onClick={handlePromptAdd}>+ 添加提示词</button>
                    <button class="b3-button b3-button--outline"
                        style={{ width: 'fit-content', opacity: '0.7' }}
                        onClick={handleResetPrompts}>↺ 恢复默认</button>
                </div>
            </Form.Wrap>
        </div>
    );
}

// ===== 设置面板声明（独立 Tab）=====
export const declareSettingPanel: IFuncModule['declareSettingPanel'] = [{
    key: 'ai-bridge',
    title: '🤖 AI 助手',
    element: () => <AIBridgeSettingPanel />,
}];

// ===== 生命周期 =====
export function load(plugin: FMiscPlugin) {
    if (enabled) return;
    enabled = true;
    plugin_ = plugin;

    plugin.loadData(CONFIG_STORAGE_NAME).then((stored: any) => {
        if (stored) {
            if (Array.isArray(stored.urls)) config.urls = stored.urls;
            if (typeof stored.activeIndex === 'number') config.activeIndex = stored.activeIndex;
            if (Array.isArray(stored.prompts)) config.prompts = stored.prompts;
            if (typeof stored.promptBarOpen === 'boolean') config.promptBarOpen = stored.promptBarOpen;
        }
        if (!Array.isArray(config.urls) || !config.urls.length)
            config.urls = [{ name: 'OpenCode', url: 'http://localhost:4096' }];
        if (config.activeIndex >= config.urls.length) config.activeIndex = 0;
        if (!Array.isArray(config.prompts)) config.prompts = [...DEFAULT_PROMPTS];
        createDock(plugin);
    }).catch(() => createDock(plugin));
}

export function unload(_plugin?: FMiscPlugin) {
    if (!enabled) return;
    enabled = false;
    dockCleanup?.();
    dockCleanup = null;
    plugin_ = null;
}

// ===== DOM 构建 =====

/**
 * 创建并返回 dock 所需的全部 DOM 元素。
 * 不修改任何状态，不 append 到 document，仅负责构建。
 */
function buildDockLayout(useWebview: boolean): DockLayout {
    // 等待层与错误层共享的基础定位样式
    const overlayBase =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'flex-direction:column;align-items:center;justify-content:center;padding:20px;' +
        'text-align:center;color:var(--b3-theme-on-surface);' +
        'background-color:var(--b3-theme-background);z-index:';

    // 等待层与错误层共享的 SVG 图标（info 圆圈）
    const infoIcon =
        `<svg style="width:48px;height:48px;margin-bottom:16px;opacity:0.6;"` +
        ` viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">` +
        `<circle cx="12" cy="12" r="10"/>` +
        `<line x1="12" y1="8" x2="12" y2="12"/>` +
        `<line x1="12" y1="16" x2="12.01" y2="16"/>` +
        `</svg>`;

    // ── 标签栏 ──
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:none;flex:none;flex-wrap:nowrap;overflow-x:auto;' +
        'border-bottom:1px solid var(--b3-border-color);background:var(--b3-theme-surface);' +
        'min-height:30px;scrollbar-width:none;';

    // ── 提示词栏 ──
    const promptBar = document.createElement('div');
    promptBar.style.cssText =
        'flex:none;border-bottom:1px solid var(--b3-border-color);' +
        'background:var(--b3-theme-surface);' +
        'display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:3px 4px 3px 6px;';

    const chipsContainer = document.createElement('div');
    chipsContainer.style.cssText =
        'display:flex;flex-wrap:wrap;gap:4px;flex:1;align-items:center;';

    const toggleBtn = document.createElement('button');
    toggleBtn.style.cssText =
        'border:none;background:transparent;cursor:pointer;padding:1px 4px;' +
        'color:var(--b3-theme-on-surface);font-size:10px;opacity:0.4;line-height:1;' +
        'flex-shrink:0;margin-left:auto;';
    toggleBtn.title = '收起/展开提示词栏';

    promptBar.append(chipsContainer, toggleBtn);

    // ── 媒体容器 ──
    const mediaContainer = document.createElement('div');
    mediaContainer.style.cssText = 'flex:1;position:relative;overflow:hidden;min-height:0;';

    // ── 拖拽覆盖层 ──
    const dropHint = document.createElement('div');
    dropHint.style.cssText =
        'display:none;position:absolute;inset:0;pointer-events:none;z-index:12;' +
        'border:2px dashed var(--b3-theme-primary);border-radius:4px;' +
        'background:color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);' +
        'color:var(--b3-theme-primary);font-size:13px;font-weight:500;' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'text-align:center;gap:6px;padding:16px;box-sizing:border-box;';
    dropHint.innerHTML = useWebview
        ? `<span style="font-size:22px;">⌨️</span>
           <span>松开鼠标，将块 ID 插入光标处</span>
           <span style="font-size:11px;opacity:0.7;">（桌面端直接注入，无需粘贴）</span>`
        : `<span style="font-size:22px;">📋</span>
           <span>松开鼠标，块 ID 将复制到剪贴板</span>
           <span style="font-size:11px;opacity:0.7;">在 AI 输入框中 Ctrl+V 粘贴即可</span>`;

    // ── 等待容器（z-index:10，等待服务启动时显示）──
    const waitingEl = document.createElement('div');
    waitingEl.style.cssText = 'display:flex;' + overlayBase + '10;';
    waitingEl.innerHTML = infoIcon + `
        <div style="font-size:16px;font-weight:500;margin-bottom:8px;">请先启动 AI Agent Web</div>
        <div style="font-size:14px;opacity:0.7;margin-bottom:16px;">等待服务启动中...</div>
        <div class="ai-url" style="font-size:12px;opacity:0.5;font-family:monospace;word-break:break-all;"></div>`;

    // ── 错误容器（z-index:11，加载失败时显示）──
    const errorEl = document.createElement('div');
    errorEl.style.cssText = 'display:none;' + overlayBase + '11;';
    const retryBtn = document.createElement('button');
    retryBtn.className = 'b3-button b3-button--outline';
    retryBtn.style.marginTop = '16px';
    retryBtn.textContent = '重试';
    errorEl.innerHTML = infoIcon + `
        <div style="font-size:16px;font-weight:500;margin-bottom:8px;">页面加载失败</div>
        <div style="font-size:14px;opacity:0.7;margin-bottom:16px;">请检查 URL 是否正确或服务是否已启动</div>
        <div class="ai-url" style="font-size:12px;opacity:0.5;font-family:monospace;word-break:break-all;margin-bottom:16px;"></div>`;
    errorEl.appendChild(retryBtn);

    mediaContainer.append(waitingEl, errorEl, dropHint);

    return { tabBar, promptBar, chipsContainer, toggleBtn, mediaContainer, dropHint, waitingEl, errorEl, retryBtn };
}

// ===== Dock 初始化 =====

/**
 * 初始化 dock 根元素：构建布局、绑定所有事件、启动媒体加载。
 * 返回 cleanup 函数，销毁时调用以注销所有监听器和定时器。
 */
function initDock(dockEl: HTMLElement, useWebview: boolean): () => void {
    dockEl.style.cssText =
        'width:100%;height:100%;min-width:200px;min-height:180px;overflow:hidden;' +
        'box-sizing:border-box;display:flex;flex-direction:column;' +
        'border:1px solid var(--b3-border-color);border-radius:4px;';

    const { tabBar, promptBar, chipsContainer, toggleBtn, mediaContainer, dropHint, waitingEl, errorEl, retryBtn } =
        buildDockLayout(useWebview);

    dockEl.append(tabBar, promptBar, mediaContainer);

    // ── 运行状态 ──
    let media: HTMLIFrameElement | any = null;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let hasLoaded = false;
    let retrying = false;
    let dragDepth = 0;
    let activeDragId: string | null = null;
    let currentIdx = Math.min(config.activeIndex, config.urls.length - 1);

    const getUrl = () => config.urls[Math.min(currentIdx, config.urls.length - 1)]?.url ?? '';

    // ── 标签栏渲染 ──
    const renderTabs = () => {
        tabBar.innerHTML = '';
        if (config.urls.length <= 1) { tabBar.style.display = 'none'; return; }
        tabBar.style.display = 'flex';
        config.urls.forEach((e, idx) => {
            const btn = document.createElement('button');
            const active = idx === currentIdx;
            btn.style.cssText =
                'flex:none;padding:4px 14px;border:none;border-bottom:2px solid transparent;' +
                'background:transparent;cursor:pointer;font-size:12px;white-space:nowrap;' +
                'color:var(--b3-theme-on-surface);' +
                (active ? 'border-bottom-color:var(--b3-theme-primary);color:var(--b3-theme-primary);font-weight:500;'
                        : 'opacity:0.6;');
            btn.textContent = e.name || e.url;
            btn.title = e.url;
            btn.addEventListener('click', () => switchTo(idx));
            tabBar.appendChild(btn);
        });
    };

    // ── 提示词栏渲染 ──
    const updatePromptBarVisibility = () => {
        const open = config.promptBarOpen;
        chipsContainer.style.display = open ? 'flex' : 'none';
        // 折叠时 promptBar 只剩 toggle 按钮，收紧高度
        promptBar.style.paddingBottom = open ? '3px' : '0';
        promptBar.style.paddingTop = open ? '3px' : '0';
        toggleBtn.textContent = open ? '▲' : '▼';
    };

    const renderPromptBar = () => {
        chipsContainer.innerHTML = '';

        if (config.prompts.length === 0) {
            promptBar.style.display = 'none';
            return;
        }
        promptBar.style.display = 'flex';

        config.prompts.forEach((preset) => {
            const chip = document.createElement('button');
            chip.className = 'b3-button b3-button--outline';
            chip.style.cssText =
                'padding:1px 8px;font-size:11px;height:22px;line-height:1;' +
                'display:inline-flex;align-items:center;gap:3px;flex-shrink:0;cursor:pointer;';
            chip.title = preset.template;

            const iconSpan = document.createElement('span');
            iconSpan.textContent = preset.icon;
            iconSpan.style.fontSize = '12px';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = preset.name || preset.id;

            chip.append(iconSpan, nameSpan);

            chip.addEventListener('click', async () => {
                if (!preset.template.trim()) {
                    showMessage('该提示词模板为空', 1500, 'error');
                    return;
                }

                chip.disabled = true;
                chip.style.opacity = '0.5';

                try {
                    const resolved = await resolveTemplate(preset.template);

                    if (useWebview && media) {
                        // 使用 webview 中心坐标，以命中焦点区域
                        const rect = (media as HTMLElement).getBoundingClientRect();
                        const cx = rect.left + rect.width / 2;
                        const cy = rect.top + rect.height / 2;
                        const result = await injectTextToWebview(media, resolved, cx, cy);
                        if (result === 'ok') {
                            showMessage(`✓ ${preset.name}`, 1500, 'info');
                        } else {
                            copyToClipboard(resolved);
                            showMessage('已复制到剪贴板，请在 AI 输入框粘贴', 2500, 'info');
                        }
                    } else {
                        copyToClipboard(resolved);
                        showMessage('已复制到剪贴板，请在 AI 输入框粘贴', 2500, 'info');
                    }
                } finally {
                    chip.disabled = false;
                    chip.style.opacity = '';
                }
            });

            chipsContainer.appendChild(chip);
        });

        updatePromptBarVisibility();
    };

    toggleBtn.addEventListener('click', () => {
        config.promptBarOpen = !config.promptBarOpen;
        updatePromptBarVisibility();
        saveConfig();
    });

    // ── 状态显示 ──
    // 等待/错误层已用 position:absolute + z-index:10/11 覆盖在 media 上方
    // 不对 media 做 display 切换，避免破坏 webview/iframe 的尺寸计算
    const setOverlay = (state: 'waiting' | 'error' | 'media') => {
        const overlay = state === 'waiting' ? waitingEl : state === 'error' ? errorEl : null;
        if (overlay) overlay.querySelector<HTMLElement>('.ai-url')!.textContent = getUrl();
        waitingEl.style.display = state === 'waiting' ? 'flex' : 'none';
        errorEl.style.display   = state === 'error'   ? 'flex' : 'none';
    };

    // ── 拖拽覆盖层 ──
    const showDrop = () => {
        if (!activeDragId) return;
        dropHint.style.display = 'flex';
        dropHint.style.pointerEvents = 'auto';
    };
    const hideDrop = () => {
        dragDepth = 0;
        dropHint.style.display = 'none';
        dropHint.style.pointerEvents = 'none';
        // 拖拽结束，恢复 webview/iframe 的指针事件
        if (media?.style) media.style.pointerEvents = 'auto';
    };

    dropHint.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault(); e.stopPropagation();
    });

    dropHint.addEventListener('drop', async (e: DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        const blockId = activeDragId;
        hideDrop();
        activeDragId = null;
        if (!blockId) return;

        if (useWebview && media) {
            const result = await injectTextToWebview(media, blockId, e.clientX, e.clientY);
            if (result === 'ok') {
                showMessage('块 ID 已插入', 1500, 'info');
            } else {
                copyToClipboard(blockId);
                showMessage('未找到输入框，块 ID 已复制到剪贴板', 3000, 'info');
            }
        } else {
            copyToClipboard(blockId);
            showMessage('块 ID 已复制到剪贴板，在 AI 输入框粘贴即可', 3000, 'info');
        }
    });

    // ── 全局拖拽监听 ──
    const onDragStart = (e: DragEvent) => {
        const id = blockIdFromElement(e.target) ?? blockIdFromTransfer(e.dataTransfer);
        if (!id || !e.dataTransfer) { activeDragId = null; return; }
        activeDragId = id;
        try {
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.setData(BLOCK_ID_TEXT_TYPE, id);
        } catch {}
        // 拖拽期间禁用 webview/iframe 的指针事件
        // Electron webview 是独立嵌入窗口，z-index 无效，必须用 pointer-events:none
        // 才能让外层 DOM 接收到 dragenter/drop 事件
        if (media?.style) media.style.pointerEvents = 'none';
    };
    const onDragEnd = () => {
        activeDragId = null;
        hideDrop();
        // hideDrop 内已恢复 pointer-events
    };
    const onDragEnter = () => { if (!activeDragId) return; dragDepth++; showDrop(); };
    const onDragLeave = () => {
        if (!activeDragId) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) hideDrop();
    };
    const onDrop = () => { hideDrop(); activeDragId = null; };

    const stopRetry = () => {
        if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
        retrying = false;
    };
    // 每 3 秒直接尝试重建媒体元素（由 webview/iframe 自身的 did-fail-load/onerror 处理失败），
    // 不再从父窗口发 fetch 探活，避免 ERR_CONNECTION_REFUSED 控制台噪音。
    const startRetry = (targetUrl: string) => {
        if (retryTimer || retrying) return;
        retrying = true;
        retryTimer = setInterval(() => {
            if (hasLoaded || targetUrl !== getUrl()) { stopRetry(); return; }
            createMedia();
        }, 3000);
    };

    // ── 媒体元素销毁 ──
    const addDragListeners    = (el: Element) => { el.addEventListener('dragenter', onDragEnter); el.addEventListener('dragleave', onDragLeave); el.addEventListener('drop', onDrop); };
    const removeDragListeners = (el: Element) => { el.removeEventListener('dragenter', onDragEnter); el.removeEventListener('dragleave', onDragLeave); el.removeEventListener('drop', onDrop); };

    const destroyMedia = () => {
        if (!media) return;
        removeDragListeners(media);
        // iframe 重置 src；webview 不能设置 about:blank（Electron 异步 IPC 会抛 ERR_FAILED）
        if (!useWebview) { try { (media as HTMLIFrameElement).src = 'about:blank'; } catch {} }
        else { try { (media as Electron.WebviewTag).stop(); } catch {} }
        media.remove();
        media = null;
    };

    // ── 媒体元素创建 ──
    const createMedia = () => {
        if (media) return;
        const url = getUrl();
        if (!url) { setOverlay('error'); return; }
        setOverlay('waiting');

        // 直接创建媒体元素；加载失败由 did-fail-load/onerror/loadTimeout 处理
        // （不再做 checkAvailable 前置预检，避免多余的 favicon 请求）
        // 加载失败的统一处理：先销毁媒体元素再显示等待界面。
        // webview 是 Electron OS 级嵌入窗口，任何 HTML 覆盖层都会被它遮挡，
        // 必须先 destroyMedia() 把它从 DOM 移除，setOverlay('waiting') 才可见。
        const onFail = () => {
            if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
            hasLoaded = false;
            destroyMedia();
            setOverlay('waiting');
            startRetry(url);
        };
        const onLoadSuccess = () => {
            loaded = true; hasLoaded = true;
            if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
            stopRetry(); setOverlay('media');
        };

        let loaded = false;

        if (useWebview) {
            const wv = document.createElement('webview') as any;
            wv.src = url;
            wv.style.cssText =
                'position:absolute;top:0;left:0;right:0;bottom:0;border:none;z-index:0;';
            wv.setAttribute('allowpopups', '');

            wv.addEventListener('did-finish-load', onLoadSuccess);
            wv.addEventListener('did-fail-load', (e: any) => {
                if (e.errorCode === -3) return; // ERR_ABORTED，忽略
                onFail();
            });
            addDragListeners(wv);
            media = wv;
            mediaContainer.appendChild(wv);

            loadTimeout = setTimeout(() => {
                if (!loaded && media) onFail();
            }, 8000);

        } else {
            const fr = document.createElement('iframe');
            fr.src = url;
            fr.style.cssText =
                'position:absolute;top:0;left:0;right:0;bottom:0;border:none;' +
                'pointer-events:auto;z-index:0;';
            fr.setAttribute('allow', 'clipboard-read; clipboard-write');

            fr.onload = onLoadSuccess;
            fr.onerror = () => onFail();
            addDragListeners(fr);
            media = fr;
            mediaContainer.appendChild(fr);

            loadTimeout = setTimeout(() => {
                if (!loaded && media) onFail();
            }, 5000);
        }
    };

    // ── 切换标签 ──
    const switchTo = (idx: number) => {
        if (idx === currentIdx && media) return;
        stopRetry(); hasLoaded = false;
        if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
        destroyMedia();
        currentIdx = idx;
        config.activeIndex = idx;
        renderTabs();
        createMedia();
    };

    retryBtn.addEventListener('click', () => {
        stopRetry(); hasLoaded = false; destroyMedia(); createMedia();
    });

    // ── ResizeObserver ──
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
        if (media?.style) media.style.pointerEvents = 'none';
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            if (media?.style) media.style.pointerEvents = 'auto';
        }, 200);
    });
    ro.observe(dockEl);

    let edgeDrag = false;
    const onMouseUp = () => {
        if (!edgeDrag) return;
        edgeDrag = false;
        if (media?.style) media.style.pointerEvents = 'none';
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            if (media?.style) media.style.pointerEvents = 'auto';
        }, 200);
    };
    dockEl.addEventListener('mousedown', (e: MouseEvent) => {
        const r = dockEl.getBoundingClientRect(), th = 5;
        if (e.clientX <= r.left + th || e.clientX >= r.right - th ||
            e.clientY <= r.top + th  || e.clientY >= r.bottom - th) {
            edgeDrag = true;
            if (media?.style) media.style.pointerEvents = 'none';
        }
    });

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('dragstart', onDragStart, false);
    document.addEventListener('dragend', onDragEnd, true);
    mediaContainer.addEventListener('dragenter', onDragEnter);
    mediaContainer.addEventListener('dragleave', onDragLeave);
    mediaContainer.addEventListener('drop', onDrop);

    renderTabs();
    renderPromptBar();
    createMedia();

    // ── 清理 ──
    return () => {
        stopRetry();
        if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
        if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
        ro.disconnect();
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('dragstart', onDragStart, false);
        document.removeEventListener('dragend', onDragEnd, true);
        mediaContainer.removeEventListener('dragenter', onDragEnter);
        mediaContainer.removeEventListener('dragleave', onDragLeave);
        mediaContainer.removeEventListener('drop', onDrop);
        hideDrop(); activeDragId = null;
        destroyMedia();
    };
}

// ===== Dock =====
function createDock(plugin: FMiscPlugin) {
    const useWebview = isElectronEnv();

    plugin.addDock({
        config: {
            position: 'RightTop',
            size: { width: 300, height: 0 },
            icon: 'iconAI',
            title: 'AI Agent',
            show: true,
        },
        data: null,
        type: DOCK_TYPE,
        init(dock: any) {
            dockCleanup = initDock(dock.element, useWebview);
        },
        destroy() {
            dockCleanup?.();
            dockCleanup = null;
            console.log('[AI Bridge] dock destroyed');
        },
    });
}
