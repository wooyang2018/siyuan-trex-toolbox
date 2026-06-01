export type PermissionMode = "auto" | "bypassPermissions" | "plan";

export interface ClaudeNoteSettings {
    chatPlacement: "dock" | "tab";
    cliPath: string;
    workingDir: string;
    /**
     * Claude CLI 的会话目录根（默认 ~/.claude）。
     * 公司定制版可能用 ~/.claude-internal 等。留空则自动探测：
     *   - 如果 ~/.claude/projects 存在则用它；
     *   - 否则若 ~/.claude-internal/projects 存在则用它；
     *   - 否则回退到 ~/.claude（即使不存在）。
     */
    claudeHomeDir: string;
    model: string;
    effort: "low" | "medium" | "high" | "xhigh" | "max";
    permissionMode: PermissionMode;
    safeMode: "safe" | "default" | "yolo";
    loadUserSettings: boolean;
    autoAttachCurrentDoc: boolean;
    showThinking: boolean;
    showToolCalls: boolean;
    enableAutoScroll: boolean;
    requireModEnterToSend: boolean;
    maxContextChars: number;
    historyLimit: number;
    historyDays: number;
    projectInstructions: string;
    appendSystemPrompt?: string;
    environmentVariables: string;
    customModels: string;
    enableChrome: boolean;
    enableBangBash: boolean;
    siyuanApiToken: string;
    siyuanApiPort: string;
}

export const SETTINGS_FILE = "settings.json";
export const PROJECT_INSTRUCTIONS_FILE = "CLAUDE.md";

export interface ClaudeModelOption {
    value: string;
    label: string;
    resolved: string;
}

const legacyDefaultSystemPrompt = [
    "你正在思源笔记内作为 Claude Note 运行。",
    "优先把用户当前打开的思源文档和手动引用块当作上下文。",
    "如果需要读取或修改思源笔记，优先使用本机可用的 siyuan-cli 或思源 API，不要直接编辑 .sy 文件。",
    "涉及写入时，先说明计划；除非用户明确要求，避免大范围批量改动。",
].join("\n");

interface DetectedDefaults {
    cliPath: string;
    workingDir: string;
    homedir: string;
    claudeHomeDir: string;
}

/**
 * 根据 Claude CLI 路径推断会话目录根。
 *   - cliPath 形如 .../claude-internal、.../claude-internal-cli、claude-internal.cmd
 *     → 返回 ~/.claude-internal
 *   - cliPath 形如 .../claude、claude.cmd
 *     → 返回 ~/.claude
 *   - cliPath 既不含 claude 也无法识别 → 返回 ""，调用方自行处理
 */
export function detectClaudeHomeDir(homedir: string, cliPath?: string): string {
    if (!homedir) return "";
    try {
        const requireFn = (window as any).require;
        if (typeof requireFn !== "function") return "";
        const path = requireFn("path");

        const cli = (cliPath || "").trim();
        if (cli) {
            // 取最后一段文件名（去扩展名），与已知变体匹配
            const baseName = path.basename(cli).replace(/\.(cmd|bat|exe|sh)$/i, "");
            // 注意：先匹配 internal，避免被普通 claude 提前 match
            if (/claude-internal\b/i.test(baseName)) {
                return path.join(homedir, ".claude-internal");
            }
            if (/\bclaude\b/i.test(baseName)) {
                return path.join(homedir, ".claude");
            }
        }
        return "";
    } catch (e) {
        console.warn("Failed to detect Claude home dir", e);
        return "";
    }
}

export function detectDefaultSettings(): DetectedDefaults {
    const defaults: DetectedDefaults = {
        cliPath: "claude",
        workingDir: "",
        homedir: "",
        claudeHomeDir: "",
    };

    try {
        const requireFn = (window as any).require;
        if (typeof requireFn === "function") {
            const os = requireFn("os");
            const path = requireFn("path");
            const fs = requireFn("fs");

            const homedir = os.homedir();
            defaults.homedir = homedir;
            const platform = os.platform();

            // Claude CLI 默认路径（按平台）
            if (platform === "win32") {
                defaults.cliPath = path.join(homedir, "AppData", "Roaming", "npm", "claude.cmd");
            } else {
                defaults.cliPath = path.join(homedir, ".local", "bin", "claude");
            }

            // workingDir 优先用思源运行时已知的数据目录，避免猜测
            const siyuanDataDir = (window as any)?.siyuan?.config?.system?.dataDir;
            if (siyuanDataDir && typeof siyuanDataDir === "string" && fs.existsSync(siyuanDataDir)) {
                defaults.workingDir = siyuanDataDir;
            } else if (platform === "win32") {
                const winCandidates = [
                    path.join(homedir, "Documents", "SiYuan", "data"),
                    path.join(homedir, "SiYuan", "data"),
                ];
                defaults.workingDir = winCandidates.find((c: string) => fs.existsSync(c)) || "";
            } else {
                const unixCandidates = [
                    path.join(homedir, "SiYuan", "data"),
                    path.join(homedir, "siyuan", "data"),
                    path.join(homedir, "Documents", "SiYuan", "data"),
                ];
                defaults.workingDir = unixCandidates.find((c: string) => fs.existsSync(c)) || "";
            }
            // 如果探测失败，留空——用户必须手动配置（避免兜底假路径误导）

            // claudeHomeDir 必须基于 cliPath 才能判断（默认 cliPath 是普通版 claude，所以默认会推 ~/.claude）
            defaults.claudeHomeDir = detectClaudeHomeDir(homedir, defaults.cliPath);
        }
    } catch (e) {
        console.warn("Failed to detect Node.js environment paths, using fallback defaults", e);
    }

    return defaults;
}

