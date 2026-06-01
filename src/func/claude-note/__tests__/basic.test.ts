/**
 * Claude Note 模块基础测试
 * @description 验证模块的核心功能和错误处理
 */

// 使用相对路径导入
import {
    MockConfigManager,
    MockTemplateService,
    MockClaudeAPIService,
    MockNoteStorageService,
    TestUtils,
    Assert,
    TestRunner
} from "../testing.js";
import { ClaudeNoteError, ClaudeNoteErrorCode } from "../errors.js";

/**
 * 配置管理器测试
 */
async function testConfigManager(): Promise<void> {
    console.log('测试配置管理器...');

    const configManager = new MockConfigManager();
    const config = await configManager.loadConfig();

    Assert.truthy(config, '配置应该被加载');
    Assert.equal(config.quickNoteEnabled, true, '默认配置应该启用快速笔记');
    Assert.equal(config.apiConfig.model, 'claude-3-sonnet', '默认模型应该正确');

    // 测试配置更新
    await configManager.updateConfig({ quickNoteEnabled: false });
    const updatedConfig = configManager.getConfig();
    Assert.equal(updatedConfig.quickNoteEnabled, false, '配置更新应该生效');

    console.log('✅ 配置管理器测试通过');
}

/**
 * 模板服务测试
 */
async function testTemplateService(): Promise<void> {
    console.log('测试模板服务...');

    const templateService = new MockTemplateService();

    // 测试默认模板渲染
    const result = await templateService.renderTemplate('default', {
        title: '测试标题',
        content: '测试内容'
    });

    Assert.truthy(result.includes('测试标题'), '模板应该渲染标题');
    Assert.truthy(result.includes('测试内容'), '模板应该渲染内容');

    // 测试模板验证
    const isValid = templateService.validateTemplate('# {{title}}\n{{content}}');
    Assert.truthy(isValid, '有效模板应该通过验证');

    // 测试模板未找到错误
    try {
        await templateService.renderTemplate('nonexistent', {});
        Assert.falsy(true, '应该抛出模板未找到错误');
    } catch (error) {
        Assert.truthy(error instanceof ClaudeNoteError, '应该抛出 ClaudeNoteError');
        Assert.equal((error as ClaudeNoteError).code, ClaudeNoteErrorCode.TEMPLATE_NOT_FOUND, '错误码应该正确');
    }

    console.log('✅ 模板服务测试通过');
}

/**
 * API 服务测试
 */
async function testAPIService(): Promise<void> {
    console.log('测试 API 服务...');

    const apiService = new MockClaudeAPIService();

    // 测试正常响应
    const response = await apiService.chat('你好');
    Assert.truthy(response.content.includes('模拟响应'), '应该返回模拟响应');
    Assert.truthy(response.usage, '应该包含使用统计');

    // 测试连接检查
    const isConnected = await apiService.checkConnection();
    Assert.truthy(isConnected, '连接检查应该返回 true');

    // 测试失败情况
    const failingApiService = new MockClaudeAPIService({ shouldFail: true });
    try {
        await failingApiService.chat('测试');
        Assert.falsy(true, '应该抛出 API 错误');
    } catch (error) {
        Assert.truthy(error instanceof ClaudeNoteError, '应该抛出 ClaudeNoteError');
    }

    console.log('✅ API 服务测试通过');
}

/**
 * 存储服务测试
 */
async function testStorageService(): Promise<void> {
    console.log('测试存储服务...');

    const storageService = new MockNoteStorageService();

    // 测试创建笔记
    const note = await storageService.createNote('测试笔记', '测试内容');
    Assert.truthy(note.id, '笔记应该有 ID');
    Assert.equal(note.title, '测试笔记', '笔记标题应该正确');

    // 测试获取笔记列表
    const notes = await storageService.getNotes();
    Assert.equal(notes.length, 1, '应该有一个笔记');

    // 测试更新笔记
    const updatedNote = await storageService.updateNote(note.id, { title: '更新后的标题' });
    Assert.equal(updatedNote.title, '更新后的标题', '笔记标题应该被更新');

    // 测试笔记未找到错误
    try {
        await storageService.updateNote('nonexistent-id', { title: '测试' });
        Assert.falsy(true, '应该抛出笔记未找到错误');
    } catch (error) {
        Assert.truthy(error instanceof ClaudeNoteError, '应该抛出 ClaudeNoteError');
        Assert.equal((error as ClaudeNoteError).code, ClaudeNoteErrorCode.NOTE_NOT_FOUND, '错误码应该正确');
    }

    console.log('✅ 存储服务测试通过');
}

/**
 * 错误处理测试
 */
async function testErrorHandling(): Promise<void> {
    console.log('测试错误处理...');

    // 测试错误创建
    const error = new ClaudeNoteError(
        ClaudeNoteErrorCode.API_CONNECTION_FAILED,
        '测试错误消息',
        { test: 'data' }
    );

    Assert.equal(error.code, ClaudeNoteErrorCode.API_CONNECTION_FAILED, '错误码应该正确');
    Assert.equal(error.message, '测试错误消息', '错误消息应该正确');
    Assert.truthy(error.context, '错误上下文应该存在');
    Assert.truthy(error.timestamp, '错误时间戳应该存在');

    // 测试错误描述
    const description = error.getDescription();
    Assert.truthy(description, '错误描述应该存在');

    // 测试错误序列化
    const json = error.toJSON();
    Assert.truthy(json.name, '序列化对象应该包含名称');
    Assert.truthy(json.code, '序列化对象应该包含错误码');

    console.log('✅ 错误处理测试通过');
}

/**
 * 运行所有测试
 */
async function runAllTests(): Promise<void> {
    const testRunner = new TestRunner();

    testRunner.addTest('配置管理器', testConfigManager);
    testRunner.addTest('模板服务', testTemplateService);
    testRunner.addTest('API 服务', testAPIService);
    testRunner.addTest('存储服务', testStorageService);
    testRunner.addTest('错误处理', testErrorHandling);

    const results = await testRunner.runAll();

    if (results.failed > 0) {
        throw new Error(`测试失败: ${results.failed} 个测试未通过`);
    }

    console.log('🎉 所有测试通过！');
}

// 如果直接运行此文件，执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

export {
    testConfigManager,
    testTemplateService,
    testAPIService,
    testStorageService,
    testErrorHandling,
    runAllTests
};