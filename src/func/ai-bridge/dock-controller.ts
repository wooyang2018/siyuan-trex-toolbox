/**
 * Dock 控制器
 *
 * 把原 initDock 闭包内的所有运行时状态封装成 class，
 * 按职责分组（媒体加载 / 拖拽 / 标签 / 提示词 / resize），
 * 统一通过 dispose() 清理监听器和定时器。
 */

import { showMessage } from 'siyuan';

import { buildDockLayout, type DockLayout } from './dock-layout';
import { injectTextToWebview } from './inject-text';

// ===== 与 index.tsx 共享的接口（避免循环依赖） =====

export interface AIBridgeUrl { name: string; url: string; }

export interface PromptPreset {
    id: string;
    icon: string;
    name: string;
    template: string;
}

export interface DockConfig {
    urls: AIBridgeUrl[];
    activeIndex: number;
    prompts: PromptPreset[];
    promptBarOpen: boolean;
}

/** 由调用方注入的副作用：避免本文件直接耦合 plugin/IO 层 */
export interface DockDeps {
    /** 解析提示词模板（替换 {{selection}} 等变量） */
    resolveTemplate: (template: string) => Promise<string>;
    /** 文本复制到剪贴板（带降级） */
    copyToClipboard: (text: string) => void;
    /** 从 DOM 节点提取思源块 ID */
    blockIdFromElement: (target: EventTarget | null) => string | null;
    /** 从 DataTransfer 提取思源块 ID */
    blockIdFromTransfer: (dt: DataTransfer | null) => string | null;
    /** 配置变更后持久化（用于 promptBarOpen / activeIndex 等 dock 内部修改） */
    saveConfig: () => void;
    /** 是否使用 webview（Electron 桌面端）；否则使用 iframe */
    useWebview: boolean;
    /** 获取块的 Markdown 内容（清理 IAL 后），失败时降级返回块 ID */
    fetchBlockContent: (blockId: string) => Promise<string>;
}

const BLOCK_ID_TEXT_TYPE = 'text/siyuan-block-id';

// ===== 控制器 =====

export class DockController {
    private dockEl: HTMLElement;
    private cfg: DockConfig;
    private deps: DockDeps;
    private layout!: DockLayout;

    // ── 媒体加载状态 ──
    private media: HTMLIFrameElement | any = null;
    private loadTimeout: ReturnType<typeof setTimeout> | null = null;
    private retryTimer: ReturnType<typeof setInterval> | null = null;
    private hasLoaded = false;
    private retrying = false;

    // ── 拖拽状态 ──
    private dragDepth = 0;
    private activeDragId: string | null = null;

    // ── 标签状态 ──
    private currentIdx: number;

    // ── resize / 边缘拖动状态 ──
    private ro: ResizeObserver | null = null;
    private resizeTimer: ReturnType<typeof setTimeout> | null = null;
    private edgeDrag = false;

    constructor(dockEl: HTMLElement, cfg: DockConfig, deps: DockDeps) {
        this.dockEl = dockEl;
        this.cfg = cfg;
        this.deps = deps;
        this.currentIdx = Math.min(cfg.activeIndex, cfg.urls.length - 1);
    }

    /** 入口：构建布局、绑定事件、启动加载 */
    mount(): void {
        this.dockEl.style.cssText =
            'width:100%;height:100%;min-width:200px;min-height:180px;overflow:hidden;' +
            'box-sizing:border-box;display:flex;flex-direction:column;' +
            'border:1px solid var(--b3-border-color);border-radius:4px;';

        this.layout = buildDockLayout(this.deps.useWebview);
        const { tabBar, promptBar, mediaContainer } = this.layout;
        this.dockEl.append(tabBar, promptBar, mediaContainer);

        this.bindPromptToggle();
        this.bindDropHint();
        this.bindGlobalDrag();
        this.bindResize();
        this.bindEdgeDrag();

        this.renderTabs();
        this.renderPromptBar();
        this.updateDropHint();
        this.createMedia();
    }

    /** 销毁：清理所有监听器、定时器、媒体元素 */
    dispose(): void {
        this.stopRetry();
        this.clearTimer('loadTimeout');
        this.clearTimer('resizeTimer');
        this.ro?.disconnect();
        this.ro = null;

        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('dragstart', this.onDragStart, false);
        document.removeEventListener('dragend', this.onDragEnd, true);

        const { mediaContainer } = this.layout;
        mediaContainer.removeEventListener('dragenter', this.onDragEnter);
        mediaContainer.removeEventListener('dragleave', this.onDragLeave);
        mediaContainer.removeEventListener('drop', this.onDrop);

        this.hideDrop();
        this.activeDragId = null;
        this.destroyMedia();
    }

    // ===== 工具 =====

