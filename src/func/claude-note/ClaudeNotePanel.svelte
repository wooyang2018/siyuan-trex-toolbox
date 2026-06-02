<script lang="ts">
    import { tick, onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import MarkdownBlock from "./MarkdownBlock.svelte";
    // svelte-preprocess + TypeScript isolatedModules 在 lang="ts" 模式下，
    // 若 default import 仅在模板中使用，可能被 TS elision 移除（误判为 unused）。
    void MarkdownBlock;
    import {
        deleteClaudeSession,
        describeClaudeSessionDir,
        listClaudeSessions,
        loadClaudeSessionMessages,
        renameClaudeSession,
        runClaude,
        type ClaudeRunHandle,
        type ClaudeSessionSummary,
        type ClaudeStreamEvent,
    } from "./claude-runner";
    import {
        buildClaudeModelOptions,
        defaultSettings,
        mergeSettings,
        type ClaudeNoteSettings,
    } from "./settings";
    import {
        appendBlockToDoc,
        buildBlockContext,
        findCurrentDocumentId,
        formatContext,
        getBlockKramdown,
        getDocTitle,
        getSelectedTextContext,
        searchDocuments,
        summarizeBlockMarkdown,
        type ContextItem,
    } from "./siyuan-api";

    export let settings: ClaudeNoteSettings = defaultSettings;
    export let saveSettings: (settings: ClaudeNoteSettings) => Promise<void>;
    export let openSetting: (() => void) | undefined = undefined;
    export let clearPluginPendingContexts: (() => void) | undefined = undefined;
    export let isTabPanel = false;
    export let i18n: any = {};

    type Role = "user" | "assistant" | "event" | "tool" | "thinking" | "error" | "duration" | "usage";
    type Message = { id: string; role: Role; content: string; meta?: string };
    type PendingRef = { kind: "block" | "doc"; id: string };
    type ManualContext = { id: string; title: string; markdown: string };
    type SessionOptions = Pick<ClaudeNoteSettings, "model" | "effort" | "permissionMode" | "safeMode">;

    interface PanelSessionState {
        input: string;
        messages: Message[];
        pendingRefs: PendingRef[];
        manualContexts: ManualContext[];
        expandedItems: Set<string>;
        streamedCtxUsed: number;
        streamedCtxLimit: number;
        userManuallyDetached: boolean;
        options: SessionOptions;
    }

    interface TokenUsage {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    }

    interface Turn {
        id: string; // Typically the user's message ID to anchor this turn
        userMessage: Message | null;
        workingProcess: Message[]; // thinking, tool, event
        assistantMessage: Message | null;
        errorMessage: Message | null;
        durationMs?: number;
        usage?: TokenUsage;
    }

    function generateUUID() {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    const welcomeGreetings = [
        "把一闪而过的念头，安放在这里。",
        "今天的灵感，也许正等你写下第一句。",
        "思考不是抵达，是一盏慢慢亮起的灯。",
        "写下来，模糊的东西会开始成形。",
        "每一条笔记，都是未来与你的重逢。",
        "让想法先停靠，再出发。",
        "在这里，碎片会慢慢长出脉络。",
        "记录，是给思想留下回声。",
        "Begin with a spark. Stay for the pattern.",
        "Your thoughts have entered a quiet room.",
        "Not every idea is ready. Some need a place to breathe.",
        "捕捉此刻，整理未来。",
        "一页空白，等一颗念头落下。",
        "知识会沉淀，灵感会发芽。",
        "Think softly. Write clearly.",
        "A note is a seed with memory.",
        "今天的困惑，可能是明天的索引。",
        "让 AI 帮你照看那些尚未成形的想法。",
        "Between thought and insight, there is a note.",
        "慢慢写，答案会自己靠近。"
    ];

    let input = "";
    let messages: Message[] = [];
    let pendingRefs: PendingRef[] = [];
    let manualContexts: ManualContext[] = [];
    let filePicker: HTMLInputElement;
    let activeSessionId = "";
    let running = false;
    let activeRuns: Record<string, ClaudeRunHandle> = {};
    let componentDestroyed = false;
    let transcript: HTMLDivElement;
    let localSettings = mergeSettings(settings);
    let previousSettings = settings;
    let sessions: ClaudeSessionSummary[] = [];
    let historyOpen = false;
    let streamedCtxUsed = 0;
    let streamedCtxLimit = 200000;

    // Collapsed/expanded state for individual thinking/tool entries.
    let expandedItems = new Set<string>();

    // Academic randomized greeting & active document sensing
    let activeGreeting = welcomeGreetings[0];
    let activeDocId = "";
    let activeDocTitle = "";
    let pollInterval: any;
    let titleCache: Record<string, string> = {};
    let userManuallyDetached = false;
    let lastProcessedDocId = "";
    let lastAutoAttachSetting = localSettings?.autoAttachCurrentDoc ?? false;

    // Smart @ mentions search state
    let searchOpen = false;
    let searchQuery = "";
    let searchResults: Array<{ id: string; title: string; hpath: string }> = [];
    let searchLoading = false;
    let searchDebounceTimer: any;
    let composer: HTMLTextAreaElement;
    let searchInput: HTMLInputElement;

    // Write-back state
    let writeBackBusy = false;

    // Drag-drop state
    let dropActive = false;

    // Inline session editing and deletion state
    let editingSessionId = "";
    let editingTitle = "";
    let editingTitleInput: HTMLInputElement;

    // Active sessions open as tabs (keeps top recent sessions and current active session)
    const DRAFT_SESSION_PREFIX = "draft:";
    const createDraftSessionId = () => `${DRAFT_SESSION_PREFIX}${generateUUID()}`;
    const isDraftSessionId = (id: string) => id.startsWith(DRAFT_SESSION_PREFIX);
    const initialDraftSessionId = createDraftSessionId();
    let activeDraftSessionId = initialDraftSessionId;
    let activeSessionIds: string[] = [initialDraftSessionId];
    let currentTabKey = initialDraftSessionId;
    let sessionModels: Record<string, string> = {};
    let sessionStates: Record<string, PanelSessionState> = {};
    let isRenamingCurrent = false;
    let renameCurrentTitle = "";
    let renameCurrentInput: HTMLInputElement;

    onMount(() => {
        randomizeGreeting();

        // Initialize with just the empty "new session" state
        // Sessions are added to tabs only when the user creates them
        try {
            sessions = listFilteredSessions();
        } catch (e) {
            console.error("Failed to load sessions on mount", e);
        }
        activeSessionIds = [activeDraftSessionId];

        // 1.2s heartbeats to sense active editor tab
        pollInterval = setInterval(async () => {
            const currentId = findCurrentDocumentId();
            if (currentId !== activeDocId) {
                activeDocId = currentId;
                if (activeDocId) {
                    try {
                        const title = await getDocTitle(activeDocId);
                        activeDocTitle = title;
                        titleCache[titleCacheKey(activeDocId, "doc")] = activeDocTitle;
                        titleCache = { ...titleCache };
                    } catch (e) {
                        console.warn("Failed to resolve active doc path", e);
                        activeDocTitle = activeDocId;
                    }
                } else {
                    activeDocTitle = "";
                }
            }
        }, 1200);
    });

    onDestroy(() => {
        componentDestroyed = true;
        if (pollInterval) clearInterval(pollInterval);
        abortAllRuns();
    });

    function sessionListOptions(source: ClaudeNoteSettings = localSettings) {
        return {
            limit: source.historyLimit,
            days: source.historyDays,
            claudeHomeDir: source.claudeHomeDir,
        };
    }

    function listFilteredSessions(source: ClaudeNoteSettings = localSettings) {
        return listClaudeSessions(source.workingDir, sessionListOptions(source));
    }

    function randomizeGreeting() {
        activeGreeting = welcomeGreetings[Math.floor(Math.random() * welcomeGreetings.length)];
    }

    function titleCacheKey(id: string, kind: "block" | "doc") {
        return `${kind}:${id}`;
    }

    async function resolveRefTitle(id: string, kind: "block" | "doc") {
        const key = titleCacheKey(id, kind);
        if (titleCache[key]) return;
        try {
            if (kind === "doc") {
                titleCache[key] = await getDocTitle(id);
            } else {
                const markdown = await getBlockKramdown(id);
                titleCache[key] = summarizeBlockMarkdown(markdown);
            }
        } catch (e) {
            titleCache[key] = id;
        }
        titleCache = { ...titleCache };
    }

    // Smart Siyuan search with input debounce
    async function toggleSearch() {
        searchOpen = !searchOpen;
        if (searchOpen) {
            searchQuery = "";
            searchResults = [];
            runSearch();
            await tick();
            searchInput?.focus();
        }
    }

    function closeSearch() {
        searchOpen = false;
        searchQuery = "";
        searchResults = [];
    }

    function triggerSearch() {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            runSearch();
        }, 300);
    }

    async function runSearch() {
        searchLoading = true;
        try {
            searchResults = await searchDocuments(searchQuery);
        } catch (e) {
            console.error("Search failed", e);
        } finally {
            searchLoading = false;
        }
    }

    function toggleDocAttachment(doc: { id: string; title: string; hpath: string }) {
        const ref = { kind: "doc" as const, id: doc.id };
        const existing = pendingRefs.find((item) => item.kind === "doc" && item.id === doc.id);
        if (existing) {
            pendingRefs = pendingRefs.filter((item) => item !== existing);
            if (doc.id === activeDocId) {
                userManuallyDetached = true;
            }
        } else {
            titleCache[titleCacheKey(doc.id, "doc")] = doc.title;
            titleCache = { ...titleCache };
            pendingRefs = [...pendingRefs, ref];
            if (doc.id === activeDocId) {
                userManuallyDetached = false;
            }
        }
    }

    async function startRename(session: ClaudeSessionSummary, event: Event) {
        event.stopPropagation();
        editingSessionId = session.id;
        editingTitle = session.title;
        await tick();
        editingTitleInput?.focus();
        editingTitleInput?.select();
    }

    function saveRename(session: ClaudeSessionSummary, event: Event) {
        event.stopPropagation();
        const title = editingTitle.trim();
        if (title && title !== session.title) {
            const success = renameClaudeSession(session.path, title);
            if (success) {
                showMessage(i18n.sessionRenameSuccess || "会话重命名成功");
                sessions = sessions.map(s => s.id === session.id ? { ...s, title } : s);
            } else {
                showMessage(i18n.sessionRenameFailed || "重命名失败");
            }
        }
        editingSessionId = "";
    }

    function cancelRename(event: Event) {
        event.stopPropagation();
        editingSessionId = "";
    }

    function deleteSession(session: ClaudeSessionSummary, event: Event) {
        event.stopPropagation();
        const confirmMsg = (i18n.confirmDeleteSession || "确定要删除会话 \"{title}\" 吗？（对应的底层文件将被物理移除）").replace("{title}", session.title);
        if (confirm(confirmMsg)) {
            const success = deleteClaudeSession(session.path);
            if (success) {
                showMessage(i18n.sessionDeleted || "会话已删除");
                sessions = sessions.filter(s => s.id !== session.id);
                activeSessionIds = activeSessionIds.filter(id => id !== session.id);
                if (activeSessionIds.length === 0) {
                    const draftId = createDraftSessionId();
                    activeDraftSessionId = draftId;
                    activeSessionIds = [draftId];
                }
                if (activeSessionId === session.id) {
                    const firstTab = activeSessionIds[0];
                    if (isDraftSessionId(firstTab)) {
                        selectSessionTab(firstTab);
                    } else {
                        const nextSession = sessions.find(s => s.id === firstTab);
                        if (nextSession) {
                            loadSession(nextSession);
                        } else {
                            newSession();
                        }
                    }
                }
            } else {
                showMessage(i18n.sessionDeleteFailed || "删除会话失败");
            }
        }
    }

    interface ParsedContext {
        source: string;
        preview: string;
    }

    function cleanKramdownPreview(raw: string): string {
        return raw
            // 删除 IAL 属性标记 {: id="..." updated="..." ...}
            .replace(/\{:[^}]*\}/g, "")
            // 删除 markdown 图片 ![alt](url)
            .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
            // 把 [text](url) 只保留 text
            .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
            // 删除行内代码反引号包裹（保留内容）
            .replace(/`([^`]*)`/g, "$1")
            // 删除 markdown 粗体 / 斜体标记
            .replace(/\*{1,3}([^*]*)\*{1,3}/g, "$1")
            // 删除 HTML 标签
            .replace(/<[^>]+>/g, "")
            // 压缩空白
            .replace(/\s+/g, " ")
            .trim();
    }

    function parseContextItems(contextText: string): ParsedContext[] {
        const result: ParsedContext[] = [];
        const re = /<siyuan-context[^>]*source="([^"]*)"[^>]*>([\s\S]*?)<\/siyuan-context>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(contextText)) !== null) {
            const rawSource = m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
            // source 格式: "kind | id | hpath/title"，取最后一段作为显示名
            const parts = rawSource.split(" | ");
            const displaySource = parts[parts.length - 1] || rawSource;
            const cleaned = cleanKramdownPreview(m[2]);
            const preview = cleaned.length > 150 ? cleaned.slice(0, 150) + "…" : cleaned;
            result.push({ source: displaySource, preview });
        }
        return result;
    }

    function parseUserMessage(content: string) {
        const separator = "\n---\n用户问题：\n";
        const idx = content.indexOf(separator);
        if (idx >= 0) {
            return {
                question: content.slice(idx + separator.length),
                hasContext: true,
                contextText: content.slice(0, idx)
            };
        }
        return {
            question: content,
            hasContext: false,
            contextText: ""
        };
    }

    $: if (settings !== previousSettings) {
        previousSettings = settings;
        localSettings = mergeSettings({ ...settings, ...getSessionOptions(currentTabKey) });
        if (historyOpen) sessions = listFilteredSessions();
    }
    $: currentDocAttached = activeDocId ? pendingRefs.some((ref) => ref.kind === "doc" && ref.id === activeDocId) : false;

    $: {
        const isAutoAttach = localSettings.autoAttachCurrentDoc;
        if (isAutoAttach !== lastAutoAttachSetting) {
            if (isAutoAttach) {
                userManuallyDetached = false;
            } else {
                if (activeDocId && pendingRefs.some(ref => ref.kind === "doc" && ref.id === activeDocId)) {
                    pendingRefs = pendingRefs.filter(ref => !(ref.kind === "doc" && ref.id === activeDocId));
                }
            }
            lastAutoAttachSetting = isAutoAttach;
        }

        if (isAutoAttach) {
            if (activeDocId !== lastProcessedDocId) {
                if (lastProcessedDocId && pendingRefs.some(ref => ref.kind === "doc" && ref.id === lastProcessedDocId)) {
                    pendingRefs = pendingRefs.filter(ref => !(ref.kind === "doc" && ref.id === lastProcessedDocId));
                }
                userManuallyDetached = false;
                lastProcessedDocId = activeDocId;
                
                if (activeDocId && !pendingRefs.some(ref => ref.kind === "doc" && ref.id === activeDocId)) {
                    pendingRefs = [...pendingRefs, { kind: "doc", id: activeDocId }];
                }
            } else if (activeDocId && !userManuallyDetached && !pendingRefs.some(ref => ref.kind === "doc" && ref.id === activeDocId)) {
                pendingRefs = [...pendingRefs, { kind: "doc", id: activeDocId }];
            }
        } else {
            if (activeDocId !== lastProcessedDocId) {
                lastProcessedDocId = activeDocId;
                userManuallyDetached = false;
            }
        }
    }

    $: modelOptions = buildClaudeModelOptions(localSettings);
    $: currentTabKey = activeSessionId || activeDraftSessionId;
    $: running = Boolean(activeRuns[currentTabKey]);
    $: currentSessionTitle = activeSessionId
        ? (sessions.find((session) => session.id === activeSessionId)?.title || (i18n.sessionWithId || "会话 {id}").replace("{id}", activeSessionId.slice(0, 8)))
        : (i18n.newSession || "新会话");

    $: {
        for (const ref of pendingRefs) {
            if (!titleCache[titleCacheKey(ref.id, ref.kind)]) {
                resolveRefTitle(ref.id, ref.kind);
            }
        }
    }

    $: totalUsage = turns.reduce((acc, turn) => {
        if (turn.usage) {
            acc.input += turn.usage.input_tokens || 0;
            acc.output += turn.usage.output_tokens || 0;
            acc.cacheRead += turn.usage.cache_read_input_tokens || 0;
            acc.cacheCreation += turn.usage.cache_creation_input_tokens || 0;
        }
        return acc;
    }, { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });

    $: latestUsage = [...turns].reverse().find((turn) => {
        const usage = turn.usage;
        return usage && ((usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0)) > 0;
    })?.usage;
    $: latestCtxUsed = latestUsage
        ? (latestUsage.input_tokens || 0) + (latestUsage.cache_creation_input_tokens || 0)
        : 0;
    $: ctxUsed = streamedCtxUsed || latestCtxUsed;
    $: ctxLimit = streamedCtxLimit || 200000;
    $: ctxPercent = ctxLimit > 0 ? Math.min(99, Math.round((ctxUsed / ctxLimit) * 100)) : 0;

    // --- Svelte Reactive Turn Grouping Logic ---
    let turns: Turn[] = [];
    $: {
        const grouped: Turn[] = [];
        let currentTurn: Turn | null = null;

        for (const msg of messages) {
            if (msg.role === "user") {
                if (currentTurn) grouped.push(currentTurn);
                currentTurn = {
                    id: msg.id,
                    userMessage: msg,
                    workingProcess: [],
                    assistantMessage: null,
                    errorMessage: null
                };
            } else {
                if (!currentTurn) {
                    // Create an orphan turn anchor if no user prompt starts the list
                    currentTurn = {
                        id: msg.id,
                        userMessage: null,
                        workingProcess: [],
                        assistantMessage: null,
                        errorMessage: null
                    };
                }

                if (msg.role === "assistant") {
                    currentTurn.assistantMessage = msg;
                } else if (msg.role === "error") {
                    currentTurn.errorMessage = msg;
                } else if (msg.role === "duration") {
                    currentTurn.durationMs = Number(msg.content);
                } else if (msg.role === "usage") {
                    try {
                        currentTurn.usage = JSON.parse(msg.content);
                    } catch {
                        // ignore malformed usage JSON
                    }
                } else {
                    // thinking, tool, event
                    if (msg.role === "thinking" && !localSettings.showThinking) {
                        continue;
                    }
                    if (msg.role === "tool" && !localSettings.showToolCalls) {
                        continue;
                    }
                    currentTurn.workingProcess.push(msg);
                }
            }
        }
        if (currentTurn) grouped.push(currentTurn);
        turns = grouped;
    }

    function toggleItemExpanded(itemId: string) {
        const next = new Set(expandedItems);
        if (next.has(itemId)) {
            next.delete(itemId);
        } else {
            next.add(itemId);
        }
        expandedItems = next;
    }

    // Formatting utilities for premium aesthetics
    function formatDuration(ms: number | undefined): string {
        if (ms === undefined) return "";
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    }

    function getToolLabel(meta: string | undefined): string {
        if (!meta || meta === "tool") return i18n.callTool || "调用工具";
        if (meta === "tool_result") return i18n.toolOutput || "工具输出";
        return meta.replace(/^mcp__/, "").replace(/__/g, " / ");
    }

    function activeSessionKey(): string {
        return currentTabKey;
    }

    function getSessionOptions(key: string): SessionOptions {
        return sessionStates[key]?.options || {
            model: localSettings.model,
            effort: localSettings.effort,
            permissionMode: localSettings.permissionMode,
            safeMode: localSettings.safeMode
        };
    }

    function captureActiveState(): PanelSessionState {
        return {
            input,
            messages,
            pendingRefs,
            manualContexts,
            expandedItems: new Set(expandedItems),
            streamedCtxUsed,
            streamedCtxLimit,
            userManuallyDetached,
            options: {
                model: localSettings.model,
                effort: localSettings.effort,
                permissionMode: localSettings.permissionMode,
                safeMode: localSettings.safeMode
            }
        };
    }

    function saveActiveState() {
        const key = currentTabKey;
        if (!key) return;
        sessionStates = { ...sessionStates, [key]: captureActiveState() };
    }

    function applySessionState(key: string, state: PanelSessionState) {
        input = state.input;
        messages = state.messages;
        pendingRefs = state.pendingRefs;
        manualContexts = state.manualContexts;
        expandedItems = new Set(state.expandedItems);
        streamedCtxUsed = state.streamedCtxUsed;
        streamedCtxLimit = state.streamedCtxLimit || 200000;
        userManuallyDetached = state.userManuallyDetached ?? false;
        localSettings = mergeSettings({ ...settings, ...state.options });
    }

    function blankSessionState(options: SessionOptions = getSessionOptions(currentTabKey)): PanelSessionState {
        return {
            input: "",
            messages: [],
            pendingRefs: [],
            manualContexts: [],
            expandedItems: new Set<string>(),
            streamedCtxUsed: 0,
            streamedCtxLimit: 200000,
            userManuallyDetached: false,
            options
        };
    }

    function replaceSessionKey(oldKey: string, sessionId: string): string {
        if (!oldKey || oldKey === sessionId) return sessionId;
        const wasActive = currentTabKey === oldKey;
        const state = wasActive ? captureActiveState() : sessionStates[oldKey];
        if (state) {
            const nextStates = { ...sessionStates, [sessionId]: state };
            delete nextStates[oldKey];
            sessionStates = nextStates;
        }
        if (activeRuns[oldKey]) {
            const nextRuns = { ...activeRuns, [sessionId]: activeRuns[oldKey] };
            delete nextRuns[oldKey];
            activeRuns = nextRuns;
        }
        activeSessionIds = Array.from(new Set(activeSessionIds.map(id => id === oldKey ? sessionId : id)));
        if (!activeSessionIds.includes(sessionId)) {
            activeSessionIds = [...activeSessionIds, sessionId];
        }
        if (wasActive) {
            activeSessionId = sessionId;
            activeDraftSessionId = "";
            currentTabKey = sessionId;
            if (state) applySessionState(sessionId, state);
        }
        return sessionId;
    }

    function abortRunForKey(key: string) {
        const handle = activeRuns[key];
        if (!handle) return false;
        handle.abort();
        const nextRuns = { ...activeRuns };
        delete nextRuns[key];
        activeRuns = nextRuns;
        return true;
    }

    function abortAllRuns() {
        const handles = Object.values(activeRuns);
        if (handles.length === 0) return;
        activeRuns = {};
        for (const handle of handles) {
            handle.abort();
        }
    }

    export function addPendingContext(ref: PendingRef) {
        if (!pendingRefs.some((item) => item.kind === ref.kind && item.id === ref.id)) {
            pendingRefs = [...pendingRefs, ref];
        }
    }

    function addMessage(role: Role, content: string, meta = "") {
        messages = [...messages, { id: generateUUID(), role, content, meta }];
        if (localSettings.enableAutoScroll) scrollDown();
    }

    function addMessageFor(key: string, role: Role, content: string, meta = "") {
        if (key === currentTabKey) {
            addMessage(role, content, meta);
            return;
        }
        const state = sessionStates[key] || blankSessionState();
        sessionStates = {
            ...sessionStates,
            [key]: {
                ...state,
                messages: [...state.messages, { id: generateUUID(), role, content, meta }]
            }
        };
    }

    function appendAssistant(text: string) {
        if (!text) return;
        const last = messages[messages.length - 1];
        if (last?.role === "assistant") {
            messages = [...messages.slice(0, -1), { ...last, content: `${last.content}${last.content ? "\n" : ""}${text}` }];
        } else {
            addMessage("assistant", text);
        }
    }

    function appendAssistantFor(key: string, text: string) {
        if (!text) return;
        if (key === currentTabKey) {
            appendAssistant(text);
            return;
        }
        const state = sessionStates[key] || blankSessionState();
        const last = state.messages[state.messages.length - 1];
        const nextMessages = last?.role === "assistant"
            ? [...state.messages.slice(0, -1), { ...last, content: `${last.content}${last.content ? "\n" : ""}${text}` }]
            : [...state.messages, { id: generateUUID(), role: "assistant" as Role, content: text, meta: "" }];
        sessionStates = { ...sessionStates, [key]: { ...state, messages: nextMessages } };
    }

    function readNumber(value: unknown): number {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
    }

    function updateContextUsage(raw: unknown) {
        if (!raw || typeof raw !== "object") return;
        const data = raw as any;
        const usage = data.usage || data.message?.usage || data;
        const rawModelUsage = data.modelUsage || data.model_usage || usage?.modelUsage || {};
        const modelUsage = rawModelUsage?.contextWindow || rawModelUsage?.context_window
            ? rawModelUsage
            : Object.values(rawModelUsage || {}).find((item: any) => item && typeof item === "object") || {};
        const nextLimit = readNumber(modelUsage.contextWindow ?? modelUsage.context_window ?? data.contextWindow ?? data.context_window);
        if (nextLimit > 0) {
            streamedCtxLimit = nextLimit;
        }
        const usageTokens =
            readNumber(usage.input_tokens ?? usage.input) +
            readNumber(usage.cache_creation_input_tokens) +
            readNumber(usage.cache_creation?.ephemeral_1h_input_tokens) +
            readNumber(usage.cache_creation?.ephemeral_5m_input_tokens);
        const modelTokens = readNumber(modelUsage.usedContextWindow ?? modelUsage.currentContextWindow ?? modelUsage.contextTokens ?? modelUsage.inputTokens);
        const nextUsed = Math.max(usageTokens, modelTokens);
        if (nextUsed > 0) streamedCtxUsed = nextUsed;
    }

    function updateContextUsageFor(key: string, raw: unknown) {
        if (key === currentTabKey) {
            updateContextUsage(raw);
            return;
        }
        if (!raw || typeof raw !== "object") return;
        const state = sessionStates[key] || blankSessionState();
        const data = raw as any;
        const usage = data.usage || data.message?.usage || data;
        const rawModelUsage = data.modelUsage || data.model_usage || usage?.modelUsage || {};
        const modelUsage = rawModelUsage?.contextWindow || rawModelUsage?.context_window
            ? rawModelUsage
            : Object.values(rawModelUsage || {}).find((item: any) => item && typeof item === "object") || {};
        const nextLimit = readNumber(modelUsage.contextWindow ?? modelUsage.context_window ?? data.contextWindow ?? data.context_window);
        const usageTokens =
            readNumber(usage.input_tokens ?? usage.input) +
            readNumber(usage.cache_creation_input_tokens) +
            readNumber(usage.cache_creation?.ephemeral_1h_input_tokens) +
            readNumber(usage.cache_creation?.ephemeral_5m_input_tokens);
        const modelTokens = readNumber(modelUsage.usedContextWindow ?? modelUsage.currentContextWindow ?? modelUsage.contextTokens ?? modelUsage.inputTokens);
        const nextUsed = Math.max(usageTokens, modelTokens);
        sessionStates = {
            ...sessionStates,
            [key]: {
                ...state,
                streamedCtxLimit: nextLimit > 0 ? nextLimit : state.streamedCtxLimit,
                streamedCtxUsed: nextUsed > 0 ? nextUsed : state.streamedCtxUsed
            }
        };
    }

    async function scrollDown() {
        await tick();
        if (transcript) transcript.scrollTop = transcript.scrollHeight;
    }

    async function scrollUp() {
        await tick();
        if (transcript) transcript.scrollTop = 0;
    }

    async function collectContext(): Promise<ContextItem[]> {
        const items: ContextItem[] = [];
        const selected = getSelectedTextContext();
        if (selected) items.push(selected);
        for (const item of manualContexts) {
            items.push({ kind: "selection", id: item.id, title: item.title, markdown: item.markdown });
        }

        for (const ref of pendingRefs) {
            const item = await buildBlockContext(ref.id, ref.kind);
            if (item) items.push(item);
        }
        return items;
    }

    function buildPrompt(userText: string, contextText: string) {
        if (!contextText) return userText;
        return `${contextText}\n---\n用户问题：\n${userText}`;
    }

    function handleEventFor(key: string, event: ClaudeStreamEvent): string {
        let targetKey = key;
        if (event.sessionId && event.sessionId !== targetKey) {
            targetKey = replaceSessionKey(targetKey, event.sessionId);
            sessions = listFilteredSessions();
        }
        if (event.type === "text") {
            appendAssistantFor(targetKey, event.text || "");
        } else if (event.type === "result") {
            const stateMessages = targetKey === currentTabKey ? messages : (sessionStates[targetKey]?.messages || []);
            const hasAssistant = stateMessages.some((message) => message.role === "assistant");
            if (!hasAssistant && event.text) appendAssistantFor(targetKey, event.text);
        } else if (event.type === "thinking") {
            addMessageFor(targetKey, "thinking", event.thinking || "", "thinking");
        } else if (event.type === "tool" || event.type === "tool_result") {
            const content = event.type === "tool"
                ? JSON.stringify(event.toolInput ?? {}, null, 2)
                : event.text || "";
            addMessageFor(targetKey, "tool", content, event.toolName || event.type);
        } else if (event.type === "stderr") {
            const meta = (event.raw as any)?.subtype === "api_retry" ? "api_retry" : "stderr";
            addMessageFor(targetKey, "event", event.text || "", meta);
        } else if (event.type === "error") {
            addMessageFor(targetKey, "error", event.error || (i18n.claudeError || "Claude 运行出错"));
        } else if (event.type === "duration") {
            addMessageFor(targetKey, "duration", event.text || "");
        } else if (event.type === "usage") {
            updateContextUsageFor(targetKey, event.raw);
            addMessageFor(targetKey, "usage", JSON.stringify(event.raw || {}));
        }
        return targetKey;
    }

    // ===== Write-back to SiYuan =====

    async function writeBackAppend(content: string) {
        if (!activeDocId) {
            showMessage("请先打开一篇文档再写入");
            return;
        }
        writeBackBusy = true;
        try {
            const ok = await appendBlockToDoc(activeDocId, content);
            if (ok) {
                showMessage(`已追加到「${activeDocTitle || activeDocId}」`);
            } else {
                showMessage("写入失败，请检查思源连接");
            }
        } catch (e) {
            showMessage("写入出错：" + (e as Error).message);
        } finally {
            writeBackBusy = false;
        }
    }

    // ===== Drag-drop context =====


    // 完整块 ID：14位数字 + 7位小写字母数字
    const BLOCK_ID_EXACT_RE = /^\d{14}-[a-z0-9]{7}$/;
    // siyuan:// 协议链接里的块 ID
    const BLOCK_ID_IN_URL_RE = /siyuan:\/\/blocks\/(\d{14}-[a-z0-9]{7})/;

    function extractDragBlockId(e: DragEvent): string {
        const dt = e.dataTransfer;
        if (!dt) return "";

        // 优先：text/plain 里的值恰好就是一个裸块 ID（思源拖拽块时的标准格式）
        try {
            const plain = (dt.getData("text/plain") || "").trim();
            if (BLOCK_ID_EXACT_RE.test(plain)) return plain;

            // 也匹配 siyuan://blocks/<id> 协议链接
            const urlMatch = plain.match(BLOCK_ID_IN_URL_RE);
            if (urlMatch) return urlMatch[1];
        } catch { /* ignore */ }

        // 其次：遍历未知 MIME 类型，只在值本身是裸块 ID 时命中
        for (const type of Array.from(dt.types || [])) {
            if (type === "text/plain" || type === "text/html") continue;
            try {
                const val = (dt.getData(type) || "").trim();
                if (BLOCK_ID_EXACT_RE.test(val)) return val;
                const urlMatch = val.match(BLOCK_ID_IN_URL_RE);
                if (urlMatch) return urlMatch[1];
            } catch { /* ignore */ }
        }

        return "";
    }

    function onInputCardDragOver(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        dropActive = true;
    }

    function onInputCardDragLeave(e: DragEvent) {
        // 只有真正离开 input-card（不是进入子元素）时才取消高亮
        const related = e.relatedTarget as Node | null;
        const card = (e.currentTarget as HTMLElement);
        if (related && card.contains(related)) return;
        dropActive = false;
    }

    function onInputCardDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        dropActive = false;
        const dt = e.dataTransfer;

        // Debug: 收集所有 MIME 数据，打印到 console 帮助排查
        if (dt) {
            const debugInfo: Record<string, string> = {};
            for (const type of Array.from(dt.types || [])) {
                try { debugInfo[type] = dt.getData(type); } catch { /* skip */ }
            }
            console.log("[ClaudeNote] drop dataTransfer:", debugInfo);
        }

        const blockId = extractDragBlockId(e);
        if (blockId) {
            if (!pendingRefs.some(r => r.kind === "block" && r.id === blockId)) {
                pendingRefs = [...pendingRefs, { kind: "block", id: blockId }];
            }
            showMessage("已将块加入上下文");
        } else if (dt) {
            // 没有块 ID，尝试把 text/plain 内容作为选中文本上下文
            const plainText = dt.getData("text/plain").trim();
            if (plainText) {
                const id = generateUUID();
                manualContexts = [...manualContexts, { id, title: plainText.slice(0, 30) + (plainText.length > 30 ? "…" : ""), markdown: plainText }];
                showMessage("已将选中文本加入上下文");
            }
        }
    }

    async function send() {
        const text = input.trim();
        if (!text || running) return;
        if (!localSettings.workingDir.trim()) {
            showMessage(i18n.setWorkingDirFirst || "请先设置 Claude Code 工作目录");
            return;
        }

        input = "";
        const startKey = currentTabKey;
        const runSettings = mergeSettings(localSettings);

        try {
            const items = await collectContext();
            const contextText = formatContext(items, localSettings.maxContextChars);
            const prompt = buildPrompt(text, contextText);
            // 把完整 prompt（含上下文）存入 user message，parseUserMessage 可解析展开
            addMessage("user", prompt);

            // Reset context attachments to prevent token accumulation
            pendingRefs = [];
            manualContexts = [];
            clearPluginPendingContexts?.();
            saveActiveState();

            const resumeSessionId = activeSessionId && sessionModels[activeSessionId] === runSettings.model
                ? activeSessionId
                : undefined;
            let runKey = startKey;
            const handle = runClaude(runSettings, prompt, resumeSessionId, (event) => {
                if (componentDestroyed) return;
                runKey = handleEventFor(runKey, event);
            });
            activeRuns = { ...activeRuns, [startKey]: handle };
            const result = await handle.completed;
            if (componentDestroyed) return;
            const nextRuns = { ...activeRuns };
            delete nextRuns[runKey];
            delete nextRuns[startKey];
            activeRuns = nextRuns;
            if (result.sessionId) {
                runKey = replaceSessionKey(runKey, result.sessionId);
                sessionModels = { ...sessionModels, [result.sessionId]: runSettings.model };
                sessions = listFilteredSessions(runSettings);
            }
            if (result.exitCode !== 0 && !result.aborted && result.signal !== "SIGTERM" && !result.hasClaudeError) {
                let message = (i18n.claudeExitAbnormal || "Claude 进程退出异常：exit={exitCode} signal={signal}")
                    .replace("{exitCode}", (result.exitCode ?? "null").toString())
                    .replace("{signal}", result.signal ?? "null");
                if (result.errorText) {
                    message += `\n${result.errorText}`;
                }
                addMessageFor(runKey, "error", message);
            }
        } catch (error) {
            if (componentDestroyed) return;
            const nextRuns = { ...activeRuns };
            delete nextRuns[startKey];
            activeRuns = nextRuns;
            addMessageFor(startKey, "error", (error as Error).message);
        }
    }

    function stop() {
        const key = currentTabKey;
        if (abortRunForKey(key)) {
            addMessage("event", i18n.stopRequested || "已请求停止 Claude 进程", "stop");
        }
    }

    function newSession() {
        saveActiveState();
        const draftId = createDraftSessionId();
        const state = blankSessionState(getSessionOptions(currentTabKey));
        sessionStates = { ...sessionStates, [draftId]: state };
        activeSessionId = "";
        activeDraftSessionId = draftId;
        applySessionState(draftId, state);
        randomizeGreeting();
        activeSessionIds = [...activeSessionIds, draftId];
    }

    async function updateSettings(patch: Partial<ClaudeNoteSettings>) {
        localSettings = mergeSettings({ ...localSettings, ...patch });
        saveActiveState();
        await saveSettings(localSettings);
    }

    function onModelChange(event: Event) {
        const model = (event.currentTarget as HTMLSelectElement).value;
        updateSettings({ model });
    }

    function onEffortChange(event: Event) {
        updateSettings({ effort: (event.currentTarget as HTMLSelectElement).value as ClaudeNoteSettings["effort"] });
    }

    function onPermissionModeChange(event: Event) {
        const permissionMode = (event.currentTarget as HTMLSelectElement).value as ClaudeNoteSettings["permissionMode"];
        updateSettings({ permissionMode, safeMode: permissionMode === "bypassPermissions" ? "yolo" : "default" });
    }

    async function attachCurrentNote() {
        if (!activeDocId) {
            showMessage(i18n.noActiveDoc || "当前无活动打开文档");
            return;
        }
        const existing = pendingRefs.find((ref) => ref.kind === "doc" && ref.id === activeDocId);
        if (existing) {
            pendingRefs = pendingRefs.filter((ref) => ref !== existing);
            userManuallyDetached = true;
            return;
        }
        addPendingContext({ kind: "doc", id: activeDocId });
        userManuallyDetached = false;
    }

    function removePending(ref: PendingRef) {
        pendingRefs = pendingRefs.filter((item) => item !== ref);
        if (ref.kind === "doc" && ref.id === activeDocId) {
            userManuallyDetached = true;
        }
    }

    async function importFiles(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const files = Array.from(input.files || []);
        if (files.length === 0) return;
        const imported = await Promise.all(files.map(async (file) => ({
            id: generateUUID(),
            title: file.name,
            markdown: await file.text(),
        })));
        manualContexts = [...manualContexts, ...imported];
        input.value = "";
    }

    function toggleHistory() {
        if (historyOpen) {
            historyOpen = false;
            return;
        }
        sessions = listFilteredSessions();
        // 拉不到会话时把诊断信息打到 console（不在 UI 上喧宾夺主）
        if (sessions.length === 0) {
            try {
                const dirInfo = describeClaudeSessionDir(localSettings.workingDir, localSettings.claudeHomeDir);
                if (!dirInfo.exists) {
                    console.warn(
                        "[Claude Note] 当前工作目录暂无 Claude Code 会话。\n" +
                        `  查找路径: ${dirInfo.dir || "(未配置)"}\n` +
                        (dirInfo.reason ? `  原因: ${dirInfo.reason}\n` : "") +
                        '  提示: 请检查"工作目录"和"Claude 会话目录根"是否设置正确。'
                    );
                } else if (!dirInfo.hasJsonl) {
                    console.warn(
                        "[Claude Note] 当前工作目录暂无 Claude Code 会话。\n" +
                        `  查找路径: ${dirInfo.dir}\n` +
                        "  原因: 目录存在但没有 .jsonl 会话文件。"
                    );
                }
            } catch (e) {
                console.warn("[Claude Note] describeClaudeSessionDir failed:", e);
            }
        }
        historyOpen = true;
    }

    function selectSessionTab(id: string) {
        if (id === activeSessionKey()) return;
        saveActiveState();
        if (isDraftSessionId(id)) {
            activeSessionId = "";
            activeDraftSessionId = id;
            currentTabKey = id;
            const state = sessionStates[id] || blankSessionState();
            sessionStates = { ...sessionStates, [id]: state };
            applySessionState(id, state);
            randomizeGreeting();
        } else {
            const found = sessions.find(s => s.id === id);
            if (found) {
                loadSession(found);
                return;
            }
            // 列表里没找到（可能 sessions 数组过期），先刷新列表再找一次
            sessions = listFilteredSessions();
            const foundRefresh = sessions.find(s => s.id === id);
            if (foundRefresh) {
                loadSession(foundRefresh);
                return;
            }
            // 磁盘上找不到这个会话文件，但 UI 内存里可能仍有 sessionStates 缓存
            // （Claude CLI resume 时会换 session id；或文件被外部删除）
            // 优先用缓存切 tab，不删 tab、不清空消息，避免误删用户上下文
            const cachedState = sessionStates[id];
            if (cachedState) {
                activeSessionId = id;
                activeDraftSessionId = "";
                currentTabKey = id;
                applySessionState(id, cachedState);
                console.warn("[ClaudeNote] session file missing, using cached state:", id);
                return;
            }
            // 既没磁盘文件也没缓存：说明这个 tab id 已经无效，提示并关闭
            showMessage(i18n.sessionFileNotFound || "未找到会话文件");
            activeSessionIds = activeSessionIds.filter(tid => tid !== id);
            if (activeSessionIds.length === 0) {
                newSession();
            } else {
                // 切到下一个有效的 tab，避免悬空
                const nextId = activeSessionIds[0];
                if (nextId) selectSessionTab(nextId);
            }
        }
    }

    function closeSessionTab(id: string, event?: Event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        abortRunForKey(id);
        if (activeSessionIds.length <= 1) {
            const draftId = createDraftSessionId();
            activeSessionIds = [draftId];
            selectSessionTab(draftId);
            return;
        }
        const isCurrent = activeSessionKey() === id;
        const index = activeSessionIds.indexOf(id);
        activeSessionIds = activeSessionIds.filter((tid) => tid !== id);
        if (isCurrent) {
            const nextIndex = Math.min(index, activeSessionIds.length - 1);
            const nextId = activeSessionIds[nextIndex];
            selectSessionTab(nextId);
        }
    }

    function loadSession(session: ClaudeSessionSummary) {
        saveActiveState();
        const previousDraftId = activeDraftSessionId;
        activeSessionId = session.id;
        activeDraftSessionId = "";
        currentTabKey = session.id;
        if (sessionStates[session.id]) {
            applySessionState(session.id, sessionStates[session.id]);
        } else {
            const state: PanelSessionState = {
                ...blankSessionState(),
                messages: loadClaudeSessionMessages(session.path).map((item) => ({
                    id: generateUUID(),
                    role: item.role as Role,
                    content: item.content,
                    meta: item.meta
                })),
                options: sessionModels[session.id]
                    ? { ...getSessionOptions(currentTabKey), model: sessionModels[session.id] }
                    : getSessionOptions(currentTabKey)
            };
            sessionStates = { ...sessionStates, [session.id]: state };
            applySessionState(session.id, state);
        }
        
        if (!activeSessionIds.includes(session.id)) {
            if (previousDraftId && activeSessionIds.includes(previousDraftId)) {
                activeSessionIds = activeSessionIds.map(id => id === previousDraftId ? session.id : id);
            } else {
                if (activeSessionIds.length >= 4) {
                    const idx = activeSessionIds.findIndex(id => id !== activeSessionId);
                    const removeIdx = idx !== -1 ? idx : 0;
                    activeSessionIds = activeSessionIds.filter((_, i) => i !== removeIdx);
                }
                activeSessionIds = [...activeSessionIds, session.id];
            }
        }
        
        historyOpen = false;
        scrollDown();
    }



    async function startRenameCurrent() {
        if (!activeSessionId) return;
        let currentSession = sessions.find(s => s.id === activeSessionId);
        if (!currentSession) {
            sessions = listFilteredSessions();
            currentSession = sessions.find(s => s.id === activeSessionId);
        }
        if (currentSession) {
            renameCurrentTitle = currentSession.title;
            isRenamingCurrent = true;
        } else {
            renameCurrentTitle = activeSessionId.slice(0, 8);
            isRenamingCurrent = true;
        }
        await tick();
        renameCurrentInput?.focus();
        renameCurrentInput?.select();
    }

    function saveRenameCurrent() {
        if (!activeSessionId) return;
        const title = renameCurrentTitle.trim();
        if (title) {
            let currentSession = sessions.find(s => s.id === activeSessionId);
            if (!currentSession) {
                sessions = listFilteredSessions();
                currentSession = sessions.find(s => s.id === activeSessionId);
            }
            if (currentSession) {
                const success = renameClaudeSession(currentSession.path, title);
                if (success) {
                    showMessage(i18n.sessionRenameSuccess || "会话重命名成功");
                    sessions = sessions.map(s => s.id === activeSessionId ? { ...s, title } : s);
                    sessions = listFilteredSessions().map(s => s.id === activeSessionId ? { ...s, title } : s);
                } else {
                    showMessage(i18n.sessionRenameFailed || "重命名失败");
                }
            } else {
                showMessage(i18n.currentSessionFileNotFound || "未找到当前会话文件");
            }
        }
        isRenamingCurrent = false;
    }

    function cancelRenameCurrent() {
        isRenamingCurrent = false;
    }

    function onKeydown(event: KeyboardEvent) {
        if (running) return;
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            send();
        } else if (!localSettings.requireModEnterToSend && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
        }
    }
</script>

<div class="cn-shell" class:cn-shell-tab={isTabPanel}>
    <div class="cn-header">
        <div class="cn-brand">
            <div class="cn-mark">
                <svg viewBox="0 0 39.5 39.53" class="cn-star-svg" style="fill: currentColor;">
                    <path d="m7.75 26.27 7.77-4.36.13-.38-.13-.21h-.38l-1.3-.08-4.44-.12-3.85-.16-3.73-.2-.94-.2-.88-1.16.09-.58.79-.53 1.13.1 2.5.17 3.75.26 2.72.16 4.03.42h.64l.09-.26-.22-.16-.17-.16-3.88-2.63-4.2-2.78-2.2-1.6-1.19-.81-.6-.76-.26-1.66 1.08-1.19 1.45.1.37.1 1.47 1.13 3.14 2.43 4.1 3.02.6.5.24-.17.03-.12-.27-.45-2.23-4.03-2.38-4.1-1.06-1.7-.28-1.02c-.1-.42-.17-.77-.17-1.2l1.23-1.67.68-.22 1.64.22.69.6 1.02 2.33 1.65 3.67 2.56 4.99.75 1.48.4 1.37.15.42h.26v-.24l.21-2.81.39-3.45.38-4.44.13-1.25.62-1.5 1.23-.81.96.46.79 1.13-.11.73-.47 3.05-.92 4.78-.6 3.2h.35l.4-.4 1.62-2.15 2.72-3.4 1.2-1.35 1.4-1.49.9-.71h1.7l1.25 1.86-.56 1.92-1.75 2.22-1.45 1.88-2.08 2.8-1.3 2.24.12.18.31-.03 4.7-1 2.54-.46 3.03-.52 1.37.64.15.65-.54 1.33-3.24.8-3.8.76-5.66 1.34-.07.05.08.1 2.55.24 1.09.06h2.67l4.97.37 1.3.86.78 1.05-.13.8-2 1.02-2.7-.64-6.3-1.5-2.16-.54h-.3v.18l1.8 1.76 3.3 2.98 4.13 3.84.21.95-.53.75-.56-.08-3.63-2.73-1.4-1.23-3.17-2.67h-.21v.28l.73 1.07 3.86 5.8.2 1.78-.28.58-1 .35-1.1-.2-2.26-3.17-2.33-3.57-1.88-3.2-.23.13-1.11 11.95-.52.61-1.2.46-1-.76-.53-1.23.53-2.43.64-3.17.52-2.52.47-3.13.28-1.04-.02-.07-.23.03-2.36 3.24-3.59 4.85-2.84 3.04-.68.27-1.18-.61.11-1.09.66-.97 3.93-5 2.37-3.1 1.53-1.79-.01-.26h-.09l-10.44 6.78-1.86.24-.8-.75.1-1.23.38-.4 3.14-2.16z" fill="currentColor"></path>
                </svg>
            </div>
            <div class="cn-title">Claude Note</div>
        </div>
        {#if isRenamingCurrent}
            <div class="cn-session-rename" on:click|stopPropagation>
                <input
                    type="text"
                    class="b3-text-field cn-rename-header-input"
                    bind:this={renameCurrentInput}
                    bind:value={renameCurrentTitle}
                    on:keydown={(e) => {
                        if (e.key === "Enter") saveRenameCurrent();
                        if (e.key === "Escape") cancelRenameCurrent();
                    }}
                />
                <button class="cn-mini-btn" on:click={saveRenameCurrent}>✓</button>
                <button class="cn-mini-btn cn-mini-btn-secondary" on:click={cancelRenameCurrent}>✕</button>
            </div>
        {:else}
            <div class="cn-session" on:click={startRenameCurrent} title={activeSessionId ? (i18n.clickToRename || "点击重命名会话") : (i18n.newSession || "新会话")}>
                {currentSessionTitle}
            </div>
        {/if}
        <div class="cn-actions">
            <button class="cn-icon-btn b3-tooltips b3-tooltips__sw" aria-label={i18n.historySessions || "历史会话"} on:click={toggleHistory}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 6h13"></path>
                    <path d="M8 12h13"></path>
                    <path d="M8 18h13"></path>
                    <path d="M3 6h.01"></path>
                    <path d="M3 12h.01"></path>
                    <path d="M3 18h.01"></path>
                </svg>
            </button>

            {#if openSetting}
                <button class="cn-icon-btn b3-tooltips b3-tooltips__sw" aria-label={i18n.settingsTitle || "设置"} on:click={openSetting}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 21v-7"></path>
                        <path d="M4 10V3"></path>
                        <path d="M12 21v-9"></path>
                        <path d="M12 8V3"></path>
                        <path d="M20 21v-5"></path>
                        <path d="M20 12V3"></path>
                        <path d="M2 14h4"></path>
                        <path d="M10 8h4"></path>
                        <path d="M18 16h4"></path>
                    </svg>
                </button>
            {/if}
        </div>
    </div>

    <!-- Floating History Popover Top relative to cn-shell -->
    {#if historyOpen}
        <div class="cn-popover-backdrop" on:click={() => historyOpen = false}></div>
        <div class="cn-history-popover-top">
            {#if sessions.length === 0}
                <div class="cn-history-empty">{i18n.noSessionInDir || "当前工作目录暂无 Claude Code 会话。"}</div>
            {:else}
                {#each sessions as session (session.id)}
                    <div class="cn-history-item-row" class:active={activeSessionId === session.id}>
                        {#if editingSessionId === session.id}
                            <div class="cn-history-edit-box" on:click|stopPropagation>
                                <input
                                    type="text"
                                    class="b3-text-field"
                                    bind:this={editingTitleInput}
                                    bind:value={editingTitle}
                                    on:keydown={(e) => {
                                        if (e.key === "Enter") saveRename(session, e);
                                        if (e.key === "Escape") cancelRename(e);
                                    }}
                                />
                                <button class="cn-mini-btn" on:click={(e) => saveRename(session, e)}>{i18n.save || "保存"}</button>
                                <button class="cn-mini-btn cn-mini-btn-secondary" on:click={cancelRename}>{i18n.cancel || "取消"}</button>
                            </div>
                        {:else}
                            <button class="cn-history-item" on:click={() => loadSession(session)}>
                                <span class="cn-history-title-span">{session.title}</span>
                                <small>{session.id.slice(0, 8)}</small>
                            </button>
                            <div class="cn-history-actions">
                                <button class="cn-action-btn b3-tooltips b3-tooltips__n" aria-label={i18n.renameSession || "重命名会话"} on:click={(e) => startRename(session, e)}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cn-svg-icon mini">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
                                    </svg>
                                </button>
                                <button class="cn-action-btn delete b3-tooltips b3-tooltips__n" aria-label={i18n.deleteSession || "删除会话"} on:click={(e) => deleteSession(session, e)}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cn-svg-icon mini">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        {/if}
                    </div>
                {/each}
            {/if}
        </div>
    {/if}

    <div class="cn-transcript-wrap">
        {#if messages.length > 0}
            <div class="cn-jump-controls" aria-label={i18n.quickNavigation || "快速导航"}>
                <button class="cn-jump-btn b3-tooltips b3-tooltips__w" aria-label={i18n.scrollToTop || "滚动到开头"} on:click={scrollUp}>↑</button>
                <button class="cn-jump-btn b3-tooltips b3-tooltips__w" aria-label={i18n.scrollToBottom || "滚动到末尾"} on:click={scrollDown}>↓</button>
            </div>
        {/if}

        <div class="cn-transcript" bind:this={transcript}>
        {#if messages.length === 0}
            <div class="cn-welcome">
                <div class="cn-welcome-quote">
                    <div class="cn-welcome-mark" aria-hidden="true">
                        <svg viewBox="0 0 39.5 39.53">
                            <use href="#iconClaudeNote"></use>
                        </svg>
                    </div>
                    <div class={/[\u4e00-\u9fff]/.test(activeGreeting) ? "cn-quote-zh" : "cn-quote-en"}>{activeGreeting}</div>
                </div>
            </div>
        {:else}
            {#each turns as turn, idx (turn.id || idx)}
                {#if turn.userMessage}
                    {@const parsed = parseUserMessage(turn.userMessage.content)}
                    <div class="cn-turn-user-group">
                        <article class="cn-message cn-user">
                            <MarkdownBlock content={parsed.question} />
                            {#if parsed.hasContext}
                                {@const ctxItems = parseContextItems(parsed.contextText)}
                                <details class="cn-context-details">
                                    <summary class="cn-context-badge">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="cn-svg-icon mini inline">
                                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                        </svg>
                                        已附加 {ctxItems.length} 条思源上下文
                                        <span class="cn-ctx-expand-arrow"></span>
                                    </summary>
                                    <div class="cn-context-expand">
                                        {#each ctxItems as item, i}
                                            <div class="cn-ctx-item">
                                                <div class="cn-ctx-item-source">
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;flex-shrink:0;opacity:0.6;">
                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                        <polyline points="14 2 14 8 20 8"></polyline>
                                                    </svg>
                                                    {item.source}
                                                </div>
                                                <div class="cn-ctx-item-preview">{item.preview}</div>
                                            </div>
                                            {#if i < ctxItems.length - 1}
                                                <div class="cn-ctx-divider"></div>
                                            {/if}
                                        {/each}
                                    </div>
                                </details>
                            {/if}
                        </article>

                    </div>
                {/if}

                {@const isLatestTurn = idx === turns.length - 1}
                {@const shouldAutoExpand = isLatestTurn && running}

                {#each turn.workingProcess as msg (msg.id)}
                    {#if msg.role === "thinking" && localSettings.showThinking}
                        {@const isExpanded = shouldAutoExpand || expandedItems.has(msg.id)}
                        <div class="cn-working-process thinking">
                            <details open={isExpanded} on:toggle={(e) => {
                                const details = e.currentTarget;
                                if (details.open) {
                                    expandedItems.add(msg.id);
                                } else {
                                    expandedItems.delete(msg.id);
                                }
                                expandedItems = new Set(expandedItems);
                            }}>
                                <summary>
                                    <span class="cn-details-arrow"></span>
                                    <span>{i18n.thinkingProcess || "思考过程"}</span>
                                </summary>
                                <div class="cn-working-content select-text">
                                    <MarkdownBlock content={msg.content} />
                                </div>
                            </details>
                        </div>
                    {:else if msg.role === "tool" && localSettings.showToolCalls}
                        {@const isExpanded = shouldAutoExpand || expandedItems.has(msg.id)}
                        <div class="cn-working-process tool">
                            <details open={isExpanded} on:toggle={(e) => {
                                const details = e.currentTarget;
                                if (details.open) {
                                    expandedItems.add(msg.id);
                                } else {
                                    expandedItems.delete(msg.id);
                                }
                                expandedItems = new Set(expandedItems);
                            }}>
                                <summary title={msg.meta}>
                                    <span class="cn-details-arrow"></span>
                                    <span>{getToolLabel(msg.meta)}</span>
                                </summary>
                                <div class="cn-working-content select-text">
                                    <pre class="cn-tool-call"><code>{msg.content}</code></pre>
                                </div>
                            </details>
                        </div>
                    {:else if msg.role === "event"}
                        <div class={`cn-working-event ${msg.meta === "api_retry" ? "api-retry" : ""}`} title={msg.meta}>
                            <span>{msg.content}</span>
                        </div>
                    {/if}
                {/each}

                {#if turn.assistantMessage}
                    <div class="cn-assistant-wrap">
                        <article class="cn-message cn-assistant select-text">
                            <MarkdownBlock content={turn.assistantMessage.content} />
                        </article>
                        {#if !running}
                            <div class="cn-writeback-bar">
                                <button
                                    class="cn-writeback-btn b3-tooltips b3-tooltips__n"
                                    aria-label={activeDocId ? `追加到「${activeDocTitle || activeDocId}」` : "追加到当前文档（无活动文档）"}
                                    disabled={writeBackBusy || !activeDocId}
                                    on:click={() => writeBackAppend(turn.assistantMessage?.content ?? "")}
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cn-svg-icon mini">
                                        <path d="M12 5v14"></path>
                                        <path d="M5 12l7 7 7-7"></path>
                                        <path d="M3 20h18"></path>
                                    </svg>
                                    <span>追加到文档</span>
                                </button>

                            </div>
                        {/if}
                    </div>
                {/if}

                {#if turn.errorMessage}
                    <article class="cn-message cn-error">
                        <MarkdownBlock content={turn.errorMessage.content} />
                    </article>
                {/if}

                {#if (turn.assistantMessage || turn.errorMessage) && turn.durationMs !== undefined}
                    <div class="cn-metrics-bar">
                        <span class="cn-metrics-pill">⏱️ {formatDuration(turn.durationMs)}</span>
                    </div>
                {/if}
            {/each}
            {#if running && messages[messages.length - 1]?.role !== "assistant"}
                <div class="cn-claude-loader" aria-label="Claude 正在工作">
                    <svg viewBox="0 0 39.5 39.53" aria-hidden="true">
                        <use href="#iconClaudeNote"></use>
                    </svg>
                </div>
            {/if}
        {/if}
        </div>
    </div>

    <div class="cn-composer">
        <!-- Composer Header: session tabs left, context buttons right -->
        <div class="cn-composer-header">
            <div class="cn-session-tabs">
                {#if activeSessionIds.length >= 2}
                    {#each activeSessionIds as id, index (id)}
                        {@const num = index + 1}
                        {@const active = currentTabKey === id}
                        <button
                            class="cn-tab-btn"
                            class:active={active}
                            on:click={() => selectSessionTab(id)}
                            on:contextmenu|preventDefault|stopPropagation={(e) => closeSessionTab(id, e)}
                            title={isDraftSessionId(id) ? (i18n.newSession || "新会话") : ((i18n.sessionWithId || "会话 {id}").replace("{id}", id.slice(0, 8)) + "\n" + (i18n.removeContextTip || "右键可关闭该会话"))}
                        >
                            <span class="cn-tab-num">{num}</span>
                            <span class="cn-tab-close" on:click|preventDefault|stopPropagation={(e) => closeSessionTab(id, e)}>×</span>
                        </button>
                    {/each}
                {/if}
                <button class="cn-tab-btn cn-tab-add b3-tooltips b3-tooltips__n" aria-label={i18n.newSession || "新建会话"} on:click={newSession}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>
            <div class="cn-composer-actions">
                <label class="cn-icon-btn cn-file-picker-label b3-tooltips b3-tooltips__nw" aria-label={i18n.addFile || "添加文件"}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                    </svg>
                    <input bind:this={filePicker} class="cn-file-input" type="file" multiple on:change={importFiles} />
                </label>
                <button class="cn-icon-btn b3-tooltips b3-tooltips__nw" class:active={searchOpen} aria-label={i18n.attachNote || "关联笔记"} on:click={toggleSearch}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"></path>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>

        <div
            class="cn-input-card"
            class:cn-drop-active={dropActive}
            on:dragover={onInputCardDragOver}
            on:dragleave={(e) => onInputCardDragLeave(e)}
            on:drop={onInputCardDrop}
        >
            {#if searchOpen}
                <div class="cn-search-overlay">
                    <div class="cn-search-header">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cn-svg-icon search-icon">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input
                            type="text"
                            bind:this={searchInput}
                            bind:value={searchQuery}
                            on:input={triggerSearch}
                            placeholder={i18n.searchPlaceholder || "输入关键字搜索思源文档..."}
                        />
                        <button class="cn-search-close b3-tooltips b3-tooltips__n" aria-label={i18n.closeSearch || "关闭搜索"} on:click={closeSearch}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="cn-search-results">
                        {#if searchLoading}
                            <div class="cn-search-status">正在搜索思源笔记数据库...</div>
                        {:else if searchResults.length === 0}
                            <div class="cn-search-status">未找到匹配的文档。输入其他词试试？</div>
                        {:else}
                            {#each searchResults as doc (doc.id)}
                                {@const attached = pendingRefs.some((ref) => ref.kind === "doc" && ref.id === doc.id)}
                                <button class="cn-search-item" class:active={attached} on:click={() => toggleDocAttachment(doc)}>
                                    <div class="cn-search-item-info">
                                        <div class="cn-search-item-title">{doc.title}</div>
                                        <div class="cn-search-item-path">{doc.hpath}</div>
                                    </div>
                                    <div class="cn-search-item-checkbox">
                                        {#if attached}
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        {/if}
                                    </div>
                                </button>
                            {/each}
                        {/if}
                    </div>
                </div>
            {/if}
            <div class="cn-context-top-row">
                <label class:active={currentDocAttached} class:disabled={!activeDocId} class="cn-current-doc-check">
                    <input type="checkbox" checked={currentDocAttached} on:change={attachCurrentNote} disabled={!activeDocId} />
                    <span class="cn-current-doc-text">
                        {#if activeDocId}
                            {(i18n.currentDoc || "当前文档: ")}{activeDocTitle || (i18n.loading || "加载中...")}
                        {:else}
                            {(i18n.currentDoc || "当前文档: ")}{(i18n.noActiveDocInline || "无活动文档")}
                        {/if}
                    </span>
                </label>
            </div>
            {#if pendingRefs.length > 0 || manualContexts.length > 0}
                <div class="cn-context-row">
                    {#each pendingRefs as ref}
                        <button class="cn-file-chip b3-tooltips b3-tooltips__n" class:cn-block-chip={ref.kind === "block"} aria-label={i18n.removeContextTip || "点击移除此上下文"} on:click={() => removePending(ref)}>
                            <span class="cn-file-icon">
                                {#if ref.kind === "block"}
                                    <span class="cn-block-mark" aria-hidden="true">¶</span>
                                {:else}
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                    </svg>
                                {/if}
                            </span>
                            <span class="cn-file-name">{titleCache[titleCacheKey(ref.id, ref.kind)] || (ref.kind === "block" ? (i18n.loadingBlock || "正在读取块...") : ref.id)}</span>
                            <span class="cn-file-remove">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </span>
                        </button>
                    {/each}
                    {#each manualContexts as item}
                        <button class="cn-file-chip b3-tooltips b3-tooltips__n" aria-label={i18n.removeContextTip || "点击移除此上下文"} on:click={() => manualContexts = manualContexts.filter((ctx) => ctx !== item)}>
                            <span class="cn-file-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                            </span>
                            <span class="cn-file-name">{item.title}</span>
                            <span class="cn-file-remove">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </span>
                        </button>
                    {/each}
                </div>
            {/if}
            <textarea bind:this={composer} bind:value={input} on:keydown={onKeydown} placeholder={i18n.composerPlaceholder || "把问题交给 Claude Note..."}></textarea>
            <div class="cn-input-toolbar">
                <div class="cn-toolbar-left">
                    <div class="cn-toolbar-item cn-model-item">
                        <span class="cn-toolbar-label">{i18n.model || "模型"}</span>
                        <select class="cn-toolbar-select cn-model-pill" aria-label="Select Claude Model" bind:value={localSettings.model} on:change={onModelChange}>
                            {#each modelOptions as model}
                                <option value={model.value}>{model.label}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="cn-toolbar-item">
                        <span class="cn-toolbar-label">{i18n.thinking || "思考"}</span>
                        <select class="cn-toolbar-select cn-effort-pill" aria-label="Set Thinking Effort" bind:value={localSettings.effort} on:change={onEffortChange}>
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                            <option value="xhigh">xhigh</option>
                            <option value="max">max</option>
                        </select>
                    </div>

                    <div class="cn-toolbar-item">
                        <span class="cn-toolbar-label">{i18n.mode || "模式"}</span>
                        <select class="cn-toolbar-select cn-mode-pill" aria-label="Set Permission Mode" bind:value={localSettings.permissionMode} on:change={onPermissionModeChange}>
                            <option value="auto">auto</option>
                            <option value="plan">plan</option>
                            <option value="bypassPermissions">YOLO</option>
                        </select>
                    </div>

                    <div class="cn-toolbar-item">
                        <span class="cn-toolbar-label">{i18n.context || "上下文"}</span>
                        <div class="cn-toolbar-select cn-ctx-pill b3-tooltips b3-tooltips__n" aria-label={`Input: ${totalUsage.input.toLocaleString()} tokens\nCache: ${(totalUsage.cacheRead + totalUsage.cacheCreation).toLocaleString()} tokens\nOutput: ${totalUsage.output.toLocaleString()} tokens\nWindow: ${ctxLimit.toLocaleString()} tokens`}>
                            {ctxPercent}%
                        </div>
                    </div>
                </div>
                {#if running}
                    <button class="cn-send-btn cn-stop-btn b3-tooltips b3-tooltips__n" aria-label={i18n.stop || "停止生成"} on:click={stop}>{i18n.stop || "停止"}</button>
                {:else}
                    <div class="cn-toolbar-right">
                        <button class="cn-send-btn-circle b3-tooltips b3-tooltips__nw" aria-label={i18n.sendMessage || "发送消息"} on:click={send} disabled={!input.trim() || running}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
