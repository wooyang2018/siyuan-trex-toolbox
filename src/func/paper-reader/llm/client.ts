/**
 * LLM client — supports OpenAI-compatible and Anthropic APIs.
 * Uses native fetch (works in SiYuan Desktop/Electron without CORS restrictions).
 */
import type { LLMConfig, IProgressReporter } from '../types';

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Detect API format from base URL or model name.
 */
function detectApiFormat(config: LLMConfig): 'openai' | 'anthropic' {
    if (config.apiFormat) return config.apiFormat;
    if (config.baseUrl.includes('anthropic.com') || config.model.startsWith('claude')) {
        return 'anthropic';
    }
    return 'openai';
}

/**
 * Core LLM call — non-streaming, returns full response text.
 */
export async function callLLM(
    config: LLMConfig,
    systemPrompt: string,
    userPrompt: string,
    reporter?: IProgressReporter
): Promise<string> {
    const signal = reporter?.abortController.signal;
    const format = detectApiFormat(config);

    if (format === 'anthropic') {
        return callAnthropic(config, systemPrompt, userPrompt, signal);
    }
    return callOpenAI(config, systemPrompt, userPrompt, signal);
}

// ─── OpenAI-compatible ────────────────────────────────────────────────────────

async function callOpenAI(
    config: LLMConfig,
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal
): Promise<string> {
    const url = config.baseUrl.replace(/\/$/, '') + '/chat/completions';
    const body: Record<string, any> = {
        model: config.model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: config.temperature,
        stream: false,
    };
    if (config.maxTokens > 0) {
        body.max_tokens = config.maxTokens;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        const err = await response.text().catch(() => response.statusText);
        throw new Error(`LLM API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
        throw new Error('Unexpected LLM response format (no choices[0].message.content)');
    }
    return text;
}

// ─── Anthropic Messages API ───────────────────────────────────────────────────

async function callAnthropic(
    config: LLMConfig,
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal
): Promise<string> {
    const url = config.baseUrl.replace(/\/$/, '') + '/messages';
    const body: Record<string, any> = {
        model: config.model,
        max_tokens: config.maxTokens > 0 ? config.maxTokens : 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        const err = await response.text().catch(() => response.statusText);
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text;
    if (typeof text !== 'string') {
        throw new Error('Unexpected Anthropic response format (no content[0].text)');
    }
    return text;
}

/**
 * Quick connectivity test — sends a minimal prompt to verify the API key and model are valid.
 */
export async function testLLMConnection(config: LLMConfig): Promise<{ ok: boolean; error?: string }> {
    try {
        const result = await callLLM(
            { ...config, maxTokens: 5 },
            'You are a test assistant.',
            'Reply with exactly: OK'
        );
        return { ok: typeof result === 'string' && result.length > 0 };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
