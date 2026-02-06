/**
 * Doc Context - 文档上下文导航
 * 
 * @description 提供文档上下文查看和导航功能，支持父子文档和同级文档切换
 * @author frostime
 */
import { createSignal, For, JSXElement, Match, onMount, Show, Switch } from 'solid-js';
import { render } from 'solid-js/web';
import { simpleDialog } from "@frostime/siyuan-plugin-kits";

import { type Dialog, openTab, showMessage, confirm } from "siyuan";
import { createDocWithMd, getBlockByID, listDocsByPath, request } from "@/api";
import { getActiveDoc, getNotebook } from '@frostime/siyuan-plugin-kits';
import type FMiscPlugin from '..';


const I18n = {
    name: '文档上下文',
    focus: '跳转聚焦到文档',
    parent: '上级文档',
    children: '子文档',
    siblings: '同级文档',
    no: '无'
} as const;

export let name: string = "DocContext";
export let enabled: boolean = false;

export const declareToggleEnabled = {
    title: '📑 文档上下文',
    description: '启用文档上下文功能',
    defaultEnabled: true
} as const;

const config = {
    parentChildCommand: true,
};

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "doc-context",
    title: "文档上下文",
    load: (itemValues: any) => {
        if (itemValues) {
            Object.assign(config, itemValues);
        }
    },
    dump: () => structuredClone(config),
    items: [
        {
            key: 'parentChildCommand',
            type: 'checkbox' as const,
            title: '启用切换父子文档快捷键',
            description: `开启后，使用快捷键 Ctrl+Shift+↑ 跳转到父文档，Ctrl+Shift+↓ 跳转到子文档<br/>。如果你想要换成别的快捷键，请自行更改 "文档上下文" 中 "父文档" 和 "子文档" 快捷键。`,
            get: () => config.parentChildCommand,
            set: (value: boolean) => {
                config.parentChildCommand = value;
            }
        }
    ]
};

/**
 * 获取父文档
 */
const getParentDocument = async (path: string): Promise<Block | null> => {
    const pathArr = path.split("/").filter(item => item);
    pathArr.pop();
    
    if (pathArr.length === 0) return null;
    
    const id = pathArr[pathArr.length - 1];
    return getBlockByID(id);
};

/**
 * 列出子文档
 */
const listChildDocs = async (doc: Block) => {
    const data = await listDocsByPath(doc.box, doc.path);
    return data?.files;
};

/**
 * 获取同级文档
 */
const getSibling = async (path: string, box: string) => {
    path = path.replace('.sy', '');
    const parts = path.split('/');

    if (parts.length > 0) {
        parts.pop();
    }

    const parentPath = parts.join('/') || '/';
    return await listChildDocs({ path: parentPath, box } as Block);
};

/**
 * 创建文档上下文数据
 */
const createContext = async (docId?: string) => {
    if (!docId) {
        docId = getActiveDoc();
        if (!docId) return null;
    }
    
    const doc = await getBlockByID(docId);
    let parent = await getParentDocument(doc.path);
    
    parent = parent ?? {
        box: doc.box,
        path: '/',
        hpath: ''
    } as Block;
    
    const [children, siblings] = await Promise.all([
        listChildDocs(doc),
        listChildDocs(parent)
    ]);

    const hpaths = doc.hpath.slice(1).split('/');
    const paths = doc.path.slice(1).split('/');
    
    const docPaths = hpaths.map((title, index) => ({
        title,
        id: paths[index],
    }));

    return { doc, parent, children, siblings, docPaths };
};


/**
 * 链接组件，用于文档导航
 */
const A = (props: { 
    id: string, 
    hightlight?: boolean, 
    children: any, 
    dialog: Dialog, 
    actions?: any, 
    updateDoc?: (docId: string) => void 
}) => {
    const open = (e: MouseEvent) => {
        if (e.altKey && props.updateDoc) {
            e.preventDefault();
            props.updateDoc(props.id);
            return;
        }

        openTab({
            app: plugin_?.app,
            doc: {
                id: props.id,
                action: props.actions
            }
        });
        props.dialog.destroy();
        
        const ele = document.querySelector(`div[data-node-id="${props.id}"]`);
        ele?.scrollIntoView();
    };

    return (
        <span 
            class="anchor" 
            data-id={props.id} 
            onClick={(e) => open(e)} 
            style={{
                outline: props?.hightlight ? 'solid var(--b3-theme-primary-light)' : 0,
                'font-weight': props?.hightlight ? 'bold' : 'inherit',
            }}
        >
            {props.children}
        </span>
    );
};

