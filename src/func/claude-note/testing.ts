/**
 * Claude Note 测试支持模块
 * @description 提供单元测试和集成测试的支持
 */

import { ClaudeNoteError, ClaudeNoteErrorCode } from "./errors";
import type { ConfigManager } from "./config";
import type { TemplateService, ClaudeAPIService, NoteStorageService, ServiceContainer } from "./services";
import type { ClaudeNoteConfig, ClaudeNoteData, ClaudeResponse } from "./types";

/**
 * 模拟配置管理器（用于测试）
 */
export class MockConfigManager implements Partial<ConfigManager> {
    private mockConfig: ClaudeNoteConfig;

    constructor(config?: Partial<ClaudeNoteConfig>) {
        this.mockConfig = {
            quickNoteEnabled: true,
            defaultTemplate: '# {{title}}\n\n{{date}} {{time}}\n\n## 内容\n\n{{content}}\n\n---\n\n*由 Claude Note 创建*',
            apiConfig: {
                endpoint: 'https://api.anthropic.com',
                apiKey: 'test-key',
                model: 'claude-3-sonnet',
                maxTokens: 4096,
                temperature: 0.7
            },
            autoSaveInterval: 30,
            syntaxHighlighting: true,
            defaultNotePath: '/Claude Notes',
            customTemplates: [],
            ...config
        };
    }

    async loadConfig(): Promise<ClaudeNoteConfig> {
        return this.mockConfig;
    }

    async saveConfig(config: Partial<ClaudeNoteConfig>): Promise<void> {
        this.mockConfig = { ...this.mockConfig, ...config };
    }

    getConfig(): ClaudeNoteConfig {
        return this.mockConfig;
    }

    async updateConfig(updates: Partial<ClaudeNoteConfig>): Promise<void> {
        this.mockConfig = { ...this.mockConfig, ...updates };
    }

    isValidConfig(): boolean {
        return true;
    }

    getConfigSummary(): Record<string, any> {
        return {
            quickNoteEnabled: this.mockConfig.quickNoteEnabled,
            apiConfigured: !!this.mockConfig.apiConfig.apiKey,
            autoSaveInterval: this.mockConfig.autoSaveInterval,
            templateCount: this.mockConfig.customTemplates?.length || 0
        };
    }
}

/**
 * 模拟模板服务（用于测试）
 */
export class MockTemplateService implements Partial<TemplateService> {
    private mockTemplates: Map<string, string> = new Map();

    constructor() {
        this.mockTemplates.set('default', '# {{title}}\n\n{{content}}');
    }

    async renderTemplate(templateName: string, variables: Record<string, any>): Promise<string> {
        const template = this.mockTemplates.get(templateName);
        if (!template) {
            throw new ClaudeNoteError(
                ClaudeNoteErrorCode.TEMPLATE_NOT_FOUND,
                `模板未找到: ${templateName}`
            );
        }

        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
            return variables[key] !== undefined ? String(variables[key]) : match;
        });
    }

    validateTemplate(template: string): boolean {
        try {
            // 简单的模板语法验证
            const testVariables = { title: 'test', content: 'test' };
            template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
                return testVariables[key] !== undefined ? String(testVariables[key]) : match;
            });
            return true;
        } catch {
            return false;
        }
    }

    getAvailableTemplates(): Array<{ name: string; description?: string }> {
        return Array.from(this.mockTemplates.keys()).map(name => ({
            name,
            description: `模拟模板: ${name}`
        }));
    }

    // 测试辅助方法
    addTemplate(name: string, content: string): void {
        this.mockTemplates.set(name, content);
    }
}

/**
 * 模拟 API 服务（用于测试）
 */
export class MockClaudeAPIService implements Partial<ClaudeAPIService> {
    private shouldFail: boolean = false;
    private responseDelay: number = 0;

    constructor(options: { shouldFail?: boolean; responseDelay?: number } = {}) {
        this.shouldFail = options.shouldFail || false;
        this.responseDelay = options.responseDelay || 0;
    }

    async chat(message: string): Promise<ClaudeResponse> {
        if (this.responseDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.responseDelay));
        }

        if (this.shouldFail) {
            throw new ClaudeNoteError(
                ClaudeNoteErrorCode.API_CONNECTION_FAILED,
                '模拟 API 失败'
            );
        }

        return {
            content: `模拟响应: ${message}`,
            usage: {
                promptTokens: message.length,
                completionTokens: 50,
                totalTokens: message.length + 50
            },
            responseTime: this.responseDelay
        };
    }

    async checkConnection(): Promise<boolean> {
        return !this.shouldFail;
    }

    // 测试辅助方法
    setShouldFail(shouldFail: boolean): void {
        this.shouldFail = shouldFail;
    }

    setResponseDelay(delay: number): void {
        this.responseDelay = delay;
    }
}

/**
 * 模拟存储服务（用于测试）
 */
export class MockNoteStorageService implements Partial<NoteStorageService> {
    private notes: Map<string, ClaudeNoteData> = new Map();
    private shouldFail: boolean = false;

    constructor(options: { shouldFail?: boolean } = {}) {
        this.shouldFail = options.shouldFail || false;
    }

