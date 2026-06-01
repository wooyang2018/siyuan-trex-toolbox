/**
 * 完整的 SiYuan API 封装
 * 整合了基础 API 和 Claude Note 特定功能
 */

// 导出基础 API
export * from './index';

// 导出 Claude Note 同步功能
export type {
    ContextItem,
    SearchedDoc
} from './claude-note';

export {
    findCurrentDocumentId,
    getTitleFromHPath,
    extractBlockIdFromElement,
    findSelectedBlockId,
    getSelectedTextContext,
    summarizeBlockMarkdown,
    formatContext
} from './claude-note';

// 导出 Claude Note 异步功能
export {
    getBlockBreadcrumb,
    getDocTitle,
    searchDocuments,
    buildBlockContext,
    getBlockKramdownContent,
    getHPathById
} from './claude-note-async';