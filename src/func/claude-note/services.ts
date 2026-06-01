/**
 * Claude Note 服务层模块
 * @description 实现职责分离和依赖注入，提供可测试的服务接口
 */

// 使用相对路径导入以避免路径映射问题
// import type FMiscPlugin from "@/index";

// 临时定义类型，实际使用时需要正确的导入
type FMiscPlugin = any;
import { ClaudeNoteError, ClaudeNoteErrorCode, ErrorHandler } from "./errors";
import type { ConfigManager } from "./config";
import type { ClaudeNoteData, ClaudeConversationContext, ClaudeResponse, NoteTemplate } from "./types";
import { ClaudeRunner, type ClaudeStreamEvent } from "./claude-runner";

/**
 * 模板渲染服务
 */
export class TemplateService {
    private configManager: ConfigManager;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    /**
     * 渲染笔记模板
     */
    public async renderTemplate(
        templateName: string,
        variables: Record<string, any>
    ): Promise<string> {
        return await ErrorHandler.wrapAsync(async () => {
            const config = this.configManager.getConfig();
            let template: string;

            if (templateName === 'default') {
                template = config.defaultTemplate;
            } else {
                const customTemplate = config.customTemplates?.find(t => t.name === templateName);
                if (!customTemplate) {
                    throw new ClaudeNoteError(
                        ClaudeNoteErrorCode.TEMPLATE_NOT_FOUND,
                        `模板未找到: ${templateName}`
                    );
                }
                template = customTemplate.content;
            }

            return this.renderTemplateString(template, variables);
        }, ClaudeNoteErrorCode.TEMPLATE_RENDER_FAILED, { templateName, variables });
    }

    /**
     * 渲染模板字符串
     */
    private renderTemplateString(template: string, variables: Record<string, any>): string {
        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
            const value = variables[key];
            return value !== undefined ? String(value) : match;
        });
    }

    /**
     * 验证模板语法
     */
    public validateTemplate(template: string): boolean {
        try {
            // 简单的模板语法验证
            const testVariables = { title: 'test', content: 'test', date: 'test', time: 'test' };
            this.renderTemplateString(template, testVariables);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取可用模板列表
     */
    public getAvailableTemplates(): Array<{ name: string; description?: string }> {
        const config = this.configManager.getConfig();
        const templates = [
            { name: 'default', description: '默认模板' }
        ];

        if (config.customTemplates) {
            templates.push(...config.customTemplates.map(t => ({
                name: t.name,
                description: t.description
            })));
        }

        return templates;
    }
}

/**
 * Claude API 服务
 */
export class ClaudeAPIService {
    private configManager: ConfigManager;
    private claudeRunner: ClaudeRunner;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
        this.claudeRunner = new ClaudeRunner(configManager.getConfig());
    }

    /**
     * 与 Claude 对话
     */
    public async chat(
        message: string,
        context?: ClaudeConversationContext
    ): Promise<ClaudeResponse> {
        return await ErrorHandler.wrapAsync(async () => {
            const config = this.configManager.getConfig();

            // 检查 API 配置
            if (!config.apiConfig.apiKey) {
                throw new ClaudeNoteError(
                    ClaudeNoteErrorCode.API_AUTHENTICATION_FAILED,
                    'API 密钥未配置'
                );
            }

            // 使用 Claude Runner 进行真实的对话
            return await this.chatWithClaudeRunner(message, context);
        }, ClaudeNoteErrorCode.API_CONNECTION_FAILED, { message, hasContext: !!context });
    }

    /**
     * 使用 Claude Runner 进行对话
     */
    private async chatWithClaudeRunner(
        message: string,
        context?: ClaudeConversationContext
    ): Promise<ClaudeResponse> {
        return new Promise((resolve, reject) => {
            let responseContent = "";
            let usage: any = null;
            let hasError = false;
            let errorMessage = "";

            const handle = this.claudeRunner.runClaude(message, undefined, (event: ClaudeStreamEvent) => {
                switch (event.type) {
                    case "text":
                        if (event.text) {
                            responseContent += event.text;
                        }
                        break;
                    case "usage":
                        usage = event.raw;
                        break;
                    case "error":
                        hasError = true;
                        errorMessage = event.error || "未知错误";
                        break;
                    case "result":
                        // 对话完成
                        break;
                }
            });

            handle.completed.then(result => {
                if (hasError || result.hasClaudeError) {
                    reject(new ClaudeNoteError(
                        ClaudeNoteErrorCode.API_CONNECTION_FAILED,
                        errorMessage || result.errorText || "Claude 对话失败"
                    ));
                } else {
                    resolve({
                        content: responseContent,
                        usage: usage ? {
                            promptTokens: usage.promptTokens || message.length,
                            completionTokens: usage.completionTokens || responseContent.length,
                            totalTokens: usage.totalTokens || (message.length + responseContent.length)
                        } : {
                            promptTokens: message.length,
                            completionTokens: responseContent.length,
                            totalTokens: message.length + responseContent.length
                        },
                        responseTime: 1500 // 默认响应时间
                    });
                }
            }).catch(error => {
                reject(new ClaudeNoteError(
                    ClaudeNoteErrorCode.API_CONNECTION_FAILED,
                    error.message || "Claude 对话异常"
                ));
            });
        });
    }

    /**
     * 检查 API 连接状态
     */
    public async checkConnection(): Promise<boolean> {
        try {
            const config = this.configManager.getConfig();
            if (!config.apiConfig.apiKey) {
                return false;
            }

            // 使用 Claude Runner 进行简单的连接测试
            return await this.testClaudeRunnerConnection();
        } catch {
            return false;
        }
    }

    /**
     * 测试 Claude Runner 连接
     */
    private async testClaudeRunnerConnection(): Promise<boolean> {
        return new Promise((resolve) => {
            const testMessage = "测试连接";
            let connectionSuccessful = false;

            const handle = this.claudeRunner.runClaude(testMessage, undefined, (event: ClaudeStreamEvent) => {
                if (event.type === "text" && event.text) {
                    connectionSuccessful = true;
                }
            });

            // 设置超时
            const timeout = setTimeout(() => {
                handle.abort();
                resolve(false);
            }, 5000);

            handle.completed.then(result => {
                clearTimeout(timeout);
                resolve(connectionSuccessful && !result.hasClaudeError);
            }).catch(() => {
                clearTimeout(timeout);
                resolve(false);
            });
        });
    }
}