/**
 * 大纲组件
 */
const OutlineComponent = (props: { 
    docId: string, 
    dialog: Dialog, 
    updateDoc?: (docId: string) => void 
}) => {
    const [outline, setOutline] = createSignal([]);

    const iterate = (data) => {
        if (!data) return [];
        return data.map(item => ({
            depth: item.depth,
            name: item.name || item.content,
            id: item.id,
            children: item.count > 0 ? iterate(item.blocks ?? item.children) : []
        }));
    };

    const RenderItem = (propsRi: { items: any[] }) => (
        <ul style={{ "list-style-type": "disc", "margin": "0.5em 0" }}>
            <For each={propsRi.items}>
                {(item) => (
                    <li>
                        <A id={item.id} dialog={props.dialog} updateDoc={(docId) => props.updateDoc?.(docId)}>
                            <span innerHTML={item.name} />
                        </A>
                        <Show when={item.children.length > 0}>
                            <RenderItem items={item.children} />
                        </Show>
                    </li>
                )}
            </For>
        </ul>
    );

    onMount(async () => {
        const ans = await request('/api/outline/getDocOutline', {
            id: props.docId
        });
        setOutline(iterate(ans));
    });

    return (
        <Show when={outline().length > 0} fallback={<p>{I18n.no}</p>}>
            <div class="outline-container">
                <RenderItem items={outline()} />
            </div>
        </Show>
    );
};


const NavBar = (props: { initialDocId: string, currentDocId: string, onBack: () => void }) => {
    return (
        <div style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
            'margin-bottom': '10px',
            'padding': '5px',
            'background-color': 'var(--b3-theme-background-light)',
            'border-radius': '4px'
        }}>
            <div>
                <Switch>
                    <Match when={props.initialDocId !== props.currentDocId}>
                        <span style={{
                            'color': 'var(--b3-theme-on-surface)',
                            'font-size': '14px'
                        }}>查看其他文档的上下文</span>
                    </Match>
                    <Match when={props.initialDocId === props.currentDocId}>
                        <span style={{
                            'color': 'var(--b3-theme-on-surface)',
                            'font-size': '14px'
                        }}>Alt+点击文档链接, 查看其他文档的上下文</span>
                    </Match>
                </Switch>
            </div>
            {props.initialDocId !== props.currentDocId && (
                <button
                    class="b3-button b3-button--outline"
                    onClick={props.onBack}
                    style={{
                        'padding': '4px 8px',
                        'font-size': '12px'
                    }}
                >
                    <svg class="b3-button__icon" style={{
                        "margin-right": "4px"
                    }}>
                        <use href="#iconLeft"></use>
                    </svg>
                    返回初始文档
                </button>
            )}
        </div>
    );
};

