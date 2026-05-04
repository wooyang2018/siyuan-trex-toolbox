/**
 * Add Links — annotate important concepts in the current document with bold markup.
 * Chunks the document, sends each chunk to the LLM, parses [[concept]] patterns,
 * then bold-marks those concepts in the original markdown.
 */
import type { PaperReaderConfig, ActionResult, IProgressReporter } from '../types';
import { callLLM } from '../llm/client';
import { getSystemPrompt, buildUserPrompt } from '../llm/prompts';
import { splitIntoChunks } from '../utils/chunking';
import { getDocMarkdown, updateDocContent, getCurrentDocId } from '../utils/siyuan-api';

/**
 * Parse [[concept]] tags from LLM response.
 * Returns deduped array of concept strings.
 */
function parseConcepts(llmOutput: string): string[] {
    const matches = llmOutput.match(/\[\[([^\]]+)\]\]/g) || [];
    const concepts = matches.map(m => m.slice(2, -2).trim()).filter(c => c.length > 0);
    return [...new Set(concepts)];
}

/**
 * Bold-markup all occurrences of each concept in markdown text.
 * Skips concepts that are already inside bold/code/link markers.
 */
function applyBoldMarkup(markdown: string, concepts: string[]): string {
    // Sort by length descending so longer matches take priority
    const sorted = [...concepts].sort((a, b) => b.length - a.length);

    let result = markdown;
    for (const concept of sorted) {
        // Escape regex special characters
        const escaped = concept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Only match if NOT already inside ** ... ** (simple heuristic: not preceded by **)
        const re = new RegExp(`(?<!\\*\\*)${escaped}(?!\\*\\*)`, 'g');
        result = result.replace(re, `**${concept}**`);
    }
    return result;
}

export async function runAddLinks(
    config: PaperReaderConfig,
    reporter: IProgressReporter,
    docId?: string
): Promise<ActionResult> {
    const targetDocId = docId ?? getCurrentDocId();
    if (!targetDocId) {
        return { success: false, message: '未检测到当前文档，请先打开一篇文档' };
    }

    reporter.updateStatus('读取文档内容...', 5);
    const markdown = await getDocMarkdown(targetDocId);
    if (!markdown) {
        return { success: false, message: '无法读取文档内容' };
    }

    const llmConfig = {
        baseUrl: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        maxTokens: config.llmMaxTokens,
        temperature: config.llmTemperature,
    };

    const chunks = splitIntoChunks(markdown, config.chunkWordCount);
    reporter.log(`文档共 ${chunks.length} 个分块`);

    const allConcepts: string[] = [];
    const systemPrompt = getSystemPrompt('addLinks', config.outputLanguage);

    for (let i = 0; i < chunks.length; i++) {
        if (reporter.cancelled) return { success: false, message: '操作已取消' };

        const percent = 10 + Math.round((i / chunks.length) * 70);
        reporter.updateStatus(`概念提取 ${i + 1}/${chunks.length}...`, percent);

        const userPrompt = buildUserPrompt('addLinks', { content: chunks[i] }, config.outputLanguage);

        try {
            const response = await callLLM(llmConfig, systemPrompt, userPrompt, reporter);
            const concepts = parseConcepts(response);
            reporter.log(`块 ${i + 1}: 提取到 ${concepts.length} 个概念`);
            allConcepts.push(...concepts);
        } catch (e) {
            if (reporter.cancelled) return { success: false, message: '操作已取消' };
            reporter.log(`块 ${i + 1} 处理失败: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    const uniqueConcepts = [...new Set(allConcepts)];
    reporter.log(`共识别到 ${uniqueConcepts.length} 个唯一概念`);

    if (uniqueConcepts.length === 0) {
        return { success: true, message: '未识别到可标注的学术概念' };
    }

    reporter.updateStatus('标注概念...', 85);
    const annotatedMarkdown = applyBoldMarkup(markdown, uniqueConcepts);

    reporter.updateStatus('写入文档...', 95);
    const ok = await updateDocContent(targetDocId, annotatedMarkdown);
    if (!ok) {
        return { success: false, message: '文档写入失败' };
    }

    reporter.updateStatus('完成', 100);
    return {
        success: true,
        message: `已标注 ${uniqueConcepts.length} 个概念`,
        details: uniqueConcepts.join('、'),
    };
}
