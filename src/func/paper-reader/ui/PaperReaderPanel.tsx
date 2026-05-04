/**
 * PaperReaderPanel — SolidJS UI panel for the paper-reader module.
 * Rendered inside a SiYuan dock tab.
 */
import { Component, createSignal, For, Show } from 'solid-js';
import type { PaperReaderConfig } from '../types';
import { ProgressReporter } from '../utils/progress';
import {
    runAddLinks,
    runExtractConcepts,
    runResearchSummarize,
    runGenerateContent,
    runTranslate,
    runMermaidSummary,
} from '../actions';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionKey =
    | 'addLinks'
    | 'extractConcepts'
    | 'researchSummarize'
    | 'generateContent'
    | 'translate'
    | 'mermaidSummary';

interface ActionDef {
    key: ActionKey;
    label: string;
    icon: string;
    description: string;
}

const ACTIONS: ActionDef[] = [
    {
        key: 'addLinks',
        label: '标注概念',
        icon: '🔗',
        description: '识别文档中的学术概念并加粗标注',
    },
    {
        key: 'extractConcepts',
        label: '提取概念',
        icon: '📚',
        description: '提取核心概念并创建独立笔记',
    },
    {
        key: 'researchSummarize',
        label: '研究摘要',
        icon: '🔍',
        description: '搜索网络并生成研究摘要',
    },
    {
        key: 'generateContent',
        label: '生成内容',
        icon: '✍️',
        description: '根据标题生成结构化文档内容',
    },
    {
        key: 'translate',
        label: '翻译文档',
        icon: '🌐',
        description: '将文档翻译为目标语言并创建新文档',
    },
    {
        key: 'mermaidSummary',
        label: '知识图谱',
        icon: '🗺️',
        description: '生成 Mermaid 思维导图或流程图',
    },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface PaperReaderPanelProps {
    getConfig: () => PaperReaderConfig;
}

const PaperReaderPanel: Component<PaperReaderPanelProps> = (props) => {
    const [running, setRunning] = createSignal(false);
    const [statusText, setStatusText] = createSignal('');
    const [statusPercent, setStatusPercent] = createSignal(0);
    const [logs, setLogs] = createSignal<string[]>([]);
    const [currentReporter, setCurrentReporter] = createSignal<ProgressReporter | null>(null);

    function addLog(msg: string) {
        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 200));
    }

    function clearLogs() {
        setLogs([]);
        setStatusText('');
        setStatusPercent(0);
    }

    async function runAction(key: ActionKey) {
        if (running()) return;

        clearLogs();
        setRunning(true);

        const reporter = new ProgressReporter((log, status, percent) => {
            if (log !== null) addLog(log);
            if (status !== null) setStatusText(status);
            if (percent !== null) setStatusPercent(percent);
        });
        setCurrentReporter(reporter);

        const config = props.getConfig();

        try {
            addLog(`开始执行: ${ACTIONS.find(a => a.key === key)?.label ?? key}`);

            let result;
            switch (key) {
                case 'addLinks':
                    result = await runAddLinks(config, reporter);
                    break;
                case 'extractConcepts':
                    result = await runExtractConcepts(config, reporter);
                    break;
                case 'researchSummarize':
                    result = await runResearchSummarize(config, reporter);
                    break;
                case 'generateContent':
                    result = await runGenerateContent(config, reporter);
                    break;
                case 'translate':
                    result = await runTranslate(config, reporter);
                    break;
                case 'mermaidSummary':
                    result = await runMermaidSummary(config, reporter);
                    break;
                default:
                    result = { success: false, message: '未知操作' };
            }

            addLog(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
            if (result.details) addLog(`详情: ${result.details}`);
        } catch (e) {
            addLog(`❌ 执行出错: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setRunning(false);
            setCurrentReporter(null);
        }
    }

    function handleCancel() {
        const r = currentReporter();
        if (r) {
            r.cancel();
            addLog('⚠️ 用户取消操作');
        }
    }

    return (
        <div style={{
            display: 'flex',
            'flex-direction': 'column',
            height: '100%',
            padding: '8px',
            'box-sizing': 'border-box',
            gap: '8px',
            'font-size': '13px',
        }}>
            {/* Action buttons */}
            <div style={{
                display: 'grid',
                'grid-template-columns': '1fr 1fr',
                gap: '6px',
            }}>
                <For each={ACTIONS}>
                    {(action) => (
                        <button
                            title={action.description}
                            disabled={running()}
                            onClick={() => runAction(action.key)}
                            style={{
                                display: 'flex',
                                'align-items': 'center',
                                gap: '4px',
                                padding: '6px 8px',
                                'border-radius': '4px',
                                border: '1px solid var(--b3-border-color)',
                                background: 'var(--b3-theme-surface)',
                                color: 'var(--b3-theme-on-surface)',
                                cursor: running() ? 'not-allowed' : 'pointer',
                                opacity: running() ? '0.6' : '1',
                                'font-size': '12px',
                                'white-space': 'nowrap',
                                overflow: 'hidden',
                                'text-overflow': 'ellipsis',
                            }}
                        >
                            <span>{action.icon}</span>
                            <span>{action.label}</span>
                        </button>
                    )}
                </For>
            </div>

            {/* Progress area */}
            <Show when={running()}>
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                    <div style={{
                        display: 'flex',
                        'justify-content': 'space-between',
                        'align-items': 'center',
                    }}>
                        <span style={{ color: 'var(--b3-theme-on-background)', 'font-size': '12px' }}>
                            {statusText() || '处理中...'}
                        </span>
                        <button
                            onClick={handleCancel}
                            style={{
                                padding: '2px 8px',
                                'border-radius': '3px',
                                border: '1px solid var(--b3-theme-error)',
                                background: 'transparent',
                                color: 'var(--b3-theme-error)',
                                cursor: 'pointer',
                                'font-size': '11px',
                            }}
                        >
                            取消
                        </button>
                    </div>
                    <div style={{
                        width: '100%',
                        height: '6px',
                        background: 'var(--b3-border-color)',
                        'border-radius': '3px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${statusPercent()}%`,
                            background: 'var(--b3-theme-primary)',
                            'border-radius': '3px',
                            transition: 'width 0.2s ease',
                        }} />
                    </div>
                </div>
            </Show>

            {/* Log area */}
            <div style={{
                flex: '1',
                display: 'flex',
                'flex-direction': 'column',
                'min-height': '0',
            }}>
                <div style={{
                    display: 'flex',
                    'justify-content': 'space-between',
                    'align-items': 'center',
                    'margin-bottom': '4px',
                }}>
                    <span style={{ 'font-size': '11px', color: 'var(--b3-theme-on-surface-variant, #666)' }}>
                        操作日志
                    </span>
                    <button
                        onClick={clearLogs}
                        style={{
                            padding: '1px 6px',
                            'border-radius': '3px',
                            border: '1px solid var(--b3-border-color)',
                            background: 'transparent',
                            color: 'var(--b3-theme-on-surface)',
                            cursor: 'pointer',
                            'font-size': '10px',
                        }}
                    >
                        清空
                    </button>
                </div>
                <div style={{
                    flex: '1',
                    overflow: 'auto',
                    background: 'var(--b3-theme-background)',
                    border: '1px solid var(--b3-border-color)',
                    'border-radius': '4px',
                    padding: '6px',
                    'font-size': '11px',
                    'font-family': 'var(--b3-font-family-code, monospace)',
                    'line-height': '1.5',
                    color: 'var(--b3-theme-on-background)',
                    'min-height': '80px',
                }}>
                    <Show when={logs().length === 0}>
                        <span style={{ color: 'var(--b3-theme-on-surface-variant, #999)' }}>
                            选择一个操作开始...
                        </span>
                    </Show>
                    <For each={logs()}>
                        {(line) => (
                            <div style={{ 'margin-bottom': '2px' }}>{line}</div>
                        )}
                    </For>
                </div>
            </div>
        </div>
    );
};

export default PaperReaderPanel;