    private getUrl(): string {
        const list = this.cfg.urls;
        return list[Math.min(this.currentIdx, list.length - 1)]?.url ?? '';
    }

    private clearTimer(key: 'loadTimeout' | 'resizeTimer'): void {
        const t = this[key];
        if (t) {
            clearTimeout(t);
            this[key] = null;
        }
    }

    // ===== 标签栏 =====

    private renderTabs = (): void => {
        const { tabBar } = this.layout;
        tabBar.innerHTML = '';
        if (this.cfg.urls.length <= 1) {
            tabBar.style.display = 'none';
            return;
        }
        tabBar.style.display = 'flex';
        this.cfg.urls.forEach((e, idx) => {
            const btn = document.createElement('button');
            const active = idx === this.currentIdx;
            btn.style.cssText =
                'flex:none;padding:4px 14px;border:none;border-bottom:2px solid transparent;' +
                'background:transparent;cursor:pointer;font-size:12px;white-space:nowrap;' +
                'color:var(--b3-theme-on-surface);' +
                (active ? 'border-bottom-color:var(--b3-theme-primary);color:var(--b3-theme-primary);font-weight:500;'
                        : 'opacity:0.6;');
            btn.textContent = e.name || e.url;
            btn.title = e.url;
            btn.addEventListener('click', () => this.switchTo(idx));
            tabBar.appendChild(btn);
        });
    };

    private switchTo(idx: number): void {
        if (idx === this.currentIdx && this.media) return;
        this.stopRetry();
        this.hasLoaded = false;
        this.clearTimer('loadTimeout');
        this.destroyMedia();
        this.currentIdx = idx;
        this.cfg.activeIndex = idx;
        this.renderTabs();
        this.createMedia();
    }

    // ===== 提示词栏 =====

    private updatePromptBarVisibility = (): void => {
        const open = this.cfg.promptBarOpen;
        const { chipsContainer, promptBar, toggleBtn } = this.layout;
        chipsContainer.style.display = open ? 'flex' : 'none';
        // 折叠时 promptBar 只剩 toggle 按钮，收紧高度
        promptBar.style.paddingBottom = open ? '3px' : '0';
        promptBar.style.paddingTop = open ? '3px' : '0';
        toggleBtn.textContent = open ? '▲' : '▼';
    };

    private renderPromptBar = (): void => {
        const { chipsContainer, promptBar } = this.layout;
        chipsContainer.innerHTML = '';

        if (this.cfg.prompts.length === 0) {
            promptBar.style.display = 'none';
            return;
        }
        promptBar.style.display = 'flex';

        this.cfg.prompts.forEach((preset) => {
            const chip = this.buildPromptChip(preset);
            chipsContainer.appendChild(chip);
        });

        this.updatePromptBarVisibility();
    };

    private buildPromptChip(preset: PromptPreset): HTMLButtonElement {
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
        chip.addEventListener('click', () => this.handlePromptClick(preset, chip));
        return chip;
    }

    private async handlePromptClick(preset: PromptPreset, chip: HTMLButtonElement): Promise<void> {
        if (!preset.template.trim()) {
            showMessage('该提示词模板为空', 1500, 'error');
            return;
        }

        chip.disabled = true;
        chip.style.opacity = '0.5';

        try {
            const resolved = await this.deps.resolveTemplate(preset.template);

            if (this.deps.useWebview && this.media) {
                // 使用 webview 中心坐标，以命中焦点区域
                const rect = (this.media as HTMLElement).getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const result = await injectTextToWebview(this.media, resolved, cx, cy);
                if (result === 'ok') {
                    showMessage(`✓ ${preset.name}`, 1500, 'info');
                } else {
                    this.deps.copyToClipboard(resolved);
                    showMessage('已复制到剪贴板，请在 AI 输入框粘贴', 2500, 'info');
                }
            } else {
                this.deps.copyToClipboard(resolved);
                showMessage('已复制到剪贴板，请在 AI 输入框粘贴', 2500, 'info');
            }
        } finally {
            chip.disabled = false;
            chip.style.opacity = '';
        }
    }

    private bindPromptToggle(): void {
        this.layout.toggleBtn.addEventListener('click', () => {
            this.cfg.promptBarOpen = !this.cfg.promptBarOpen;
            this.updatePromptBarVisibility();
            this.deps.saveConfig();
        });
    }

    // ===== 状态显示（等待 / 媒体）=====

