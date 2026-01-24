import { getMarkdown } from "@frostime/siyuan-plugin-kits";
import { getBlockByID } from "@frostime/siyuan-plugin-kits";


const FocusDocProvider: CustomContextProvider = {
    name: "FocusDoc",
    icon: 'iconFile',
    displayTitle: "当前文档",
    description: "当前编辑器聚焦的文档",
    getContextItems: async (options?: any): Promise<ContextItem[]> => {
        const tabs = document.querySelectorAll(`div[data-type="wnd"] ul.layout-tab-bar>li.item--focus`);
        if (!tabs || tabs.length === 0) {
            return [];
        }
        const docIds = Array.from(tabs)
            .map(tab => {
                const dataId = tab.getAttribute("data-id");
                if (dataId) {
                    const activeTab = document.querySelector(`.layout-tab-container.fn__flex-1>div.protyle[data-id="${dataId}"]`);
                    if (activeTab) {
                        const eleTitle = activeTab.querySelector(".protyle-title");
                        const docId = eleTitle?.getAttribute("data-node-id");
                        return docId || null;
                    }
                }
                return null;
            })
            .filter(Boolean);


        const parseTab = async (docId: string): Promise<ContextItem> => {
            const doc = await getBlockByID(docId);
            const content = await getMarkdown(docId);
            return {
                name: doc.content,
                description: `文档: ${doc.hpath}`,
                content: content,
            };
        };

        const contextItems: ContextItem[] = [];
        for (const docId of docIds) {
            const contextItem = await parseTab(docId);
            if (contextItem) {
                contextItems.push(contextItem);
            }
        }
        return contextItems;
    },
};


const OpenedDocProvider: CustomContextProvider = {
    name: "OpenedDoc",
    icon: 'iconFile',
    displayTitle: "打开文档",
    description: "当前编辑器中打开的文档",
    "type": "submenu",
    getContextItems: async (options: {
        selected: ContextSubmenuItem[];
    }): Promise<ContextItem[]> => {

        const parseItem = async (item: ContextSubmenuItem): Promise<ContextItem> => {
            const content = await getMarkdown(item.id);
            return {
                name: item.title,
                description: `文档: ${item.description}`,
                content: content,
            };
        };

        const contextItems: ContextItem[] = [];
        for (const item of options.selected) {
            const contextItem = await parseItem(item);
            if (contextItem) {
                contextItems.push(contextItem);
            }
        }
        return contextItems;
    },
    loadSubmenuItems: async (args: any): Promise<ContextSubmenuItem[]> => {
        const tabs = document.querySelectorAll(`div[data-type="wnd"] ul.layout-tab-bar>li.item:not(.item--readonly)`);
        if (!tabs || tabs.length === 0) {
            return [];
        }
        const items: ContextSubmenuItem[] = [];

        for (const tab of tabs) {
            const dataId = tab.getAttribute("data-id");
            if (dataId) {
                const activeTab = document.querySelector(`.layout-tab-container div.protyle[data-id="${dataId}"]`);
                if (activeTab) {
                    const eleTitle = activeTab.querySelector(".protyle-title");
                    const docId = eleTitle?.getAttribute("data-node-id");
                    if (docId) {
                        const block = await getBlockByID(docId);
                        items.push({
                            id: docId,
                            title: (tab.querySelector('span.item__text') as HTMLElement).innerText,
                            description: block.hpath
                        })
                    }
                }
            }
        }
        return items;
    }
};

export {
    FocusDocProvider,
    OpenedDocProvider
};
