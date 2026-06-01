/**
 * Claude Note 特定的 SiYuan API 封装
 * 移植自 claude-note 项目，提供上下文管理和文档查找功能
 */

// 类型已在全局定义，无需导入

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

/**
 * 检查元素是否隐藏
 */
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

/**
 * 从 Protyle 元素中提取文档 ID
 */
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

/**
 * 查找当前文档 ID
 */
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

/**
 * 从 HPath 获取标题
 */
export function getTitleFromHPath(hpath: string): string {
    if (!hpath) return "";
    const segments = hpath.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
}

/**
 * 从元素中提取块 ID
 */
export function extractBlockIdFromElement(element: Element | null | undefined): string {
    if (!element) return "";
    const target = element.closest("[data-node-id]");
    if (!(target instanceof HTMLElement)) return "";
    const id = target.getAttribute("data-node-id") || target.dataset.nodeId || "";
    return /^\d{14}-[a-z0-9]{7}$/.test(id) ? id : "";
}

/**
 * 查找选中的块 ID
 */
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

/**
 * 获取选中文本的上下文
 */
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

/**
 * 摘要块 Markdown 内容
 */
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

/**
 * 转义属性值
 */
function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * 格式化上下文内容
 */
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