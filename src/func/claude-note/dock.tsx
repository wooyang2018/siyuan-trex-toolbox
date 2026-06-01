/**
 * Claude Note 停靠栏组件
 * @description 提供 Claude 笔记功能的停靠栏界面
 */

import { createSignal, createEffect, For, Show, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { showMessage } from "siyuan";
import type { ClaudeNoteData, ClaudeResponse, ClaudeConversationContext } from "./types";

// ===== 停靠栏配置 =====
export interface ClaudeNoteDockConfig {
    /** 是否显示快速笔记面板 */
    showQuickNotePanel: boolean;
    /** 默认模板 */
    defaultTemplate: string;
    /** 是否启用语法高亮 */
    syntaxHighlighting: boolean;
    /** 自动保存间隔 */
    autoSaveInterval: number;
}

// ===== 停靠栏依赖 =====
export interface ClaudeNoteDockDeps {
    /** 创建笔记函数 */
    createNote: (title: string, content?: string) => Promise<ClaudeNoteData>;
    /** 快速笔记函数 */
    quickNote: (content: string) => Promise<ClaudeNoteData>;
    /** 与 Claude 对话函数 */
    chatWithClaude: (message: string, context?: ClaudeConversationContext) => Promise<ClaudeResponse>;
    /** 获取笔记列表函数 */
    getNotes: (filter?: any) => Promise<ClaudeNoteData[]>;
    /** 显示消息函数 */
    showMessage: typeof showMessage;
}

// ===== 历史对话条目 =====
interface ChatHistoryItem {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

/**
 * Claude Note 停靠栏组件（SolidJS）
 */
function ClaudeNoteDockComponent(props: {
    config: ClaudeNoteDockConfig;
    deps: ClaudeNoteDockDeps;
}): JSX.Element {
    const [activeTab, setActiveTab] = createSignal<'quick' | 'chat' | 'notes'>('quick');
    const [quickNoteContent, setQuickNoteContent] = createSignal('');
    const [chatMessage, setChatMessage] = createSignal('');
    const [chatHistory, setChatHistory] = createSignal<ChatHistoryItem[]>([]);
    const [isLoading, setIsLoading] = createSignal(false);
    const [notes, setNotes] = createSignal<ClaudeNoteData[]>([]);
    const [searchKeyword, setSearchKeyword] = createSignal('');

    // 加载笔记列表
    createEffect(async () => {
        if (activeTab() === 'notes') {
            try {
                const noteList = await props.deps.getNotes();
                setNotes(noteList);
            } catch (error) {
                props.deps.showMessage('加载笔记列表失败', 5000, 'error');
            }
        }
    });

    // 快速笔记处理
    const handleQuickNote = async () => {
        const content = quickNoteContent().trim();
        if (!content) {
            props.deps.showMessage('请输入笔记内容', 3000, 'info');
            return;
        }

        setIsLoading(true);
        try {
            await props.deps.quickNote(content);
            setQuickNoteContent('');
            props.deps.showMessage('快速笔记创建成功', 3000);
        } catch (error) {
            props.deps.showMessage(`创建笔记失败: ${(error as Error).message || '未知错误'}`, 5000, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Claude 对话处理
    const handleChat = async () => {
        const message = chatMessage().trim();
        if (!message) {
            props.deps.showMessage('请输入对话内容', 3000, 'info');
            return;
        }

        const userItem: ChatHistoryItem = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: Date.now()
        };
        setChatHistory([...chatHistory(), userItem]);
        setChatMessage('');

        setIsLoading(true);
        try {
            const response = await props.deps.chatWithClaude(message);
            const assistantItem: ChatHistoryItem = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: response.content,
                timestamp: Date.now()
            };
            setChatHistory([...chatHistory(), assistantItem]);
        } catch (error) {
            props.deps.showMessage(`与 Claude 对话失败: ${(error as Error).message || '未知错误'}`, 5000, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // 清空对话历史
    const clearChatHistory = () => {
        setChatHistory([]);
    };

    // 笔记搜索过滤
    const filteredNotes = () => {
        const keyword = searchKeyword().toLowerCase().trim();
        if (!keyword) return notes();
        return notes().filter(note =>
            note.title.toLowerCase().includes(keyword) ||
            (note.content || '').toLowerCase().includes(keyword)
        );
    };

    return (
        <div class="claude-note-dock__container">
            {/* 标签页导航 */}
            <div class="claude-note-dock__tabs">
                <button
                    class={`claude-note-dock__tab ${activeTab() === 'quick' ? 'active' : ''}`}
                    onClick={() => setActiveTab('quick')}
                >
                    📝 快速笔记
                </button>
                <button
                    class={`claude-note-dock__tab ${activeTab() === 'chat' ? 'active' : ''}`}
                    onClick={() => setActiveTab('chat')}
                >
                    🤖 Claude 对话
                </button>
                <button
                    class={`claude-note-dock__tab ${activeTab() === 'notes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notes')}
                >
                    📚 笔记列表
                </button>
            </div>

            {/* 内容区域 */}
            <div class="claude-note-dock__content">
                {/* 快速笔记面板 */}
                <Show when={activeTab() === 'quick'}>
                    <div class="claude-note-dock__panel">
                        <div class="claude-note-dock__panel-title">快速记录想法</div>
                        <textarea
                            class="claude-note-dock__textarea"
                            placeholder="输入您的想法或笔记内容...（支持 Ctrl+Enter 快速提交）"
                            value={quickNoteContent()}
                            onInput={(e) => setQuickNoteContent(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.ctrlKey && e.key === 'Enter') {
                                    e.preventDefault();
                                    handleQuickNote();
                                }
                            }}
                            rows={6}
                        />
                        <div class="claude-note-dock__actions">
                            <button
                                class="b3-button b3-button--primary"
                                onClick={handleQuickNote}
                                disabled={isLoading() || !quickNoteContent().trim()}
                            >
                                {isLoading() ? '创建中...' : '创建笔记'}
                            </button>
                            <button
                                class="b3-button b3-button--outline"
                                onClick={() => setQuickNoteContent('')}
                                disabled={isLoading() || !quickNoteContent().trim()}
                            >
                                清空
                            </button>
                        </div>
                    </div>
                </Show>

                {/* Claude 对话面板 */}
                <Show when={activeTab() === 'chat'}>
                    <div class="claude-note-dock__panel">
                        <div class="claude-note-dock__panel-header">
                            <div class="claude-note-dock__panel-title">与 Claude 对话</div>
                            <Show when={chatHistory().length > 0}>
                                <button
                                    class="claude-note-dock__clear-btn"
                                    onClick={clearChatHistory}
                                    title="清空对话历史"
                                >
                                    🗑️
                                </button>
                            </Show>
                        </div>

                        {/* 对话历史 */}
                        <div class="claude-note-dock__chat-history">
                            <For each={chatHistory()}>
                                {(item) => (
                                    <div class={`claude-note-dock__chat-item claude-note-dock__chat-item--${item.role}`}>
                                        <div class="claude-note-dock__chat-role">
                                            {item.role === 'user' ? '👤 你' : '🤖 Claude'}
                                        </div>
                                        <div class="claude-note-dock__chat-content">{item.content}</div>
                                    </div>
                                )}
                            </For>
                            <Show when={chatHistory().length === 0}>
                                <div class="claude-note-dock__empty">开始与 Claude 对话吧</div>
                            </Show>
                        </div>

                        <textarea
                            class="claude-note-dock__textarea"
                            placeholder="向 Claude 提问或开始对话...（支持 Ctrl+Enter 发送）"
                            value={chatMessage()}
                            onInput={(e) => setChatMessage(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.ctrlKey && e.key === 'Enter') {
                                    e.preventDefault();
                                    handleChat();
                                }
                            }}
                            rows={4}
                        />
                        <button
                            class="b3-button b3-button--primary"
                            onClick={handleChat}
                            disabled={isLoading() || !chatMessage().trim()}
                        >
                            {isLoading() ? '思考中...' : '发送消息'}
                        </button>
                    </div>
                </Show>

                {/* 笔记列表面板 */}
                <Show when={activeTab() === 'notes'}>
                    <div class="claude-note-dock__panel">
                        <div class="claude-note-dock__panel-title">
                            笔记列表 ({filteredNotes().length}/{notes().length})
                        </div>
                        <input
                            type="text"
                            class="claude-note-dock__search"
                            placeholder="🔍 搜索笔记标题或内容..."
                            value={searchKeyword()}
                            onInput={(e) => setSearchKeyword(e.currentTarget.value)}
                        />
                        <div class="claude-note-dock__notes-list">
                            <Show when={filteredNotes().length === 0}>
                                <div class="claude-note-dock__empty">
                                    {searchKeyword() ? '未找到匹配的笔记' : '暂无笔记'}
                                </div>
                            </Show>
                            <For each={filteredNotes()}>
                                {(note) => (
                                    <div class="claude-note-dock__note-item" title={note.content}>
                                        <div class="claude-note-dock__note-title">{note.title}</div>
                                        <div class="claude-note-dock__note-date">
                                            {new Date(note.createdAt).toLocaleString('zh-CN')}
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </div>
                </Show>
            </div>
        </div>
    );
}

// ===== 停靠栏控制器 =====
export class ClaudeNoteDockController {
    private element: HTMLElement;
    private config: ClaudeNoteDockConfig;
    private deps: ClaudeNoteDockDeps;
    private disposeRender: (() => void) | null = null;

    constructor(element: HTMLElement, config: ClaudeNoteDockConfig, deps: ClaudeNoteDockDeps) {
        this.element = element;
        this.config = config;
        this.deps = deps;
        this.element.classList.add('claude-note-dock');
    }

    /** 挂载停靠栏 */
    mount() {
        // 清空现有内容
        this.element.innerHTML = '';

        // 使用 SolidJS render 函数渲染响应式组件
        this.disposeRender = render(
            () => <ClaudeNoteDockComponent config={this.config} deps={this.deps} />,
            this.element
        );
    }

    /** 卸载停靠栏 */
    dispose() {
        if (this.disposeRender) {
            this.disposeRender();
            this.disposeRender = null;
        }
        this.element.innerHTML = '';
    }

    /** 更新配置 */
    updateConfig(config: Partial<ClaudeNoteDockConfig>) {
        this.config = { ...this.config, ...config };
        // 重新渲染
        this.dispose();
        this.mount();
    }
}
