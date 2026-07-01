/**
 * Copyright (c) 2023 frostime. All rights reserved.
 * https://github.com/frostime/sy-plugin-template-vite
 * 
 * See API Document in [API.md](https://github.com/siyuan-note/siyuan/blob/master/API.md)
 * API 文档见 [API_zh_CN.md](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)
 */

import { fetchPost, fetchSyncPost, type IWebSocketData } from "siyuan";
import type { NotebookId, Notebook, NotebookConf, ITheme, BlockId, DocumentId, Block, PreviousID, ParentID } from "./../types/index";
import type { IReslsNotebooks, IResGetNotebookConf, IDocTreeNode, IResUpload, IResdoOperations, IResGetBlockKramdown, IResGetChildBlock, IResGetTemplates, IResReadDir, IResExportResources, IResForwardProxy, IResBootProgress } from "./../types/api";
import { validateBlockId, withErrorHandling } from "./error-handler";

// 简单的内存缓存
const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

function getCache(key: string): any {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    cache.delete(key);
    return null;
}

function setCache(key: string, data: any): void {
    cache.set(key, { data, timestamp: Date.now() });
}

// 缓存管理函数
export function clearCache(pattern?: string): void {
    if (!pattern) {
        cache.clear();
        return;
    }

    for (const key of cache.keys()) {
        if (key.includes(pattern)) {
            cache.delete(key);
        }
    }
}

export function getCacheStats(): { size: number, keys: string[] } {
    return {
        size: cache.size,
        keys: Array.from(cache.keys())
    };
}


export async function request(url: string, data: any, returnType: 'data' | 'response' = 'data') {
    try {
        let response: IWebSocketData = await fetchSyncPost(url, data);
        if (response.code !== 0) {
            console.error(`API request failed: ${url}`, response);
            throw new Error(`API Error: ${response.msg || 'Unknown error'}`);
        }
        let res = response.data;
        return returnType === 'data' ? res : response;
    } catch (error) {
        console.error(`API request error: ${url}`, error);
        throw new Error(`Network error: ${error.message}`);
    }
}

export const postMessage = async(channel: string, message: any) => {
    return request('/api/broadcast/postMessage', {
        channel, message
    });
}


// **************************************** Noteboook ****************************************


export async function lsNotebooks(): Promise<IReslsNotebooks> {
    let url = '/api/notebook/lsNotebooks';
    return request(url, '');
}


export async function openNotebook(notebook: NotebookId) {
    let url = '/api/notebook/openNotebook';
    return request(url, { notebook: notebook });
}


export async function closeNotebook(notebook: NotebookId) {
    let url = '/api/notebook/closeNotebook';
    return request(url, { notebook: notebook });
}


export async function renameNotebook(notebook: NotebookId, name: string) {
    let url = '/api/notebook/renameNotebook';
    return request(url, { notebook: notebook, name: name });
}


export async function createNotebook(name: string): Promise<Notebook> {
    let url = '/api/notebook/createNotebook';
    return request(url, { name: name });
}


export async function removeNotebook(notebook: NotebookId) {
    let url = '/api/notebook/removeNotebook';
    return request(url, { notebook: notebook });
}


export async function getNotebookConf(notebook: NotebookId): Promise<IResGetNotebookConf> {
    let data = { notebook: notebook };
    let url = '/api/notebook/getNotebookConf';
    return request(url, data);
}


export async function setNotebookConf(notebook: NotebookId, conf: NotebookConf): Promise<NotebookConf> {
    let data = { notebook: notebook, conf: conf };
    let url = '/api/notebook/setNotebookConf';
    return request(url, data);
}


// **************************************** Bazaar ****************************************

export async function getBazaarTheme(): Promise<ITheme[] | null> {
    let data = await request('api/bazaar/getBazaarTheme', {});
    return data?.packages ?? null;
}

// api/bazaar/installBazaarTheme
export async function installBazaarTheme(theme: ITheme): Promise<boolean> {
    let payload = {
        frontend: "desktop",
        mode: "light" in theme.modes ? 0 : 1,
        packageName: theme.name,
        repoHash: theme.repoHash,
        repoURL: theme.repoURL
    }
    let data = await request('api/bazaar/installBazaarTheme', payload);
    return data?.success ?? false;
}