export function readClaudeSettingsEnv(): Record<string, string> {
    try {
        const requireFn = (window as any).require;
        if (typeof requireFn !== "function") return {};
        const os = requireFn("os");
        const path = requireFn("path");
        const fs = requireFn("fs");
        const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
        if (!fs.existsSync(settingsPath)) return {};
        const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        return parsed?.env && typeof parsed.env === "object" ? parsed.env : {};
    } catch (e) {
        console.warn("Failed to read Claude settings env", e);
        return {};
    }
}

export function resolveClaudeModelValue(model: string): string {
    const value = (model || "").trim();
    if (!value) return "";
    const env = readClaudeSettingsEnv();
    const key = value.toLowerCase();
    if (key === "haiku") return env.ANTHROPIC_DEFAULT_HAIKU_MODEL || value;
    if (key === "sonnet") return env.ANTHROPIC_DEFAULT_SONNET_MODEL || value;
    if (key === "opus") return env.ANTHROPIC_DEFAULT_OPUS_MODEL || value;
    return value;
}

export function buildClaudeModelOptions(settings: ClaudeNoteSettings): ClaudeModelOption[] {
    const env = readClaudeSettingsEnv();
    const candidates = [
        { value: "haiku", rank: 10 },
        { value: "sonnet", rank: 20 },
        { value: "opus", rank: 30 },
    ];

    const current = settings.model.trim();
    if (current && !candidates.some((item) => item.value === current)) {
        candidates.push({ value: current, rank: 50 + candidates.length });
    }

    const envModels = Object.entries(env)
        .filter(([key, value]) => /MODEL/i.test(key) && typeof value === "string" && value.trim())
        .map(([, value]) => value.trim())
        .filter((value) => !/token|key|secret/i.test(value));
    for (const model of envModels) {
        if (!candidates.some((item) => item.value === model)) {
            candidates.push({ value: model, rank: 40 + candidates.length });
        }
    }

    const byResolved = new Map<string, { value: string; rank: number }>();
    for (const candidate of candidates) {
        const resolved = resolveClaudeModelValue(candidate.value);
        if (!resolved) continue;
        const previous = byResolved.get(resolved);
        if (!previous || candidate.rank >= previous.rank) {
            byResolved.set(resolved, { value: resolved, rank: candidate.rank });
        }
    }

    return Array.from(byResolved.entries())
        .map(([resolved, item]) => ({
            value: item.value,
            resolved,
            label: resolved,
            rank: item.rank,
        }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ value, resolved, label }) => ({ value, resolved, label }));
}

const detected = detectDefaultSettings();

export const defaultSettings: ClaudeNoteSettings = {
    chatPlacement: "dock",
    cliPath: detected.cliPath,
    workingDir: detected.workingDir,
    claudeHomeDir: detected.claudeHomeDir,
    model: "sonnet",
    effort: "high",
    permissionMode: "auto",
    safeMode: "default",
    loadUserSettings: true,
    autoAttachCurrentDoc: false,
    showThinking: false,
    showToolCalls: true,
    enableAutoScroll: true,
    requireModEnterToSend: false,
    maxContextChars: 200000,
    historyLimit: 30,
    historyDays: 0,
    environmentVariables: "",
    customModels: "",
    enableChrome: false,
    enableBangBash: false,
    projectInstructions: "",
    appendSystemPrompt: "",
    siyuanApiToken: "",
    siyuanApiPort: "6806",
};

export function getNodeRequire(): ((id: string) => any) | null {
    const requireFn = (globalThis as any)?.window?.require || (globalThis as any)?.require;
    return typeof requireFn === "function" ? requireFn : null;
}

export function getProjectInstructionsPath(workingDir: string): string {
    const requireFn = getNodeRequire();
    if (!requireFn) return "";
    try {
        const path = requireFn("path");
        return path.join(workingDir || detectDefaultSettings().workingDir, PROJECT_INSTRUCTIONS_FILE);
    } catch {
        return "";
    }
}

