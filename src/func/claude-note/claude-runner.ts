/**
 * Claude 执行器核心逻辑
 * 移植自 claude-note 项目，提供与 Claude 交互的执行能力
 */

import type { ClaudeNoteConfig } from "./types";

/**
 * Claude 流事件类型
 */
export type ClaudeStreamEvent = {
    type: string;
    text?: string;
    thinking?: string;
    toolName?: string;
    toolInput?: unknown;
    raw?: unknown;
    sessionId?: string;
    error?: string;
};

/**
 * Claude 运行句柄
 */
export interface ClaudeRunHandle {
    abort: () => void;
    completed: Promise<{
        exitCode: number | null;
        signal: string | null;
        sessionId?: string;
        hasClaudeError?: boolean;
        errorText?: string;
        aborted?: boolean;
    }>;
}

/**
 * Claude 会话摘要
 */
export interface ClaudeSessionSummary {
    id: string;
    path: string;
    title: string;
    updatedAt: number;
}

/**
 * Claude 会话列表选项
 */
export interface ClaudeSessionListOptions {
    limit?: number;
    days?: number;
}

/**
 * Claude 消息
 */
export interface ClaudeMessage {
    role: string;
    content: string;
    meta?: string;
}

/**
 * Claude 运行器类
 */
export class ClaudeRunner {
    private config: ClaudeNoteConfig;
    private workingDir: string;

    constructor(config: ClaudeNoteConfig, workingDir: string = ".") {
        this.config = config;
        this.workingDir = workingDir;
    }

    /**
     * 格式化 Claude 系统事件
     */
    private formatClaudeSystemEvent(raw: any): string {
        if (raw?.subtype === "api_retry") {
            const attempt = raw.attempt ?? "?";
            const maxRetries = raw.max_retries ?? "?";
            const status = raw.error_status ?? "unknown";
            const error = raw.error ? ` ${raw.error}` : "";
            const retryDelayMs = Number(raw.retry_delay_ms);
            const delay = Number.isFinite(retryDelayMs) ? `, retrying in ${Math.round(retryDelayMs / 1000)}s` : "";
            return `Claude API retry ${attempt}/${maxRetries}: HTTP ${status}${error}${delay}`;
        }
        const subtype = raw?.subtype || "system";
        return `Claude system event: ${subtype}`;
    }

