/**
 * Claude Note 模块演示
 * @description 展示改进后模块的基本功能
 */

import {
    MockConfigManager,
    MockTemplateService,
    MockClaudeAPIService,
    MockNoteStorageService,
    TestUtils
} from './testing.js';

import { ErrorHandler, ClaudeNoteError, ClaudeNoteErrorCode } from './errors.js';

/**
 * 演示配置管理功能
 */
async function demoConfigManagement(): Promise<void> {
    console.log('=== 配置管理演示 ===');

    const configManager = new MockConfigManager();

    // 加载配置
    const config = await configManager.loadConfig();
    console.log('✅ 配置加载成功');
    console.log('   快速笔记启用:', config.quickNoteEnabled);
    console.log('   API 模型:', config.apiConfig.model);

    // 更新配置
    await configManager.updateConfig({ quickNoteEnabled: false });
    const updatedConfig = configManager.getConfig();
    console.log('✅ 配置更新成功');
    console.log('   更新后快速笔记启用:', updatedConfig.quickNoteEnabled);

    // 配置摘要
    const summary = configManager.getConfigSummary();
    console.log('📊 配置摘要:', summary);
}

/**
 * 演示模板服务功能
 */
async function demoTemplateService(): Promise<void> {
    console.log('\n=== 模板服务演示 ===');

    const templateService = new MockTemplateService();

    // 渲染模板
    const result = await templateService.renderTemplate('default', {
        title: '演示笔记',
        content: '这是演示内容'
    });

    console.log('✅ 模板渲染成功');
    console.log('   渲染结果:');
    console.log(result);

    // 模板验证
    const isValid = templateService.validateTemplate('# {{title}}\n{{content}}');
    console.log('✅ 模板验证:', isValid);

    // 可用模板
    const templates = templateService.getAvailableTemplates();
    console.log('📋 可用模板:', templates);
}

/**
 * 演示 API 服务功能
 */
async function demoAPIService(): Promise<void> {
    console.log('\n=== API 服务演示 ===');

    const apiService = new MockClaudeAPIService();

    // 与 Claude 对话
    const response = await apiService.chat('你好，请帮我写一段代码');
    console.log('✅ API 调用成功');
    console.log('   响应内容:', response.content);
    console.log('   Token 使用:', response.usage);

    // 连接检查
    const isConnected = await apiService.checkConnection();
    console.log('🔗 连接状态:', isConnected);
}

/**
 * 演示存储服务功能
 */
async function demoStorageService(): Promise<void> {
    console.log('\n=== 存储服务演示 ===');

    const storageService = new MockNoteStorageService();

    // 创建笔记
    const note = await storageService.createNote('演示笔记', '这是演示笔记的内容');
    console.log('✅ 笔记创建成功');
    console.log('   笔记 ID:', note.id);
    console.log('   笔记标题:', note.title);

    // 更新笔记
    const updatedNote = await storageService.updateNote(note.id, {
        title: '更新后的演示笔记'
    });
    console.log('✅ 笔记更新成功');
    console.log('   新标题:', updatedNote.title);

    // 获取笔记列表
    const notes = await storageService.getNotes();
    console.log('📚 笔记数量:', notes.length);
}

/**
 * 演示错误处理功能
 */
async function demoErrorHandling(): Promise<void> {
    console.log('\n=== 错误处理演示 ===');

    // 创建自定义错误
    const error = new ClaudeNoteError(
        ClaudeNoteErrorCode.API_CONNECTION_FAILED,
        '模拟 API 连接失败',
        { endpoint: 'https://api.example.com', timeout: 5000 }
    );

    console.log('✅ 错误创建成功');
    console.log('   错误码:', error.code);
    console.log('   错误描述:', error.getDescription());
    console.log('   用户友好消息:', ErrorHandler.getUserFriendlyMessage(error.code));

    // 演示错误处理包装器
    const failingApiService = new MockClaudeAPIService({ shouldFail: true });

    try {
        await ErrorHandler.wrapAsync(
            () => failingApiService.chat('测试'),
            ClaudeNoteErrorCode.API_CONNECTION_FAILED,
            { operation: '测试API' }
        );
    } catch (wrappedError) {
        console.log('✅ 错误包装器工作正常');
        if (ErrorHandler.isClaudeNoteError(wrappedError)) {
            console.log('   包装后的错误码:', wrappedError.code);
        }
    }

    // 演示优雅的错误处理
    const result = await ErrorHandler.handleGracefully(
        () => failingApiService.chat('测试'),
        { content: '备用响应' } as any,
        '优雅错误处理演示'
    );
    console.log('✅ 优雅错误处理成功');
    console.log('   备用响应:', result.content);
}

/**
 * 运行所有演示
 */
async function runAllDemos(): Promise<void> {
    console.log('🚀 开始 Claude Note 模块功能演示\n');

    try {
        await demoConfigManagement();
        await demoTemplateService();
        await demoAPIService();
        await demoStorageService();
        await demoErrorHandling();

        console.log('\n🎉 所有演示成功完成！');
        console.log('\n📋 改进总结:');
        console.log('✅ 错误处理机制完善 - 提供了详细的错误码和用户友好消息');
        console.log('✅ 配置管理改进 - 类型安全且支持热更新');
        console.log('✅ 函数职责分离 - 清晰的服务层架构');
        console.log('✅ 可测试性增强 - 完整的模拟对象和测试工具');
        console.log('✅ 向后兼容性保持 - 旧接口仍然可用');

    } catch (error) {
        console.error('\n❌ 演示过程中出错:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllDemos().catch(error => {
        console.error('演示运行失败:', error);
        process.exit(1);
    });
}

export {
    demoConfigManagement,
    demoTemplateService,
    demoAPIService,
    demoStorageService,
    demoErrorHandling,
    runAllDemos
};