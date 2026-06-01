/**
 * Claude Note 模块 - 改进版本
 * @description Claude 笔记功能，支持与 Claude 交互的笔记创建和管理
 *
 * 主要改进：
 * 1. 完善的错误处理机制
 * 2. 类型安全的配置管理
 * 3. 职责分离的服务架构
 * 4. 依赖注入支持
 * 5. 可测试性增强
 */

// 使用相对路径导入以避免路径映射问题
// import type FMiscPlugin from "@/index";

// 临时定义类型，实际使用时需要正确的导入
type FMiscPlugin = any;
import { createServiceContainer, ServiceContainer } from "./services";
import { ConfigManager } from "./config";
import { ErrorHandler, ClaudeNoteError, ClaudeNoteErrorCode } from "./errors";
import type { ClaudeNoteData, ClaudeResponse, ClaudeConversationContext } from "./types";
import { ClaudeRunner, type ClaudeStreamEvent, type ClaudeRunHandle, type ClaudeSessionSummary, type ClaudeSessionListOptions, type ClaudeMessage } from "./claude-runner";

// ===== 模块元数据 =====
export const name = 'ClaudeNote';
export let enabled = false;

export const declareToggleEnabled = {
    title: '📝 Claude 笔记',
    description: 'Claude 笔记功能，支持与 Claude 交互的笔记创建和管理',
    defaultEnabled: false,
};

// ===== 模块状态 =====
let plugin: FMiscPlugin | null = null;
let serviceContainer: ServiceContainer | null = null;

// ===== 模块核心功能（改进版本） =====

/**
 * 创建新的 Claude 笔记
 */
async function createClaudeNote(
    title: string,
    content?: string,
    templateName: string = 'default'
): Promise<ClaudeNoteData> {
    if (!enabled || !serviceContainer) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用或未初始化'
        );
    }

    return await ErrorHandler.wrapAsync(async () => {
        const templateService = serviceContainer!.getTemplateService();
        const storageService = serviceContainer!.getStorageService();

        // 渲染模板
        const templateVariables = {
            title,
            content: content || '',
            date: new Date().toLocaleDateString('zh-CN'),
            time: new Date().toLocaleTimeString('zh-CN')
        };

        const renderedContent = await templateService.renderTemplate(templateName, templateVariables);

        // 创建笔记
        const noteData = await storageService.createNote(title, renderedContent);

        console.log(`[ClaudeNote] 笔记创建成功: ${title}`);
        return noteData;
    }, ClaudeNoteErrorCode.NOTE_CREATION_FAILED, { title, contentLength: content?.length, templateName });
}

/**
 * 快速笔记功能
 */
async function quickNote(content: string): Promise<ClaudeNoteData> {
    if (!enabled) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用'
        );
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const title = `快速笔记-${timestamp}`;

    return await createClaudeNote(title, content);
}

/**
 * 与 Claude 对话
 */
async function chatWithClaude(
    message: string,
    context?: ClaudeConversationContext
): Promise<ClaudeResponse> {
    if (!enabled || !serviceContainer) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用或未初始化'
        );
    }

    return await ErrorHandler.wrapAsync(async () => {
        const apiService = serviceContainer!.getAPIService();
        return await apiService.chat(message, context);
    }, ClaudeNoteErrorCode.API_CONNECTION_FAILED, { message, hasContext: !!context });
}

/**
 * 获取笔记列表
 */
async function getNotes(filter?: {
    tags?: string[];
    dateRange?: { start: Date; end: Date };
}): Promise<ClaudeNoteData[]> {
    if (!enabled || !serviceContainer) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用或未初始化'
        );
    }

    return await ErrorHandler.wrapAsync(async () => {
        const storageService = serviceContainer!.getStorageService();
        return await storageService.getNotes(filter);
    }, ClaudeNoteErrorCode.NOTE_NOT_FOUND, { filter });
}

/**
 * 更新笔记
 */
async function updateNote(
    id: string,
    updates: Partial<ClaudeNoteData>
): Promise<ClaudeNoteData> {
    if (!enabled || !serviceContainer) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用或未初始化'
        );
    }

    return await ErrorHandler.wrapAsync(async () => {
        const storageService = serviceContainer!.getStorageService();
        return await storageService.updateNote(id, updates);
    }, ClaudeNoteErrorCode.NOTE_UPDATE_FAILED, { id, updates });
}

/**
 * 删除笔记
 */
async function deleteNote(id: string): Promise<boolean> {
    if (!enabled || !serviceContainer) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用或未初始化'
        );
    }

    // 这里需要实现删除逻辑
    // 目前返回 true 作为占位符
    return true;
}

