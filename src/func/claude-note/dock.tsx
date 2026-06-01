/**
 * Claude Note 停靠栏组件
 * @description 提供 Claude 笔记功能的停靠栏界面
 */

import { createSignal, createEffect, type JSX } from "solid-js";
import { showMessage } from "siyuan";
import type { FMiscPlugin } from "@/index";
import type { ClaudeNoteData, ClaudeResponse, ClaudeConversationContext } from "./types";

// ===== 停靠栏配置 =====
interface ClaudeNoteDockConfig {
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
interface ClaudeNoteDockDeps {
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

// ===== 停靠栏控制器 =====
export class ClaudeNoteDockController {
    private element: HTMLElement;
    private config: ClaudeNoteDockConfig;
    private deps: ClaudeNoteDockDeps;

    constructor(element: HTMLElement, config: ClaudeNoteDockConfig, deps: ClaudeNoteDockDeps) {
        this.element = element;
        this.config = config;
        this.deps = deps;
        this.element.classList.add('claude-note-dock');
    }

    /** 挂载停靠栏 */
    mount() {
        this.render();
    }

    /** 卸载停靠栏 */
    dispose() {
        this.element.innerHTML = '';
    }

    /** 渲染停靠栏界面 */
    private render() {
        const DockUI = () => {
            const [activeTab, setActiveTab] = createSignal<'quick' | 'chat' | 'notes'>('quick');
            const [quickNoteContent, setQuickNoteContent] = createSignal('');
            const [chatMessage, setChatMessage] = createSignal('');
            const [isLoading, setIsLoading] = createSignal(false);
            const [notes, setNotes] = createSignal<ClaudeNoteData[]>([]);

            // 加载笔记列表
            createEffect(async () => {
                if (activeTab() === 'notes') {
                    try {
                        const noteList = await this.deps.getNotes();
                        setNotes(noteList);
                    } catch (error) {
                        this.deps.showMessage('加载笔记列表失败', 'error');
                    }
                }
            });

            // 快速笔记处理
            const handleQuickNote = async () => {
                const content = quickNoteContent().trim();
                if (!content) {
                    this.deps.showMessage('请输入笔记内容', 'warning');
                    return;
                }

                setIsLoading(true);
                try {
                    await this.deps.quickNote(content);
                    setQuickNoteContent('');
                    this.deps.showMessage('快速笔记创建成功', 'success');
                } catch (error) {
                    this.deps.showMessage('创建笔记失败', 'error');
                } finally {
                    setIsLoading(false);
                }
            };

            // Claude 对话处理
            const handleChat = async () => {
                const message = chatMessage().trim();
                if (!message) {
                    this.deps.showMessage('请输入对话内容', 'warning');
                    return;
                }

                setIsLoading(true);
                try {
                    const response = await this.deps.chatWithClaude(message);
                    // 这里可以处理响应，比如显示在界面上
                    this.deps.showMessage('Claude 回复完成', 'success');
                    setChatMessage('');
                } catch (error) {
                    this.deps.showMessage('与 Claude 对话失败', 'error');
                } finally {
                    setIsLoading(false);
                }
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
                        {activeTab() === 'quick' && (
                            <div class="claude-note-dock__panel">
                                <div class="claude-note-dock__panel-title">快速记录想法</div>
                                <textarea
                                    class="claude-note-dock__textarea"
                                    placeholder="输入您的想法或笔记内容..."
                                    value={quickNoteContent()}
                                    onInput={(e) => setQuickNoteContent(e.currentTarget.value)}
                                    rows={6}
                                />
                                <button
                                    class="b3-button b3-button--primary"
                                    onClick={handleQuickNote}
                                    disabled={isLoading() || !quickNoteContent().trim()}
                                >
                                    {isLoading() ? '创建中...' : '创建笔记'}
                                </button>
                            </div>
                        )}

                        {/* Claude 对话面板 */}
                        {activeTab() === 'chat' && (
                            <div class="claude-note-dock__panel">
                                <div class="claude-note-dock__panel-title">与 Claude 对话</div>
                                <textarea
                                    class="claude-note-dock__textarea"
                                    placeholder="向 Claude 提问或开始对话..."
                                    value={chatMessage()}
                                    onInput={(e) => setChatMessage(e.currentTarget.value)}
                                    rows={6}
                                />
                                <button
                                    class="b3-button b3-button--primary"
                                    onClick={handleChat}
                                    disabled={isLoading() || !chatMessage().trim()}
                                >
                                    {isLoading() ? '对话中...' : '发送消息'}
                                </button>
                            </div>
                        )}

                        {/* 笔记列表面板 */}
                        {activeTab() === 'notes' && (
                            <div class="claude-note-dock__panel">
                                <div class="claude-note-dock__panel-title">
                                    笔记列表 ({notes().length})
                                </div>
                                <div class="claude-note-dock__notes-list">
                                    {notes().length === 0 ? (
                                        <div class="claude-note-dock__empty">暂无笔记</div>
                                    ) : (
                                        notes().map((note) => (
                                            <div class="claude-note-dock__note-item">
                                                <div class="claude-note-dock__note-title">{note.title}</div>
                                                <div class="claude-note-dock__note-date">
                                                    {new Date(note.createdAt).toLocaleDateString('zh-CN')}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        };

        // 使用 SolidJS 渲染组件（这里需要实际的渲染逻辑）
        // 暂时使用简单的 DOM 操作作为占位符
        this.element.innerHTML = `
            <div class="claude-note-dock__container">
                <div class="claude-note-dock__tabs">
                    <button class="claude-note-dock__tab active">📝 快速笔记</button>
                    <button class="claude-note-dock__tab">🤖 Claude 对话</button>
                    <button class="claude-note-dock__tab">📚 笔记列表</button>
                </div>
                <div class="claude-note-dock__content">
                    <div class="claude-note-dock__panel">
                        <div class="claude-note-dock__panel-title">Claude Note</div>
                        <p>Claude 笔记功能已启用</p>
                    </div>
                </div>
            </div>
        `;
    }
}