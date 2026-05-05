/**
 * Translate — translate the current document chunk-by-chunk and create
 * a new translated document in the same notebook.
 */
import type { PaperReaderConfig, ActionResult, IProgressReporter } from '../types';
import { callLLM } from '../llm/client';
import { getSystemPrompt, buildUserPrompt } from '../llm/prompts';
import { splitIntoChunks } from '../utils/chunking';
import {
    getCurrentDocId,
    getDocTitle,
    getDocMarkdown,
    findNotebookByName,
    listNotebooks,
    createDocWithMarkdown,
    getDocByPath,
} from '../utils/siyuan-api';

/**
 * Map outputLanguage to a human-readable target language label.
 */
function getTargetLanguageLabel(outputLanguage: string): string {
    const map: Record<string, string> = {
        'zh-CN': '中文',
        'zh-TW': '繁體中文',
        'en': '英文',
        'en-US': '英文',
        'en-GB': '英文',
        'ja': '日文',
        'ko': '韩文',
        'fr': '法文',
        'de': '德文',
        'es': '西班牙文',
        'ru': '俄文',
    };
    return map[outputLanguage] || outputLanguage;
}

export async function runTranslate(
    config: PaperReaderConfig,
    reporter: IProgressReporter,
    docId?: string
): Promise<ActionResult> {
    const targetDocId = docId ?? getCurrentDocId();
    if (!targetDocId) {
        return { success: false, message: '未检测到当前文档，请先打开一篇文档' };
    }

    reporter.updateStatus('读取文档内容...', 5);
    const [markdown, docTitle] = await Promise.all([
        getDocMarkdown(targetDocId),
        getDocTitle(targetDocId),
    ]);

    if (!markdown) {
        return { success: false, message: '无法读取文档内容' };
    }

    const targetLanguage = getTargetLanguageLabel(config.outputLanguage);
    reporter.log(`翻译目标语言: ${targetLanguage}`);

    const chunks = splitIntoChunks(markdown, config.chunkWordCount);
    reporter.log(`文档共 ${chunks.length} 个分块`);

    const translatedChunks: string[] = [];
    const systemPrompt = getSystemPrompt('translate', config.outputLanguage).replace(
        '{targetLanguage}',
        targetLanguage
    );

    for (let i = 0; i < chunks.length; i++) {
        if (reporter.cancelled) return { success: false, message: '操作已取消' };

        const percent = 10 + Math.round((i / chunks.length) * 70);
        reporter.updateStatus(`翻译 ${i + 1}/${chunks.length}...`, percent);

        const userPrompt = buildUserPrompt(
            'translate',
            { content: chunks[i], targetLanguage },
            config.outputLanguage
        );

        try {
            const translated = await callLLM(config.claudeCliPath, systemPrompt, userPrompt, reporter);
            translatedChunks.push(translated);
            reporter.log(`块 ${i + 1} 翻译完成`);
        } catch (e) {
            if (reporter.cancelled) return { success: false, message: '操作已取消' };
            reporter.log(`块 ${i + 1} 翻译失败: ${e instanceof Error ? e.message : String(e)}`);
            // Keep original chunk on failure
            translatedChunks.push(chunks[i]);
        }
    }

    const translatedContent = translatedChunks.join('\n\n');
    const translatedTitle = docTitle ? `${docTitle}（${targetLanguage}）` : `翻译文档（${targetLanguage}）`;

    reporter.updateStatus('创建翻译文档...', 85);

    // Resolve notebook
    let notebookId: string | null = null;
    if (config.conceptNotebook) {
        notebookId = await findNotebookByName(config.conceptNotebook);
    }
    if (!notebookId) {
        const notebooks = await listNotebooks();
        if (notebooks.length === 0) {
            return { success: false, message: '没有可用的笔记本' };
        }
        notebookId = notebooks[0].id;
    }

    const path = `${config.conceptPath.replace(/\/$/, '')}/译文/${translatedTitle}`;

    // Check if already exists
    const existing = await getDocByPath(notebookId, path);
    if (existing) {
        reporter.log('译文文档已存在，将追加内容');
        // For simplicity, create with a timestamped path to avoid conflict
        const ts = Date.now();
        const tsPath = `${config.conceptPath.replace(/\/$/, '')}/译文/${translatedTitle}_${ts}`;
        const newId = await createDocWithMarkdown(notebookId, tsPath, translatedContent);
        if (!newId) return { success: false, message: '创建译文文档失败' };
    } else {
        const newId = await createDocWithMarkdown(notebookId, path, translatedContent);
        if (!newId) return { success: false, message: '创建译文文档失败' };
    }

    reporter.updateStatus('完成', 100);
    return {
        success: true,
        message: `翻译完成，已创建文档《${translatedTitle}》`,
    };
}