    async createNote(title: string, content: string): Promise<ClaudeNoteData> {
        if (this.shouldFail) {
            throw new ClaudeNoteError(
                ClaudeNoteErrorCode.NOTE_CREATION_FAILED,
                '模拟存储失败'
            );
        }

        const noteId = `mock-note-${Date.now()}`;
        const now = new Date();

        const noteData: ClaudeNoteData = {
            id: noteId,
            title,
            content,
            createdAt: now,
            updatedAt: now,
            tags: ['claude-note', 'mock']
        };

        this.notes.set(noteId, noteData);
        return noteData;
    }

    async updateNote(id: string, updates: Partial<ClaudeNoteData>): Promise<ClaudeNoteData> {
        if (this.shouldFail) {
            throw new ClaudeNoteError(
                ClaudeNoteErrorCode.NOTE_UPDATE_FAILED,
                '模拟存储失败'
            );
        }

        const existingNote = this.notes.get(id);
        if (!existingNote) {
            throw new ClaudeNoteError(
                ClaudeNoteErrorCode.NOTE_NOT_FOUND,
                `笔记不存在: ${id}`
            );
        }

        const updatedNote: ClaudeNoteData = {
            ...existingNote,
            ...updates,
            updatedAt: new Date()
        };

        this.notes.set(id, updatedNote);
        return updatedNote;
    }

    async getNotes(): Promise<ClaudeNoteData[]> {
        return Array.from(this.notes.values());
    }

    // 测试辅助方法
    getNoteCount(): number {
        return this.notes.size;
    }

    clearNotes(): void {
        this.notes.clear();
    }

    setShouldFail(shouldFail: boolean): void {
        this.shouldFail = shouldFail;
    }
}

/**
 * 测试工具函数
 */
export class TestUtils {
    /**
     * 生成测试用的笔记数据
     */
    static generateTestNote(overrides?: Partial<ClaudeNoteData>): ClaudeNoteData {
        const now = new Date();
        return {
            id: `test-note-${Date.now()}`,
            title: '测试笔记',
            content: '这是测试笔记的内容',
            createdAt: now,
            updatedAt: now,
            tags: ['test', 'claude-note'],
            ...overrides
        };
    }

    /**
     * 生成测试用的配置
     */
    static generateTestConfig(overrides?: Partial<ClaudeNoteConfig>): ClaudeNoteConfig {
        return {
            quickNoteEnabled: true,
            defaultTemplate: '# {{title}}\n\n{{content}}',
            apiConfig: {
                endpoint: 'https://api.anthropic.com',
                apiKey: 'test-key',
                model: 'claude-3-sonnet',
                maxTokens: 4096,
                temperature: 0.7
            },
            autoSaveInterval: 30,
            syntaxHighlighting: true,
            defaultNotePath: '/Claude Notes',
            customTemplates: [],
            ...overrides
        };
    }

    /**
     * 等待指定的时间（用于测试异步操作）
     */
    static async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 验证笔记数据是否符合预期
     */
    static validateNoteData(note: ClaudeNoteData): boolean {
        return !!(note.id && note.title && note.createdAt && note.updatedAt);
    }

    /**
     * 创建模拟的服务容器（用于集成测试）
     */
    static createMockServiceContainer(): any {
        return {
            getConfigManager: () => new MockConfigManager(),
            getTemplateService: () => new MockTemplateService(),
            getAPIService: () => new MockClaudeAPIService(),
            getStorageService: () => new MockNoteStorageService(),
            initialize: async () => {},
            destroy: () => {}
        };
    }
}

/**
 * 测试运行器（简化版）
 */
export class TestRunner {
    private tests: Array<{ name: string; fn: () => Promise<void> }> = [];
    private passed = 0;
    private failed = 0;

    /**
     * 添加测试用例
     */
    addTest(name: string, fn: () => Promise<void>): void {
        this.tests.push({ name, fn });
    }

    /**
     * 运行所有测试
     */
    async runAll(): Promise<{ passed: number; failed: number; total: number }> {
        console.log('=== 开始运行 Claude Note 模块测试 ===');

        for (const test of this.tests) {
            try {
                await test.fn();
                console.log(`✅ ${test.name}`);
                this.passed++;
            } catch (error) {
                console.error(`❌ ${test.name}`, error);
                this.failed++;
            }
        }

        console.log('=== 测试完成 ===');
        console.log(`通过: ${this.passed}, 失败: ${this.failed}, 总计: ${this.tests.length}`);

        return {
            passed: this.passed,
            failed: this.failed,
            total: this.tests.length
        };
    }

    /**
     * 清除测试结果
     */
    clear(): void {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }
}

/**
 * 断言工具
 */
export class Assert {
    static equal(actual: any, expected: any, message?: string): void {
        if (actual !== expected) {
            throw new Error(message || `期望 ${expected}，实际得到 ${actual}`);
        }
    }

    static notEqual(actual: any, expected: any, message?: string): void {
        if (actual === expected) {
            throw new Error(message || `期望不等于 ${expected}，实际得到 ${actual}`);
        }
    }

    static truthy(value: any, message?: string): void {
        if (!value) {
            throw new Error(message || `期望为真值，实际得到 ${value}`);
        }
    }

    static falsy(value: any, message?: string): void {
        if (value) {
            throw new Error(message || `期望为假值，实际得到 ${value}`);
        }
    }

    static throws(fn: () => void, message?: string): void {
        try {
            fn();
            throw new Error(message || '期望函数抛出异常，但未抛出');
        } catch {
            // 正常情况，捕获到异常
        }
    }
}