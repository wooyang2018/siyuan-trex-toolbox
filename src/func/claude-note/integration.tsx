/**
 * Claude Note 模块集成
 * @description 负责 Claude Note 模块与主插件的集成
 */

import type { FMiscPlugin } from "./plugin-types";
import { createSignal, createEffect, For, type JSX } from "solid-js";
// import Form from "@/libs/components/Form"; // 暂时注释掉，避免路径问题
import { showMessage } from "siyuan";

import {
    createClaudeNote,
    quickNote,
    chatWithClaude,
    getNotes,
    updateNote,
    deleteNote,
    checkHealth,
    getStats,
    runClaude,
    listClaudeSessions,
    loadClaudeSessionMessages,
    deleteClaudeSession,
    renameClaudeSession,
    normalizeClaudeEvent,
    withErrorHandling
} from "./index";
import type { ClaudeNoteConfig, ClaudeNoteData, ClaudeResponse, ClaudeConversationContext } from "./types";
import { ClaudeNoteDockController } from "./dock";

// ===== 常量 =====
const DOCK_TYPE = '-claude-note-dock';
const CONFIG_STORAGE_NAME = 'claude-note-config.json';

// ===== 默认配置 =====
const defaultConfig: ClaudeNoteConfig = {
    quickNoteEnabled: true,
    defaultTemplate: 'default',
    apiConfig: {
        endpoint: 'https://api.anthropic.com',
        apiKey: '',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 4096,
        temperature: 0.7
    },
    customTemplates: [],
    autoSaveInterval: 30,
    syntaxHighlighting: true,
    defaultNotePath: '/Claude Notes'
};

// ===== 模块状态 =====
let pluginInstance: FMiscPlugin | null = null;
let dockController: ClaudeNoteDockController | null = null;
let currentConfig: ClaudeNoteConfig = { ...defaultConfig };

// ===== 配置持久化 =====
const saveConfig = async () => {
    if (!pluginInstance) return;
    await pluginInstance.saveData(CONFIG_STORAGE_NAME, currentConfig);
};

const loadConfig = async (): Promise<ClaudeNoteConfig> => {
    if (!pluginInstance) return { ...defaultConfig };

    try {
        const stored = await pluginInstance.loadData(CONFIG_STORAGE_NAME);
        if (stored) {
            return { ...defaultConfig, ...stored };
        }
    } catch (error) {
        console.warn('[ClaudeNote] 加载配置失败，使用默认配置:', error);
    }

    return { ...defaultConfig };
};

// ===== 停靠栏集成 =====
function createDock(plugin: FMiscPlugin) {
    const deps = {
        createNote: createClaudeNote,
        quickNote: quickNote,
        chatWithClaude: chatWithClaude,
        getNotes: getNotes,
        showMessage: showMessage
    };

    const dockConfig = {
        showQuickNotePanel: currentConfig.quickNoteEnabled,
        defaultTemplate: currentConfig.defaultTemplate,
        syntaxHighlighting: currentConfig.syntaxHighlighting || false,
        autoSaveInterval: currentConfig.autoSaveInterval || 30
    };

    plugin.addDock({
        config: {
            position: 'RightBottom',
            size: { width: 350, height: 500 },
            icon: 'iconAI',
            title: 'Claude Note',
            show: true,
        },
        data: null,
        type: DOCK_TYPE,
        init(dock: any) {
            dockController = new ClaudeNoteDockController(dock.element, dockConfig, deps);
            dockController.mount();
        },
        destroy() {
            dockController?.dispose();
            dockController = null;
            console.log('[ClaudeNote] dock destroyed');
        },
    });
}

