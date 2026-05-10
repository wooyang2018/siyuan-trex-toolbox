/**
 * Dock 布局 DOM 构建（无状态，纯构建）
 *
 * 职责：创建并返回 dock 所需的全部 DOM 元素。
 * 不修改任何状态，不 append 到 document，不绑定事件。
 */

export interface DockLayout {
    tabBar: HTMLDivElement;
    promptBar: HTMLDivElement;
    chipsContainer: HTMLDivElement;
    toggleBtn: HTMLButtonElement;
    mediaContainer: HTMLDivElement;
    dropHint: HTMLDivElement;
    waitingEl: HTMLDivElement;
}

export function buildDockLayout(useWebview: boolean): DockLayout {
    // 等待层基础定位样式
    const overlayBase =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'flex-direction:column;align-items:center;justify-content:center;padding:20px;' +
        'text-align:center;color:var(--b3-theme-on-surface);' +
        'background-color:var(--b3-theme-background);z-index:';

    // 等待层 SVG 图标（info 圆圈）
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

    // ── 等待容器（z-index:10，URL 未配置或加载失败时显示）──
    const waitingEl = document.createElement('div');
    waitingEl.style.cssText = 'display:flex;' + overlayBase + '10;';
    waitingEl.innerHTML = infoIcon + `
        <div style="font-size:16px;font-weight:500;margin-bottom:8px;">请先启动 AI Agent Web</div>
        <div style="font-size:14px;opacity:0.7;margin-bottom:16px;">等待服务启动中...</div>
        <div class="ai-url" style="font-size:12px;opacity:0.5;font-family:monospace;word-break:break-all;"></div>`;

    mediaContainer.append(waitingEl, dropHint);

    return { tabBar, promptBar, chipsContainer, toggleBtn, mediaContainer, dropHint, waitingEl };
}
