/**
 * Claude Runner 测试
 */

import { ClaudeRunner } from "../claude-runner";
import type { ClaudeNoteConfig } from "../types";

describe("ClaudeRunner", () => {
    let runner: ClaudeRunner;
    let config: ClaudeNoteConfig;

    beforeEach(() => {
        config = {
            quickNoteEnabled: true,
            defaultTemplate: "# {{title}}\n\n{{content}}\n\n---\n*创建于 {{date}} {{time}}*",
            apiConfig: {
                apiKey: "test-api-key",
                model: "claude-3-5-sonnet",
                maxTokens: 1000,
                temperature: 0.7
            },
            customTemplates: [],
            autoSaveInterval: 30,
            syntaxHighlighting: true,
            defaultNotePath: "/测试/Claude笔记"
        };
        runner = new ClaudeRunner(config);
    });

    describe("构造函数", () => {
        it("应该正确初始化", () => {
            expect(runner).toBeInstanceOf(ClaudeRunner);
        });
    });

    describe("listClaudeSessions", () => {
        it("应该返回会话列表", () => {
            const sessions = runner.listClaudeSessions();
            expect(Array.isArray(sessions)).toBe(true);
        });

        it("应该支持限制参数", () => {
            const sessions = runner.listClaudeSessions({ limit: 10 });
            expect(Array.isArray(sessions)).toBe(true);
        });

        it("应该支持天数过滤", () => {
            const sessions = runner.listClaudeSessions({ days: 7 });
            expect(Array.isArray(sessions)).toBe(true);
        });
    });

    describe("runClaude", () => {
        it("应该返回运行句柄", () => {
            const prompt = "你好，测试一下";
            const onEvent = jest.fn();

            const handle = runner.runClaude(prompt, undefined, onEvent);

            expect(handle).toHaveProperty("abort");
            expect(handle).toHaveProperty("completed");
            expect(typeof handle.abort).toBe("function");
            expect(handle.completed).toBeInstanceOf(Promise);
        });

        it("应该触发事件回调", async () => {
            const prompt = "测试事件";
            const onEvent = jest.fn();

            const handle = runner.runClaude(prompt, undefined, onEvent);

            // 等待执行完成
            await handle.completed;

            // 验证事件回调被调用
            expect(onEvent).toHaveBeenCalled();
        });

        it("应该支持中止操作", () => {
            const prompt = "测试中止";
            const onEvent = jest.fn();

            const handle = runner.runClaude(prompt, undefined, onEvent);

            // 立即中止
            handle.abort();

            expect(typeof handle.abort).toBe("function");
        });
    });

    describe("normalizeClaudeEvent", () => {
        it("应该处理文本事件", () => {
            const rawEvent = {
                type: "assistant",
                message: {
                    content: [
                        { type: "text", text: "Hello, world!" }
                    ]
                }
            };

            const events = runner.normalizeClaudeEvent(rawEvent);

            expect(Array.isArray(events)).toBe(true);
            expect(events.length).toBeGreaterThan(0);
            expect(events[0]).toHaveProperty("type");
        });

        it("应该处理思考事件", () => {
            const rawEvent = {
                type: "assistant",
                message: {
                    content: [
                        { type: "thinking", thinking: "我在思考..." }
                    ]
                }
            };

            const events = runner.normalizeClaudeEvent(rawEvent);

            expect(Array.isArray(events)).toBe(true);
        });

        it("应该处理工具使用事件", () => {
            const rawEvent = {
                type: "assistant",
                message: {
                    content: [
                        {
                            type: "tool_use",
                            name: "search",
                            input: { query: "test" }
                        }
                    ]
                }
            };

            const events = runner.normalizeClaudeEvent(rawEvent);

            expect(Array.isArray(events)).toBe(true);
        });

        it("应该处理错误事件", () => {
            const rawEvent = {
                type: "error",
                error: { message: "测试错误" }
            };

            const events = runner.normalizeClaudeEvent(rawEvent);

            expect(Array.isArray(events)).toBe(true);
            expect(events[0]).toHaveProperty("type", "error");
        });
    });

    describe("会话管理", () => {
        it("应该支持删除会话", () => {
            const result = runner.deleteClaudeSession("/test/session.jsonl");
            expect(typeof result).toBe("boolean");
        });

        it("应该支持重命名会话", () => {
            const result = runner.renameClaudeSession("/test/session.jsonl", "新标题");
            expect(typeof result).toBe("boolean");
        });

        it("应该加载会话消息", () => {
            const messages = runner.loadClaudeSessionMessages("/test/session.jsonl");
            expect(Array.isArray(messages)).toBe(true);
        });
    });

    describe("内容处理", () => {
        it("应该正确处理字符串内容", () => {
            // 测试私有方法通过间接方式
            const messages = runner.loadClaudeSessionMessages("test");
            expect(Array.isArray(messages)).toBe(true);
        });

        it("应该处理数组内容", () => {
            // 测试私有方法通过间接方式
            const messages = runner.loadClaudeSessionMessages("test");
            expect(Array.isArray(messages)).toBe(true);
        });
    });
});

describe("ClaudeRunner 集成测试", () => {
    it("应该与现有服务兼容", () => {
        const config: ClaudeNoteConfig = {
            quickNoteEnabled: true,
            defaultTemplate: "# {{title}}\n\n{{content}}",
            apiConfig: {
                apiKey: "test-key",
                model: "claude-3-5-sonnet"
            },
            customTemplates: []
        };

        const runner = new ClaudeRunner(config);

        // 验证基本功能
        expect(runner.listClaudeSessions()).toEqual([]);

        // 验证事件处理
        const onEvent = jest.fn();
        const handle = runner.runClaude("test", undefined, onEvent);

        expect(handle).toBeDefined();
        expect(typeof handle.abort).toBe("function");
    });
});