export async function getInstalledTheme(frontend: string) {
    let data = {
        frontend: frontend,
    }
    return request('api/bazaar/getInstalledTheme', data);
}


// **************************************** File Tree ****************************************
export async function listDocTree(notebook: NotebookId, path: string): Promise<IDocTreeNode[]> {
    let data = {
        notebook: notebook,
        path: path
    }
    let url = '/api/filetree/listDocTree';
    let resData = await request(url, data);
    return resData?.tree;
}

export async function listDocsByPath(notebook: NotebookId, path: string) {
    let url = '/api/filetree/listDocsByPath'
    let payload = { notebook: notebook, path: path };
    return request(url, payload);
}

export async function createDocWithMd(notebook: NotebookId, path: string, markdown: string): Promise<DocumentId> {
    let data = {
        notebook: notebook,
        path: path,
        markdown: markdown,
    };
    let url = '/api/filetree/createDocWithMd';
    return request(url, data);
}


export async function renameDoc(notebook: NotebookId, path: string, title: string): Promise<DocumentId> {
    let data = {
        notebook: notebook,
        path: path,
        title: title
    };
    let url = '/api/filetree/renameDoc';
    return request(url, data);
}


export async function removeDoc(notebook: NotebookId, path: string) {
    let data = {
        notebook: notebook,
        path: path,
    };
    let url = '/api/filetree/removeDoc';
    return request(url, data);
}


export async function moveDocs(fromPaths: string[], toNotebook: NotebookId, toPath: string) {
    let data = {
        fromPaths: fromPaths,
        toNotebook: toNotebook,
        toPath: toPath
    };
    let url = '/api/filetree/moveDocs';
    return request(url, data);
}


export async function getHPathByPath(notebook: NotebookId, path: string): Promise<string> {
    let data = {
        notebook: notebook,
        path: path
    };
    let url = '/api/filetree/getHPathByPath';
    return request(url, data);
}


export const getHPathByID = withErrorHandling(
    async (id: BlockId): Promise<string> => {
        // 验证 ID 格式
        validateBlockId(id);

        // 检查缓存
        const cacheKey = `hpath:${id}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return cached;
        }

        let data = {
            id: id
        };
        let url = '/api/filetree/getHPathByID';
        const result = await request(url, data);

        // 设置缓存
        if (result) {
            setCache(cacheKey, result);
        }

        return result;
    },
    "Failed to get HPath by ID"
);


export async function getIDsByHPath(notebook: NotebookId, path: string): Promise<BlockId[]> {
    let data = {
        notebook: notebook,
        path: path
    };
    let url = '/api/filetree/getIDsByHPath';
    return request(url, data);
}

// **************************************** Asset Files ****************************************

export async function upload(assetsDirPath: string, files: any[]): Promise<IResUpload> {
    let form = new FormData();
    form.append('assetsDirPath', assetsDirPath);
    for (let file of files) {
        form.append('file[]', file);
    }
    let url = '/api/asset/upload';
    return request(url, form);
}

// **************************************** Block ****************************************
type DataType = "markdown" | "dom";
export async function insertBlock(
    dataType: DataType, data: string,
    nextID?: BlockId, previousID?: BlockId, parentID?: BlockId
): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        nextID: nextID,
        previousID: previousID,
        parentID: parentID
    }
    let url = '/api/block/insertBlock';
    return request(url, payload);
}


export async function prependBlock(dataType: DataType, data: string, parentID: BlockId | DocumentId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        parentID: parentID
    }
    let url = '/api/block/prependBlock';
    return request(url, payload);
}


export async function appendBlock(dataType: DataType, data: string, parentID: BlockId | DocumentId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        parentID: parentID
    }
    let url = '/api/block/appendBlock';
    return request(url, payload);
}


export async function updateBlock(dataType: DataType, data: string, id: BlockId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        id: id
    }
    let url = '/api/block/updateBlock';
    return request(url, payload);
}


export async function deleteBlock(id: BlockId): Promise<IResdoOperations[]> {
    let data = {
        id: id
    }
    let url = '/api/block/deleteBlock';
    return request(url, data);
}


export async function moveBlock(id: BlockId, previousID?: PreviousID, parentID?: ParentID): Promise<IResdoOperations[]> {
    let data = {
        id: id,
        previousID: previousID,
        parentID: parentID
    }
    let url = '/api/block/moveBlock';
    return request(url, data);
}


export async function foldBlock(id: BlockId) {
    let data = {
        id: id
    }
    let url = '/api/block/foldBlock';
    return request(url, data);
}


export async function unfoldBlock(id: BlockId) {
    let data = {
        id: id
    }
    let url = '/api/block/unfoldBlock';
    return request(url, data);
}


export const getBlockKramdown = withErrorHandling(
    async (id: BlockId): Promise<IResGetBlockKramdown> => {
        // 验证 ID 格式
        validateBlockId(id);

        // 检查缓存
        const cacheKey = `kramdown:${id}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return cached;
        }

        let data = {
            id: id
        }
        let url = '/api/block/getBlockKramdown';
        const result = await request(url, data);

        // 设置缓存
        if (result) {
            setCache(cacheKey, result);
        }

        return result;
    },
    "Failed to get block kramdown"
);


