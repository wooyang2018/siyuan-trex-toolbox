/**
 * Claude Note 特定的异步 SiYuan API 封装
 * 移植自 claude-note 项目，提供需要异步调用的功能
 */

import { sql, getBlockKramdown as getBlockKramdownAPI, getHPathByID as getHPathByIDAPI } from "./index";
import { getTitleFromHPath } from "./claude-note";

/**
 * 获取块的面包屑路径
 */
export async function getBlockBreadcrumb(id: string): Promise<string> {
    const hpath = await getHPathById(id);
    return hpath || id;
}

/**
 * 获取文档标题
 */
export async function getDocTitle(id: string): Promise<string> {
    // Validate id format to prevent SQL injection
    if (!/^\d{14}-[a-z0-9]{7}$/.test(id)) {
        return "未命名文档";
    }

    // 使用参数化查询替代字符串拼接
    const stmt = `SELECT content FROM blocks WHERE id = ? AND type = 'd'`;
    try {
        const rows = await sql(stmt, [id]);
        if (rows && rows.length > 0) {
            const title = rows[0].content?.trim();
            if (title) return title;
            return "未命名文档";
        }
    } catch (e) {
        console.warn("SQL doc title query failed", e);
    }
    // Fallback to HPath
    const hpath = await getHPathById(id);
    return getTitleFromHPath(hpath) || "未命名文档";
}

/**
 * 搜索文档
 */
export async function searchDocuments(keyword: string): Promise<any[]> {
    if (!keyword.trim()) return [];

    // 使用参数化查询，避免 SQL 注入
    const stmt = `SELECT id, content, hpath FROM blocks WHERE type = 'd' AND (content LIKE ? OR hpath LIKE ?) LIMIT 15`;
    const searchPattern = `%${keyword}%`;

    try {
        const rows = await sql(stmt, [searchPattern, searchPattern]);
        if (!rows || !Array.isArray(rows)) return [];
        return rows.map((row) => ({
            id: row.id || "",
            title: row.content || "",
            hpath: row.hpath || "",
        }));
    } catch (e) {
        console.error("Search documents failed:", e);
        return [];
    }
}

/**
 * 构建块上下文
 */
export async function buildBlockContext(id: string, kind: "block" | "doc" = "block"): Promise<any | null> {
    const markdownData = await getBlockKramdownAPI(id);
    const markdown = markdownData?.kramdown || "";
    if (!markdown.trim()) return null;
    const hpath = await getBlockBreadcrumb(id);
    return {
        kind,
        id,
        hpath,
        title: hpath || id,
        markdown,
    };
}

/**
 * 获取块 Kramdown 内容（适配现有API）
 */
export async function getBlockKramdownContent(id: string): Promise<string> {
    const data = await getBlockKramdownAPI(id);
    return data?.kramdown || "";
}

/**
 * 通过 ID 获取 HPath（适配现有API）
 */
export async function getHPathById(id: string): Promise<string> {
    const data = await getHPathByIDAPI(id);
    return data || "";
}