/**
 * paper-reader module — shared type definitions
 */

// ─── LLM Configuration ───────────────────────────────────────────────────────

export interface LLMConfig {
    baseUrl: string;        // e.g. "https://api.openai.com/v1"
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    /** 'openai' | 'anthropic' — detected automatically from baseUrl/model */
    apiFormat?: 'openai' | 'anthropic';
}

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
    // LLM
    llmBaseUrl: string;
    llmApiKey: string;
    llmModel: string;
    llmMaxTokens: number;
    llmTemperature: number;
    chunkWordCount: number;

    // Output
    conceptNotebook: string;    // SiYuan notebook name for concept docs
    conceptPath: string;        // path prefix inside the notebook e.g. "/概念/"
    outputLanguage: string;     // 'zh-CN' | 'en' | 'ja' | ...

    // Search
    tavilyApiKey: string;
    searchEnabled: boolean;
    maxResearchTokens: number;
}

export const DEFAULT_PAPER_READER_CONFIG: PaperReaderConfig = {
    llmBaseUrl: 'https://api.openai.com/v1',
    llmApiKey: '',
    llmModel: 'gpt-4o-mini',
    llmMaxTokens: 4096,
    llmTemperature: 0.3,
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