export async function getChildBlocks(id: BlockId): Promise<IResGetChildBlock[]> {
    let data = {
        id: id
    }
    let url = '/api/block/getChildBlocks';
    return request(url, data);
}

export async function transferBlockRef(fromID: BlockId, toID: BlockId, refIDs: BlockId[]) {
    let data = {
        fromID: fromID,
        toID: toID,
        refIDs: refIDs
    }
    let url = '/api/block/transferBlockRef';
    return request(url, data);
}


// /api/block/getBlockBreadcrumb
export async function getBlockBreadcrumb(id: BlockId) {
    let payload = { id: id, excludeTypes: [] };
    let url = '/api/block/getBlockBreadcrumb';
    return request(url, payload);
}


// **************************************** Attributes ****************************************
export async function setBlockAttrs(id: BlockId, attrs: { [key: string]: string }) {
    let data = {
        id: id,
        attrs: attrs
    }
    let url = '/api/attr/setBlockAttrs';
    return request(url, data);
}


export async function getBlockAttrs(id: BlockId): Promise<{ [key: string]: string }> {
    let data = {
        id: id
    }
    let url = '/api/attr/getBlockAttrs';
    return request(url, data);
}

// **************************************** SQL ****************************************

export async function sql(sql: string, params?: any[]): Promise<any[]> {
    // 参数化查询支持
    let processedSql = sql;
    if (params && params.length > 0) {
        // 简单的参数替换，实际应该由后端处理参数化查询
        // 这里主要是为了保持接口一致性
        processedSql = sql.replace(/\?/g, (match, index) => {
            if (index < params.length) {
                const param = params[index];
                if (typeof param === 'string') {
                    return `'${param.replace(/'/g, "''")}'`;
                } else if (typeof param === 'number') {
                    return param.toString();
                } else {
                    return `'${JSON.stringify(param).replace(/'/g, "''")}'`;
                }
            }
            return match;
        });
    }

    let sqldata = {
        stmt: processedSql,
    };
    let url = '/api/query/sql';
    return request(url, sqldata);
}

export const getBlockByID = withErrorHandling(
    async (blockId: string): Promise<Block> => {
        // 验证 blockId 格式，防止 SQL 注入
        validateBlockId(blockId);

        // 检查缓存
        const cacheKey = `block:${blockId}`;
        const cached = getCache(cacheKey);
        if (cached) {
            return cached;
        }

        let sqlScript = `select * from blocks where id ='${blockId}'`;
        let data = await sql(sqlScript);
        const result = data?.[0] || null;

        // 设置缓存
        if (result) {
            setCache(cacheKey, result);
        }

        return result;
    },
    "Failed to get block by ID"
);

// **************************************** Template ****************************************

export async function render(id: DocumentId, path: string): Promise<IResGetTemplates> {
    let data = {
        id: id,
        path: path
    }
    let url = '/api/template/render';
    return request(url, data);
}


export async function renderSprig(template: string): Promise<string> {
    let url = '/api/template/renderSprig';
    return request(url, { template: template });
}

// **************************************** File ****************************************

