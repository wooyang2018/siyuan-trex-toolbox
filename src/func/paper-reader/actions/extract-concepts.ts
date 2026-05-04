/**
 * Extract Concepts — extract core academic concepts from the current document
 * and create individual concept notes in the configured target notebook.
 */
import type { PaperReaderConfig, ActionResult, IProgressReporter } from '../types';
import { callLLM } from '../llm/client';
import { getSystemPrompt, buildUserPrompt } from '../llm/prompts';
import { splitIntoChunks } from '../utils/chunking';
import {
    getDocMarkdown,
    getDocTitle,
    getCurrentDocId,
    findNotebookByName,
    listNotebooks,
    createDocWithMarkdown,
    getDocByPath,
} from '../utils/siyuan-api';

/**
 * Parse `CONCEPT: name` lines from LLM response.
 */
function parseConcepts(llmOutput: string): string[] {
    const lines = llmOutput.split('\n');
    const concepts: string[] = [];
    for (const line of lines) {
        const match = line.match(/^CONCEPT:\s*(.+)/i);
        if (match) {
            const name = match[1].trim();
            if (name) concepts.push(name);
        }
    }
    return [...new Set(concepts)];
}

/**
 * Generate a stub markdown document for a concept.
 */
function makeConceptDoc(conceptName: string, sourceTitle: string): string {
    const date = new Date().toLocaleDateString('zh-CN');
    return `# ${conceptName}

> 从文档《${sourceTitle}》中提取 · ${date}

## 定义

（待完善）

## 核心要点

-

## 相关概念

-

## 参考来源

- 《${sourceTitle}》
`;
}

export async function runExtractConcepts(
    config: PaperReaderConfig,
    reporter: IProgressReporter,
    docId?: string
): Promise<ActionResult> {
    const targetDocId = docId ?? getCurrentDocId();
    if (!targetDocId) {
        return { success: false, message: '未检测到当前文档，请先打开一篇文档' };
    }

    // Resolve target notebook
    let notebookId: string | null = null;
    if (config.conceptNotebook) {
        notebookId = await findNotebookByName(config.conceptNotebook);
        if (!notebookId) {
            reporter.log(`未找到笔记本 "${config.conceptNotebook}"，将使用第一个可用笔记本`);
        }
    }
    if (!notebookId) {
        const notebooks = await listNotebooks();
        if (notebooks.length === 0) {
            return { success: false, message: '没有可用的笔记本，请先创建笔记本' };
        }
        notebookId = notebooks[0].id;
        reporter.log(`使用笔记本: ${notebooks[0].name}`);
    }

    reporter.updateStatus('读取文档内容...', 5);
    const markdown = await getDocMarkdown(targetDocId);
    if (!markdown) {
        return { success: false, message: '无法读取文档内容' };
    }

    // Use doc title for source reference
    const docTitle = (await getDocTitle(targetDocId)) || '未命名文档';

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
    const systemPrompt = getSystemPrompt('extractConcepts', config.outputLanguage);

    for (let i = 0; i < chunks.length; i++) {
        if (reporter.cancelled) return { success: false, message: '操作已取消' };

        const percent = 10 + Math.round((i / chunks.length) * 50);
        reporter.updateStatus(`提取概念 ${i + 1}/${chunks.length}...`, percent);

        const userPrompt = buildUserPrompt('extractConcepts', { content: chunks[i] }, config.outputLanguage);

        try {
            const response = await callLLM(llmConfig, systemPrompt, userPrompt, reporter);
            const concepts = parseConcepts(response);
            reporter.log(`块 ${i + 1}: 识别到 ${concepts.length} 个概念`);
            allConcepts.push(...concepts);
        } catch (e) {
            if (reporter.cancelled) return { success: false, message: '操作已取消' };
            reporter.log(`块 ${i + 1} 处理失败: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    const uniqueConcepts = [...new Set(allConcepts)];
    reporter.log(`共 ${uniqueConcepts.length} 个唯一概念，开始创建文档...`);

    if (uniqueConcepts.length === 0) {
        return { success: true, message: '未提取到学术概念' };
    }

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < uniqueConcepts.length; i++) {
        if (reporter.cancelled) return { success: false, message: '操作已取消' };

        const concept = uniqueConcepts[i];
        const percent = 65 + Math.round((i / uniqueConcepts.length) * 30);
        reporter.updateStatus(`创建概念文档 ${i + 1}/${uniqueConcepts.length}...`, percent);

        // Build the path: /prefix/ConceptName
        const path = `${config.conceptPath.replace(/\/$/, '')}/${concept}`;

        // Skip if already exists
        const existingId = await getDocByPath(notebookId, path);
        if (existingId) {
            reporter.log(`已存在: ${concept}，跳过`);
            skipped++;
            continue;
        }

        const docContent = makeConceptDoc(concept, docTitle);
        const newId = await createDocWithMarkdown(notebookId, path, docContent);
        if (newId) {
            reporter.log(`已创建: ${concept}`);
            created++;
        } else {
            reporter.log(`创建失败: ${concept}`);
        }
    }

    reporter.updateStatus('完成', 100);
    return {
        success: true,
        message: `概念提取完成：新建 ${created} 个，跳过 ${skipped} 个`,
        details: uniqueConcepts.join('、'),
    };
}