export function readProjectInstructions(workingDir: string): string | null {
    const requireFn = getNodeRequire();
    if (!requireFn) return null;
    try {
        const fs = requireFn("fs");
        const filePath = getProjectInstructionsPath(workingDir);
        if (!filePath || !fs.existsSync(filePath)) return null;
        return fs.readFileSync(filePath, "utf8");
    } catch (error) {
        console.warn("Failed to read CLAUDE.md", error);
        return null;
    }
}

export function writeProjectInstructions(workingDir: string, content: string): boolean {
    const requireFn = getNodeRequire();
    if (!requireFn) return false;
    try {
        const fs = requireFn("fs");
        const path = requireFn("path");
        const filePath = getProjectInstructionsPath(workingDir);
        if (!filePath) return false;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content || "", "utf8");
        return true;
    } catch (error) {
        console.warn("Failed to write CLAUDE.md", error);
        return false;
    }
}

export function hydrateProjectInstructions(settings: ClaudeNoteSettings): ClaudeNoteSettings {
    const existing = readProjectInstructions(settings.workingDir);
    if (existing !== null) {
        return { ...settings, projectInstructions: existing, appendSystemPrompt: "" };
    }
    const legacyPrompt = (settings.appendSystemPrompt || "").trim();
    const initialContent = settings.projectInstructions || legacyPrompt || "";
    writeProjectInstructions(settings.workingDir, initialContent);
    return { ...settings, projectInstructions: initialContent, appendSystemPrompt: "" };
}

export function mergeSettings(input: Partial<ClaudeNoteSettings> | null | undefined): ClaudeNoteSettings {
    const detectedDefaults = detectDefaultSettings();
    const merged = { ...defaultSettings, ...(input || {}) };
    merged.chatPlacement = "dock";
    merged.model = resolveClaudeModelValue(merged.model) || defaultSettings.model;

    const currentHomedir = detectedDefaults.homedir;

    // 智能处理空路径或者其他用户路径残留，防止泄露个人隐私且支持自适应重置
    const isLegacyUserPath = (p: string | undefined): boolean => {
        if (!p) return false;
        if (!currentHomedir) return false;
        // 如果是绝对路径且包含常见的多用户目录，但却不以当前 homedir 开头，说明是其他用户的路径残留
        const hasUserPrefix = p.includes("/Users/") || p.includes("\\Users\\") || p.includes("/home/");
        return hasUserPrefix && !p.startsWith(currentHomedir);
    };

    if (!merged.cliPath?.trim() || isLegacyUserPath(merged.cliPath)) {
        merged.cliPath = detectedDefaults.cliPath || "claude";
    }

    if (!merged.workingDir?.trim() || isLegacyUserPath(merged.workingDir) || merged.workingDir.includes("AI-workspace")) {
        merged.workingDir = detectedDefaults.workingDir;
    }

    // claudeHomeDir 留空时，根据用户当前配的 cliPath 推断（公司定制 CLI 通常是 claude-internal）
    if (!merged.claudeHomeDir?.trim() || isLegacyUserPath(merged.claudeHomeDir)) {
        merged.claudeHomeDir = detectClaudeHomeDir(detectedDefaults.homedir, merged.cliPath);
    }

    if (merged.appendSystemPrompt === legacyDefaultSystemPrompt || /称用户/.test(merged.appendSystemPrompt || "")) {
        merged.appendSystemPrompt = "";
    }
    if (!merged.projectInstructions && merged.appendSystemPrompt) {
        merged.projectInstructions = merged.appendSystemPrompt;
    }
    merged.appendSystemPrompt = "";
    const numericLimit = Number(merged.maxContextChars);
    merged.maxContextChars = Number.isFinite(numericLimit) && numericLimit > 1000 ? numericLimit : defaultSettings.maxContextChars;
    const historyLimit = Number(merged.historyLimit);
    merged.historyLimit = Number.isFinite(historyLimit) && historyLimit > 0
        ? Math.min(200, Math.floor(historyLimit))
        : defaultSettings.historyLimit;
    const historyDays = Number(merged.historyDays);
    merged.historyDays = Number.isFinite(historyDays) && historyDays > 0
        ? Math.min(3650, Math.floor(historyDays))
        : 0;
    if (!["auto", "bypassPermissions", "plan"].includes(merged.permissionMode)) {
        merged.permissionMode = "auto";
    }
    if (!["low", "medium", "high", "xhigh", "max"].includes(merged.effort)) {
        merged.effort = defaultSettings.effort;
    }
    if (!["safe", "default", "yolo"].includes(merged.safeMode)) {
        merged.safeMode = defaultSettings.safeMode;
    }
    return merged;
}
