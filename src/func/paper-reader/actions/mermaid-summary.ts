/**
 * Mermaid Summary — generate a Mermaid diagram from the current document
 * and append it as a code block.
 */
import type { PaperReaderConfig, ActionResult, IProgressReporter } from '../types';
import { callLLM } from '../llm/client';
import { getSystemPrompt, buildUserPrompt } from '../llm/prompts';
import { splitIntoChunks } from '../utils/chunking';
import {
    getCurrentDocId,
    getDocMarkdown,
    appendMarkdownToDoc,
} from '../utils/siyuan-api';

/**
 * Extract the first mermaid code block from LLM response.
 * Returns the raw mermaid code (without fences), or null if not found.
 */
function extractMermaidCode(response: string): string | null {
    const match = response.match(/```mermaid\s*([\s\S]*?)```/);
    return match ? match[1].trim() : null;
}

/**
 * If the doc is too long, summarize by taking the first chunk only
 * (the opening sections usually contain the most structural info).
 */
function selectRepresentativeContent(markdown: string, wordCount: number): string {
    const chunks = splitIntoChunks(markdown, wordCount);
    if (chunks.length === 0) return markdown;
    // Use at most 2 chunks to stay within typical LLM context limits
    return chunks.slice(0, 2).join('\n\n');
}

export async function runMermaidSummary(
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

    const content = selectRepresentativeContent(markdown, config.chunkWordCount);
    reporter.log(`使用文档前 ${content.length} 字符生成图表`);

    reporter.updateStatus('生成 Mermaid 图表...', 30);

    const llmConfig = {
        baseUrl: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
        maxTokens: config.llmMaxTokens,
        temperature: config.llmTemperature,
    };

    const systemPrompt = getSystemPrompt('mermaidSummary', config.outputLanguage);
    const userPrompt = buildUserPrompt('mermaidSummary', { content }, config.outputLanguage);

    let response: string;
    try {
        response = await callLLM(llmConfig, systemPrompt, userPrompt, reporter);
    } catch (e) {
        if (reporter.cancelled) return { success: false, message: '操作已取消' };
        return { success: false, message: `LLM 调用失败: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (reporter.cancelled) return { success: false, message: '操作已取消' };

    const mermaidCode = extractMermaidCode(response);
    if (!mermaidCode) {
        // Try treating the whole response as mermaid code
        const trimmed = response.trim();
        if (trimmed.startsWith('mindmap') || trimmed.startsWith('flowchart') || trimmed.startsWith('graph')) {
            reporter.log('LLM 返回了无围栏的 Mermaid 代码，尝试使用');
            const blockMd = `\n---\n\n## 📊 知识图谱\n\n\`\`\`mermaid\n${trimmed}\n\`\`\`\n`;
            const ok = await appendMarkdownToDoc(targetDocId, blockMd);
            if (!ok) return { success: false, message: '图表写入文档失败' };
            reporter.updateStatus('完成', 100);
            return { success: true, message: 'Mermaid 图表已追加到文档' };
        }
        return { success: false, message: 'LLM 未返回有效的 Mermaid 代码块' };
    }

    reporter.updateStatus('写入文档...', 90);

    const blockMd = `\n---\n\n## 📊 知识图谱\n\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n`;
    const newBlockId = await appendMarkdownToDoc(targetDocId, blockMd);
    if (!newBlockId) {
        return { success: false, message: '图表写入文档失败' };
    }

    reporter.updateStatus('完成', 100);
    return {
        success: true,
        message: 'Mermaid 图表已追加到文档',
    };
}
