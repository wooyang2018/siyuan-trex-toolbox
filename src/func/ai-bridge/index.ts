/**
 * AI Bridge 模块
 * @description 在侧边栏嵌入 AI Agent 网页（iframe），支持拖拽思源块 ID 到 AI 网页输入框
 */
import type FMiscPlugin from "@/index";

// ===== 常量 =====
const DOCK_TYPE = 'ai-agent-bridge-dock';
const DOCK_HOTKEY = '⌥⌘A';
const BLOCK_ID_TEXT_TYPE = 'text/siyuan-block-id';
const BLOCK_ID_PATTERN = /\b\d{14}-[0-9a-z]{7}\b/i;

// ===== 模块元数据 =====
export const name = 'AIBridge';
export let enabled = false;

export const declareToggleEnabled = {
    title: '🤖 AI 助手侧边栏',
    description: '在侧边栏嵌入 AI Agent 网页，支持拖拽块 ID 到 AI 网页输入框',
    defaultEnabled: false,
};

// ===== 模块配置 =====
const config = {
    openCodeUrl: 'http://localhost:4096',
};

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'ai-bridge',
    title: 'AI 助手侧边栏',
    items: [
        {
            key: 'openCodeUrl',
            type: 'textinput',
            title: 'AI Agent Web URL',
            description: '要嵌入的 AI Agent 网页地址（修改后需重新开关模块生效）',
            get: () => config.openCodeUrl,
            set: (value: string) => { config.openCodeUrl = value; },
        } as IConfigItem<string>,
    ],
    load: (itemValues?: Record<string, any>) => {
        if (itemValues) Object.assign(config, itemValues);
    },
    dump: () => ({ ...config }),
};

// ===== 辅助函数 =====
const extractBlockIdFromText = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const matched = value.match(BLOCK_ID_PATTERN);
    return matched ? matched[0] : null;
};

const getBlockIdFromElement = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null;
    const blockEl = target.closest('[data-node-id]');
    return blockEl?.getAttribute('data-node-id') ?? null;
};

const getBlockIdFromDataTransfer = (dataTransfer: DataTransfer | null): string | null => {
    if (!dataTransfer) return null;

    const preferredTypes = [
        BLOCK_ID_TEXT_TYPE,
        'application/x-siyuan-node-id',
        'application/x-siyuan-block-id',
        'text/plain',
        'text/uri-list',
        'text/html',
    ];

    for (const type of preferredTypes) {
        try {
            const blockId = extractBlockIdFromText(dataTransfer.getData(type));
            if (blockId) return blockId;
        } catch (error) {
            console.debug('[AI Bridge] Failed reading drag data type:', type, error);
        }
    }

    return null;
};

// ===== 模块状态 =====
let plugin_: FMiscPlugin | null = null;
let dockCleanup: (() => void) | null = null;

// ===== 生命周期 =====
export function load(plugin: FMiscPlugin) {
    if (enabled) return;
    enabled = true;
    plugin_ = plugin;
    createDock(plugin);
}

export function unload(_plugin?: FMiscPlugin) {
    if (!enabled) return;
    enabled = false;
    dockCleanup?.();
    dockCleanup = null;
    plugin_ = null;
}

