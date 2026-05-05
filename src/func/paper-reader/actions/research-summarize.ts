/**
 * Research & Summarize — search the web for the document topic and generate
 * a research summary, then append it as a new block in the document.
 */
import type { PaperReaderConfig, ActionResult, IProgressReporter } from '../types';
import { callLLM } from '../llm/client';
import { getSystemPrompt, buildUserPrompt } from '../llm/prompts';
import { performWebSearch } from '../search/web-search';
import { getCurrentDocId, getDocTitle, appendMarkdownToDoc } from '../utils/siyuan-api';
import { getSelectedText } from '../utils/siyuan-api';

export async function runResearchSummarize(
    config: PaperReaderConfig,
    reporter: IProgressReporter,
    docId?: string
): Promise<ActionResult> {
    const targetDocId = docId ?? getCurrentDocId();
    if (!targetDocId) {
        return { success: false, message: '未检测到当前文档，请先打开一篇文档' };
    }

    // Determine topic: selected text first, then doc title
    let topic = getSelectedText();
    if (!topic) {
        reporter.updateStatus('获取文档标题...', 5);
        topic = await getDocTitle(targetDocId);
    }
    if (!topic) {
        return { success: false, message: '无法确定研究主题，请选中一段文字或确保文档有标题' };
    }

    reporter.log(`研究主题: ${topic}`);
    reporter.updateStatus('搜索相关资料...', 10);

    const searchContext = await performWebSearch(topic, config, reporter);

    if (reporter.cancelled) return { success: false, message: '操作已取消' };

    if (!searchContext) {
        reporter.log('未获取搜索结果，使用 Claude 自有知识生成摘要');
    }

    reporter.updateStatus('生成研究摘要...', 50);

    const systemPrompt = getSystemPrompt('researchSummarize', config.outputLanguage);
    const userPrompt = buildUserPrompt(
        'researchSummarize',
        {
            topic,
            searchResults: searchContext ?? '（未能获取搜索结果，请基于已有知识生成摘要）',
        },
        config.outputLanguage
    );

    let summary: string;
    try {
        summary = await callLLM(config.claudeCliPath, systemPrompt, userPrompt, reporter);
    } catch (e) {
        if (reporter.cancelled) return { success: false, message: '操作已取消' };
        return { success: false, message: `Claude CLI 调用失败: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (!summary.trim()) {
        return { success: false, message: 'Claude CLI 返回了空响应' };
    }

    reporter.updateStatus('写入文档...', 90);

    // Wrap in a collapsible section with heading
    const blockMd = `\n---\n\n## 📖 研究摘要：${topic}\n\n${summary}\n`;

    const newBlockId = await appendMarkdownToDoc(targetDocId, blockMd);
    if (!newBlockId) {
        return { success: false, message: '摘要写入文档失败' };
    }

    reporter.updateStatus('完成', 100);
    return {
        success: true,
        message: `研究摘要已添加至文档`,
    };
}
