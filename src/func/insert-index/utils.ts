// ==================== IndexQueue ====================

/** 目录队列节点 */
export class IndexQueueNode {
    depth: number;
    text: string;
    children: IndexQueue;
    constructor(depth: number, text: string) {
        this.depth = depth;
        this.text = text;
        this.children = new IndexQueue();
    }
}

/** 目录队列 */
export class IndexQueue {
    queue: IndexQueueNode[];

    constructor() {
        this.queue = [];
    }

    push(item: IndexQueueNode) {
        return this.queue.push(item);
    }

    pop() {
        return this.queue.shift();
    }

    getFront() {
        return this.queue[0];
    }

    getRear() {
        return this.queue[this.queue.length - 1];
    }

    clear() {
        this.queue = [];
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    getSize() {
        return this.queue.length;
    }
}

// ==================== 字符转义 ====================

/** 替换字符串中导致异常的字符 */
export function escapeHtml(unsafe: string) {
    return unsafe
        .replaceAll('[', '\\[')
        .replaceAll(']', '\\]')
        .replaceAll('&#39;', '&apos;')
        .replaceAll('\\', '&#92;')
        .replaceAll('"', '&quot;');
}

// ==================== 图标处理 ====================

/** 将 Hex 字符串转换为 Emoji 字符 */
function hexToEmoji(hex: string) {
    if (!hex) return "";
    try {
        return hex.split("-").map(item => String.fromCodePoint(parseInt(item, 16))).join("");
    } catch (e) {
        return hex;
    }
}

/**
 * 获取处理后的文档图标
 * @param icon 图标字符串
 * @param hasChild 是否有子文档
 */
export function getProcessedDocIcon(icon: string, hasChild: boolean) {
    if (!icon) {
        return hasChild ? "📑" : "📄";
    }

    // 动态图标 - 回退到默认
    if (icon.startsWith("api/icon/getDynamicIcon")) {
        return hasChild ? "📑" : "📄";
    }

    // 自定义图片表情 (e.g. kmind/kmind.svg)
    if (icon.includes(".")) {
        const alias = icon.split(".")[0];
        return `:${alias}:`;
    }

    // 短代码 (e.g. :kmind/kmind:)
    if (icon.startsWith(':') && icon.endsWith(':')) {
        return icon;
    }

    // Unicode 十六进制序列 (e.g. "1f600")
    const isLikelyHex = /^[0-9a-fA-F]{4,}$/.test(icon) || /^[0-9a-fA-F]+-[0-9a-fA-F-]+$/.test(icon);
    if (isLikelyHex) {
        const asEmoji = hexToEmoji(icon);
        const code = asEmoji?.codePointAt(0);
        if (code !== undefined && (code < 32 || (code >= 127 && code <= 159))) {
            // 跳过控制字符
        } else if (asEmoji && asEmoji !== icon) {
            return asEmoji;
        }
    }

    // 拦截不可见控制字符
    const firstCode = icon.codePointAt(0);
    if (firstCode !== undefined && (firstCode < 32 || (firstCode >= 127 && firstCode <= 159))) {
        return hasChild ? "📑" : "📄";
    }

    return icon;
}

// ==================== DOM 工具 ====================

/** 获取当前光标所在的块 ID */
export function getCurrentBlockId(): string | null {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) return null;
    let node = selection.anchorNode;
    if (node.nodeType !== Node.ELEMENT_NODE) {
        node = node.parentElement;
    }
    const element = node as HTMLElement;
    const block = element.closest('[data-node-id]');
    return block ? block.getAttribute('data-node-id') : null;
}
