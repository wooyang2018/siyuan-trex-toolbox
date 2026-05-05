/**
 * Paper Reader — 读论文工作流模块
 *
 * Implements IFuncModule for the paper-reading workflow migrated from obsidian-NotEMD.
 * Provides 6 operations: AddLinks, ExtractConcepts, ResearchSummarize,
 * GenerateContent, Translate, MermaidSummary.
 */
import { render } from 'solid-js/web';
import type FMiscPlugin from '@/index';
import { DEFAULT_PAPER_READER_CONFIG, type PaperReaderConfig } from './types';
import PaperReaderPanel from './ui/PaperReaderPanel';

export let name = 'PaperReader';
export let enabled = false;

export const declareToggleEnabled = {
    title: '📖 读论文工作流',
    description: '提供论文阅读辅助功能：概念标注、提取、研究摘要、翻译、知识图谱等',
    defaultEnabled: false,
};

// ─── Config state ─────────────────────────────────────────────────────────────

let _config: PaperReaderConfig = { ...DEFAULT_PAPER_READER_CONFIG };

// ─── Dock state ───────────────────────────────────────────────────────────────

let _disposePanel: (() => void) | null = null;
let _dockElement: HTMLElement | null = null;

// ─── IFuncModule implementation ───────────────────────────────────────────────

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    // Register a dock panel
    plugin.addDock({
        config: {
            position: 'RightBottom',
            size: { width: 240, height: 0 },
            icon: 'iconWebSearch',
            title: '读论文',
            show: false,
        },
        data: {
            id: 'paper-reader-dock',
        },
        type: 'paper-reader-dock',
        init(dock) {
            _dockElement = dock.element as HTMLElement;
            _disposePanel = render(
                () => PaperReaderPanel({ getConfig: () => _config }),
                _dockElement
            );
        },
        destroy() {
            if (_disposePanel) {
                _disposePanel();
                _disposePanel = null;
            }
            _dockElement = null;
        },
    });
};

export const unload = (_plugin?: FMiscPlugin) => {
    if (!enabled) return;
    if (_disposePanel) {
        _disposePanel();
        _disposePanel = null;
    }
    _dockElement = null;
    enabled = false;
};

// ─── Module config (shown in Settings > 其他设置) ────────────────────────────

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'PaperReader',
    title: '📖 读论文工作流',
    load(saved?: Record<string, any>) {
        if (!saved) return;
        for (const k of Object.keys(_config) as (keyof PaperReaderConfig)[]) {
            if (saved[k] !== undefined) {
                (_config as any)[k] = saved[k];
            }
        }
    },
    dump() {
        return { ..._config };
    },
    items: [
        {
            key: 'claudeCliPath',
            title: 'Claude CLI 路径',
            description: 'claude 可执行文件的路径，例如 /usr/local/bin/claude（留空则使用 PATH 中的 claude）',
            type: 'textinput',
            direction: 'row',
            get: () => _config.claudeCliPath,
            set: (v: string) => { _config.claudeCliPath = v; },
        },
        {
            key: 'chunkWordCount',
            title: '分块词数',
            description: '文档分块时每块的目标词数（默认 800）',
            type: 'number',
            direction: 'row',
            number: { min: 200, max: 4000, step: 100 },
            get: () => _config.chunkWordCount,
            set: (v: number) => { _config.chunkWordCount = v; },
        },
        {
            key: 'outputLanguage',
            title: '输出语言',
            description: '生成内容和翻译的目标语言',
            type: 'select',
            direction: 'row',
            options: [
                { text: '简体中文', value: 'zh-CN' },
                { text: '繁體中文', value: 'zh-TW' },
                { text: 'English', value: 'en' },
                { text: '日本語', value: 'ja' },
                { text: '한국어', value: 'ko' },
            ],
            get: () => _config.outputLanguage,
            set: (v: string) => { _config.outputLanguage = v; },
        },
        {
            key: 'conceptNotebook',
            title: '概念笔记本',
            description: '提取概念和译文存放的笔记本名称（留空则使用第一个笔记本）',
            type: 'textinput',
            direction: 'row',
            get: () => _config.conceptNotebook,
            set: (v: string) => { _config.conceptNotebook = v; },
        },
        {
            key: 'conceptPath',
            title: '概念路径',
            description: '笔记本内的概念文档路径前缀，例如 /概念/',
            type: 'textinput',
            direction: 'row',
            get: () => _config.conceptPath,
            set: (v: string) => { _config.conceptPath = v; },
        },
        {
            key: 'searchEnabled',
            title: '启用网络搜索',
            description: '研究摘要和生成内容时是否搜索 DuckDuckGo/Tavily',
            type: 'checkbox',
            direction: 'row',
            get: () => _config.searchEnabled,
            set: (v: boolean) => { _config.searchEnabled = v; },
        },
        {
            key: 'tavilyApiKey',
            title: 'Tavily API Key',
            description: '可选，提供更高质量的学术搜索结果',
            type: 'textinput',
            direction: 'row',
            get: () => _config.tavilyApiKey,
            set: (v: string) => { _config.tavilyApiKey = v; },
        },
    ],
};
