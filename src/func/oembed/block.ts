/**
 * Copyright (c) anarion80
 * 改编自 siyuan-oembed (https://github.com/anarion80/siyuan-oembed)，
 * 原作品以 GNU Affero General Public License v3.0 授权。
 * 本文件作为合入部分继续适用 AGPL-3.0。
 */

import { isSingleHttpUrl } from "./url";

const BLOCK_ID = /^\d{14}-[0-9a-z]{7}$/;

function isSiyuanBlock(element: HTMLElement | null): element is HTMLElement {
    return !!(element && element.dataset?.type && element.dataset.nodeId && BLOCK_ID.test(element.dataset.nodeId));
}

export function getCurrentBlock(): HTMLElement | null {
    const selection = document.getSelection();
    let node: Node | null = selection?.focusNode ?? null;
    while (node) {
        if (node instanceof HTMLElement && isSiyuanBlock(node)) return node;
        node = node.parentNode;
    }
    return null;
}

export function getBlocks(): HTMLElement[] {
    const selected = Array.from(document.querySelectorAll(".protyle-wysiwyg--select")) as HTMLElement[];
    if (selected.length > 0) return selected;
    const current = getCurrentBlock();
    return current ? [current] : [];
}

export function blocksInEditor(
    protyle: { wysiwyg?: { element?: HTMLElement } } | null | undefined,
    nodeElement?: HTMLElement,
): HTMLElement[] {
    const root = protyle?.wysiwyg?.element;
    if (root) {
        const selected = Array.from(root.querySelectorAll(".protyle-wysiwyg--select")) as HTMLElement[];
        if (selected.length > 0) return selected;
    }
    if (nodeElement?.dataset?.nodeId) return [nodeElement];
    const current = getCurrentBlock();
    return current ? [current] : [];
}

export function isEmptyParagraph(element: HTMLElement): boolean {
    if (element.dataset.type !== "NodeParagraph") return false;
    return (element.querySelector('[contenteditable="true"]')?.textContent || "").trim() === "";
}

export function extractUrlFromBlock(block: HTMLElement): string | null {
    const edit = block.querySelector<HTMLElement>('[contenteditable="true"]');
    if (!edit) return null;
    const link = edit.querySelector("[data-type~='a'][data-href], a[data-href]");
    const href = link?.getAttribute("data-href") || "";
    if (isSingleHttpUrl(href)) return href.trim();
    const text = (edit.textContent || "").trim();
    return isSingleHttpUrl(text) ? text : null;
}
