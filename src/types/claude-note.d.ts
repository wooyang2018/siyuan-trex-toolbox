/**
 * Claude Note 特定的类型定义
 */

/**
 * 上下文项接口
 */
export interface ContextItem {
    kind: "selection" | "block" | "doc";
    id?: string;
    title?: string;
    hpath?: string;
    markdown: string;
}

/**
 * 搜索到的文档接口
 */
export interface SearchedDoc {
    id: string;
    title: string;
    hpath: string;
}