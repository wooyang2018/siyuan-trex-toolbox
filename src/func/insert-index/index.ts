import { showMessage, Protyle } from "siyuan";
import type FMiscPlugin from "@/index";
import {
    sql,
    getBlockByID,
    prependBlock,
    updateBlock,
    setBlockAttrs,
    deleteBlock,
} from "@/api";
import { getCurrentBlockId, IndexQueue } from "./utils";
import { generateIndex, queuePopAll } from "./generator";

// ==================== 模块配置 ====================

/** 获取当前文档 ID */
function getDocId(): string | null {
    return document.querySelector(
        '.layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background'
    )?.getAttribute("data-node-id") ?? null;
}

export interface InsertIndexConfig {
    /** 目录递归深度，0 表示无限递归所有层级 */
    depth: number;
    /** 列表类型："unordered"（无序列表）| "ordered"（有序列表） */
    listType: string;
    /** 链接类型："ref"（超链接 siyuan://blocks/）| "embed"（块引用 (( )) ） */
    linkType: string;
    /** 分栏列数，1 表示不分栏 */
    col: number;
    /** 折叠层级，0 表示不折叠，>0 时该层级及以下的列表项自动折叠 */
    fold: number;
    /** 是否在目录项前显示文档图标 */
    icon: boolean;
    /** 文档加载 / 切换 tab 时是否自动更新目录 */
    autoUpdate: boolean;
}

const config: InsertIndexConfig = {
    depth: 0,
    listType: "unordered",
    linkType: "ref",
    col: 1,
    fold: 0,
    icon: true,
    autoUpdate: true,
};

// ==================== 模块声明 ====================

export const name = "InsertIndex";
export let enabled = false;

export const declareToggleEnabled = {
    title: "🗂️ 一键插入目录",
    description: "点击顶栏菜单为当前文档一键生成目录列表",
    defaultEnabled: false,
};

// ==================== 核心逻辑 ====================

let plugin: FMiscPlugin = null;
const ATTR_NAME = "custom-trex-index-create";

/**
 * 插入或更新目录
 */
async function insertOrUpdateIndex(targetBlockId?: string) {
    const parentId = getDocId();
    if (!parentId) {
        showMessage("当前文档 ID 为空", 3000, "error");
        return;
    }

    // 获取文档信息（需要 notebook 和 path）
    const block = await getBlockByID(parentId);
    if (!block) {
        showMessage("无法获取文档信息", 3000, "error");
        return;
    }

    // 生成目录
    const indexQueue = new IndexQueue();
    await generateIndex(block.box, block.path, indexQueue, 0, config);
    const data = queuePopAll(indexQueue, "", config);

    if (data === "") {
        showMessage("当前文档无子文档", 3000);
        return;
    }

    // 检查是否有已存在的目录块
    const existingBlocks = await sql(
        `SELECT id, type, parent_id FROM blocks WHERE root_id = '${parentId}' AND ial like '%${ATTR_NAME}%' order by updated desc limit 1`
    );

    if (existingBlocks && existingBlocks[0]?.id) {
        // 更新已有目录
        const existingId = existingBlocks[0].id;
        console.log(`[InsertIndex] Updating existing index at: ${existingId}`);

        await updateBlock("markdown", data, existingId);

        // 等待一小段时间让思源处理完毕，然后查找新的列表块绑定属性
        await sleep(500);
        const newBlocks = await sql(
            `SELECT id FROM blocks WHERE root_id = '${parentId}' AND parent_id = '${parentId}' AND type = 'l' ORDER BY sort ASC LIMIT 1`
        );
        const attrTargetId = newBlocks?.[0]?.id || existingId;
        await setBlockAttrs(attrTargetId, { [ATTR_NAME]: JSON.stringify(config) });

        // 如果 slash 命令创建了占位块，删除它
        if (targetBlockId && targetBlockId !== existingId) {
            await deleteBlock(targetBlockId);
        }
    } else {
        // 插入新目录
        console.log("[InsertIndex] No existing index found, creating new.");

        // 检查是否为空文档（只有一个空段落）
        let emptyBlockId: string | undefined;
        if (!targetBlockId) {
            const checkRs = await sql(
                `SELECT id, type, content FROM blocks WHERE root_id = '${parentId}' AND parent_id = '${parentId}' ORDER BY sort ASC`
            );
            if (checkRs && checkRs.length === 1) {
                const b = checkRs[0];
                if (b.type === "p" && (!b.content || b.content.trim() === "")) {
                    emptyBlockId = b.id;
                }
            }
        }

        let result: any;
        if (targetBlockId) {
            result = await updateBlock("markdown", data, targetBlockId);
        } else {
            result = await prependBlock("markdown", data, parentId);
        }

        // 获取新插入块的 ID 并绑定属性
        if (result && result[0]?.doOperations?.[0]?.id) {
            const newId = result[0].doOperations[0].id;
            await setBlockAttrs(newId, { [ATTR_NAME]: JSON.stringify(config) });
        }

        // 删除空段落
        if (emptyBlockId) {
            await deleteBlock(emptyBlockId);
        }
    }
}