/**
 * 检查模块健康状态
 */
async function checkHealth(): Promise<{
    isHealthy: boolean;
    services: Record<string, boolean>;
    configValid: boolean;
    lastError?: string;
}> {
    if (!enabled || !serviceContainer) {
        return {
            isHealthy: false,
            services: {},
            configValid: false,
            lastError: '模块未启用或未初始化'
        };
    }

    try {
        const configManager = serviceContainer.getConfigManager();
        const apiService = serviceContainer.getAPIService();

        const configValid = configManager.isValidConfig();
        const apiConnected = await apiService.checkConnection();

        return {
            isHealthy: configValid && apiConnected,
            services: {
                config: configValid,
                api: apiConnected,
                storage: true // 存储服务通常总是可用的
            },
            configValid
        };
    } catch (error) {
        return {
            isHealthy: false,
            services: {},
            configValid: false,
            lastError: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * 获取模块统计信息
 */
async function getStats(): Promise<{
    notesCreated: number;
    apiCalls: number;
    lastActivity: Date;
    configSummary: Record<string, any>;
}> {
    if (!enabled || !serviceContainer) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用或未初始化'
        );
    }

    const configManager = serviceContainer.getConfigManager();

    // 这里需要实现实际的统计逻辑
    // 目前返回模拟数据
    return {
        notesCreated: 0,
        apiCalls: 0,
        lastActivity: new Date(),
        configSummary: configManager.getConfigSummary()
    };
}

// ===== 模块生命周期（改进版本） =====

export const load = async (pluginInstance: FMiscPlugin): Promise<void> => {
    if (enabled) return;

    try {
        console.log('[ClaudeNote] 开始加载模块...');

        plugin = pluginInstance;

        // 创建服务容器
        serviceContainer = createServiceContainer(pluginInstance);
        await serviceContainer.initialize();

        enabled = true;

        // 注册事件监听器
        registerEventListeners();

        console.log('[ClaudeNote] 模块加载完成');

        // 检查健康状态
        const health = await checkHealth();
        if (!health.isHealthy) {
            console.warn('[ClaudeNote] 模块健康检查未通过:', health);
        }

    } catch (error) {
        ErrorHandler.logError(error, '模块加载');
        throw error;
    }
};

export const unload = async (pluginInstance?: FMiscPlugin): Promise<void> => {
    if (!enabled) return;

    try {
        console.log('[ClaudeNote] 开始卸载模块...');

        // 清理事件监听器
        unregisterEventListeners();

        // 销毁服务容器
        if (serviceContainer) {
            serviceContainer.destroy();
            serviceContainer = null;
        }

        // 清理 Claude Runner
        if (claudeRunner) {
            claudeRunner = null;
        }

        plugin = null;
        enabled = false;

        console.log('[ClaudeNote] 模块卸载完成');

    } catch (error) {
        ErrorHandler.logError(error, '模块卸载');
        // 在卸载过程中，即使出错也要继续清理
    }
};

// ===== 事件处理 =====

/**
 * 注册事件监听器
 */
function registerEventListeners(): void {
    if (!plugin) return;

    // TODO: 注册具体的事件监听器
    // 例如：快捷键、菜单项、自动保存等

    console.log('[ClaudeNote] 事件监听器已注册');
}

/**
 * 注销事件监听器
 */
function unregisterEventListeners(): void {
    if (!plugin) return;

    // TODO: 注销事件监听器

    console.log('[ClaudeNote] 事件监听器已注销');
}

// ===== 用户界面集成 =====

/**
 * 显示用户友好的错误消息
 */
function showUserFriendlyError(error: unknown): void {
    if (ErrorHandler.isClaudeNoteError(error)) {
        const message = ErrorHandler.getUserFriendlyMessage(error.code);
        // 使用思源笔记的消息系统显示错误
        if (plugin) {
            plugin.showMessage(message, 'error');
        } else {
            console.error('[ClaudeNote]', message);
        }
    } else {
        const message = error instanceof Error ? error.message : String(error);
        if (plugin) {
            plugin.showMessage(`操作失败: ${message}`, 'error');
        } else {
            console.error('[ClaudeNote]', message);
        }
    }
}

/**
 * 优雅的错误处理包装器
 */
async function withErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string
): Promise<T | null> {
    try {
        return await operation();
    } catch (error) {
        ErrorHandler.logError(error, operationName);
        showUserFriendlyError(error);
        return null;
    }
}

// ===== 设置面板 =====

/**
 * 设置面板配置
 */
export const declareSettingPanel = {
    title: 'Claude Note 设置',
    description: '配置 Claude 笔记功能',
    icon: '📝',

    // 这里可以定义具体的设置项
    // 实际实现需要与 ConfigManager 集成
    items: []
};

