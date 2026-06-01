/**
 * Claude Note 模块错误处理
 * @description 定义模块特定的错误类型和错误码
 */

/**
 * Claude Note 错误码枚举
 */
export enum ClaudeNoteErrorCode {
    // 配置相关错误 (1000-1999)
    CONFIG_LOAD_FAILED = 1000,
    CONFIG_VALIDATION_FAILED = 1001,
    CONFIG_TEMPLATE_INVALID = 1002,

    // API 相关错误 (2000-2999)
    API_CONNECTION_FAILED = 2000,
    API_AUTHENTICATION_FAILED = 2001,
    API_RATE_LIMIT_EXCEEDED = 2002,
    API_INVALID_RESPONSE = 2003,
    API_REQUEST_TIMEOUT = 2004,

    // 笔记操作错误 (3000-3999)
    NOTE_CREATION_FAILED = 3000,
    NOTE_UPDATE_FAILED = 3001,
    NOTE_DELETION_FAILED = 3002,
    NOTE_NOT_FOUND = 3003,
    NOTE_VALIDATION_FAILED = 3004,

    // 模板处理错误 (4000-4999)
    TEMPLATE_RENDER_FAILED = 4000,
    TEMPLATE_NOT_FOUND = 4001,

    // 系统错误 (5000-5999)
    SYSTEM_INITIALIZATION_FAILED = 5000,
    PERMISSION_DENIED = 5001,
    STORAGE_ERROR = 5002,
}

/**
 * Claude Note 错误类
 */
export class ClaudeNoteError extends Error {
    public readonly code: ClaudeNoteErrorCode;
    public readonly context?: Record<string, any>;
    public readonly timestamp: Date;

    constructor(
        code: ClaudeNoteErrorCode,
        message: string,
        context?: Record<string, any>,
        originalError?: Error
    ) {
        super(message);
        this.name = 'ClaudeNoteError';
        this.code = code;
        this.context = context;
        this.timestamp = new Date();

        if (originalError) {
            this.stack = originalError.stack;
        }

        // 确保错误实例化时正确设置原型链
        Object.setPrototypeOf(this, ClaudeNoteError.prototype);
    }

    /**
     * 转换为可序列化的对象
     */
    public toJSON(): object {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack
        };
    }

    /**
     * 获取错误描述
     */
    public getDescription(): string {
        const codeDescriptions: Record<ClaudeNoteErrorCode, string> = {
            [ClaudeNoteErrorCode.CONFIG_LOAD_FAILED]: '配置加载失败',
            [ClaudeNoteErrorCode.CONFIG_VALIDATION_FAILED]: '配置验证失败',
            [ClaudeNoteErrorCode.CONFIG_TEMPLATE_INVALID]: '模板配置无效',
            [ClaudeNoteErrorCode.API_CONNECTION_FAILED]: 'API 连接失败',
            [ClaudeNoteErrorCode.API_AUTHENTICATION_FAILED]: 'API 认证失败',
            [ClaudeNoteErrorCode.API_RATE_LIMIT_EXCEEDED]: 'API 请求频率超限',
            [ClaudeNoteErrorCode.API_INVALID_RESPONSE]: 'API 响应无效',
            [ClaudeNoteErrorCode.API_REQUEST_TIMEOUT]: 'API 请求超时',
            [ClaudeNoteErrorCode.NOTE_CREATION_FAILED]: '笔记创建失败',
            [ClaudeNoteErrorCode.NOTE_UPDATE_FAILED]: '笔记更新失败',
            [ClaudeNoteErrorCode.NOTE_DELETION_FAILED]: '笔记删除失败',
            [ClaudeNoteErrorCode.NOTE_NOT_FOUND]: '笔记未找到',
            [ClaudeNoteErrorCode.NOTE_VALIDATION_FAILED]: '笔记数据验证失败',
            [ClaudeNoteErrorCode.TEMPLATE_RENDER_FAILED]: '模板渲染失败',
            [ClaudeNoteErrorCode.TEMPLATE_NOT_FOUND]: '模板未找到',
            [ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED]: '系统初始化失败',
            [ClaudeNoteErrorCode.PERMISSION_DENIED]: '权限不足',
            [ClaudeNoteErrorCode.STORAGE_ERROR]: '存储错误',
        };

        return codeDescriptions[this.code] || '未知错误';
    }
}