    /**
     * 等待层用 position:absolute + z-index:10 覆盖在 media 上方；
     * 不对 media 做 display 切换，避免破坏 webview/iframe 的尺寸计算。
     *
     * 'waiting'：URL 未配置 / 加载失败重试中（搭配 startRetry 自动恢复）
     * 'media'  ：加载成功，揭开等待层显示底层 webview/iframe
     */
    private setOverlay(state: 'waiting' | 'media'): void {
        const { waitingEl } = this.layout;
        if (state === 'waiting') {
            waitingEl.querySelector<HTMLElement>('.ai-url')!.textContent = this.getUrl();
        }
        waitingEl.style.display = state === 'waiting' ? 'flex' : 'none';
    }

    // ===== 拖拽 =====

    /** 根据 useWebview 更新拖拽提示文案 */
    private updateDropHint = (): void => {
        const { dropHint } = this.layout;
        if (this.deps.useWebview) {
            dropHint.innerHTML =
                `<span style="font-size:22px;">📝</span>
                 <span>松开鼠标，将块内容插入光标处</span>
                 <span style="font-size:11px;opacity:0.7;">（自动获取块的 Markdown 内容，无需粘贴）</span>`;
        } else {
            dropHint.innerHTML =
                `<span style="font-size:22px;">📋</span>
                 <span>松开鼠标，块内容将复制到剪贴板</span>
                 <span style="font-size:11px;opacity:0.7;">在 AI 输入框中 Ctrl+V 粘贴即可</span>`;
        }
    };

    private showDrop = (): void => {
        if (!this.activeDragId) return;
        const { dropHint } = this.layout;
        dropHint.style.display = 'flex';
        dropHint.style.pointerEvents = 'auto';
    };

    private hideDrop = (): void => {
        this.dragDepth = 0;
        const { dropHint } = this.layout;
        dropHint.style.display = 'none';
        dropHint.style.pointerEvents = 'none';
        // 拖拽结束，恢复 webview/iframe 的指针事件
        if (this.media?.style) this.media.style.pointerEvents = 'auto';
    };