// ===== Dock 创建 =====
function createDock(plugin: FMiscPlugin) {
    plugin.addDock({
        config: {
            position: 'RightTop',
            size: { width: 300, height: 0 },
            icon: 'iconAI',
            title: 'AI Agent',
            hotkey: DOCK_HOTKEY,
            show: true,
        },
        data: null,
        type: DOCK_TYPE,
        init(dock: any) {
            dock.element.style.cssText = 'width:100%;height:100%;min-width:200px;min-height:180px;overflow:hidden;position:relative;box-sizing:border-box;border:1px solid var(--b3-border-color);border-radius:4px;';

            // 拖拽提示层
            const dropHint = document.createElement('div');
            dropHint.className = 'ai-bridge-drop-hint';
            dropHint.style.cssText = 'display:none;position:absolute;inset:0;pointer-events:none;z-index:12;border:2px dashed var(--b3-theme-primary);border-radius:4px;background:color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);color:var(--b3-theme-primary);font-size:14px;font-weight:500;align-items:center;justify-content:center;text-align:center;padding:16px;box-sizing:border-box;';
            dropHint.textContent = '将块拖拽至网页输入框以粘贴块 ID';

            // 等待容器
            const waitingContainer = document.createElement('div');
            waitingContainer.className = 'ai-bridge-waiting';
            waitingContainer.style.cssText = 'display:flex;position:absolute;top:0;left:0;width:100%;height:100%;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;color:var(--b3-theme-on-surface);background-color:var(--b3-theme-background);z-index:10;';
            waitingContainer.innerHTML = `
                <svg style="width:48px;height:48px;margin-bottom:16px;opacity:0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <div style="font-size:16px;font-weight:500;margin-bottom:8px;">请先启动 AI Agent Web</div>
                <div style="font-size:14px;opacity:0.7;margin-bottom:16px;">等待 AI Agent Web 服务启动中...</div>
                <div class="ai-bridge-url" style="font-size:12px;opacity:0.5;font-family:monospace;word-break:break-all;"></div>
            `;

            // 错误容器
            const errorContainer = document.createElement('div');
            errorContainer.className = 'ai-bridge-error';
            errorContainer.style.cssText = 'display:none;position:absolute;top:0;left:0;width:100%;height:100%;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;color:var(--b3-theme-on-surface);background-color:var(--b3-theme-background);z-index:11;';

            const retryButton = document.createElement('button');
            retryButton.className = 'b3-button b3-button--outline';
            retryButton.style.marginTop = '16px';
            retryButton.textContent = '重试';

            errorContainer.innerHTML = `
                <svg style="width:48px;height:48px;margin-bottom:16px;opacity:0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <div style="font-size:16px;font-weight:500;margin-bottom:8px;">页面加载失败</div>
                <div style="font-size:14px;opacity:0.7;margin-bottom:16px;">请检查 AI Agent Web URL 是否正确，或服务是否已启动</div>
                <div class="ai-bridge-url" style="font-size:12px;opacity:0.5;font-family:monospace;word-break:break-all;margin-bottom:16px;"></div>
            `;
            errorContainer.appendChild(retryButton);

            dock.element.appendChild(waitingContainer);
            dock.element.appendChild(errorContainer);
            dock.element.appendChild(dropHint);

            // ===== 内部状态 =====
            let iframe: HTMLIFrameElement | null = null;
            let loadTimeout: ReturnType<typeof setTimeout> | null = null;
            let retryInterval: ReturnType<typeof setInterval> | null = null;
            let hasLoaded = false;
            let isRetrying = false;
            let dockDragDepth = 0;
            let activeDragBlockId: string | null = null;

            // ===== 状态切换 =====
            const showWaiting = () => {
                if (iframe) iframe.style.display = 'none';
                const urlEl = waitingContainer.querySelector('.ai-bridge-url');
                if (urlEl) urlEl.textContent = config.openCodeUrl;
                waitingContainer.style.display = 'flex';
                errorContainer.style.display = 'none';
            };

            const showError = () => {
                if (iframe) iframe.style.display = 'none';
                waitingContainer.style.display = 'none';
                const urlEl = errorContainer.querySelector('.ai-bridge-url');
                if (urlEl) urlEl.textContent = config.openCodeUrl;
                errorContainer.style.display = 'flex';
            };

            const showIframe = () => {
                if (iframe) {
                    iframe.style.display = 'block';
                    waitingContainer.style.display = 'none';
                    errorContainer.style.display = 'none';
                }
            };

            // ===== 拖拽提示 =====
            const showDropHint = () => {
                if (!activeDragBlockId) return;
                dropHint.style.display = 'flex';
            };

            const hideDropHint = () => {
                dockDragDepth = 0;
                dropHint.style.display = 'none';
            };

            // ===== 拖拽事件处理 =====
            const handleGlobalDragStart = (event: DragEvent) => {
                const blockId = getBlockIdFromElement(event.target) ?? getBlockIdFromDataTransfer(event.dataTransfer);
                if (!blockId || !event.dataTransfer) {
                    activeDragBlockId = null;
                    return;
                }
                activeDragBlockId = blockId;
                try {
                    event.dataTransfer.setData('text/plain', blockId);
                    event.dataTransfer.setData(BLOCK_ID_TEXT_TYPE, blockId);
                } catch (error) {
                    console.warn('[AI Bridge] Failed to enrich drag data:', error);
                }
            };

            const handleGlobalDragEnd = () => {
                activeDragBlockId = null;
                hideDropHint();
            };

            const handleDockDragEnter = () => {
                if (!activeDragBlockId) return;
                dockDragDepth += 1;
                showDropHint();
            };

            const handleDockDragLeave = () => {
                if (!activeDragBlockId) return;
                dockDragDepth = Math.max(0, dockDragDepth - 1);
                if (dockDragDepth === 0) hideDropHint();
            };

            const handleDockDrop = () => {
                hideDropHint();
                activeDragBlockId = null;
            };

            // ===== 服务可用性检测 =====
            const checkServiceAvailable = (): Promise<boolean> => {
                return new Promise((resolve) => {
                    const img = new Image();
                    const timeout = setTimeout(() => {
                        img.src = '';
                        resolve(false);
                    }, 2000);

                    img.onload = () => {
                        clearTimeout(timeout);
                        resolve(true);
                    };

                    img.onerror = () => {
                        clearTimeout(timeout);
                        // 图片加载失败可能是 CORS/404，用 fetch HEAD 再确认一次
                        fetch(config.openCodeUrl, {
                            method: 'HEAD',
                            mode: 'no-cors',
                            cache: 'no-cache',
                        }).then(() => resolve(true)).catch(() => resolve(false));
                    };

                    img.src = `${config.openCodeUrl}/favicon.ico?_t=${Date.now()}`;
                });
            };

            // ===== 重试机制 =====
            const startRetry = () => {
                if (retryInterval || isRetrying) return;
                isRetrying = true;

                retryInterval = setInterval(() => {
                    if (hasLoaded) {
                        if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
                        isRetrying = false;
                        return;
                    }

                    checkServiceAvailable().then((available) => {
                        if (available && !hasLoaded) {
                            if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
                            isRetrying = false;
                            hasLoaded = false;
                            if (iframe) {
                                iframe.removeEventListener('dragenter', handleDockDragEnter);
                                iframe.removeEventListener('dragleave', handleDockDragLeave);
                                iframe.removeEventListener('drop', handleDockDrop);
                                iframe.remove();
                                iframe = null;
                            }
                            createIframe();
                        }
                    });
                }, 3000);
            };

            // ===== iframe 创建 =====
            const createIframe = () => {
                if (iframe) return;
                showWaiting();

                checkServiceAvailable().then((available) => {
                    if (!available) {
                        showError();
                        startRetry();
                        return;
                    }

                    iframe = document.createElement('iframe');
                    iframe.src = config.openCodeUrl;
                    iframe.style.cssText = 'width:100%;height:100%;border:none;display:none;pointer-events:auto;will-change:auto;position:relative;z-index:0;';
                    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
                    iframe.addEventListener('dragenter', handleDockDragEnter);
                    iframe.addEventListener('dragleave', handleDockDragLeave);
                    iframe.addEventListener('drop', handleDockDrop);

                    let iframeLoaded = false;

                    iframe.onload = () => {
                        iframeLoaded = true;
                        hasLoaded = true;
                        if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
                        if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
                        isRetrying = false;
                        showIframe();
                    };

                    iframe.onerror = () => {
                        hasLoaded = false;
                        if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
                        showError();
                        startRetry();
                    };

                    dock.element.appendChild(iframe);

                    loadTimeout = setTimeout(() => {
                        if (!iframeLoaded && iframe) {
                            showError();
                            startRetry();
                        }
                    }, 5000);
                });
            };

            // ===== 重试按钮 =====
            retryButton.addEventListener('click', () => {
                if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
                isRetrying = false;
                hasLoaded = false;
                if (iframe) {
                    iframe.removeEventListener('dragenter', handleDockDragEnter);
                    iframe.removeEventListener('dragleave', handleDockDragLeave);
                    iframe.removeEventListener('drop', handleDockDrop);
                    iframe.remove();
                    iframe = null;
                }
                createIframe();
            });

            // ===== ResizeObserver 性能优化 =====
            let resizeTimer: ReturnType<typeof setTimeout> | null = null;
            let isResizing = false;

            const handleResizeStart = () => {
                if (!iframe?.style) return;
                if (!isResizing) {
                    isResizing = true;
                    iframe.style.pointerEvents = 'none';
                    iframe.style.willChange = 'auto';
                }
            };

            const handleResizeEnd = () => {
                if (!iframe?.style) return;
                isResizing = false;
                if (resizeTimer) clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    if (iframe?.style) {
                        iframe.style.pointerEvents = 'auto';
                        iframe.style.willChange = 'auto';
                    }
                }, 150);
            };

            const resizeObserver = new ResizeObserver(() => {
                handleResizeStart();
                if (resizeTimer) clearTimeout(resizeTimer);
                resizeTimer = setTimeout(handleResizeEnd, 100);
            });

            resizeObserver.observe(dock.element);

            // 边缘拖拽检测
            let isDragging = false;
            const handleMouseUp = () => {
                if (isDragging) {
                    isDragging = false;
                    handleResizeEnd();
                }
            };

            dock.element.addEventListener('mousedown', (e: MouseEvent) => {
                const rect = dock.element.getBoundingClientRect();
                const edgeThreshold = 5;
                const isNearEdge =
                    e.clientX <= rect.left + edgeThreshold ||
                    e.clientX >= rect.right - edgeThreshold ||
                    e.clientY <= rect.top + edgeThreshold ||
                    e.clientY >= rect.bottom - edgeThreshold;
                if (isNearEdge) {
                    isDragging = true;
                    handleResizeStart();
                }
            });

            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('dragstart', handleGlobalDragStart, true);
            document.addEventListener('dragend', handleGlobalDragEnd, true);
            dock.element.addEventListener('dragenter', handleDockDragEnter);
            dock.element.addEventListener('dragleave', handleDockDragLeave);
            dock.element.addEventListener('drop', handleDockDrop);

            // ===== 统一清理 =====
            const cleanup = () => {
                if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
                if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
                if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
                resizeObserver.disconnect();
                document.removeEventListener('mouseup', handleMouseUp);
                document.removeEventListener('dragstart', handleGlobalDragStart, true);
                document.removeEventListener('dragend', handleGlobalDragEnd, true);
                dock.element.removeEventListener('dragenter', handleDockDragEnter);
                dock.element.removeEventListener('dragleave', handleDockDragLeave);
                dock.element.removeEventListener('drop', handleDockDrop);
                hideDropHint();
                activeDragBlockId = null;
                if (iframe) {
                    iframe.removeEventListener('dragenter', handleDockDragEnter);
                    iframe.removeEventListener('dragleave', handleDockDragLeave);
                    iframe.removeEventListener('drop', handleDockDrop);
                    iframe.src = 'about:blank';
                    iframe.remove();
                    iframe = null;
                }
            };

            (dock.element as any).__aiBridgeCleanup = cleanup;
            dockCleanup = cleanup;

            // 立即开始检测并加载
            createIframe();
        },

        destroy() {
            const cleanup = (this as any)?.element?.__aiBridgeCleanup;
            if (typeof cleanup === 'function') cleanup();
            console.log('[AI Bridge] dock destroyed');
        },
    });

    plugin.addCommandV2({
        langKey: 'openAIAgentDock',
        langText: '打开 AI 助手侧边栏',
        hotkey: DOCK_HOTKEY,
        callback: () => { /* dock 面板通过热键由思源自动管理 */ },
    });
}