/**
 * 自动刷新目录的公共逻辑：查找已有目录块 → 重新生成 → 更新块内容 → 重新绑定属性
 */
async function refreshIndex(rootId: string, notebookId: string, docPath: string) {
    // 查找带有 custom attr 的目录块
    const rs = await sql(
        `SELECT id FROM blocks WHERE root_id = '${rootId}' AND ial like '%${ATTR_NAME}%' order by updated desc limit 1`
    );

    if (!rs || !rs[0]?.id) return;

    const existingId = rs[0].id;

    // 生成目录
    const indexQueue = new IndexQueue();
    await generateIndex(notebookId, docPath, indexQueue, 0, config);
    const data = queuePopAll(indexQueue, "", config);

    if (data !== "") {
        await updateBlock("markdown", data, existingId);

        // 重新绑定属性
        await sleep(500);
        const newBlocks = await sql(
            `SELECT id FROM blocks WHERE root_id = '${rootId}' AND parent_id = '${rootId}' AND type = 'l' ORDER BY sort ASC LIMIT 1`
        );
        const attrTargetId = newBlocks?.[0]?.id || existingId;
        await setBlockAttrs(attrTargetId, { [ATTR_NAME]: JSON.stringify(config) });
    }
}

/**
 * 自动更新目录（文档加载时触发）
 */
async function autoUpdateIndex(detail: any) {
    if (!config.autoUpdate) return;

    const protyle = detail?.protyle;
    if (!protyle?.block?.rootID) return;

    const rootId = protyle.block.rootID;
    const block = await getBlockByID(rootId);
    if (!block) return;

    await refreshIndex(rootId, block.box, block.path);
}

/**
 * 根据文档信息自动更新目录（tab 切换时对前一个文档触发）
 */
async function autoUpdateByDocInfo(rootId: string, notebookId: string, path: string) {
    await refreshIndex(rootId, notebookId, path);
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 模块加载/卸载 ====================

let protyleLoadedHandler: (e: any) => void = null;
let switchProtyleHandler: (e: any) => void = null;
let lastActiveDoc: { rootId: string; notebookId: string; path: string } | null = null;

export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    plugin = plugin_;
    enabled = true;

    // 注册斜杠命令
    plugin.addProtyleSlash({
        filter: ["insert index", "插入文档目录"],
        html: `<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconList"></use></svg><span class="b3-list-item__text">插入文档目录</span></div>`,
        id: "trex-insertIndex",
        callback(protyle: Protyle) {
            const blockId = getCurrentBlockId();
            protyle.insert("");
            insertOrUpdateIndex(blockId);
        },
    });

    // 注册到顶栏右键菜单
    plugin.registerMenuTopMenu("insert-index", [
        {
            label: "插入文档目录",
            icon: "iconList",
            click: () => {
                insertOrUpdateIndex();
            },
        },
    ]);

    // 监听文档加载事件进行自动更新
    protyleLoadedHandler = ({ detail }: any) => {
        autoUpdateIndex(detail);
    };
    plugin.eventBus.on("loaded-protyle-static", protyleLoadedHandler);

    // 监听 tab 切换事件，对前一个文档执行自动更新
    switchProtyleHandler = async ({ detail }: any) => {
        // 对前一个文档执行自动更新
        if (lastActiveDoc && config.autoUpdate) {
            await autoUpdateByDocInfo(lastActiveDoc.rootId, lastActiveDoc.notebookId, lastActiveDoc.path);
        }

        // 记录当前文档信息
        if (detail?.protyle?.block?.rootID) {
            lastActiveDoc = {
                rootId: detail.protyle.block.rootID,
                notebookId: detail.protyle.notebookId,
                path: detail.protyle.path,
            };
        }
    };
    plugin.eventBus.on("switch-protyle", switchProtyleHandler);

    console.log("[InsertIndex] Module loaded");
};

export const unload = (plugin_?: FMiscPlugin) => {
    if (!enabled) return;

    // 移除斜杠命令
    plugin?.delProtyleSlash("trex-insertIndex");

    // 移除顶栏菜单
    plugin?.unRegisterMenuTopMenu("insert-index");

    // 移除事件监听
    if (protyleLoadedHandler && plugin) {
        plugin.eventBus.off("loaded-protyle-static", protyleLoadedHandler);
        protyleLoadedHandler = null;
    }
    if (switchProtyleHandler && plugin) {
        plugin.eventBus.off("switch-protyle", switchProtyleHandler);
        switchProtyleHandler = null;
    }

    lastActiveDoc = null;
    plugin = null;
    enabled = false;

    console.log("[InsertIndex] Module unloaded");
};
