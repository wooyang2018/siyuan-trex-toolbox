/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-19 21:52:17
 * @FilePath     : /src/func/gpt/index.ts
 * @LastEditTime : 2025-08-23 15:42:57
 * @Description  :
 */
import type FMiscPlugin from "@/index";

import { openTab, openWindow, showMessage, getFrontend } from "siyuan";
import { inputDialog, openCustomTab, thisPlugin } from "@frostime/siyuan-plugin-kits";

import { render } from "solid-js/web";

import ChatSession from "./chat/ChatSession";
import { translateHotkey } from "@/libs/hotkey";
import * as setting from "./setting";
import { ISignalRef, useSignalRef } from "@frostime/solid-signal-ref";
import { id2block } from "./utils";

import * as persist from './persistence';
import { solidDialog } from "@/libs/dialog";
import HistoryList from "./chat/HistoryList";
import { globalMiscConfigs } from "./setting/store";
import { showMessageLog } from "./MessageLogger";

import * as openai from './openai';
import * as chatInDoc from './chat-in-doc';
import { MonitorTabUpdates } from "../shared-configs";

export { openai };

export const name = "GPT";
export let enabled = false;
export const declareToggleEnabled = {
    title: '🤖 ChatGPT',
    description: '使用GPT进行对话',
    defaultEnabled: false
} as const;
export const declareSettingPanel = [
    {
        key: 'GPT',
        title: '🤖 人工智能',
        element: setting.GlobalSetting
    }
] as const;

const attachSelectedText = async (): Promise<string> => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return '';
    }

    const range = selection.getRangeAt(0);
    const element = range?.startContainer.parentElement.closest('.protyle-wysiwyg');

    if (!element) return '';

    const nodes = element.querySelectorAll('.protyle-wysiwyg--select');
    if (nodes.length === 0) {
        const selectedText = selection.toString().trim();
        if (!selectedText) {
            return '';
        }
        return selectedText;
    }

    const blocksIds = Array.from(nodes).map((node: HTMLElement) => node.dataset.nodeId);
    const blocks: Block[] = await id2block(...blocksIds);
    const blocksMap = new Map(blocks.map(block => [block.id, block]));
    const sortedBlocks = blocksIds.map(id => blocksMap.get(id));
    const blockMarkdown = sortedBlocks.map((block) => block?.markdown || '');
    const content = blockMarkdown.join('\n\n').trim();
    return `\n\n${content}`;
}

let activeTabId: string | null = null;

const outsideInputs: Record<string, ISignalRef<string>> = {}

export const openChatTab = async (reuse: boolean = true, history?: IChatSessionHistory): Promise<void> => {

    const prompt = await attachSelectedText();
    let input: ISignalRef<string>;
    let tabId = 'gpt-chat' + new Date().getTime();
    if (reuse === true && activeTabId !== null) {
        tabId = activeTabId;
        input = outsideInputs[activeTabId];
        input.value = prompt;
    } else {
        activeTabId = tabId;
        input = useSignalRef(prompt);
        outsideInputs[activeTabId] = input;
    }
    let disposer = () => {};
    const tab = await openCustomTab({
        tabId: tabId,
        render: (container: HTMLElement) => {
            disposer = render(() => ChatSession({
                input: input,
                history: history,
                updateTitleCallback: (title: string) => {
                    if (!title) return;
                    if (title.length > 30) {
                        title = title.slice(0, 30);
                        title += '...';
                    }
                    const plugin = thisPlugin();
                    const tabs = plugin.getOpenedTab();
                    const tab = tabs[tabId];
                    if (tab && tab?.[0]) {
                        const id = tab[0].tab.id;
                        const ele = document.querySelector(`li.item[data-id="${id}"] .item__text`);
                        if (ele) {
                            (ele as HTMLElement).innerText = title;
                        }
                    }
                }
            }), container);
            const tabContainer: HTMLElement = container.closest('[data-id]');
            if (tabContainer) {
                Object.assign(tabContainer.style, {
                    overflowY: 'clip',
                    background: 'var(--chat-bg-color)',
                    containerType: 'inline-size'
                });
            }
        },
        beforeDestroy: () => {
            if (activeTabId === tabId) {
                activeTabId = null;
            }
            delete outsideInputs[tabId];
            disposer();
        },
        title: history?.title || '和 GPT 对话',
        icon: 'iconGithub',
        position: prompt.trim() ? 'right' : undefined
    });
    setTimeout(() => {
        if (!tab?.headElement) return;
        tab.headElement.classList.toggle('item--unupdate', false);
    }, 100);
}

const GPT_WINDOW_TYPE = "gpt-chat-window" as const;

const registerGlobalChat = (plugin: FMiscPlugin): void => {
    plugin.addTab({
        type: GPT_WINDOW_TYPE,
        init() {
            if (getFrontend() !== "desktop-window") {
                return;
            }
            const disposer = render(() => ChatSession({
                history: this.data.history,
                updateTitleCallback: (title: string) => {},
                uiStyle: {
                    maxWidth: '95%'
                }
            }), this.element);

            Object.assign((this.element as HTMLElement).style, {
                overflowY: 'clip',
                background: 'var(--chat-bg-color)',
                containerType: 'inline-size',
            });
            this.data.disposer = disposer;
        },
        destroy() {
            this.data.disposer?.();
        }
    });
};