const DocContextComponent = (props: {
    doc: Block, parent: Block, children: Block[], siblings: Block[], docPaths: any[], dialog: Dialog
}) => {
    // 保存初始文档ID
    const [initialDocId] = createSignal(props.doc.id);
    const [currentContext, setCurrentContext] = createSignal({
        doc: props.doc,
        parent: props.parent,
        children: props.children,
        siblings: props.siblings,
        docPaths: props.docPaths
    });

    const focus = () => {
        const dock = document.querySelector(`.dock__items>span[data-type="file"]`) as HTMLElement;
        const ele = document.querySelector('div.file-tree span[data-type="focus"]') as HTMLElement;
        if (!dock && !ele) return;
        if (dock && !dock.classList.contains('dock__item--active')) {
            dock.click();
        }
        if (ele) {
            ele.click();
        }
        props.dialog.destroy();
    };

    const newDoc = (hpath: string) => {
        confirm('确定?', `新建文档: ${hpath}`, async () => {
            const docId = await createDocWithMd(currentContext().doc.box, hpath, '');
            openTab({
                app: plugin_?.app,
                doc: {
                    id: docId
                }
            });
            props.dialog.destroy();
        });
    };

    const newChild = () => {
        const newPath = `${currentContext().doc.hpath}/Untitled`;
        console.log(newPath);
        newDoc(newPath);
    };

    const newSibling = () => {
        const newPath = `${currentContext().parent.hpath}/Untitled`;
        console.log(newPath);
        newDoc(newPath);
    };

    const HR = () => (
        <hr
            style={{
                margin: '5px 0'
            }}
        />
    );

    const DocList = (p: { docs: Block[] }) => (
        <Show when={p.docs.length > 0} fallback={<p>{I18n.no}</p>}>
            <ol>
                <For each={p.docs}>
                    {(item) => {
                        const hightlight = item.id === currentContext().doc.id;
                        return (
                            <li>
                                <A hightlight={hightlight} id={item.id} dialog={props.dialog} updateDoc={updateDoc}>
                                    {item.name.replace('.sy', '')}
                                </A>
                            </li>
                        );
                    }}
                </For>
            </ol>
        </Show>
    );

    const NewDocBtn = (props: { children: JSXElement, onClick: () => void }) => (
        <div
            style={{
                "text-align": "right", "font-size": "15px",
                display: 'flex', flex: 1,
            }}
        >
            <button
                class="b3-button"
                onclick={props.onClick}
                style={{
                    "margin-left": '10px',
                    'line-height': '17px'
                }}
            >
                {props.children}
            </button>
        </div>
    );

    const updateDoc = async (docId: string) => {
        const newContext = await createContext(docId);
        if (newContext) {
            setCurrentContext(newContext);
        }
    };

    const backToInitialDoc = async () => {
        const initialContext = await createContext(initialDocId());
        if (initialContext) {
            setCurrentContext(initialContext);
        }
    };

    return (
        <section class="doc-context item__readme b3-typography fn__flex-1" style="margin: 1em;">
            <NavBar
                initialDocId={initialDocId()}
                currentDocId={currentContext().doc.id}
                onBack={backToInitialDoc}
            />
            <p>🍞
                [{getNotebook(currentContext().doc.box).name}]
                {currentContext().docPaths.map((d) => {
                    return (<> / <A id={d.id.replace('.sy', '')} dialog={props.dialog} updateDoc={updateDoc}>{d.title}</A></>);
                })}
            </p>
            <p class="btn-focus" onClick={focus}>
                🎯 {I18n.focus}
            </p>

            <HR />

            <div style={{ display: 'flex', 'align-items': 'center' }}>
                <h4 style={{ flex: 2 }}>⬆️ {I18n.parent}</h4>
                <div style={{ flex: 1, 'margin-left': '10px' }}>
                    <Show when={currentContext().parent} fallback={<p>{I18n.no}</p>}>
                        <p><A id={currentContext().parent.id} dialog={props.dialog} updateDoc={updateDoc}>{currentContext().parent.content}</A></p>
                    </Show>
                </div>
            </div>

            <HR />

            <div style={{ display: 'flex', 'align-items': 'center' }}>
                <h4 style={{ flex: 2 }}>↔️ {I18n.siblings}</h4>
                <NewDocBtn onClick={newSibling}>📬 新建文档</NewDocBtn>
            </div>
            <DocList docs={currentContext().siblings} />

            <HR />

            <div style={{ display: 'flex', 'align-items': 'center' }}>
                <h4 style={{ flex: 2 }}>⬇️ {I18n.children}</h4>
                <NewDocBtn onClick={newChild}>📬 新建文档</NewDocBtn>
            </div>
            <DocList docs={currentContext().children} />

            <div style={{ display: 'flex', 'align-items': 'center' }}>
                <h4>📇 标题大纲</h4>
            </div>
            <OutlineComponent docId={currentContext().doc.id} dialog={props.dialog} updateDoc={updateDoc} />

        </section>
    );
};