// ===== 菜单项集成 =====
function registerMenuItems(plugin: FMiscPlugin) {
    // 注册顶部菜单项
    const menuItems = [
        {
            label: '📝 新建 Claude 笔记',
            icon: 'iconAI',
            click: async () => {
                const title = prompt('请输入笔记标题:', '新 Claude 笔记');
                if (title) {
                    await withErrorHandling(async () => {
                        await createClaudeNote(title);
                        showMessage(`Claude 笔记 "${title}" 创建成功`, 'success');
                    }, '创建 Claude 笔记');
                }
            }
        },
        {
            label: '🚀 快速笔记',
            icon: 'iconAI',
            click: async () => {
                const content = prompt('请输入笔记内容:');
                if (content) {
                    await withErrorHandling(async () => {
                        await quickNote(content);
                        showMessage('快速笔记创建成功', 'success');
                    }, '创建快速笔记');
                }
            }
        },
        {
            label: '🤖 与 Claude 对话',
            icon: 'iconAI',
            click: async () => {
                const message = prompt('请输入对话内容:');
                if (message) {
                    await withErrorHandling(async () => {
                        const response = await chatWithClaude(message);
                        showMessage(`Claude 回复: ${response.content.substring(0, 100)}...`, 'info');
                    }, '与 Claude 对话');
                }
            }
        },
        {
            label: '📊 模块状态',
            icon: 'iconSettings',
            click: async () => {
                await withErrorHandling(async () => {
                    const health = await checkHealth();
                    const stats = await getStats();

                    const message = `健康状态: ${health.isHealthy ? '✅' : '❌'}\n` +
                                  `配置有效: ${health.configValid ? '✅' : '❌'}\n` +
                                  `API 连接: ${health.services.api ? '✅' : '❌'}\n` +
                                  `笔记数量: ${stats.notesCreated}`;

                    showMessage(message, 'info');
                }, '检查模块状态');
            }
        }
    ];

    // 注册到主插件的自定义菜单系统
    plugin.registerMenuTopMenu('claude-note', menuItems);
}

// ===== 快捷键集成 =====
function registerShortcuts(plugin: FMiscPlugin) {
    // 注册快捷键
    const shortcuts = [
        {
            langKey: 'claude-note-quick-note',
            langText: '创建快速笔记',
            hotkey: '⌘⇧N',
            callback: async () => {
                const content = prompt('请输入快速笔记内容:');
                if (content) {
                    await withErrorHandling(async () => {
                        await quickNote(content);
                        showMessage('快速笔记创建成功', 'success');
                    }, '快捷键创建快速笔记');
                }
            }
        },
        {
            langKey: 'claude-note-toggle-dock',
            langText: '切换 Claude Note 停靠栏',
            hotkey: '⌘⇧C',
            callback: () => {
                // 这里需要实现停靠栏的切换逻辑
                showMessage('Claude Note 停靠栏切换功能', 'info');
            }
        }
    ];

    shortcuts.forEach(shortcut => {
        plugin.addCommandV2({
            langKey: shortcut.langKey,
            langText: shortcut.langText,
            hotkey: shortcut.hotkey,
            callback: shortcut.callback
        });
    });
}

