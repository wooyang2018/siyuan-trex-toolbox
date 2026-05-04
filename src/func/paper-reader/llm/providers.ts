/**
 * LLM provider presets — quick-fill configurations for common providers.
 */

export interface ProviderPreset {
    name: string;
    baseUrl: string;
    defaultModel: string;
    requiresApiKey: boolean;
    /** Optional hint shown in UI */
    hint?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
    {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        requiresApiKey: true,
    },
    {
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        defaultModel: 'claude-3-5-haiku-20241022',
        requiresApiKey: true,
    },
    {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        requiresApiKey: true,
    },
    {
        name: 'Qwen (阿里)',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        defaultModel: 'qwen-turbo',
        requiresApiKey: true,
    },
    {
        name: 'Moonshot (月之暗面)',
        baseUrl: 'https://api.moonshot.cn/v1',
        defaultModel: 'moonshot-v1-8k',
        requiresApiKey: true,
    },
    {
        name: 'GLM (智谱AI)',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        defaultModel: 'glm-4-flash',
        requiresApiKey: true,
    },
    {
        name: 'SiliconFlow',
        baseUrl: 'https://api.siliconflow.cn/v1',
        defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
        requiresApiKey: true,
    },
    {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.1-8b-instant',
        requiresApiKey: true,
    },
    {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
        requiresApiKey: true,
    },
    {
        name: 'Ollama (本地)',
        baseUrl: 'http://localhost:11434/v1',
        defaultModel: 'qwen2.5:7b',
        requiresApiKey: false,
        hint: '确保 Ollama 正在运行',
    },
    {
        name: 'LM Studio (本地)',
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
        requiresApiKey: false,
        hint: '确保 LM Studio 服务器已启动',
    },
];

export function getPresetByName(name: string): ProviderPreset | undefined {
    return PROVIDER_PRESETS.find(p => p.name === name);
}
