/**
 * SiYuan API wrappers for paper-reader module.
 * All functions call the SiYuan kernel HTTP API via fetchPost/fetchSyncPost.
 */
import { fetchSyncPost } from 'siyuan';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function request<T = any>(url: string, data: any): Promise<T | null> {
    const response = await fetchSyncPost(url, data);
    return response.code === 0 ? (response.data as T) : null;
}

// ─── Document read ────────────────────────────────────────────────────────────

/**
 * Export a document as Markdown text (including all child blocks).
 * Returns the markdown string, or null on failure.
 */
export async function getDocMarkdown(docId: string): Promise<string | null> {
    const data = await request<{ content: string }>('/api/export/exportMdContent', { id: docId });
    return data?.content ?? null;
}

/**
 * Get the title of a document block.
 */
export async function getDocTitle(docId: string): Promise<string> {
    const data = await request<{ ial: Record<string, string> }>('/api/block/getBlockInfo', { id: docId });
    return data?.ial?.title ?? '';
}

// ─── Document write ───────────────────────────────────────────────────────────

/**
 * Append a Markdown string as a new block at the end of a document.
 * Returns the new block ID, or null on failure.
 */
export async function appendMarkdownToDoc(docId: string, markdown: string): Promise<string | null> {
    const data = await request<Array<{ doOperations: Array<{ id: string }> }>>(
        '/api/block/insertBlock',
        {
            dataType: 'markdown',
            data: markdown,
            parentID: docId,
        }
    );
    return data?.[0]?.doOperations?.[0]?.id ?? null;
}

/**
 * Update the full content of a document by replacing its root markdown.
 * Uses createDocWithMd on a temp path if a full rewrite is needed —
 * but for safety we just append. For full replace, delete+recreate approach is used.
 */
export async function updateDocContent(docId: string, markdown: string): Promise<boolean> {
    const result = await request('/api/block/updateBlock', {
        dataType: 'markdown',
        data: markdown,
        id: docId,
    });
    return result !== null;
}

// ─── Document/notebook navigation ────────────────────────────────────────────

/**
 * List all open notebooks.
 */
export async function listNotebooks(): Promise<Array<{ id: string; name: string }>> {
    const data = await request<{ notebooks: Array<{ id: string; name: string }> }>(
        '/api/notebook/lsNotebooks',
        ''
    );
    return data?.notebooks ?? [];
}

/**
 * Find a notebook by name. Returns its ID or null.
 */
export async function findNotebookByName(name: string): Promise<string | null> {
    const notebooks = await listNotebooks();
    return notebooks.find(n => n.name === name)?.id ?? null;
}

/**
 * Create a document with Markdown content under a notebook at given path.
 * Returns the new document ID, or null on failure.
 */
export async function createDocWithMarkdown(
    notebookId: string,
    path: string,
    markdown: string
): Promise<string | null> {
    const data = await request<string>('/api/filetree/createDocWithMd', {
        notebook: notebookId,
        path,
        markdown,
    });
    return data ?? null;
}

/**
 * Check if a document already exists at the given path in a notebook.
 * Returns the doc ID if it exists, null otherwise.
 */
export async function getDocByPath(notebookId: string, path: string): Promise<string | null> {
    const data = await request<{ id: string }>('/api/filetree/getIDsByHPath', {
        notebook: notebookId,
        path,
    });
    // Returns an array of IDs
    const ids = data as unknown as string[];
    return Array.isArray(ids) && ids.length > 0 ? ids[0] : null;
}

// ─── Current context ─────────────────────────────────────────────────────────

/**
 * Get the currently focused document's block ID from the protyle (editor).
 * Returns null if no document is active.
 */
export function getCurrentDocId(): string | null {
    try {
        // SiYuan exposes the current editor state on window.siyuan
        const layouts = (window as any).siyuan?.layout?.centerLayout;
        if (!layouts) return null;
        // Walk through tabs to find the active editor
        const wnd = layouts?.children?.[0];
        const tab = wnd?.children?.find?.((t: any) => t.headElement?.classList?.contains('item--focus'));
        return tab?.model?.editor?.protyle?.block?.rootID ?? null;
    } catch {
        return null;
    }
}

/**
 * Get selected text from the currently active protyle.
 */
export function getSelectedText(): string {
    const selection = window.getSelection();
    return selection?.toString().trim() ?? '';
}