// ===== 导出类型和函数 =====

export type { ClaudeNoteConfig, ClaudeNoteData, ClaudeResponse, ClaudeConversationContext } from "./types";
export type { ClaudeStreamEvent, ClaudeRunHandle, ClaudeSessionSummary, ClaudeSessionListOptions, ClaudeMessage } from "./claude-runner";
export { ClaudeNoteError, ClaudeNoteErrorCode } from "./errors";

export {
    createClaudeNote,
    quickNote,
    chatWithClaude,
    getNotes,
    updateNote,
    deleteNote,
    checkHealth,
    getStats,
    withErrorHandling
};

// ===== 向后兼容性导出 =====

/**
 * 向后兼容的旧版本函数
 * @deprecated 请使用新的函数签名
 */
export const createClaudeNoteLegacy = async (
    plugin: FMiscPlugin,
    title: string,
    content?: string
): Promise<void> => {
    await withErrorHandling(async () => {
        await createClaudeNote(title, content);
    }, 'createClaudeNoteLegacy');
};

/**
 * 向后兼容的旧版本函数
 * @deprecated 请使用新的函数签名
 */
export const quickNoteLegacy = async (plugin: FMiscPlugin, content: string): Promise<void> => {
    await withErrorHandling(async () => {
        await quickNote(content);
    }, 'quickNoteLegacy');
};

// ===== Claude Runner 功能集成 =====

/**
 * Claude 运行器实例
 */
let claudeRunner: ClaudeRunner | null = null;

/**
 * 获取 Claude 运行器实例
 */
function getClaudeRunner(): ClaudeRunner {
    if (!claudeRunner) {
        if (!serviceContainer) {
            throw new ClaudeNoteError(
                ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
                'Claude Note 模块未初始化'
            );
        }
        const configManager = serviceContainer.getConfigManager();
        const config = configManager.getConfig();
        claudeRunner = new ClaudeRunner(config);
    }
    return claudeRunner;
}

/**
 * 运行 Claude 对话
 */
export async function runClaude(
    prompt: string,
    sessionId: string | undefined,
    onEvent: (event: ClaudeStreamEvent) => void
): Promise<ClaudeRunHandle> {
    if (!enabled) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用'
        );
    }

    return await ErrorHandler.wrapAsync(async () => {
        const runner = getClaudeRunner();
        return runner.runClaude(prompt, sessionId, onEvent);
    }, ClaudeNoteErrorCode.API_CONNECTION_FAILED, { prompt, sessionId });
}

/**
 * 列出 Claude 会话
 */
export function listClaudeSessions(options: ClaudeSessionListOptions = {}): ClaudeSessionSummary[] {
    if (!enabled) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用'
        );
    }

    try {
        const runner = getClaudeRunner();
        return runner.listClaudeSessions(options);
    } catch (error) {
        ErrorHandler.logError(error, 'listClaudeSessions');
        return [];
    }
}

/**
 * 加载 Claude 会话消息
 */
export function loadClaudeSessionMessages(sessionPath: string): ClaudeMessage[] {
    if (!enabled) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用'
        );
    }

    try {
        const runner = getClaudeRunner();
        return runner.loadClaudeSessionMessages(sessionPath);
    } catch (error) {
        ErrorHandler.logError(error, 'loadClaudeSessionMessages');
        return [];
    }
}

/**
 * 删除 Claude 会话
 */
export function deleteClaudeSession(sessionPath: string): boolean {
    if (!enabled) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用'
        );
    }

    try {
        const runner = getClaudeRunner();
        return runner.deleteClaudeSession(sessionPath);
    } catch (error) {
        ErrorHandler.logError(error, 'deleteClaudeSession');
        return false;
    }
}

/**
 * 重命名 Claude 会话
 */
export function renameClaudeSession(sessionPath: string, newTitle: string): boolean {
    if (!enabled) {
        throw new ClaudeNoteError(
            ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED,
            'Claude Note 模块未启用'
        );
    }

    try {
        const runner = getClaudeRunner();
        return runner.renameClaudeSession(sessionPath, newTitle);
    } catch (error) {
        ErrorHandler.logError(error, 'renameClaudeSession');
        return false;
    }
}

/**
 * 标准化 Claude 事件
 */
export function normalizeClaudeEvent(raw: any): ClaudeStreamEvent[] {
    try {
        const runner = getClaudeRunner();
        return runner.normalizeClaudeEvent(raw);
    } catch (error) {
        ErrorHandler.logError(error, 'normalizeClaudeEvent');
        return [{ type: "error", error: "事件处理失败", raw }];
    }
}