export const openGptWindow = async (history?: IChatSessionHistory): Promise<void> => {
    const plugin = thisPlugin();
    const tab = openTab({
        app: plugin.app,
        custom: {
            icon: 'iconGithub',
            title: history?.title || 'GPT 对话',
            id: `${plugin.name}${GPT_WINDOW_TYPE}`,
            data: {
                history: history
            }
        },
    });

    openWindow({
        height: 720,
        width: 680,
        tab: await tab,
    });
};


export const useSyDocClickEvent = () => {
    let disposer = () => {};
    return {
        register: (): void => {
            const plugin = thisPlugin();
            disposer = plugin.registerOnClickDocIcon((detail) => {
                if (!detail.data.ial[persist.ATTR_GPT_EXPORT_DOC]) {
                    return;
                }
                const exportId = detail.data.ial[persist.ATTR_GPT_EXPORT_DOC];
                detail.menu.addItem({
                    label: '打开 GPT 记录',
                    icon: 'iconGithub',
                    click: async () => {
                        const history = await persist.getFromJson(exportId);
                        //@ts-ignore
                        if (!history || history?.code === 404) {
                            showMessage(`未找到 GPT 记录 ${exportId}`, 4000, 'error');
                            return;
                        }
                        openChatTab(false, history);
                    }
                })
            });
        },
        dispose: (): void => {
            disposer();
        }
    }
}

const clickEvent = useSyDocClickEvent();

const openUrl = async (e: CustomEvent<{ url: string }>): Promise<void> => {
    const urlObj = new URL(e.detail.url);
    const method = urlObj.pathname.split('/').pop();
    if (method === 'chat-session-history') {
        const historyId = urlObj.searchParams.get('historyId');
        const history = await persist.getFromJson(historyId);
        if (!history) {
            showMessage(`未找到 GPT 记录 ${historyId}`, 4000, 'error');
            return;
        }
        openChatTab(false, history);
    }
}


const addSVG = (plugin: FMiscPlugin): void => {
    if (document.querySelector('symbol#iconSendGpt')) return;
    const symbol = `<symbol id="iconSendGpt" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-slot="icon" class="size-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z"></path></symbol>
    <symbol version="1.1" id="iconSymbolAt" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 378.632 378.632" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M377.406,160.981c-5.083-48.911-31.093-92.52-73.184-122.854C259.004,5.538,200.457-6.936,147.603,4.807 C97.354,15.971,53.256,48.312,26.571,93.491C-0.122,138.731-7.098,192.982,7.436,242.39c7.832,26.66,21.729,51.712,40.15,72.51 c18.594,20.972,41.904,37.722,67.472,48.459c23.579,9.888,48.628,14.797,73.653,14.797c34.128-0.001,68.115-9.121,97.949-27.098 l-21.092-35.081c-40.578,24.451-90.887,28.029-134.652,9.66c-40.283-16.96-71.759-52.383-84.211-94.761 c-11.336-38.595-5.846-81.093,15.125-116.586c20.922-35.467,55.426-60.801,94.622-69.533c41.644-9.225,87.948,0.669,123.857,26.566 c32.502,23.394,52.497,56.769,56.363,93.907c2.515,23.979,0.31,42.891-6.526,56.226c-14.487,28.192-35.526,28.36-43.873,27.132 c-0.283-0.041-0.476-0.082-0.65-0.117c-2.396-3.709-2.091-17.489-1.974-23.473c0.044-2.332,0.084-4.572,0.084-6.664v-112.06h-31.349 c-3.998-3.278-8.225-6.251-12.674-8.921c-17.076-10.159-36.858-15.552-57.255-15.552c-29.078,0-56.408,10.597-76.896,29.824 c-32.537,30.543-42.63,80.689-24.551,122.023c8.578,19.62,23.065,35.901,41.876,47.066c17.611,10.434,38.182,15.972,59.47,15.972 c24.394,0,46.819-6.735,64.858-19.492c1.915-1.342,3.813-2.79,5.626-4.233c6.431,8.805,15.811,14.4,27.464,16.114 c16.149,2.408,32.299-0.259,46.784-7.668c16.453-8.419,29.715-22.311,39.439-41.271C377.209,219.346,380.778,193.46,377.406,160.981 z M242.33,224.538c-0.891,1.283-2.229,2.907-2.961,3.803c-0.599,0.778-1.151,1.46-1.643,2.073 c-3.868,4.982-8.597,9.48-14.113,13.374c-11.26,7.943-25.152,11.964-41.257,11.964c-28.968,0-53.462-14.75-63.846-38.544 c-11.258-25.69-5.071-56.854,15.035-75.692c12.7-11.95,30.538-18.784,48.911-18.784c13.028,0,25.56,3.375,36.268,9.788 c6.831,4.072,12.861,9.337,17.9,15.719c0.497,0.613,1.082,1.322,1.724,2.094c0.952,1.135,2.812,3.438,3.981,5.092V224.538z"></path> </g></symbol>
    `;
    plugin.addIcons(symbol);
}