// ===== 设置面板 =====
function ClaudeNoteSettingPanel(): JSX.Element {
    const [config, setConfig] = createSignal<ClaudeNoteConfig>({ ...currentConfig });

    const handleConfigChange = <K extends keyof ClaudeNoteConfig>(key: K, value: ClaudeNoteConfig[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }));
        currentConfig = { ...currentConfig, [key]: value };
        saveConfig();
    };

    const handleApiConfigChange = <K extends keyof ClaudeNoteConfig['apiConfig']>(
        key: K,
        value: ClaudeNoteConfig['apiConfig'][K]
    ) => {
        setConfig(prev => ({
            ...prev,
            apiConfig: { ...prev.apiConfig, [key]: value }
        }));
        currentConfig.apiConfig = { ...currentConfig.apiConfig, [key]: value };
        saveConfig();
    };

    // 简化设置面板，避免使用 Form 组件
    return (
        <div class="config__tab-container claude-note-settings">
            <div class="claude-note-settings__section">
                <div class="claude-note-settings__section-title">基本设置</div>
                <div class="claude-note-settings__section-description">
                    配置 Claude Note 的基本功能
                </div>

                <div class="claude-note-settings__input-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={config().quickNoteEnabled}
                            onChange={(e) => handleConfigChange('quickNoteEnabled', e.currentTarget.checked)}
                        />
                        启用快速笔记功能
                    </label>
                </div>

                <div class="claude-note-settings__input-group">
                    <label>默认笔记模板</label>
                    <input
                        type="text"
                        value={config().defaultTemplate}
                        placeholder="default"
                        onInput={(e) => handleConfigChange('defaultTemplate', e.currentTarget.value)}
                    />
                </div>

                <div class="claude-note-settings__input-group">
                    <label>默认笔记存储路径</label>
                    <input
                        type="text"
                        value={config().defaultNotePath || ''}
                        placeholder="/Claude Notes"
                        onInput={(e) => handleConfigChange('defaultNotePath', e.currentTarget.value)}
                    />
                </div>

                <div class="claude-note-settings__input-group">
                    <label>自动保存间隔（秒）</label>
                    <input
                        type="number"
                        value={config().autoSaveInterval || 30}
                        onInput={(e) => handleConfigChange('autoSaveInterval', parseInt(e.currentTarget.value) || 30)}
                    />
                </div>
            </div>

            <div class="claude-note-settings__section">
                <div class="claude-note-settings__section-title">Claude API 设置</div>
                <div class="claude-note-settings__section-description">
                    配置 Claude API 连接参数
                </div>

                <div class="claude-note-settings__input-group">
                    <label>API 端点</label>
                    <input
                        type="text"
                        value={config().apiConfig.endpoint || ''}
                        placeholder="https://api.anthropic.com"
                        onInput={(e) => handleApiConfigChange('endpoint', e.currentTarget.value)}
                    />
                </div>

                <div class="claude-note-settings__input-group">
                    <label>API 密钥</label>
                    <input
                        type="password"
                        value={config().apiConfig.apiKey || ''}
                        placeholder="请输入 API 密钥"
                        onInput={(e) => handleApiConfigChange('apiKey', e.currentTarget.value)}
                    />
                </div>

                <div class="claude-note-settings__input-group">
                    <label>模型名称</label>
                    <input
                        type="text"
                        value={config().apiConfig.model || ''}
                        placeholder="claude-3-sonnet-20240229"
                        onInput={(e) => handleApiConfigChange('model', e.currentTarget.value)}
                    />
                </div>

                <div class="claude-note-settings__input-group">
                    <label>最大 Token 数</label>
                    <input
                        type="number"
                        value={config().apiConfig.maxTokens || 4096}
                        onInput={(e) => handleApiConfigChange('maxTokens', parseInt(e.currentTarget.value) || 4096)}
                    />
                </div>

                <div class="claude-note-settings__input-group">
                    <label>温度参数</label>
                    <input
                        type="number"
                        value={config().apiConfig.temperature || 0.7}
                        step="0.1"
                        min="0"
                        max="1"
                        onInput={(e) => handleApiConfigChange('temperature', parseFloat(e.currentTarget.value) || 0.7)}
                    />
                </div>
            </div>

            <div class="claude-note-settings__section">
                <div class="claude-note-settings__section-title">高级设置</div>
                <div class="claude-note-settings__section-description">
                    配置 Claude Note 的高级功能
                </div>

                <div class="claude-note-settings__input-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={config().syntaxHighlighting || false}
                            onChange={(e) => handleConfigChange('syntaxHighlighting', e.currentTarget.checked)}
                        />
                        启用语法高亮
                    </label>
                </div>

                <div class="claude-note-settings__actions">
                    <button
                        class="b3-button b3-button--primary"
                        onClick={async () => {
                            await withErrorHandling(async () => {
                                const health = await checkHealth();
                                if (health.isHealthy) {
                                    showMessage('API 连接测试成功', 'success');
                                } else {
                                    showMessage('API 连接测试失败', 'error');
                                }
                            }, '测试 API 连接');
                        }}
                    >
                        测试 API 连接
                    </button>
                </div>
            </div>
        </div>
    );
}

// ===== 设置面板声明 =====
export const declareSettingPanel = [{
    key: 'claude-note',
    title: '📝 Claude Note',
    element: () => <ClaudeNoteSettingPanel />,
}];

// ===== 模块生命周期 =====
export async function load(plugin: FMiscPlugin): Promise<void> {
    if (pluginInstance) return;

    console.log('[ClaudeNote] 开始集成加载...');
    pluginInstance = plugin;

    try {
        // 加载配置
        currentConfig = await loadConfig();

        // 创建停靠栏
        createDock(plugin);

        // 注册菜单项
        registerMenuItems(plugin);

        // 注册快捷键
        registerShortcuts(plugin);

        console.log('[ClaudeNote] 集成加载完成');

    } catch (error) {
        console.error('[ClaudeNote] 集成加载失败:', error);
        pluginInstance = null;
        throw error;
    }
}

export function unload(_plugin?: FMiscPlugin): void {
    if (!pluginInstance) return;

    console.log('[ClaudeNote] 开始集成卸载...');

    // 清理停靠栏
    dockController?.dispose();
    dockController = null;

    // 清理菜单项
    pluginInstance.unRegisterMenuTopMenu('claude-note');

    // 清理快捷键
    pluginInstance.delCommand('claude-note-quick-note');
    pluginInstance.delCommand('claude-note-toggle-dock');

    pluginInstance = null;
    console.log('[ClaudeNote] 集成卸载完成');
}

// ===== 导出集成接口 =====
export {
    ClaudeNoteDockController,
    type ClaudeNoteDockConfig,
    type ClaudeNoteDockDeps
} from "./dock";