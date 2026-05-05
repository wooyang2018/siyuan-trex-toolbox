/**
 * paper-reader module — shared type definitions
 */

// ─── Progress reporting ───────────────────────────────────────────────────────

export interface IProgressReporter {
    log(msg: string): void;
    updateStatus(text: string, percent: number): void;
    readonly cancelled: boolean;
    readonly abortController: AbortController;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

// ─── Module settings ─────────────────────────────────────────────────────────

export interface PaperReaderConfig {
    // Claude CLI
    claudeCliPath: string;     // claude CLI executable path, default 'claude'

    // Processing
    chunkWordCount: number;

    // Output
    conceptNotebook: string;   // SiYuan notebook name for concept docs
    conceptPath: string;       // path prefix inside the notebook e.g. "/概念/"
    outputLanguage: string;    // 'zh-CN' | 'en' | 'ja' | ...

    // Search
    tavilyApiKey: string;
    searchEnabled: boolean;
    maxResearchTokens: number;
}

export const DEFAULT_PAPER_READER_CONFIG: PaperReaderConfig = {
    claudeCliPath: 'claude',
    chunkWordCount: 800,
    conceptNotebook: '',
    conceptPath: '/概念/',
    outputLanguage: 'zh-CN',
    tavilyApiKey: '',
    searchEnabled: true,
    maxResearchTokens: 4000,
};

// ─── Action results ───────────────────────────────────────────────────────────

export interface ActionResult {
    success: boolean;
    message: string;
    details?: string;
}