let dockAdded = false;
const addDock = (plugin: FMiscPlugin): void => {
    if (dockAdded) return;
    dockAdded = true;
    let disposer = () => {};
    plugin.addDock({
        config: {
            position: 'RightBottom',
            size: {
                width: 300,
                height: null
            },
            icon: 'iconGithub',
            title: 'GPT侧边对话',
            hotkey: translateHotkey('Ctrl+Alt+L'),
        },
        data: {
        },
        type: 'fmisGPTChat',
        init(dock) {
            const container = dock.element;
            disposer = render(() => ChatSession({
                systemPrompt: 'You are a helpful assistant.',
                updateTitleCallback: (title: string) => {
                    if (!title) return;
                    if (title.length > 30) {
                        title = title.slice(0, 30);
                        title += '...';
                    }
                },
            }), container);
            Object.assign(container.style, {
                overflowY: 'clip',
                containerType: 'inline-size'
            });
        },
        destroy() {
            disposer();
        }
    })
}

export const load = async (plugin: FMiscPlugin): Promise<void> => {
    if (enabled) return;
    enabled = true;

    registerGlobalChat(plugin);

    plugin.registerMenuTopMenu('gpt', [{
        label: '新建GPT对话',
        icon: 'iconGithub',
        click: () => {
            openChatTab(false);
        },
        submenu: [
            {
                label: '打开GPT窗口',
                icon: 'iconGithub',
                click: () => {
                    openGptWindow();
                }
            },
        ]
    },
    {
        label: 'GPT对话记录',
        icon: 'iconGithub',
        click: () => {
            const { close } = solidDialog({
                title: '历史记录',
                loader: () => (
                    HistoryList({
                        close: () => close(),
                        onclick: (history: IChatSessionHistory) => {
                            openChatTab(false, history);
                        }
                    })
                ),
                width: '1000px',
                height: '640px'
            });
        },
        submenu: [
            {
                label: '查看消息控制台日志',
                icon: 'iconGithub',
                click: () => {
                    showMessageLog();
                }
            },
            {
                'label': '导入Google AI Studio',
                icon: 'iconGithub',
                click: () => {
                    persist.importChatHistoryFile('google-ai-studio');
                }
            },
            {
                'label': '导入Aizex Claude',
                icon: 'iconGithub',
                click: () => {
                    persist.importChatHistoryFile('aizex-claude');
                }
            },
            {
                label: '导入Aizex GPT',
                icon: 'iconGithub',
                click: () => {
                    persist.importChatHistoryFile('aizex-gpt');
                }
            },
            {
                label: '导入Cherry Studio',
                icon: 'iconGithub',
                click: () => {
                    persist.importChatHistoryFile('cherry-studio');
                }
            },
            {
                label: '导入Markdown文本',
                icon: 'iconEdit',
                click: () => {
                    inputDialog({
                        title: '输入符合格式要求的Markdown文本',
                        defaultText: '',
                        type: 'textarea',
                        confirm: (text) => {
                            const result = persist.parseMarkdownToChatHistory(text);
                            if (!result) {
                                showMessage('解析失败');
                                return;
                            }
                            openChatTab(false, result);
                        },
                        width: '1000px',
                        height: '720px',
                    });
                }
            }
        ]
    }]);

    plugin.addCommand({
        langKey: 'open-gpt-chat',
        langText: '打开GPT对话',
        hotkey: translateHotkey('Ctrl+Shift+L'),
        callback: () => {
            openChatTab(true);
        }
    });
    plugin.addCommand({
        langKey: 'open-gpt-chat-window',
        langText: '打开独立的GPT对话窗口',
        hotkey: translateHotkey('Shift+Alt+C'),
        globalCallback: () => {
            openGptWindow();
        }
    });
    setting.load(plugin).then(() => {
        if (globalMiscConfigs().pinChatDock) {
            addDock(plugin);
        }
    })
    clickEvent.register();

    plugin.eventBus.on('open-siyuan-url-plugin', openUrl);

    addSVG(plugin);

    // 初始化文档内对话功能
    chatInDoc.init();

    await persist.restoreCache();
    await persist.updateCacheFile();
    window.addEventListener('beforeunload', persist.updateCacheFile);

    globalThis.fmisc['gpt'] = {
        complete: openai.complete
    }

    MonitorTabUpdates(['GPT对话消息日志'])
}

export const unload = async (plugin: FMiscPlugin): Promise<void> => {
    if (!enabled) return;
    enabled = false;
    clickEvent.dispose();
    plugin.eventBus.off('open-siyuan-url-plugin', openUrl);

    chatInDoc.destroy();

    await persist.updateCacheFile();
    window.removeEventListener('beforeunload', persist.updateCacheFile)

    globalThis.fmisc && delete globalThis.fmisc['gpt']
}