    private bindDropHint(): void {
        const { dropHint } = this.layout;

        dropHint.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        });

        dropHint.addEventListener('drop', async (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const blockId = this.activeDragId;
            this.hideDrop();
            this.activeDragId = null;
            if (!blockId) return;

            // 获取块的 Markdown 内容（参考 claude-note 实现）
            showMessage('正在获取块内容...', 1500, 'info');
            let textToInsert = blockId;
            try {
                textToInsert = await this.deps.fetchBlockContent(blockId);
            } catch {
                textToInsert = blockId; // 降级为块 ID
            }

            if (this.deps.useWebview && this.media) {
                const result = await injectTextToWebview(this.media, textToInsert, e.clientX, e.clientY);
                if (result === 'ok') {
                    showMessage('块内容已插入', 1500, 'info');
                } else {
                    this.deps.copyToClipboard(textToInsert);
                    showMessage('未找到输入框，已复制到剪贴板', 3000, 'info');
                }
            } else {
                this.deps.copyToClipboard(textToInsert);
                showMessage('已复制到剪贴板，在 AI 输入框粘贴即可', 3000, 'info');
            }
        });
    }

    private onDragStart = (e: DragEvent): void => {
        const id = this.deps.blockIdFromElement(e.target) ?? this.deps.blockIdFromTransfer(e.dataTransfer);
        if (!id || !e.dataTransfer) {
            this.activeDragId = null;
            return;
        }
        this.activeDragId = id;
        try {
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.setData(BLOCK_ID_TEXT_TYPE, id);
        } catch { /* ignore */ }
        // 拖拽期间禁用 webview/iframe 的指针事件
        // Electron webview 是独立嵌入窗口，z-index 无效，必须用 pointer-events:none
        // 才能让外层 DOM 接收到 dragenter/drop 事件
        if (this.media?.style) this.media.style.pointerEvents = 'none';
    };

    private onDragEnd = (): void => {
        this.activeDragId = null;
        this.hideDrop();
        // hideDrop 内已恢复 pointer-events
    };

    private onDragEnter = (): void => {
        if (!this.activeDragId) return;
        this.dragDepth++;
        this.showDrop();
    };

    private onDragLeave = (): void => {
        if (!this.activeDragId) return;
        this.dragDepth = Math.max(0, this.dragDepth - 1);
        if (this.dragDepth === 0) this.hideDrop();
    };

    private onDrop = (): void => {
        this.hideDrop();
        this.activeDragId = null;
    };

    private bindGlobalDrag(): void {
        document.addEventListener('dragstart', this.onDragStart, false);
        document.addEventListener('dragend', this.onDragEnd, true);
        const { mediaContainer } = this.layout;
        mediaContainer.addEventListener('dragenter', this.onDragEnter);
        mediaContainer.addEventListener('dragleave', this.onDragLeave);
        mediaContainer.addEventListener('drop', this.onDrop);
    }

    // ===== 媒体元素（webview / iframe）=====

    /**
     * 每 3 秒直接尝试重建媒体元素（由 webview/iframe 自身的 did-fail-load/onerror 处理失败），
     * 不再从父窗口发 fetch 探活，避免 ERR_CONNECTION_REFUSED 控制台噪音。
     */
    private startRetry(targetUrl: string): void {
        if (this.retryTimer || this.retrying) return;
        this.retrying = true;
        this.retryTimer = setInterval(() => {
            if (this.hasLoaded || targetUrl !== this.getUrl()) {
                this.stopRetry();
                return;
            }
            this.createMedia();
        }, 3000);
    }

    private stopRetry(): void {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
        this.retrying = false;
    }

    private addDragListeners(el: Element): void {
        el.addEventListener('dragenter', this.onDragEnter);
        el.addEventListener('dragleave', this.onDragLeave);
        el.addEventListener('drop', this.onDrop);
    }

    private removeDragListeners(el: Element): void {
        el.removeEventListener('dragenter', this.onDragEnter);
        el.removeEventListener('dragleave', this.onDragLeave);
        el.removeEventListener('drop', this.onDrop);
    }

    private destroyMedia(): void {
        if (!this.media) return;
        this.removeDragListeners(this.media);
        // iframe 重置 src；webview 不能设置 about:blank（Electron 异步 IPC 会抛 ERR_FAILED）
        if (!this.deps.useWebview) {
            try { (this.media as HTMLIFrameElement).src = 'about:blank'; } catch { /* ignore */ }
        } else {
            try { this.media.stop?.(); } catch { /* ignore */ }
        }
        this.media.remove();
        this.media = null;
    }

    private createMedia = (): void => {
        if (this.media) return;
        const url = this.getUrl();
        // URL 为空（配置缺失）时，显示等待层但不创建媒体；
        // 用户在设置面板填好地址后切换标签 / 重新启用模块即可恢复
        if (!url) {
            this.setOverlay('waiting');
            return;
        }
        this.setOverlay('waiting');

        // 直接创建媒体元素；加载失败由 did-fail-load/onerror/loadTimeout 处理
        // （不再做 checkAvailable 前置预检，避免多余的 favicon 请求）
        // 加载失败的统一处理：先销毁媒体元素再显示等待界面。
        // webview 是 Electron OS 级嵌入窗口，任何 HTML 覆盖层都会被它遮挡，
        // 必须先 destroyMedia() 把它从 DOM 移除，setOverlay('waiting') 才可见。
        let loaded = false;

        const onFail = () => {
            this.clearTimer('loadTimeout');
            this.hasLoaded = false;
            this.destroyMedia();
            this.setOverlay('waiting');
            this.startRetry(url);
        };

        const onLoadSuccess = () => {
            loaded = true;
            this.hasLoaded = true;
            this.clearTimer('loadTimeout');
            this.stopRetry();
            this.setOverlay('media');
        };

        const { mediaContainer } = this.layout;

        if (this.deps.useWebview) {
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
            this.addDragListeners(wv);
            this.media = wv;
            mediaContainer.appendChild(wv);

            this.loadTimeout = setTimeout(() => {
                if (!loaded && this.media) onFail();
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
            this.addDragListeners(fr);
            this.media = fr;
            mediaContainer.appendChild(fr);

            this.loadTimeout = setTimeout(() => {
                if (!loaded && this.media) onFail();
            }, 5000);
        }
    };

    // ===== Resize / 边缘拖动 =====

    /**
     * dock 尺寸变化或边缘拖动期间，临时禁用 media 的指针事件，
     * 否则 webview/iframe 会吞掉 mousemove，导致拖动卡顿。
     */
    private suspendMediaPointer(): void {
        if (this.media?.style) this.media.style.pointerEvents = 'none';
        this.clearTimer('resizeTimer');
        this.resizeTimer = setTimeout(() => {
            this.resizeTimer = null;
            if (this.media?.style) this.media.style.pointerEvents = 'auto';
        }, 200);
    }

    private bindResize(): void {
        this.ro = new ResizeObserver(() => this.suspendMediaPointer());
        this.ro.observe(this.dockEl);
    }

    private onMouseUp = (): void => {
        if (!this.edgeDrag) return;
        this.edgeDrag = false;
        this.suspendMediaPointer();
    };

    private bindEdgeDrag(): void {
        this.dockEl.addEventListener('mousedown', (e: MouseEvent) => {
            const r = this.dockEl.getBoundingClientRect();
            const th = 5;
            if (e.clientX <= r.left + th || e.clientX >= r.right - th ||
                e.clientY <= r.top + th  || e.clientY >= r.bottom - th) {
                this.edgeDrag = true;
                if (this.media?.style) this.media.style.pointerEvents = 'none';
            }
        });
        document.addEventListener('mouseup', this.onMouseUp);
    }
}