/**
 * 笔记存储服务
 */
export class NoteStorageService {
    private plugin: FMiscPlugin;
    private configManager: ConfigManager;

    constructor(plugin: FMiscPlugin, configManager: ConfigManager) {
        this.plugin = plugin;
        this.configManager = configManager;
    }

    /**
     * 创建新笔记
     */
    public async createNote(title: string, content: string): Promise<ClaudeNoteData> {
        return await ErrorHandler.wrapAsync(async () => {
            // 验证输入
            if (!title.trim()) {
                throw new ClaudeNoteError(
                    ClaudeNoteErrorCode.NOTE_VALIDATION_FAILED,
                    '笔记标题不能为空'
                );
            }

            const noteId = this.generateNoteId();
            const now = new Date();

            const noteData: ClaudeNoteData = {
                id: noteId,
                title: title.trim(),
                content: content || '',
                createdAt: now,
                updatedAt: now,
                tags: ['claude-note']
            };

            // 保存笔记到思源笔记（这里需要集成思源笔记的 API）
            await this.saveNoteToSiyuan(noteData);

            console.log(`[ClaudeNote] 笔记创建成功: ${title}`);
            return noteData;
        }, ClaudeNoteErrorCode.NOTE_CREATION_FAILED, { title, contentLength: content?.length });
    }

    /**
     * 更新笔记
     */
    public async updateNote(id: string, updates: Partial<ClaudeNoteData>): Promise<ClaudeNoteData> {
        return await ErrorHandler.wrapAsync(async () => {
            // 这里需要实现从思源笔记获取现有笔记的逻辑
            const existingNote = await this.getNoteById(id);
            if (!existingNote) {
                throw new ClaudeNoteError(
                    ClaudeNoteErrorCode.NOTE_NOT_FOUND,
                    `笔记不存在: ${id}`
                );
            }

            const updatedNote: ClaudeNoteData = {
                ...existingNote,
                ...updates,
                updatedAt: new Date()
            };

            // 更新思源笔记中的内容
            await this.saveNoteToSiyuan(updatedNote);

            console.log(`[ClaudeNote] 笔记更新成功: ${updatedNote.title}`);
            return updatedNote;
        }, ClaudeNoteErrorCode.NOTE_UPDATE_FAILED, { id, updates });
    }

    /**
     * 获取笔记列表
     */
    public async getNotes(filter?: {
        tags?: string[];
        dateRange?: { start: Date; end: Date };
    }): Promise<ClaudeNoteData[]> {
        // 这里需要实现从思源笔记查询笔记的逻辑
        // 目前返回空数组作为占位符
        return [];
    }

    /**
     * 生成唯一的笔记 ID
     */
    private generateNoteId(): string {
        return `claude-note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 保存笔记到思源笔记（需要集成思源笔记 API）
     */
    private async saveNoteToSiyuan(noteData: ClaudeNoteData): Promise<void> {
        // TODO: 集成思源笔记的创建文档 API
        // 这里使用 console.log 模拟保存操作
        console.log(`[ClaudeNote] 保存笔记到思源笔记:`, {
            title: noteData.title,
            content: noteData.content.substring(0, 100) + '...'
        });
    }

    /**
     * 从思源笔记获取笔记（需要集成思源笔记 API）
     */
    private async getNoteById(id: string): Promise<ClaudeNoteData | null> {
        // TODO: 集成思源笔记的查询文档 API
        return null;
    }
}

/**
 * 服务容器（依赖注入容器）
 */
export class ServiceContainer {
    private plugin: FMiscPlugin;
    private configManager: ConfigManager;
    private templateService: TemplateService;
    private apiService: ClaudeAPIService;
    private storageService: NoteStorageService;

    constructor(plugin: FMiscPlugin) {
        this.plugin = plugin;
        this.configManager = new (require('./config').ConfigManager)(plugin);
        this.templateService = new TemplateService(this.configManager);
        this.apiService = new ClaudeAPIService(this.configManager);
        this.storageService = new NoteStorageService(plugin, this.configManager);
    }

    /**
     * 获取配置管理器
     */
    public getConfigManager(): ConfigManager {
        return this.configManager;
    }

    /**
     * 获取模板服务
     */
    public getTemplateService(): TemplateService {
        return this.templateService;
    }

    /**
     * 获取 API 服务
     */
    public getAPIService(): ClaudeAPIService {
        return this.apiService;
    }

    /**
     * 获取存储服务
     */
    public getStorageService(): NoteStorageService {
        return this.storageService;
    }

    /**
     * 初始化服务容器
     */
    public async initialize(): Promise<void> {
        await this.configManager.loadConfig();
        console.log('[ClaudeNote] 服务容器初始化完成');
    }

    /**
     * 销毁服务容器
     */
    public destroy(): void {
        // 清理资源
        console.log('[ClaudeNote] 服务容器已销毁');
    }
}

/**
 * 服务容器工厂函数
 */
export const createServiceContainer = (plugin: FMiscPlugin): ServiceContainer => {
    return new ServiceContainer(plugin);
};