export async function getFile(path: string, type?: "text" | "json"): Promise<any> {
    let data = {
        path: path
    }
    let url = '/api/file/getFile';
    let promise = new Promise<IWebSocketData>((resolve, reject) => {
        try {
            fetchPost(url, data, (response: any) => {
                let data = type === 'json' ? JSON.parse(response) : response;
                resolve(data);
            });
        } catch (error) {
            reject(error);
        }
    });
    let response: IWebSocketData = await promise;
    return response;
}

export async function putFile(path: string, isDir: boolean, file: any) {
    let form = new FormData();
    form.append('path', path);
    form.append('isDir', isDir.toString());
    // Copyright (c) 2023, terwer.
    // https://github.com/terwer/siyuan-plugin-importer/blob/v1.4.1/src/api/kernel-api.ts
    form.append('modTime', Math.floor(Date.now() / 1000).toString());
    form.append('file', file);
    let url = '/api/file/putFile';
    return request(url, form);
}

export async function removeFile(path: string) {
    let data = {
        path: path
    }
    let url = '/api/file/removeFile';
    return request(url, data);
}



export async function readDir(path: string): Promise<IResReadDir[]> {
    let data = {
        path: path
    }
    let url = '/api/file/readDir';
    return request(url, data);
}


// **************************************** Export ****************************************

export async function exportResources(paths: string[], name: string): Promise<IResExportResources> {
    let data = {
        paths: paths,
        name: name
    }
    let url = '/api/export/exportResources';
    return request(url, data);
}

// **************************************** Convert ****************************************

export type PandocArgs = string;
export async function pandoc(args: PandocArgs[]) {
    let data = {
        args: args
    }
    let url = '/api/convert/pandoc';
    return request(url, data);
}

// **************************************** Notification ****************************************

// /api/notification/pushMsg
// {
//     "msg": "test",
//     "timeout": 7000
//   }
export async function pushMsg(msg: string, timeout: number = 7000) {
    let payload = {
        msg: msg,
        timeout: timeout
    };
    let url = "/api/notification/pushMsg";
    return request(url, payload);
}

export async function pushErrMsg(msg: string, timeout: number = 7000) {
    let payload = {
        msg: msg,
        timeout: timeout
    };
    let url = "/api/notification/pushErrMsg";
    return request(url, payload);
}

// **************************************** Network ****************************************
export async function forwardProxy(
    url: string, method: string = 'GET', payload: any = {},
    headers: any[] = [], timeout: number = 7000, contentType: string = "text/html"
): Promise<IResForwardProxy> {
    let data = {
        url: url,
        method: method,
        timeout: timeout,
        contentType: contentType,
        headers: headers,
        payload: payload
    }
    let url1 = '/api/network/forwardProxy';
    return request(url1, data);
}


// **************************************** System ****************************************

export async function bootProgress(): Promise<IResBootProgress> {
    return request('/api/system/bootProgress', {});
}


export async function version(): Promise<string> {
    return request('/api/system/version', {});
}


export async function currentTime(): Promise<number> {
    return request('/api/system/currentTime', {});
}

export async function createDailyNote(notebook: NotebookId): Promise<{ id: BlockId }> {
    let url = '/api/filetree/createDailyNote';
    return request(url, { notebook: notebook });
}

// **************************************** Transactions ****************************************

export async function fold(blockID: BlockId, sessionId: string = "", appId: string = "") {
    let payload = {
        session: sessionId,
        app: appId,
        reqId: new Date().getTime(),
        transactions: [
            {
                doOperations: [{ action: "foldHeading", id: blockID }],
                undoOperations: [{ action: "unfoldHeading", id: blockID }]
            }
        ]
    }
    let url = '/api/transactions'
    return request(url, payload);
}

export async function unfold(blockID: BlockId, sessionId: string = "", appId: string = "") {
    let payload = {
        session: sessionId,
        app: appId,
        reqId: new Date().getTime(),
        transactions: [
            {
                doOperations: [{ action: "unfoldHeading", id: blockID }],
                undoOperations: [{ action: "foldHeading", id: blockID }]
            }
        ]
    }
    let url = '/api/transactions'
    return request(url, payload);
}


// **************************************** Riffcard (Flashcard) ****************************************

function normalizeDeckId(result: any): string {
    if (typeof result === 'string') return result;
    return result?.id ?? result?.deckID ?? result?.deckId ?? '';
}

function normalizeRiffBlocks(result: any): any[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.cards)) return result.cards;
    if (Array.isArray(result?.blocks)) return result.blocks;
    return [];
}

