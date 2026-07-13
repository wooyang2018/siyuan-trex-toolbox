/**
 * AI Bridge 模块
 * @description 在侧边栏嵌入 AI Agent 网页，支持多 URL 切换、拖拽块内容插入网页输入框、提示词预设
 */
import type FMiscPlugin from "@/index";
import { For, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import Form from "@/libs/components/Form";
import { showMessage } from "siyuan";
import { getBlockByID, getBlockKramdown } from "@/api";
import { getActiveDoc } from "@frostime/siyuan-plugin-kits";

import { DockController, type DockConfig, type DockDeps, type AIBridgeUrl, type PromptPreset } from './dock-controller';

// ===== 常量 =====
const DOCK_TYPE = '-ai-bridge-dock';
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

export const category: SettingCategory = 'ai';
export const declareSetting = {
    title: 'AI 助手侧边栏',
    description: '在侧边栏嵌入 AI Agent 网页，支持多地址切换、拖拽块内容到 AI 输入框、提示词预设',
    toggle: { defaultEnabled: false },
    customPanel: () => <AIBridgeSettingPanel />,
};

// ===== 模块配置 =====
const config: DockConfig = {
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
        try { const id = extractBlockId(dt.getData(t)); if (id) return id; } catch { /* ignore */ }
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
        try { document.execCommand('copy'); } catch { /* ignore */ }
        ta.remove();
    });
};

// ===== 辅助：获取块内容（参考 claude-note 实现）=====
/**
 * 通过 block/getBlockKramdown API 获取块的 kramdown 内容，
 * 清理 IAL 属性标记后返回纯 Markdown 文本。
 * 失败或内容为空时降级返回块 ID。
 */
const fetchBlockContent = async (blockId: string): Promise<string> => {
    try {
        const result = await getBlockKramdown(blockId);
        const kramdown = result?.kramdown || '';
        if (!kramdown.trim()) return blockId;
        // 清理 IAL 属性标记 {: id="..." updated="..." ...}
        const cleaned = kramdown.replace(/\{:[^}]*\}/g, '').trim();
        return cleaned || blockId;
    } catch {
        return blockId;
    }
};

// ===== 辅助：Electron webview 检测 =====
const isElectronEnv = (): boolean => /electron/i.test(navigator.userAgent);

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
let dockController: DockController | null = null;

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
                            <Form.Input type="textarea" key={`ptemplate-${i()}`}
                                value={entry.template}
                                placeholder="模板内容，支持 {{selection}} {{docTitle}} {{docId}}"
                                style={{ flex: '1', 'min-height': '60px', 'font-size': '12px' }}
                                changed={(v) => handlePromptChange(i(), 'template', v)} />
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



// ===== Dock =====
function createDock(plugin: FMiscPlugin) {
    const useWebview = isElectronEnv();

    const deps: DockDeps = {
        resolveTemplate,
        copyToClipboard,
        blockIdFromElement,
        blockIdFromTransfer,
        saveConfig,
        useWebview,
        fetchBlockContent,
    };

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
            dockController = new DockController(dock.element, config, deps);
            dockController.mount();
        },
        destroy() {
            dockController?.dispose();
            dockController = null;
            console.log('[AI Bridge] dock destroyed');
        },
    });
}

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
    dockController?.dispose();
    dockController = null;
    plugin_ = null;
}
