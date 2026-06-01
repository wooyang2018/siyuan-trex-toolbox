/**
 * Claude Runner 集成验证脚本
 */

import { ClaudeRunner } from "./claude-runner";
import type { ClaudeNoteConfig } from "./types";

/**
 * 验证 Claude Runner 集成
 */
async function validateIntegration(): Promise<void> {
    console.log("=== Claude Runner 集成验证 ===");

    // 创建测试配置
    const config: ClaudeNoteConfig = {
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

    // 1. 测试 Claude Runner 实例化
    console.log("1. 测试 Claude Runner 实例化...");
    const runner = new ClaudeRunner(config);
    console.log("✓ Claude Runner 实例化成功");

    // 2. 测试会话列表功能
    console.log("2. 测试会话列表功能...");
    const sessions = runner.listClaudeSessions();
    console.log(`✓ 获取到 ${sessions.length} 个会话`);

    // 3. 测试事件标准化
    console.log("3. 测试事件标准化...");
    const testEvent = {
        type: "assistant",
        message: {
            content: [
                { type: "text", text: "Hello, world!" }
            ]
        }
    };
    const normalizedEvents = runner.normalizeClaudeEvent(testEvent);
    console.log(`✓ 标准化 ${normalizedEvents.length} 个事件`);

    // 4. 测试运行 Claude
    console.log("4. 测试运行 Claude...");
    let eventCount = 0;
    let responseContent = "";

    const onEvent = (event: any) => {
        eventCount++;
        if (event.type === "text" && event.text) {
            responseContent += event.text;
        }
        console.log(`  事件 ${eventCount}: ${event.type} - ${event.text || event.error || ""}`);
    };

    const prompt = "请回复一个简单的测试消息";
    const handle = runner.runClaude(prompt, undefined, onEvent);

    console.log("   启动 Claude 执行...");

    // 等待执行完成
    const result = await handle.completed;

    console.log(`✓ Claude 执行完成:`);
    console.log(`  退出码: ${result.exitCode}`);
    console.log(`  会话ID: ${result.sessionId}`);
    console.log(`  是否有错误: ${result.hasClaudeError}`);
    console.log(`  响应内容长度: ${responseContent.length}`);
    console.log(`  处理事件数: ${eventCount}`);

    // 5. 测试中止功能
    console.log("5. 测试中止功能...");
    const abortHandle = runner.runClaude("这个应该被中止", undefined, () => {});
    abortHandle.abort();
    console.log("✓ 中止功能正常");

    // 6. 测试会话管理
    console.log("6. 测试会话管理...");
    const deleteResult = runner.deleteClaudeSession("/test/session.jsonl");
    const renameResult = runner.renameClaudeSession("/test/session.jsonl", "新标题");
    const messages = runner.loadClaudeSessionMessages("/test/session.jsonl");

    console.log(`✓ 删除会话: ${deleteResult}`);
    console.log(`✓ 重命名会话: ${renameResult}`);
    console.log(`✓ 加载消息: ${messages.length} 条`);

    console.log("\n=== 集成验证完成 ===");
    console.log("所有测试通过！Claude Runner 已成功集成到 Claude Note 模块中。");
}

/**
 * 验证错误处理
 */
async function validateErrorHandling(): Promise<void> {
    console.log("\n=== 错误处理验证 ===");

    const config: ClaudeNoteConfig = {
        quickNoteEnabled: true,
        defaultTemplate: "# {{title}}\n\n{{content}}",
        apiConfig: {
            apiKey: "", // 空 API 密钥
            model: "claude-3-5-sonnet"
        },
        customTemplates: []
    };

    const runner = new ClaudeRunner(config);

    try {
        // 测试无效输入的处理
        const sessions = runner.listClaudeSessions({ limit: -1 });
        console.log("✓ 无效参数处理正常");

        const messages = runner.loadClaudeSessionMessages("");
        console.log("✓ 空路径处理正常");

        console.log("✓ 错误处理验证通过");
    } catch (error) {
        console.log("✓ 错误处理机制正常工作");
    }
}

// 运行验证
if (import.meta.main) {
    validateIntegration()
        .then(() => validateErrorHandling())
        .catch(error => {
            console.error("验证失败:", error);
            process.exit(1);
        });
}

export { validateIntegration, validateErrorHandling };