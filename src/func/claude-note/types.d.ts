/**
 * Claude Note 模块类型定义
 */

/**
 * Claude API 配置
 */
interface ClaudeAPIConfig {
    /** API 端点 */
    endpoint?: string;
    /** API 密钥 */
    apiKey?: string;
    /** 使用的模型 */
    model?: string;
    /** 最大 token 数 */
    maxTokens?: number;
    /** 温度参数 */
    temperature?: number;
}

/**
 * 笔记模板配置
 */
interface NoteTemplate {
    /** 模板名称 */
    name: string;
    /** 模板内容 */
    content: string;
    /** 模板描述 */
    description?: string;
}

/**
 * Claude Note 模块配置
 */
interface ClaudeNoteConfig {
    /** 是否启用快速笔记功能 */
    quickNoteEnabled: boolean;
    /** 默认笔记模板 */
    defaultTemplate: string;
    /** Claude API 配置 */
    apiConfig: ClaudeAPIConfig;
    /** 自定义模板列表 */
    customTemplates?: NoteTemplate[];
    /** 自动保存间隔（秒） */
    autoSaveInterval?: number;
    /** 是否启用语法高亮 */
    syntaxHighlighting?: boolean;
    /** 默认笔记存储路径 */
    defaultNotePath?: string;
}

/**
 * Claude 笔记数据
 */
interface ClaudeNoteData {
    /** 笔记 ID */
    id: string;
    /** 笔记标题 */
    title: string;
    /** 笔记内容 */
    content: string;
    /** 创建时间 */
    createdAt: Date;
    /** 更新时间 */
    updatedAt: Date;
    /** 标签 */
    tags?: string[];
    /** 元数据 */
    metadata?: Record<string, any>;
}

/**
 * Claude 对话上下文
 */
interface ClaudeConversationContext {
    /** 对话 ID */
    conversationId: string;
    /** 消息历史 */
    messages: ClaudeMessage[];
    /** 对话主题 */
    topic?: string;
    /** 创建时间 */
    createdAt: Date;
}

/**
 * Claude 消息
 */
interface ClaudeMessage {
    /** 消息 ID */
    id: string;
    /** 角色：user 或 assistant */
    role: 'user' | 'assistant';
    /** 消息内容 */
    content: string;
    /** 发送时间 */
    timestamp: Date;
    /** 附加数据 */
    metadata?: Record<string, any>;
}

/**
 * Claude 响应结果
 */
interface ClaudeResponse {
    /** 响应内容 */
    content: string;
    /** 使用的 token 数 */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    /** 响应时间 */
    responseTime?: number;
    /** 错误信息 */
    error?: string;
}

/**
 * Claude Note 功能接口
 */
interface IClaudeNoteFunctions {
    /** 创建新的 Claude 笔记 */
    createNote(title: string, content?: string): Promise<ClaudeNoteData>;
    /** 快速笔记 */
    quickNote(content: string): Promise<ClaudeNoteData>;
    /** 与 Claude 对话 */
    chatWithClaude(message: string, context?: ClaudeConversationContext): Promise<ClaudeResponse>;
    /** 获取笔记列表 */
    getNotes(filter?: { tags?: string[]; dateRange?: { start: Date; end: Date } }): Promise<ClaudeNoteData[]>;
    /** 更新笔记 */
    updateNote(id: string, updates: Partial<ClaudeNoteData>): Promise<ClaudeNoteData>;
    /** 删除笔记 */
    deleteNote(id: string): Promise<boolean>;
}

export type {
    ClaudeAPIConfig,
    NoteTemplate,
    ClaudeNoteConfig,
    ClaudeNoteData,
    ClaudeConversationContext,
    ClaudeMessage,
    ClaudeResponse,
    IClaudeNoteFunctions
};

// 导出所有类型供外部使用
export * from "./errors";
export * from "./config";
export * from "./services";
export * from "./testing";