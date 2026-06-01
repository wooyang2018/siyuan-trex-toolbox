/**
 * API 错误处理工具
 * 提供统一的错误处理机制和错误类型定义
 */

export class APIError extends Error {
    public readonly code: string;
    public readonly details?: any;

    constructor(code: string, message: string, details?: any) {
        super(message);
        this.name = 'APIError';
        this.code = code;
        this.details = details;
    }
}

// 错误代码定义
export const ErrorCodes = {
    // 网络错误
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',

    // 认证错误
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',

    // 数据错误
    INVALID_INPUT: 'INVALID_INPUT',
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',

    // 系统错误
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

/**
 * 创建错误对象
 */
export function createError(code: keyof typeof ErrorCodes, message: string, details?: any): APIError {
    return new APIError(code, message, details);
}

/**
 * 错误处理装饰器
 */
export function withErrorHandling<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    errorMessage?: string
): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
        try {
            return await fn(...args);
        } catch (error) {
            console.error(errorMessage || 'API call failed:', error);

            if (error instanceof APIError) {
                throw error;
            }

            // 转换未知错误
            throw createError(
                'INTERNAL_ERROR',
                errorMessage || 'API call failed',
                { originalError: error }
            );
        }
    };
}

/**
 * 验证 Block ID 格式
 */
export function validateBlockId(id: string): void {
    if (!/^\d{14}-[a-z0-9]{7}$/.test(id)) {
        throw createError(
            'INVALID_INPUT',
            `Invalid block ID format: ${id}`,
            { id }
        );
    }
}

/**
 * 验证 Notebook ID 格式
 */
export function validateNotebookId(id: string): void {
    if (!/^\d{14}$/.test(id)) {
        throw createError(
            'INVALID_INPUT',
            `Invalid notebook ID format: ${id}`,
            { id }
        );
    }
}

/**
 * 验证路径格式
 */
export function validatePath(path: string): void {
    if (!path || typeof path !== 'string') {
        throw createError(
            'INVALID_INPUT',
            'Path must be a non-empty string',
            { path }
        );
    }

    // 检查路径是否包含非法字符
    if (path.includes('..') || path.includes('//')) {
        throw createError(
            'INVALID_INPUT',
            'Path contains invalid characters',
            { path }
        );
    }
}