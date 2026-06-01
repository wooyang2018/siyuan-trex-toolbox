/**
 * Claude Note 配置管理模块
 * @description 提供类型安全的配置管理和验证
 */

// 使用相对路径导入以避免路径映射问题
// import type FMiscPlugin from "@/index";

// 临时定义类型，实际使用时需要正确的导入
type FMiscPlugin = any;
import { createSettingAdapter } from "@frostime/siyuan-plugin-kits";
import { ClaudeNoteError, ClaudeNoteErrorCode, ErrorHandler } from "./errors";
import type { ClaudeNoteConfig, ClaudeAPIConfig, NoteTemplate } from "./types";

/**
 * 配置验证规则
 */
interface ConfigValidationRule<T> {
    validate: (value: T) => boolean;
    message: string;
}

/**
 * Claude Note 配置管理器
 */
export class ConfigManager {
    private plugin: FMiscPlugin;
    private configAdapter: any;
    private configCache: ClaudeNoteConfig | null = null;

    constructor(plugin: FMiscPlugin) {
        this.plugin = plugin;
        this.configAdapter = this.createConfigAdapter();
    }

    /**
     * 创建配置适配器
     */
    private createConfigAdapter() {
        const configDefinitions = [
            {
                key: 'quickNoteEnabled',
                type: 'checkbox' as const,
                value: true,
                title: '启用快速笔记功能',
                description: '是否启用快速笔记功能',
                devicewise: false
            },
            {
                key: 'defaultTemplate',
                type: 'textarea' as const,
                value: '# {{title}}\n\n{{date}} {{time}}\n\n## 内容\n\n{{content}}\n\n---\n\n*由 Claude Note 创建*',
                title: '默认笔记模板',
                description: '笔记的默认模板格式',
                devicewise: false
            },
            {
                key: 'apiConfig.endpoint',
                type: 'textinput' as const,
                value: '',
                title: 'Claude API 端点',
                description: 'Claude API 的服务端点地址',
                devicewise: false
            },
            {
                key: 'apiConfig.apiKey',
                type: 'textinput' as const,
                value: '',
                title: 'Claude API 密钥',
                description: 'Claude API 的访问密钥',
                devicewise: false
            },
            {
                key: 'apiConfig.model',
                type: 'textinput' as const,
                value: 'claude-3-sonnet',
                title: 'Claude 模型',
                description: '使用的 Claude 模型名称',
                devicewise: false
            },
            {
                key: 'apiConfig.maxTokens',
                type: 'number' as const,
                value: 4096,
                title: '最大 Token 数',
                description: '每次请求的最大 token 数量',
                devicewise: false
            },
            {
                key: 'apiConfig.temperature',
                type: 'slider' as const,
                value: 0.7,
                title: '温度参数',
                description: '生成文本的随机性 (0-1)',
                devicewise: false,
                slider: { min: 0, max: 1, step: 0.1 }
            },
            {
                key: 'autoSaveInterval',
                type: 'number' as const,
                value: 30,
                title: '自动保存间隔（秒）',
                description: '自动保存笔记的时间间隔',
                devicewise: false
            },
            {
                key: 'syntaxHighlighting',
                type: 'checkbox' as const,
                value: true,
                title: '启用语法高亮',
                description: '是否启用代码语法高亮',
                devicewise: false
            },
            {
                key: 'defaultNotePath',
                type: 'textinput' as const,
                value: '/Claude Notes',
                title: '默认笔记路径',
                description: '笔记的默认存储路径',
                devicewise: false
            }
        ];

        return createSettingAdapter(configDefinitions);
    }

    /**
     * 加载配置
     */
    public async loadConfig(): Promise<ClaudeNoteConfig> {
        return await ErrorHandler.wrapAsync(async () => {
            const configData = this.plugin.getConfig('ClaudeNote', 'config');

            if (!configData) {
                // 首次加载，使用默认配置
                const defaultConfig = this.getDefaultConfig();
                await this.saveConfig(defaultConfig);
                this.configCache = defaultConfig;
                return defaultConfig;
            }

            // 验证配置数据
            const validatedConfig = this.validateConfig(configData);
            this.configCache = validatedConfig;

            return validatedConfig;
        }, ClaudeNoteErrorCode.CONFIG_LOAD_FAILED, { operation: 'loadConfig' });
    }

    /**
     * 保存配置
     */
    public async saveConfig(config: Partial<ClaudeNoteConfig>): Promise<void> {
        await ErrorHandler.wrapAsync(async () => {
            const currentConfig = this.configCache || this.getDefaultConfig();
            const mergedConfig = { ...currentConfig, ...config };

            // 验证配置
            const validatedConfig = this.validateConfig(mergedConfig);

            // 保存到插件配置
            this.plugin.setConfig('ClaudeNote', 'config', validatedConfig);
            this.configCache = validatedConfig;

            console.log('[ClaudeNote] 配置已保存');
        }, ClaudeNoteErrorCode.CONFIG_LOAD_FAILED, { operation: 'saveConfig' });
    }

