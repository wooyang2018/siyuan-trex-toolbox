/**
 * 文档工具模块
 * 提供文档管理相关的工具功能
 */
import type FMiscPlugin from "@/index";
import { getActiveDoc, openBlock, thisPlugin } from "@frostime/siyuan-plugin-kits";
import { getBlockByID, moveDocsByID } from "@frostime/siyuan-plugin-kits/api";
import { floatingContainer } from "@/libs/components/floating-container";

export let name: string = "InboxFunctions";
export let enabled: boolean = false;

export const category: SettingCategory = 'document';
export const declareSetting = {
    title: '文档工具',
    description: '一些文档管理相关的工具',
    toggle: { defaultEnabled: false }
};

interface DocInfo {
    id: string;
    title?: string;
    content?: string;
    path?: string;
}

/**
 * 文档项选择管理器
 * 提供文档选择、展示和批量操作功能
 */
const useDocItemSelection = () => {
    const selectedFiletreeItems = new Set<{ id: string; name: string }>();

    let containerDisposer: {
        dispose: () => void;
        container?: HTMLElement;
        containerBody?: HTMLElement;
    } | null = null;
    let panelElement: HTMLElement | null = null;

    let eventListeners: Array<{
        element: HTMLElement;
        type: string;
        listener: EventListener;
    }> = [];

    /**
     * 添加事件监听器并记录，以便后续清理
     */
    const addEventListenerWithCleanup = (
        element: HTMLElement,
        type: string,
        listener: EventListener
    ) => {
        element.addEventListener(type, listener);
        eventListeners.push({ element, type, listener });
    };

    /**
     * 清理所有事件监听器
     */
    const cleanupEventListeners = () => {
        eventListeners.forEach(({ element, type, listener }) => {
            element.removeEventListener(type, listener);
        });
        eventListeners = [];
    };

    /**
     * 创建浮动容器
     */
    const createContainer = () => {
        if (containerDisposer) return;

        panelElement = document.createElement('div');
        panelElement.className = 'trex-toolbox-fileitem-selection-panel b3-menu';
        Object.assign(panelElement.style, {
            maxHeight: '300px',
            overflowY: 'auto',
            minWidth: '250px',
            position: 'relative'
        });

        containerDisposer = floatingContainer({
            element: panelElement,
            initialPosition: { x: window.innerWidth - 300, y: window.innerHeight - 350 },
            title: "文档移动缓存区",
            style: {
                "min-width": "250px",
                "max-height": "400px",
                "border-radius": "var(--b3-border-radius-b)",
                "box-shadow": "var(--b3-dialog-shadow)"
            },
            onClose: () => disposeContainer()
        });
    };

    /**
     * 销毁容器和清理资源
     */
    const disposeContainer = () => {
        if (containerDisposer) {
            cleanupEventListeners();
            containerDisposer.dispose();
            containerDisposer = null;
            panelElement = null;
        }
    };

    /**
     * 创建顶部操作按钮
     */
    const createActionButtons = () => {
        if (!panelElement) return;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'trex-toolbox-action-buttons';
        Object.assign(buttonContainer.style, {
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '10px',
            padding: '5px',
            borderBottom: '1px solid var(--b3-border-color)'
        });

        const addCurrentButton = document.createElement('button');
        addCurrentButton.className = 'b3-button b3-button--outline';
        addCurrentButton.textContent = '加入当前文档';
        Object.assign(addCurrentButton.style, {
            fontSize: '12px',
            padding: '4px 8px',
            marginRight: '5px'
        });

        addEventListenerWithCleanup(addCurrentButton, 'click', async () => {
            try {
                const activeDocResult = await getActiveDoc();
                if (activeDocResult) {
                    const doc = await getBlockByID(activeDocResult);
                    selection.add({
                        id: doc.id,
                        name: doc.content || '未命名文档'
                    });
                }
            } catch (error) {
                console.error('获取当前文档失败:', error);
            }
        });

        const moveToCurrentButton = document.createElement('button');
        moveToCurrentButton.className = 'b3-button b3-button--outline';
        moveToCurrentButton.textContent = '移动到当前文档下';
        Object.assign(moveToCurrentButton.style, {
            fontSize: '12px',
            padding: '4px 8px'
        });

        addEventListenerWithCleanup(moveToCurrentButton, 'click', async () => {
            try {
                const activeDocResult = await getActiveDoc();
                if (activeDocResult && selectedFiletreeItems.size > 0) {
                    const doc = await getBlockByID(activeDocResult);
                    await moveDocsByID(Array.from(selectedFiletreeItems).map(i => i.id), doc.id);
                    selection.clear();
                }
            } catch (error) {
                console.error('移动文档失败:', error);
            }
        });

        buttonContainer.appendChild(addCurrentButton);
        buttonContainer.appendChild(moveToCurrentButton);

        if (panelElement.firstChild) {
            panelElement.insertBefore(buttonContainer, panelElement.firstChild);
        } else {
            panelElement.appendChild(buttonContainer);
        }
    };

    /**
     * 更新选择面板内容
     */
    const updateSelectionPanel = () => {
        if (selectedFiletreeItems.size === 0) {
            disposeContainer();
            return;
        }

        if (!containerDisposer || !panelElement) {
            createContainer();
        } else if (containerDisposer.container) {
            containerDisposer.container.style.display = 'block';
        }

        if (panelElement) {
            cleanupEventListeners();
            panelElement.innerHTML = '';
            createActionButtons();
        }

        selectedFiletreeItems.forEach(item => {
            if (!panelElement) return;

            const itemElement = document.createElement('div');
            itemElement.className = 'trex-toolbox-selection-item b3-menu__item';
            Object.assign(itemElement.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '5px'
            });

            const nameElement = document.createElement('span');
            nameElement.className = 'block-ref b3-menu__label popover__block';
            nameElement.dataset.id = item.id;
            nameElement.style.cursor = 'pointer';
            nameElement.textContent = item.name;

            addEventListenerWithCleanup(nameElement, 'click', () => {
                openBlock(item.id);
            });

            const removeButton = document.createElement('span');
            removeButton.className = 'trex-toolbox-selection-remove';
            removeButton.dataset.id = item.id;
            Object.assign(removeButton.style, {
                cursor: 'pointer',
                color: 'var(--b3-theme-on-surface)',
                marginLeft: '10px'
            });
            removeButton.textContent = '✕';

            addEventListenerWithCleanup(removeButton, 'click', () => {
                selectedFiletreeItems.forEach(i => {
                    if (i.id === item.id) {
                        selectedFiletreeItems.delete(i);
                    }
                });

                if (selectedFiletreeItems.size === 0) {
                    disposeContainer();
                } else {
                    updateSelectionPanel();
                }
            });

            itemElement.appendChild(nameElement);
            itemElement.appendChild(removeButton);
            panelElement.appendChild(itemElement);
        });
    };

    return {
        add: (item: { id: string; name: string }) => {
            const exists = Array.from(selectedFiletreeItems).some(i => i.id === item.id);
            if (exists) return;

            selectedFiletreeItems.add(item);
            updateSelectionPanel();
        },
        clear: () => {
            selectedFiletreeItems.clear();
            disposeContainer();
        },
        list: () => Array.from(selectedFiletreeItems),
        dispose: () => {
            disposeContainer();
        }
    };
};

