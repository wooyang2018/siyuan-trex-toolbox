/**
 * Web search — DuckDuckGo (no API key) + Tavily (optional, higher quality).
 */
import type { SearchResult } from '../types';
import type { PaperReaderConfig } from '../types';
import type { IProgressReporter } from '../types';

// ─── DuckDuckGo ───────────────────────────────────────────────────────────────

/**
 * DuckDuckGo Instant Answer API — no API key required.
 * Returns top results as snippets.
 */
async function searchDuckDuckGo(
    query: string,
    maxResults = 5,
    signal?: AbortSignal
): Promise<SearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`DuckDuckGo error: ${response.status}`);

    const data = await response.json();
    const results: SearchResult[] = [];

    // Abstract (main answer)
    if (data.AbstractText) {
        results.push({
            title: data.Heading || query,
            url: data.AbstractURL || '',
            snippet: data.AbstractText,
        });
    }

    // Related topics
    if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
            if (results.length >= maxResults) break;
            if (topic.Text && topic.FirstURL) {
                results.push({
                    title: topic.Text.split(' - ')[0] || topic.FirstURL,
                    url: topic.FirstURL,
                    snippet: topic.Text,
                });
            }
            // Handle subtopics (nested)
            if (Array.isArray(topic.Topics)) {
                for (const sub of topic.Topics) {
                    if (results.length >= maxResults) break;
                    if (sub.Text && sub.FirstURL) {
                        results.push({
                            title: sub.Text.split(' - ')[0] || sub.FirstURL,
                            url: sub.FirstURL,
                            snippet: sub.Text,
                        });
                    }
                }
            }
        }
    }

    return results;
}

// ─── Tavily ───────────────────────────────────────────────────────────────────

async function searchTavily(
    query: string,
    apiKey: string,
    maxResults = 5,
    signal?: AbortSignal
): Promise<SearchResult[]> {
    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            query,
            max_results: maxResults,
            search_depth: 'basic',
            include_answer: false,
        }),
        signal,
    });

    if (!response.ok) {
        const err = await response.text().catch(() => response.statusText);
        throw new Error(`Tavily error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return (data.results || []).map((r: any) => ({
        title: r.title || r.url,
        url: r.url,
        snippet: r.content || r.snippet || '',
    }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search the web for a topic and return formatted research context.
 * Uses Tavily if API key is configured, otherwise DuckDuckGo.
 * Returns null if search is disabled or fails with no results.
 */
export async function performWebSearch(
    topic: string,
    config: PaperReaderConfig,
    reporter: IProgressReporter
): Promise<string | null> {
    if (!config.searchEnabled) {
        reporter.log('网络搜索已禁用，跳过搜索步骤');
        return null;
    }

    const signal = reporter.abortController.signal;
    const query = `${topic} 学术 概念`;

    let results: SearchResult[] = [];

    try {
        if (config.tavilyApiKey) {
            reporter.log(`使用 Tavily 搜索：${query}`);
            results = await searchTavily(query, config.tavilyApiKey, 5, signal);
        } else {
            reporter.log(`使用 DuckDuckGo 搜索：${query}`);
            results = await searchDuckDuckGo(query, 5, signal);
        }
    } catch (e) {
        if (reporter.cancelled) return null;
        reporter.log(`搜索失败：${e instanceof Error ? e.message : String(e)}，继续不带搜索结果`);
        return null;
    }

    if (results.length === 0) {
        reporter.log('搜索未返回结果');
        return null;
    }

    reporter.log(`获得 ${results.length} 条搜索结果`);

    // Format results as context text
    const lines = results.map(r => `### ${r.title}\n来源：${r.url}\n\n${r.snippet}`);
    let context = lines.join('\n\n---\n\n');

    // Trim to token budget (rough: 1 token ≈ 2 chars for CJK mix)
    const maxChars = config.maxResearchTokens * 2;
    if (context.length > maxChars) {
        context = context.slice(0, maxChars) + '\n\n...[内容已截断]';
    }

    return context;
}