    /**
     * 获取当前配置
     */
    public getConfig(): ClaudeNoteConfig {
        if (!this.configCache) {
            throw new ClaudeNoteError(
                ClaudeNoteErrorCode.CONFIG_LOAD_FAILED,
                '配置未加载，请先调用 loadConfig()'
            );
        }
        return this.configCache;
    }

    /**
     * 更新配置项
     */
    public async updateConfig(updates: Partial<ClaudeNoteConfig>): Promise<void> {
        const currentConfig = this.getConfig();
        const newConfig = { ...currentConfig, ...updates };
        await this.saveConfig(newConfig);
    }

    /**
     * 验证配置
     */
    private validateConfig(config: any): ClaudeNoteConfig {
        const validationRules: Record<string, ConfigValidationRule<any>> = {
            quickNoteEnabled: {
                validate: (value) => typeof value === 'boolean',
                message: 'quickNoteEnabled 必须是布尔值'
            },
            defaultTemplate: {
                validate: (value) => typeof value === 'string' && value.length > 0,
                message: 'defaultTemplate 必须是非空字符串'
            },
            'apiConfig.model': {
                validate: (value) => typeof value === 'string' && value.length > 0,
                message: 'apiConfig.model 必须是非空字符串'
            },
            'apiConfig.maxTokens': {
                validate: (value) => typeof value === 'number' && value > 0 && value <= 100000,
                message: 'apiConfig.maxTokens 必须是 1-100000 之间的数字'
            },
            'apiConfig.temperature': {
                validate: (value) => typeof value === 'number' && value >= 0 && value <= 1,
                message: 'apiConfig.temperature 必须是 0-1 之间的数字'
            },
            autoSaveInterval: {
                validate: (value) => typeof value === 'number' && value >= 0 && value <= 3600,
                message: 'autoSaveInterval 必须是 0-3600 之间的数字'
            }
        };

        const errors: string[] = [];

        // 验证必填字段
        for (const [path, rule] of Object.entries(validationRules)) {
            const value = this.getNestedValue(config, path);
            if (!rule.validate(value)) {
                errors.push(rule.message);
            }
        }

        if (errors.length > 0) {
            throw new ClaudeNoteError(
                ClaudeNoteErrorCode.CONFIG_VALIDATION_FAILED,
                `配置验证失败: ${errors.join('; ')}`,
                { errors }
            );
        }

        // 应用默认值
        return {
            quickNoteEnabled: config.quickNoteEnabled ?? true,
            defaultTemplate: config.defaultTemplate ?? this.getDefaultConfig().defaultTemplate,
            apiConfig: {
                endpoint: config.apiConfig?.endpoint ?? '',
                apiKey: config.apiConfig?.apiKey ?? '',
                model: config.apiConfig?.model ?? 'claude-3-sonnet',
                maxTokens: config.apiConfig?.maxTokens ?? 4096,
                temperature: config.apiConfig?.temperature ?? 0.7
            },
            autoSaveInterval: config.autoSaveInterval ?? 30,
            syntaxHighlighting: config.syntaxHighlighting ?? true,
            defaultNotePath: config.defaultNotePath ?? '/Claude Notes',
            customTemplates: config.customTemplates ?? []
        };
    }

    /**
     * 获取嵌套对象的值
     */
    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * 获取默认配置
     */
    private getDefaultConfig(): ClaudeNoteConfig {
        return {
            quickNoteEnabled: true,
            defaultTemplate: '# {{title}}\n\n{{date}} {{time}}\n\n## 内容\n\n{{content}}\n\n---\n\n*由 Claude Note 创建*',
            apiConfig: {
                endpoint: '',
                apiKey: '',
                model: 'claude-3-sonnet',
                maxTokens: 4096,
                temperature: 0.7
            },
            autoSaveInterval: 30,
            syntaxHighlighting: true,
            defaultNotePath: '/Claude Notes',
            customTemplates: []
        };
    }

    /**
     * 重置为默认配置
     */
    public async resetToDefault(): Promise<void> {
        await this.saveConfig(this.getDefaultConfig());
    }

    /**
     * 检查配置是否有效
     */
    public isValidConfig(): boolean {
        try {
            this.validateConfig(this.configCache || {});
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取配置摘要（用于调试）
     */
    public getConfigSummary(): Record<string, any> {
        const config = this.configCache || this.getDefaultConfig();
        return {
            quickNoteEnabled: config.quickNoteEnabled,
            apiConfigured: !!config.apiConfig.apiKey,
            autoSaveInterval: config.autoSaveInterval,
            templateCount: config.customTemplates?.length || 0
        };
    }
}

/**
 * 配置管理器工厂函数
 */
export const createConfigManager = (plugin: FMiscPlugin): ConfigManager => {
    return new ConfigManager(plugin);
};