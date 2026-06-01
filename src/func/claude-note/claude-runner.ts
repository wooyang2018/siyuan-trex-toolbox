import { readClaudeSettingsEnv, resolveClaudeModelValue, type ClaudeNoteSettings } from "./settings";

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

function formatClaudeSystemEvent(raw: any): string {
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

export interface ClaudeRunHandle {
    abort: () => void;
    completed: Promise<{ exitCode: number | null; signal: string | null; sessionId?: string; hasClaudeError?: boolean; errorText?: string; aborted?: boolean }>;
}

export interface ClaudeSessionSummary {
    id: string;
    path: string;
    title: string;
    updatedAt: number;
}

export interface ClaudeSessionListOptions {
    limit?: number;
    days?: number;
}

function nodeRequire<T = any>(id: string): T {
    const globalRequire = (globalThis as any)?.require;
    if (typeof globalRequire === "function") return globalRequire(id);
    return require(id);
}

function isWindows(): boolean {
    return (globalThis as any)?.process?.platform === "win32";
}

function parseEnvironmentVariables(text: string): Record<string, string> {
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

function getBundledSiyuanCliPath(): string {
    const path = nodeRequire<typeof import("path")>("path");
    const fs = nodeRequire<typeof import("fs")>("fs");

    // 1. 优先：思源 workspace + 插件名固定路径（trex-toolbox 中的实际部署路径）
    const workspaceDir = (globalThis as any)?.window?.siyuan?.config?.system?.workspaceDir || "";
    if (workspaceDir) {
        const candidates = [
            // 生产部署路径：dist 通过 viteStaticCopy 输出到 func/claude-note/asset/
            path.join(workspaceDir, "data", "plugins",
                "siyuan-trex-toolbox", "func", "claude-note", "asset", "siyuan-cli.py"),
            // 兼容直接放在 plugin 根 asset 的情况
            path.join(workspaceDir, "data", "plugins",
                "siyuan-trex-toolbox", "asset", "siyuan-cli.py"),
        ];
        for (const p of candidates) {
            try { if (fs.existsSync(p)) return p; } catch { /* try next */ }
        }
    }

    // 2. fallback：原插件的 __dirname/cwd 探测（开发态兼容）
    const roots = [
        typeof __dirname !== "undefined" ? __dirname : "",
        (globalThis as any)?.process?.cwd?.() || "",
    ].filter(Boolean);
    for (const root of roots) {
        for (const sub of ["asset", "func/claude-note/asset"]) {
            const candidate = path.join(root, sub, "siyuan-cli.py");
            try {
                if (fs.existsSync(candidate)) return candidate;
            } catch {
                // try next
            }
        }
    }
    return "";
}

function buildClaudeNoteSystemPrompt(helperPath: string): string {
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
 * 解析 Claude CLI 的会话目录根（不含 projects 子目录）。
 *
 * 调用方应在 settings 层（settings.ts 的 mergeSettings/detectClaudeHomeDir）
 * 根据 cliPath 把 claudeHomeDir 推断好；这里只做简单兜底：
 *   - 传入了 claudeHomeDir → 直接用它
 *   - 没传 → 返回空字符串（调用方处理）
 */
function resolveClaudeHomeDir(claudeHomeDir: string): string {
    return (claudeHomeDir || "").trim();
}

function getClaudeProjectDir(workingDir: string, claudeHomeDir: string): string {
    const path = nodeRequire<typeof import("path")>("path");
    const root = resolveClaudeHomeDir(claudeHomeDir);
    if (!root) return "";
    const normalized = path.resolve(workingDir || ".");
    const projectName = normalized === "/" ? "-" : normalized.replace(/\//g, "-");
    return path.join(root, "projects", projectName);
}

function readJsonLines(filePath: string): any[] {
    const fs = nodeRequire<typeof import("fs")>("fs");
    try {
        return fs.readFileSync(filePath, "utf8")
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line: string) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

function readJsonLinesTail(filePath: string): any[] {
    const fs = nodeRequire<typeof import("fs")>("fs");
    try {
        const stat = fs.statSync(filePath);
        const limit = 50 * 1024; // 50KB
        if (stat.size <= limit) {
            return readJsonLines(filePath);
        }
        
        // 文件很大，使用 open/read 只读取尾部 50KB
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(limit);
        const bytesRead = fs.readSync(fd, buffer, 0, limit, stat.size - limit);
        fs.closeSync(fd);
        
        let text = buffer.toString("utf8", 0, bytesRead);
        const firstNewline = text.indexOf("\n");
        if (firstNewline !== -1) {
            text = text.slice(firstNewline + 1);
        }
        
        return text.split(/\r?\n/)
            .filter(Boolean)
            .map((line: string) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

function stripClaudeNoteRuntimeInstruction(text: string): string {
    return text
        .replace(/<claude-note-runtime-instruction>[\s\S]*?<\/claude-note-runtime-instruction>\s*/g, "")
        .trim();
}

/**
 * 列出 Claude CLI 的历史会话。
 * @param workingDir Claude 运行的工作目录（路径里的 / 会被替换成 - 用作子目录名）
 * @param options.limit / options.days 过滤条件
 * @param options.claudeHomeDir Claude CLI 会话根目录（默认自动探测；公司定制版可能用 ~/.claude-internal）
 */
export function listClaudeSessions(
    workingDir: string,
    options: ClaudeSessionListOptions & { claudeHomeDir?: string } = {},
): ClaudeSessionSummary[] {
    const fs = nodeRequire<typeof import("fs")>("fs");
    const path = nodeRequire<typeof import("path")>("path");
    const dir = getClaudeProjectDir(workingDir, options.claudeHomeDir || "");
    const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
        ? Math.min(200, Math.floor(Number(options.limit)))
        : 30;
    const since = Number.isFinite(Number(options.days)) && Number(options.days) > 0
        ? Date.now() - Math.floor(Number(options.days)) * 24 * 60 * 60 * 1000
        : 0;
    try {
        return fs.readdirSync(dir)
            .filter((name: string) => name.endsWith(".jsonl"))
            .map((name: string) => {
                const filePath = path.join(dir, name);
                const stat = fs.statSync(filePath);
                const id = name.replace(/\.jsonl$/, "");
                const entries = readJsonLinesTail(filePath);
                const reversed = [...entries].reverse();
                const customTitle = stripClaudeNoteRuntimeInstruction(
                    reversed.find((entry) => entry?.type === "custom-title")?.customTitle ||
                    reversed.find((entry) => entry?.type === "agent-name")?.agentName ||
                    ""
                );
                const lastPrompt = stripClaudeNoteRuntimeInstruction(reversed.find((entry) => entry?.type === "last-prompt")?.lastPrompt || "");
                return {
                    id,
                    path: filePath,
                    title: String(customTitle || lastPrompt || id).slice(0, 80),
                    updatedAt: stat.mtimeMs,
                };
            })
            .filter((session: ClaudeSessionSummary) => !since || session.updatedAt >= since)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limit);
    } catch {
        return [];
    }
}

export function deleteClaudeSession(sessionPath: string): boolean {
    const fs = nodeRequire<typeof import("fs")>("fs");
    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            return true;
        }
    } catch (e) {
        console.error("Failed to delete session file", sessionPath, e);
    }
    return false;
}

export function renameClaudeSession(sessionPath: string, newTitle: string): boolean {
    const fs = nodeRequire<typeof import("fs")>("fs");
    try {
        if (fs.existsSync(sessionPath)) {
            const content = fs.readFileSync(sessionPath, "utf8");
            const needsNewline = content.length > 0 && !content.endsWith("\n");
            const extra = `{"type":"custom-title","customTitle":${JSON.stringify(newTitle)}}\n`;
            fs.appendFileSync(sessionPath, (needsNewline ? "\n" : "") + extra, "utf8");
            return true;
        }
    } catch (e) {
        console.error("Failed to rename session file", sessionPath, e);
    }
    return false;
}



function contentToText(content: any): string {
    if (typeof content === "string") return stripClaudeNoteRuntimeInstruction(content);
    if (Array.isArray(content)) {
        return content.map((item) => {
            if (typeof item === "string") return item;
            if (item?.text) return String(item.text);
            if (item?.content) return contentToText(item.content);
            if (item?.input) return JSON.stringify(item.input);
            return "";
        }).filter(Boolean).join("\n");
    }
    return "";
}

export function loadClaudeSessionMessages(sessionPath: string): Array<{ role: string; content: string; meta?: string }> {
    const out: Array<{ role: string; content: string; meta?: string }> = [];
    const entries = readJsonLines(sessionPath);
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
                const text = contentToText(content);
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

function resolveClaudeCli(configuredPath: string): string {
    const explicit = configuredPath.trim();
    if (explicit) return explicit;

    const childProcess = nodeRequire<typeof import("child_process")>("child_process");
    try {
        const result = childProcess.spawnSync("/bin/zsh", ["-lc", "command -v claude"], {
            encoding: "utf8",
            windowsHide: true,
        });
        const detected = String(result.stdout || "").trim();
        if (detected) return detected;
    } catch {
        // fall through to fixed locations
    }

    const fs = nodeRequire<typeof import("fs")>("fs");
    const home = String((globalThis as any)?.process?.env?.HOME || "");
    const candidates = [
        `${home}/.local/bin/claude`,
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
        "claude",
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            if (candidate === "claude" || fs.existsSync(candidate)) return candidate;
        } catch {
            // ignore and try next
        }
    }
    return "claude";
}

function pushTextFromContent(content: any, emit: (event: ClaudeStreamEvent) => void) {
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

export function normalizeClaudeEvent(raw: any): ClaudeStreamEvent[] {
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
            emit({ type: "stderr", text: formatClaudeSystemEvent(raw), sessionId: raw.session_id, raw });
        }
    } else if (raw.type === "assistant") {
        pushTextFromContent(raw.message?.content, emit);
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

export function runClaude(settings: ClaudeNoteSettings, prompt: string, sessionId: string | undefined, onEvent: (event: ClaudeStreamEvent) => void): ClaudeRunHandle {
    const childProcess = nodeRequire<typeof import("child_process")>("child_process");
    const cliPath = resolveClaudeCli(settings.cliPath);
    const args = ["-p", "--output-format", "stream-json", "--verbose"];
    const siyuanCliPath = getBundledSiyuanCliPath();

    // 检测是否是定制版 claude-internal —— 它不支持 --model/--no-chrome 这类参数
    const isClaudeInternal = /claude-internal/i.test(cliPath);

    const resolvedModel = resolveClaudeModelValue(settings.model);
    if (resolvedModel && !isClaudeInternal) {
        args.push("--model", resolvedModel);
    }
    if (settings.effort) {
        // claude-internal 帮助里只列了 low/medium/high，xhigh/max 静默忽略
        const effort = isClaudeInternal && !["low", "medium", "high"].includes(settings.effort)
            ? "high"
            : settings.effort;
        args.push("--effort", effort);
    }
    if (settings.permissionMode) {
        args.push("--permission-mode", settings.permissionMode);
    }
    const builtinPrompt = buildClaudeNoteSystemPrompt(siyuanCliPath);
    if (builtinPrompt) {
        args.push("--append-system-prompt", builtinPrompt);
    }
    args.push("--setting-sources", settings.loadUserSettings ? "user,project,local" : "project,local");
    if (!isClaudeInternal) {
        // --no-chrome 是 Anthropic 官方 claude 的参数；claude-internal 不支持，避免污染
        args.push("--no-chrome");
    }
    if (sessionId) {
        args.push("--resume", sessionId);
    }

    const windowApi = (globalThis as any).window?.siyuan?.config?.api;
    const token = settings.siyuanApiToken || windowApi?.token || "";
    const port = settings.siyuanApiPort && settings.siyuanApiPort !== "6806"
        ? settings.siyuanApiPort
        : (windowApi?.port || settings.siyuanApiPort || "6806");
    const siyuanApiUrl = `http://127.0.0.1:${port}`;

    const env = {
        ...readClaudeSettingsEnv(),
        ...((globalThis as any)?.process?.env || {}),
        SIYUAN_API_TOKEN: token,
        SIYUAN_API_PORT: port,
        SIYUAN_API_URL: siyuanApiUrl,
        CLAUDE_NOTE_SIYUAN_CLI: siyuanCliPath,
        ...parseEnvironmentVariables(settings.environmentVariables || ""),
        ANTHROPIC_MODEL: resolvedModel || settings.model,
        CLAUDE_CODE_EFFORT_LEVEL: settings.effort,
    };
    const child = childProcess.spawn(cliPath, args, {
        cwd: settings.workingDir || (globalThis as any)?.process?.cwd?.() || ".",
        env,
        shell: isWindows() || /\.(cmd|bat)$/i.test(cliPath),
        windowsHide: true,
    });

    let buffer = "";
    let capturedSessionId = sessionId;
    let aborted = false;
    let hasClaudeError = false;
    let errorText = "";

    const emitEvent = (event: ClaudeStreamEvent) => {
        if (event.sessionId) capturedSessionId = event.sessionId;
        if (event.type === "error") {
            hasClaudeError = true;
            errorText = event.error || errorText;
        } else if (event.type === "stderr" && event.text) {
            errorText = event.text;
        }
        onEvent(event);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        while (true) {
            const index = buffer.indexOf("\n");
            if (index < 0) break;
            const line = buffer.slice(0, index).replace(/\r$/, "");
            buffer = buffer.slice(index + 1);
            if (!line.trim()) continue;
            try {
                const raw = JSON.parse(line);
                for (const event of normalizeClaudeEvent(raw)) {
                    emitEvent(event);
                }
            } catch {
                emitEvent({ type: "stderr", text: line });
            }
        }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
        const lines = chunk.toString("utf8").split(/\r?\n/).filter(Boolean);
        for (const line of lines) emitEvent({ type: "stderr", text: line });
    });

    try {
        child.stdin?.write(prompt);
        child.stdin?.write("\n");
        child.stdin?.end();
    } catch (error) {
        emitEvent({ type: "error", error: `无法写入 Claude stdin: ${(error as Error).message}` });
    }

    const abort = () => {
        if (aborted) return;
        aborted = true;
        try {
            if (isWindows() && child.pid) {
                childProcess.spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true, shell: true });
            }
            child.kill();
        } catch {
            // ignore abort errors
        }
    };

    const completed = new Promise<{ exitCode: number | null; signal: string | null; sessionId?: string; hasClaudeError?: boolean; errorText?: string; aborted?: boolean }>((resolve) => {
        child.on("close", (exitCode: number | null, signal: string | null) => {
            // Flush remaining buffer
            if (buffer.trim()) {
                try {
                    const raw = JSON.parse(buffer);
                    for (const event of normalizeClaudeEvent(raw)) {
                        emitEvent(event);
                    }
                } catch { /* ignore parse errors on close */ }
            }
            resolve({ exitCode, signal, sessionId: capturedSessionId, hasClaudeError, errorText, aborted });
        });
        child.on("error", (error: Error) => {
            if (!aborted) emitEvent({ type: "error", error: `Claude 进程启动失败: ${error.message}` });
            resolve({ exitCode: null, signal: null, sessionId: capturedSessionId, hasClaudeError: true, errorText, aborted });
        });
    });

    return { abort, completed };
}