const selection = useDocItemSelection();

let disposer1 = () => {};
let disposer2 = () => {};

export const load = (_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    const plugin = thisPlugin();

    disposer1 = plugin.registerEventbusHandler('open-menu-doctree', (detail) => {
        console.log(detail);
        if (detail.type === 'notebook') return;
        const elements = Array.from(detail.elements);
        const submenu = [
            {
                label: '添加到移动缓存区',
                icon: 'iconArrowDown',
                click: () => {
                    elements.forEach(ele => {
                        selection.add({
                            id: ele.dataset.nodeId,
                            name: (ele.querySelector('span.b3-list-item__text') as HTMLElement)?.innerText || ele.dataset.name
                        });
                    });
                }
            }
        ];
        if (elements.length === 1 && selection.list().length > 0) {
            const ele = elements[0];
            submenu.push({
                label: '移动到当前文档下',
                icon: 'iconMove',
                click: async () => {
                    await moveDocsByID(selection.list().map(i => i.id), ele.dataset.nodeId);
                    selection.clear();
                }
            });
        }
        detail.menu.addItem({
            label: '移动文档工具',
            icon: 'iconFile',
            submenu
        });
    });


    disposer2 = plugin.registerEventbusHandler('click-editortitleicon', (detail) => {
        console.log(detail);
        const docId = detail.data.rootID;
        const submenu = [
            {
                label: '添加到移动缓存区',
                icon: 'iconArrowDown',
                click: () => {
                    selection.add({
                        id: docId,
                        name: detail.data.name
                    });
                }
            }
        ];
        if (selection.list().length > 0) {
            submenu.push({
                label: '移动到当前文档下',
                icon: 'iconMove',
                click: async () => {
                    await moveDocsByID(selection.list().map(i => i.id), docId);
                    selection.clear();
                }
            });
        }
        detail.menu.addItem({
            label: '移动文档工具',
            icon: 'iconFile',
            submenu
        });
    });
};

export const unload = (_: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    selection.dispose();
    disposer1();
    disposer2();
    disposer1 = () => {};
    disposer2 = () => {};
};