function getRiffPageCount(result: any): number {
    const pageCount = Number(result?.pageCount ?? result?.pages ?? 1);
    return Number.isFinite(pageCount) && pageCount > 0 ? pageCount : 1;
}

/**
 * Create a riffcard deck (flashcard deck).
 */
export async function createRiffDeck(name: string): Promise<string> {
    const url = '/api/riff/createRiffDeck';
    const result = await request(url, { name });
    return normalizeDeckId(result);
}

/**
 * Add blocks as riffcards to a native deck.
 */
export async function addRiffCards(deckID: string, blockIDs: string[]): Promise<any> {
    const url = '/api/riff/addRiffCards';
    return request(url, { deckID, blockIDs });
}

/**
 * Get riffcards from a deck. Returns block IDs or native card objects depending on SiYuan version.
 */
export async function getRiffCards(deckID: string, reviewType: string = 'all'): Promise<any[]> {
    const url = '/api/riff/getRiffCards';
    try {
        const pageSize = 999;
        const first = await request(url, { id: deckID, page: 1, pageSize });
        const blocks = normalizeRiffBlocks(first);
        const pageCount = getRiffPageCount(first);
        for (let page = 2; page <= pageCount; page++) {
            const result = await request(url, { id: deckID, page, pageSize });
            blocks.push(...normalizeRiffBlocks(result));
        }
        return blocks;
    } catch (e) {
        console.error('[API] getRiffCards paged form failed, fallback to legacy form:', e);
        const result = await request(url, { deckID, reviewType });
        return normalizeRiffBlocks(result);
    }
}

/**
 * Get native riffcard details by block IDs.
 */
export async function getRiffCardsByBlockIDs(blockIDs: string[]): Promise<any[]> {
    if (blockIDs.length === 0) return [];
    const url = '/api/riff/getRiffCardsByBlockIDs';
    const result = await request(url, { blockIDs });
    return normalizeRiffBlocks(result);
}

/**
 * Review a riffcard.
 * @param deckID - Deck ID
 * @param cardID - Block ID of the card
 * @param rating - Rating (1=again, 2=hard, 3=good, 4=easy/mastered)
 */
export async function reviewRiffCard(deckID: string, cardID: string, rating: number): Promise<any> {
    const url = '/api/riff/reviewRiffCard';
    return request(url, { deckID, cardID, rating });
}

/**
 * Skip a riffcard during native review.
 */
export async function skipReviewRiffCard(deckID: string, cardID: string): Promise<any> {
    const url = '/api/riff/skipReviewRiffCard';
    return request(url, { deckID, cardID });
}

/**
 * Remove riffcards from a deck.
 * @param deckID - Deck ID
 * @param blockIDs - Array of block IDs to remove
 */
export async function removeRiffCards(deckID: string, blockIDs: string[]): Promise<any> {
    const url = '/api/riff/removeRiffCards';
    return request(url, { deckID, blockIDs });
}

/**
 * Reset riffcards' native schedule state.
 */
export async function resetRiffCards(deckID: string, blockIDs: string[] = []): Promise<any> {
    const url = '/api/riff/resetRiffCards';
    return request(url, { type: 'deck', id: deckID, deckID, blockIDs });
}

/**
 * Batch set native riffcards due time. due must be YYYYMMDDHHmmss.
 */
export async function batchSetRiffCardsDueTime(cardDues: Array<{ id: string; due: string }>): Promise<any> {
    const url = '/api/riff/batchSetRiffCardsDueTime';
    return request(url, { cardDues });
}

/**
 * Get all riffcard decks.
 */
export async function getRiffDecks(): Promise<any[]> {
    const url = '/api/riff/getRiffDecks';
    const result = await request(url, {});
    return Array.isArray(result) ? result : (result?.decks ?? []);
}

/**
 * Rename a riffcard deck.
 */
export async function renameRiffDeck(deckID: string, name: string): Promise<any> {
    const url = '/api/riff/renameRiffDeck';
    return request(url, { deckID, name });
}

/**
 * Remove a riffcard deck.
 */
export async function removeRiffDeck(deckID: string): Promise<any> {
    const url = '/api/riff/removeRiffDeck';
    return request(url, { deckID });
}
