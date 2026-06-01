import { fetchSyncPost } from "siyuan";

export interface ContextItem {
    kind: "selection" | "block" | "doc";
    id?: string;
    title?: string;
    hpath?: string;
    markdown: string;
}

async function request<T = any>(url: string, payload: any): Promise<T | null> {
    const response = await fetchSyncPost(url, payload);
    if (response?.code !== 0) {
        console.warn("Claude Note SiYuan API failed", url, response);
        return null;
    }
    return response.data as T;
}

export async function getBlockKramdown(id: string): Promise<string> {
    const data = await request<{ kramdown?: string }>("/api/block/getBlockKramdown", { id });
    return data?.kramdown || "";
}

export async function getHPathByID(id: string): Promise<string> {
    const data = await request<string>("/api/filetree/getHPathByID", { id });
    return data || "";
}

export async function getDocTitle(id: string): Promise<string> {
    // Validate id format to prevent SQL injection
    if (!/^\d{14}-[a-z0-9]{7}$/.test(id)) {
        return "未命名文档";
    }
    const stmt = `SELECT content FROM blocks WHERE id = '${id}' AND type = 'd'`;
    try {
        const rows = await request<any[]>("/api/query/sql", { stmt });
        if (rows && rows.length > 0) {
            const title = rows[0].content?.trim();
            if (title) return title;
            return "未命名文档";
        }
    } catch (e) {
        console.warn("SQL doc title query failed", e);
    }
    // Fallback to HPath
    const hpath = await getHPathByID(id);
    return getTitleFromHPath(hpath) || "未命名文档";
}

export async function getBlockBreadcrumb(id: string): Promise<string> {
    const hpath = await getHPathByID(id);
    return hpath || id;
}

export function summarizeBlockMarkdown(markdown: string, limit = 24): string {
    const text = markdown
        .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[`*_~#>\-[\]()+.!]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return "空块";
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function isElementHidden(el: HTMLElement): boolean {
    let curr: HTMLElement | null = el;
    while (curr && curr !== document.body) {
        if (curr.classList.contains("fn__none") || curr.style.display === "none") {
            return true;
        }
        curr = curr.parentElement;
    }
    return false;
}

function extractProtyleDocId(protyle: HTMLElement): string {
    const candidates = [
        protyle.querySelector(".protyle-title[data-node-id]"),
        protyle.querySelector(".protyle-background[data-node-id]"),
        protyle.querySelector(".protyle-wysiwyg[data-node-id]"),
        protyle.querySelector("[data-node-id]"),
    ];

    for (const candidate of candidates) {
        if (candidate instanceof HTMLElement) {
            const id = candidate.getAttribute("data-node-id") || candidate.dataset.nodeId || "";
            if (/^\d{14}-[a-z0-9]{7}$/.test(id)) return id;
        }
    }
    return "";
}

export function findCurrentDocumentId(): string {
    // 1. 检查当前获得焦点的元素是否在某个未隐藏的 protyle 编辑区内
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.closest(".protyle") : null;
    if (active instanceof HTMLElement && !isElementHidden(active)) {
        const id = extractProtyleDocId(active);
        if (id) return id;
    }

    // 2. 在思源笔记的主工作中心区 (.layout__center) 寻找可见的 protyle 编辑器
    const center = document.querySelector(".layout__center");
    if (center instanceof HTMLElement) {
        const protyles = center.querySelectorAll(".protyle");
        for (const protyle of Array.from(protyles)) {
            if (protyle instanceof HTMLElement && !isElementHidden(protyle)) {
                const id = extractProtyleDocId(protyle);
                if (id) return id;
            }
        }
    }

    // 3. 回退：在整个 DOM 中寻找第一个处于显示状态的 protyle 编辑器
    const protyles = document.querySelectorAll(".protyle");
    for (const protyle of Array.from(protyles)) {
        if (protyle instanceof HTMLElement && !isElementHidden(protyle)) {
            const id = extractProtyleDocId(protyle);
            if (id) return id;
        }
    }

    return "";
}

export function getTitleFromHPath(hpath: string): string {
    if (!hpath) return "";
    const segments = hpath.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
}

export interface SearchedDoc {
    id: string;
    title: string;
    hpath: string;
}

export async function searchDocuments(keyword: string): Promise<SearchedDoc[]> {
    if (!keyword.trim()) return [];
    const sanitized = keyword.replace(/'/g, "''");
    const stmt = `SELECT id, content, hpath FROM blocks WHERE type = 'd' AND (content LIKE '%${sanitized}%' OR hpath LIKE '%${sanitized}%') LIMIT 15`;
    const rows = await request<any[]>("/api/query/sql", { stmt });
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map((row) => ({
        id: row.id || "",
        title: row.content || "",
        hpath: row.hpath || "",
    }));
}

export function extractBlockIdFromElement(element: Element | null | undefined): string {
    if (!element) return "";
    const target = element.closest("[data-node-id]");
    if (!(target instanceof HTMLElement)) return "";
    const id = target.getAttribute("data-node-id") || target.dataset.nodeId || "";
    return /^\d{14}-[a-z0-9]{7}$/.test(id) ? id : "";
}

export function findSelectedBlockId(root?: Element | null): string {
    const scope = root || document;
    const selectors = [
        ".protyle-wysiwyg--select[data-node-id]",
        ".protyle-wysiwyg--select [data-node-id]",
        ".protyle-wysiwyg [data-node-id].protyle-wysiwyg--select",
        ".protyle-wysiwyg [data-node-id][contenteditable='true']:focus",
        ".protyle-wysiwyg [data-node-id]:focus-within",
    ];
    for (const selector of selectors) {
        const found = scope.querySelector(selector);
        const id = extractBlockIdFromElement(found);
        if (id) return id;
    }
    const selection = window.getSelection();
    const selectedNode = selection?.anchorNode;
    const selectedElement = selectedNode instanceof Element ? selectedNode : selectedNode?.parentElement;
    return extractBlockIdFromElement(selectedElement);
}

export function getSelectedTextContext(): ContextItem | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const text = selection.toString().trim();
    if (!text) return null;
    return {
        kind: "selection",
        title: "当前选中文本",
        markdown: text,
    };
}

export async function buildBlockContext(id: string, kind: "block" | "doc" = "block"): Promise<ContextItem | null> {
    const markdown = await getBlockKramdown(id);
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

function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function formatContext(items: ContextItem[], maxChars: number): string {
    if (items.length === 0) return "";
    let output = "";
    for (const item of items) {
        const source = [item.kind, item.id, item.hpath || item.title].filter(Boolean).join(" | ");
        const idAttr = item.id ? ` id="${escapeAttribute(item.id)}"` : "";
        const sourceAttr = escapeAttribute(source);
        output += `<siyuan-context type="${item.kind}"${idAttr} source="${sourceAttr}">\n${item.markdown.trim()}\n</siyuan-context>\n\n`;
        if (output.length >= maxChars) {
            output = output.slice(0, maxChars) + "\n</siyuan-context>\n";
            break;
        }
    }
    return output;
}