let plugin_: FMiscPlugin;
const Keymap = '⌥S';

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin_ = plugin;
    plugin.addCommand({
        langKey: 'trex::doc-context',
        langText: `Trex-Toolbox ${I18n.name}`,
        hotkey: Keymap,
        callback: async () => {
            if (document.querySelector('.doc-context')) return;
            const context = await createContext();
            if (!context) {
                return;
            }

            const element = document.createElement('div');
            element.style.display = 'contents';
            const { dialog } = simpleDialog({
                title: I18n.name,
                ele: element,
                width: "1000px",
            });
            render(() => DocContextComponent({ ...context, dialog }), element);
            const container = dialog.element.querySelector('.b3-dialog__container') as HTMLElement;
            container.style.setProperty('max-width', '80%');
            container.style.setProperty('min-width', '40%');
            container.style.setProperty('max-height', '75%');
        }
    });

    let lastTriggered: Date = new Date();
    
    /**
     * 控制时间，如果 Action 间隔太短，就关掉中键的文档
     */
    const speedControl = () => {
        const now = new Date();
        let closeCurrentDoc = () => {};
        if ((now.getTime() - lastTriggered.getTime()) <= 1000) {
            const tab = document.querySelector("div.layout__wnd--active ul.layout-tab-bar>li.item--focus");
            const closeEle = tab.querySelector('span.item__close') as HTMLSpanElement;
            closeCurrentDoc = () => closeEle.click();
        }
        lastTriggered = now;
        return closeCurrentDoc;
    };

    const goToSibling = async (delta: -1 | 1) => {
        const docId = getActiveDoc();
        if (!docId) return;
        const doc = await getBlockByID(docId);
        const { path, box } = doc;

        const siblings: { id: string, path: string }[] = await getSibling(path, box);
        const index = siblings.findIndex(sibling => sibling.path === path);
        if ((delta < 0 && index === 0) || (delta > 0 && index === siblings.length - 1)) {
            showMessage(`跳转${delta < 0 ? '最后' : '第'}一篇文档`);
        }

        const postAction = speedControl();

        const newIndex = (index + delta + siblings.length) % siblings.length;
        openTab({
            app: plugin.app,
            doc: {
                id: siblings[newIndex].id
            }
        });
        postAction();
    };

    const goToParent = async () => {
        const docId = getActiveDoc();
        if (!docId) return;
        const doc = await getBlockByID(docId);
        const parent = await getParentDocument(doc.path);
        if (!parent) {
            showMessage('无父文档');
            return;
        }

        const postAction = speedControl();
        openTab({
            app: plugin.app,
            doc: {
                id: parent.id
            }
        });
        postAction();
    };

    const goToChild = async () => {
        const docId = getActiveDoc();
        if (!docId) return;

        const doc = await getBlockByID(docId);
        const children = await listChildDocs(doc);
        if (children.length === 0) {
            showMessage('无子文裆');
            return;
        }

        const postAction = speedControl();
        openTab({
            app: plugin.app,
            doc: {
                id: children[0].id
            }
        });
        postAction();
    };

    plugin.addCommand({
        langKey: 'trex::last-doc',
        langText: '上一篇文档',
        hotkey: '⌘←',
        callback: async () => goToSibling(-1)
    });
    plugin.addCommand({
        langKey: 'trex::next-doc',
        langText: '下一篇文档',
        hotkey: '⌘→',
        callback: async () => goToSibling(1)
    });

    if (config.parentChildCommand) {
        plugin.addCommand({
            langKey: 'trex::parent-doc',
            langText: '父文档',
            hotkey: '⌘⇧↑',
            callback: async () => goToParent()
        });
        plugin.addCommand({
            langKey: 'trex::child-doc',
            langText: '子文档',
            hotkey: '⌘⇧↓',
            callback: async () => goToChild()
        });
    }
};

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin_ = null;

    plugin.delCommand('trex::doc-context');
    plugin.delCommand('trex::last-doc');
    plugin.delCommand('trex::next-doc');
    plugin.delCommand('trex::parent-doc');
    plugin.delCommand('trex::child-doc');
}
