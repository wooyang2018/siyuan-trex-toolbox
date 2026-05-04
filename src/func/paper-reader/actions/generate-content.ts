/**
 * Generate Content — given the current document title (or selected text),
 * optionally search the web, then use LLM to generate structured content
 * and write it into the document (appended or replaced).
 */
import type { PaperReaderConfig, ActionResult, IProgressReporter } from '../types';
import { callLLM } from '../llm/client';
import { getSystemPrompt, buildUserPrompt } from '../llm/prompts';
import { performWebSearch } from '../search/web-search';
import {
    getCurrentDocId,
    getDocTitle,
    appendMarkdownToDoc,
} from '../utils/siyuan-api';
import { getSelectedText } from '../utils/siyuan-api';

export async function runGenerateContent(
    config: PaperReaderConfig,
    reporter: IProgressReporter,
    docId?: string
): Promise<ActionResult> {
    const targetDocId = docId ?? getCurrentDocId();
    if (!targetDocId) {
        return { success: false, message: '未检测到当前文档，请先打开一篇文档' };
    }

    // Determine topic from selection or doc title
    let topic = getSelectedText();
    if (!topic) {
        reporter.updateStatus('读取文档标题...', 5);
        topic = await getDocTitle(targetDocId);
    }
    if (!topic) {
        return { success: false, message: '无法确定主题，请选中文字或确保文档有标题' };
    }

    reporter.log(`生成内容主题: ${topic}`);

    // Optional web search for context
    reporter.updateStatus('搜索背景资料...', 10);
    const searchContext = await performWebSearch(topic, config, reporter);

    if (reporter.cancelled) return { success: false, message: '操作已取消' };

    reporter.updateStatus('生成文档内容...', 50);

    const llmConfig = {
        baseUrl: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        maxTokens: config.llmMaxTokens,
        temperature: config.llmTemperature,
    };

    const systemPrompt = getSystemPrompt('generateContent', config.outputLanguage);
    const userPrompt = buildUserPrompt(
        'generateContent',
        {
            topic,
            context: searchContext ?? '（无搜索结果，请基于已有知识生成）',
        },
        config.outputLanguage
    );

    let content: string;
    try {
        content = await callLLM(llmConfig, systemPrompt, userPrompt, reporter);
    } catch (e) {
        if (reporter.cancelled) return { success: false, message: '操作已取消' };
        return { success: false, message: `LLM 调用失败: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (!content.trim()) {
        return { success: false, message: 'LLM 返回了空响应' };
    }

    reporter.updateStatus('写入文档...', 90);

    const separator = `\n---\n\n`;
    const newBlockId = await appendMarkdownToDoc(targetDocId, separator + content + '\n');
    if (!newBlockId) {
        return { success: false, message: '内容写入文档失败' };
    }

    reporter.updateStatus('完成', 100);
    return {
        success: true,
        message: `内容已生成并追加到文档`,
    };
}