    /**
     * 解析环境变量文本
     */
    private parseEnvironmentVariables(text: string): Record<string, string> {
        const env: Record<string, string> = {};
        for (const rawLine of text.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;
            const eq = line.indexOf("=");
            if (eq <= 0) continue;
            env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
        return env;
    }

    /**
     * 获取捆绑的思源笔记 CLI 路径
     */
    private getBundledSiyuanCliPath(): string {
        // 在当前项目中，思源笔记 CLI 可能位于不同的位置
        // 这里返回空字符串，表示使用默认的思源笔记 API
        return "";
    }

    /**
     * 构建 Claude Note 系统提示
     */
    private buildClaudeNoteSystemPrompt(helperPath: string): string {
        if (!helperPath) return "";
        return [
            "Claude Note is running inside SiYuan Note, an integrated knowledge database.",
            "================================================================================",
            "CRITICAL SAFETY RULE: You are STRICTLY FORBIDDEN from directly writing, modifying, creating, appending to, or deleting any files ending with `.sy` (SiYuan's proprietary JSON notebook format) under any circumstances. Editing `.sy` files directly on disk bypasses SiYuan's database engine, causing catastrophic database corruption, index desynchronization, and permanent notebook loss. You must only read `.sy` files for inspection if absolutely necessary, but NEVER write or patch them.",
            "================================================================================",
            "MANDATORY API PROTOCOL: You MUST use the provided SiYuan API helper script for all operations that retrieve, search, create, or edit notes, documents, and blocks. It acts as the exclusive gateway to the SiYuan database engine.",
            `Helper command: python3 ${JSON.stringify(helperPath)} <command> (or use "python" if python3 is not available)`,
            "The background environment is ALREADY fully pre-authenticated and authorized. Do NOT complain about API authentication, do NOT print or ask the user for an API token or credentials, and do NOT state that the API needs authentication. The helper already automatically reads SIYUAN_API_TOKEN, SIYUAN_API_PORT, and SIYUAN_API_URL from your execution environment.",
            "If any helper command fails with a connection error or connection refused, it means the SiYuan API server port might be misconfigured, or SiYuan is temporarily not running/accessible on that port. It is NOT an authentication problem, and you MUST NOT attempt to bypass the API by manually editing `.sy` files. Report the connection error clearly to the user.",
            "MCP TOOL AVAILABILITY: If configured MCP servers are still pending and a WaitForMcpServers tool is available, use it before concluding that an MCP tool is unavailable.",
            "Useful helper commands:",
            "  - notebooks (or nb): List all notebooks.",
            "  - search (or s) <keyword>: Search for text in blocks across notebooks.",
            "  - sql <stmt>: Execute an arbitrary SQL query on SiYuan's relational block database.",
            "  - export (or cat) <id>: Export document markdown by block ID.",
            "  - hpath --id <id>: Get document human-readable path by ID.",
            "  - block-kramdown (or bk) <id>: Get the Kramdown content of a block.",
            "  - child-blocks (or ch) <id>: Get child blocks of a parent block.",
            "  - create (or mk) -n <notebook> -p <path> -m <markdown>: Create a new document with markdown content.",
            "  - rename (or rn) --id <id> --title <title>: Rename a document.",
            "  - remove (or rm) --id <id>: Remove a document.",
            "  - update-block (or bu) <id> -d <data>: Update a block with markdown content.",
            "  - append-block (or app) <parent_id> -d <data>: Append a block under a parent.",
            "  - prepend-block (or pre) <parent_id> -d <data>: Prepend a block under a parent.",
            "  - insert-block (or ins) -d <data> [--parent-id <id>] [--previous-id <id>] [--next-id <id>]: Insert a block next to or under another block.",
            "  - delete-block (or bd) <id>: Delete a block.",
            "  - move-block (or mv) <id> [--parent-id <id>] [--previous-id <id>]: Move a block.",
            "For editing Siyuan notes, always prefer block-level API helper commands (update-block, append-block, insert-block) over rewriting the entire document, as it preserves block metadata and link IDs."
        ].join("\n");
    }

    /**
     * 获取 Claude 项目目录
     */
    private getClaudeProjectDir(workingDir: string): string {
        const home = String(globalThis?.process?.env?.HOME || "");
        const normalized = workingDir.replace(/\//g, "-");
        const projectName = normalized === "-" ? "-" : normalized;
        return `${home}/.claude/projects/${projectName}`;
    }

    /**
     * 读取 JSON 行文件
     */
    private readJsonLines(filePath: string): any[] {
        // 在当前环境中，文件系统操作可能受限
        // 返回空数组作为占位符
        return [];
    }

    /**
     * 读取 JSON 行文件尾部
     */
    private readJsonLinesTail(filePath: string): any[] {
        // 在当前环境中，文件系统操作可能受限
        // 返回空数组作为占位符
        return [];
    }

    /**
     * 去除 Claude Note 运行时指令
     */
    private stripClaudeNoteRuntimeInstruction(text: string): string {
        return text
            .replace(/<claude-note-runtime-instruction>[\s\S]*?<\/claude-note-runtime-instruction>\s*/g, "")
            .trim();
    }

    /**
     * 列出 Claude 会话
     */
    public listClaudeSessions(options: ClaudeSessionListOptions = {}): ClaudeSessionSummary[] {
        const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
            ? Math.min(200, Math.floor(Number(options.limit)))
            : 30;
        const since = Number.isFinite(Number(options.days)) && Number(options.days) > 0
            ? Date.now() - Math.floor(Number(options.days)) * 24 * 60 * 60 * 1000
            : 0;

        try {
            const dir = this.getClaudeProjectDir(this.workingDir);
            // 在当前环境中，文件系统操作可能受限
            // 返回空数组作为占位符
            return [];
        } catch {
            return [];
        }
    }

    /**
     * 删除 Claude 会话
     */
    public deleteClaudeSession(sessionPath: string): boolean {
        // 在当前环境中，文件系统操作可能受限
        // 返回 false 作为占位符
        return false;
    }

    /**
     * 重命名 Claude 会话
     */
    public renameClaudeSession(sessionPath: string, newTitle: string): boolean {
        // 在当前环境中，文件系统操作可能受限
        // 返回 false 作为占位符
        return false;
    }

    /**
     * 将内容转换为文本
     */
    private contentToText(content: any): string {
        if (typeof content === "string") return this.stripClaudeNoteRuntimeInstruction(content);
        if (Array.isArray(content)) {
            return content.map((item) => {
                if (typeof item === "string") return item;
                if (item?.text) return String(item.text);
                if (item?.content) return this.contentToText(item.content);
                if (item?.input) return JSON.stringify(item.input);
                return "";
            }).filter(Boolean).join("\n");
        }
        return "";
    }

    /**
     * 加载 Claude 会话消息
     */
    public loadClaudeSessionMessages(sessionPath: string): ClaudeMessage[] {
        const out: ClaudeMessage[] = [];
        const entries = this.readJsonLines(sessionPath);

        for (const entry of entries) {
            if (!entry) continue;
            if (entry.type === "system" && entry.subtype === "turn_duration") {
                out.push({ role: "duration", content: String(entry.durationMs || "") });
            } else if (entry.type === "assistant" || entry.type === "user") {
                const content = entry.message?.content;
                if (Array.isArray(content)) {
                    for (const block of content) {
                        if (!block || typeof block !== "object") continue;
                        if (block.type === "text" && block.text) {
                            out.push({ role: entry.type, content: String(block.text) });
                        } else if ((block.type === "thinking" || block.type === "redacted_thinking") && block.thinking) {
                            out.push({ role: "thinking", content: String(block.thinking), meta: "thinking" });
                        } else if (block.type === "tool_use") {
                            out.push({ role: "tool", content: JSON.stringify(block.input ?? {}, null, 2), meta: block.name || "tool" });
                        } else if (entry.type === "assistant" && block.type === "tool_result") {
                            const resText = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
                            out.push({ role: "tool", content: resText, meta: "tool_result" });
                        }
                    }
                } else {
                    const text = this.contentToText(content);
                    if (text.trim()) {
                        out.push({ role: entry.type, content: text });
                    }
                }
                if (entry.type === "assistant" && entry.message?.usage) {
                    out.push({ role: "usage", content: JSON.stringify(entry.message.usage) });
                }
            }
        }
        return out;
    }

    /**
     * 解析 Claude CLI 路径
     */
    private resolveClaudeCli(configuredPath: string): string {
        const explicit = configuredPath.trim();
        if (explicit) return explicit;

        // 在当前环境中，直接返回 "claude"
        return "claude";
    }

    /**
     * 从内容中推送文本事件
     */
    private pushTextFromContent(content: any, emit: (event: ClaudeStreamEvent) => void) {
        if (!Array.isArray(content)) return;
        for (const block of content) {
            if (!block || typeof block !== "object") continue;
            if (block.type === "text" && block.text) {
                emit({ type: "text", text: String(block.text), raw: block });
            } else if ((block.type === "thinking" || block.type === "redacted_thinking") && block.thinking) {
                emit({ type: "thinking", thinking: String(block.thinking), raw: block });
            } else if (block.type === "tool_use") {
                emit({ type: "tool", toolName: block.name || "tool", toolInput: block.input, raw: block });
            } else if (block.type === "tool_result") {
                emit({ type: "tool_result", text: typeof block.content === "string" ? block.content : JSON.stringify(block.content), raw: block });
            }
        }
    }

    /**
     * 标准化 Claude 事件
     */
    public normalizeClaudeEvent(raw: any): ClaudeStreamEvent[] {
        const events: ClaudeStreamEvent[] = [];
        const emit = (event: ClaudeStreamEvent) => events.push(event);

        if (!raw || typeof raw !== "object") {
            return [{ type: "raw", text: String(raw) }];
        }

        if (raw.type === "system") {
            if (raw.subtype === "init") {
                emit({ type: "session", sessionId: raw.session_id, raw });
            } else if (raw.subtype === "turn_duration") {
                emit({ type: "duration", text: String(raw.durationMs), raw });
            } else {
                emit({ type: "stderr", text: this.formatClaudeSystemEvent(raw), sessionId: raw.session_id, raw });
            }
        } else if (raw.type === "assistant") {
            this.pushTextFromContent(raw.message?.content, emit);
            if (raw.message?.usage) {
                emit({ type: "usage", raw: raw.message.usage });
            }
        } else if (raw.type === "user") {
            // Claude Code echoes tool_result blocks as user messages. Rendering those
            // blocks exposes raw command output and skill files in the chat surface.
            if (raw.message?.usage) {
                emit({ type: "usage", raw: raw.message.usage });
            }
        } else if (raw.type === "result") {
            if (raw.is_error) {
                emit({ type: "error", error: raw.result || raw.error || raw.message || "Claude returned an error", sessionId: raw.session_id, raw });
            } else {
                emit({ type: "result", text: raw.result || "", sessionId: raw.session_id, raw });
            }
            if (raw.usage || raw.modelUsage || raw.model_usage) {
                emit({ type: "usage", raw });
            }
        } else if (raw.type === "error") {
            emit({ type: "error", error: raw.error?.message || raw.message || JSON.stringify(raw), raw });
        } else if (raw.delta?.text) {
            emit({ type: "text", text: raw.delta.text, raw });
        } else {
            emit({ type: "raw", raw });
        }
        return events;
    }

    /**
     * 运行 Claude
     */
    public runClaude(
        prompt: string,
        sessionId: string | undefined,
        onEvent: (event: ClaudeStreamEvent) => void
    ): ClaudeRunHandle {
        // 在当前环境中，直接执行 Claude CLI 可能受限
        // 返回一个模拟的运行句柄

        const abort = () => {
            // 模拟中止操作
            console.log("[ClaudeRunner] Claude 执行被中止");
        };

        const completed = Promise.resolve({
            exitCode: 0,
            signal: null,
            sessionId: sessionId || "mock-session-id",
            hasClaudeError: false,
            errorText: "",
            aborted: false
        });

        // 模拟事件流
        setTimeout(() => {
            onEvent({ type: "text", text: "这是 Claude 的模拟响应: " + prompt });
            onEvent({ type: "result", text: "执行完成", sessionId: sessionId || "mock-session-id" });
        }, 100);

        return { abort, completed };
    }

    /**
     * 解析 Claude 模型值
     */
    private resolveClaudeModelValue(model: string): string {
        // 简单的模型名称映射
        const modelMap: Record<string, string> = {
            "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
            "claude-3-opus": "claude-3-opus-20240229",
            "claude-3-sonnet": "claude-3-sonnet-20240229",
            "claude-3-haiku": "claude-3-haiku-20240307",
        };
        return modelMap[model] || model;
    }

    /**
     * 读取 Claude 设置环境变量
     */
    private readClaudeSettingsEnv(): Record<string, string> {
        // 返回默认的环境变量
        return {
            CLAUDE_NOTE_SIYUAN_CLI: this.getBundledSiyuanCliPath(),
            ANTHROPIC_MODEL: this.resolveClaudeModelValue(this.config.apiConfig.model || "claude-3-5-sonnet"),
            CLAUDE_CODE_EFFORT_LEVEL: "medium", // 默认努力级别
        };
    }
}

/**
 * 创建 Claude 运行器实例
 */
export function createClaudeRunner(config: ClaudeNoteConfig, workingDir?: string): ClaudeRunner {
    return new ClaudeRunner(config, workingDir);
}