/**
 * 错误处理工具函数
 */
export class ErrorHandler {
    /**
     * 包装异步函数，提供统一的错误处理
     */
    public static async wrapAsync<T>(
        operation: () => Promise<T>,
        errorCode: ClaudeNoteErrorCode,
        context?: Record<string, any>
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            throw this.createError(errorCode, error, context);
        }
    }

    /**
     * 创建标准化的错误对象
     */
    public static createError(
        code: ClaudeNoteErrorCode,
        originalError: unknown,
        context?: Record<string, any>
    ): ClaudeNoteError {
        const message = originalError instanceof Error
            ? originalError.message
            : String(originalError);

        return new ClaudeNoteError(
            code,
            message,
            context,
            originalError instanceof Error ? originalError : undefined
        );
    }

    /**
     * 检查是否为 ClaudeNoteError
     */
    public static isClaudeNoteError(error: unknown): error is ClaudeNoteError {
        return error instanceof ClaudeNoteError;
    }

    /**
     * 记录错误信息
     */
    public static logError(error: unknown, operation: string): void {
        if (this.isClaudeNoteError(error)) {
            console.error(`[ClaudeNote] ${operation} 失败:`, {
                code: error.code,
                description: error.getDescription(),
                context: error.context,
                timestamp: error.timestamp
            });
        } else {
            console.error(`[ClaudeNote] ${operation} 失败:`, error);
        }
    }

    /**
     * 优雅的错误处理，返回默认值而不是抛出异常
     */
    public static async handleGracefully<T>(
        operation: () => Promise<T>,
        fallback: T,
        operationName: string
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            this.logError(error, operationName);
            return fallback;
        }
    }

    /**
     * 获取用户友好的错误消息
     */
    public static getUserFriendlyMessage(code: ClaudeNoteErrorCode): string {
        const messages: Record<ClaudeNoteErrorCode, string> = {
            [ClaudeNoteErrorCode.CONFIG_LOAD_FAILED]: '配置加载失败，请检查配置文件',
            [ClaudeNoteErrorCode.CONFIG_VALIDATION_FAILED]: '配置验证失败，请检查配置项',
            [ClaudeNoteErrorCode.CONFIG_TEMPLATE_INVALID]: '模板配置无效，请检查模板格式',
            [ClaudeNoteErrorCode.API_CONNECTION_FAILED]: '网络连接失败，请检查网络设置',
            [ClaudeNoteErrorCode.API_AUTHENTICATION_FAILED]: '认证失败，请检查 API 密钥',
            [ClaudeNoteErrorCode.API_RATE_LIMIT_EXCEEDED]: '请求频率过高，请稍后再试',
            [ClaudeNoteErrorCode.API_INVALID_RESPONSE]: '服务响应异常，请稍后重试',
            [ClaudeNoteErrorCode.API_REQUEST_TIMEOUT]: '请求超时，请检查网络连接',
            [ClaudeNoteErrorCode.NOTE_CREATION_FAILED]: '笔记创建失败，请检查权限',
            [ClaudeNoteErrorCode.NOTE_UPDATE_FAILED]: '笔记更新失败，请检查数据格式',
            [ClaudeNoteErrorCode.NOTE_DELETION_FAILED]: '笔记删除失败，请检查权限',
            [ClaudeNoteErrorCode.NOTE_NOT_FOUND]: '笔记不存在',
            [ClaudeNoteErrorCode.NOTE_VALIDATION_FAILED]: '笔记数据格式错误',
            [ClaudeNoteErrorCode.TEMPLATE_RENDER_FAILED]: '模板渲染失败，请检查模板语法',
            [ClaudeNoteErrorCode.TEMPLATE_NOT_FOUND]: '模板不存在',
            [ClaudeNoteErrorCode.SYSTEM_INITIALIZATION_FAILED]: '系统初始化失败',
            [ClaudeNoteErrorCode.PERMISSION_DENIED]: '权限不足，无法执行此操作',
            [ClaudeNoteErrorCode.STORAGE_ERROR]: '存储错误，请检查磁盘空间',
        };

        return messages[code] || '操作失败，请稍后重试';
    }
}