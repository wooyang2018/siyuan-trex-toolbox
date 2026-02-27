import { showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { request, sql } from "@/api";

export let name = "AdjustTitleLevel";
export let enabled = false;

export const declareToggleEnabled = {
    title: '🔤 调整标题层级',
    description: '块菜单/文档菜单打开事件增加标题层级转换',
    defaultEnabled: false
};

let plugin: FMiscPlugin = null;

const MAX_TITLE_LEVEL = 6;

/**
 * 文档菜单点击事件处理 — 调整文档内所有标题
 */
function onDocGutterClicked({ detail }: any) {
    const menu = detail.menu;
    menu.addItem({
        iconHTML: "",
        label: "调整所有标题",
        submenu: [
            {
                iconHTML: "",
                label: "调整所有为",
                submenu: Array.from({ length: MAX_TITLE_LEVEL }, (_, i) => i + 1).map((num) => ({
                    iconHTML: "",
                    label: `H${num}`,
                    click: () => {
                        Array.from({ length: MAX_TITLE_LEVEL }, (_, i) => i + 1).forEach(async (index) => {
                            await adjustOriginTitleTo(detail, `${index}`, `${num}`, false);
                        });
                    },
                })),
            },
            ...Array.from({ length: MAX_TITLE_LEVEL }, (_, i) => i + 1).map((originNum) => ({
                iconHTML: "",
                label: `调整 H${originNum} 为`,
                submenu: Array.from({ length: MAX_TITLE_LEVEL }, (_, i) => i + 1)
                    .filter((toNum) => toNum !== originNum)
                    .map((toNum) => ({
                        iconHTML: "",
                        label: `H${toNum}`,
                        click: () => {
                            adjustOriginTitleTo(detail, `${originNum}`, `${toNum}`, false);
                        },
                    })),
            })),
        ],
    });
}

/**
 * 块菜单点击事件处理 — 调整选中块的标题层级
 */
function onBlockGutterClicked({ detail }: any) {
    detail.menu.addItem({
        icon: "iconHeadings",
        label: "调整标题",
        submenu: Array.from({ length: MAX_TITLE_LEVEL }, (_, i) => i + 1).map((num) => ({
            iconHTML: "",
            label: `调整为 H${num}`,
            click: () => {
                adjustTitle(detail, `h${num}`);
            },
        })),
    });
}

/**
 * 直接通过 DOM 调整选中块的标题层级
 */
function adjustTitle(detail: any, toTitleLevel: string) {
    const doOperations: doOperation[] = [];

    detail.blockElements
        .filter((item: HTMLElement) => item.getAttribute("data-type") === "NodeHeading")
        .forEach((editElement: HTMLElement) => {
            editElement.setAttribute("data-subtype", toTitleLevel);
            editElement.setAttribute("class", toTitleLevel);

            doOperations.push({
                id: editElement.dataset.nodeId,
                data: editElement.outerHTML,
                action: "update",
            } as doOperation);
        });

    if (doOperations.length > 0) {
        detail.protyle.getInstance().transaction(doOperations);
    }
}

/**
 * 通过 SQL + API 调整文档内指定层级的标题
 */
async function adjustOriginTitleTo(
    detail: any,
    originTitleLevel: string,
    toTitleLevel: string,
    includeSub = true
) {
    showMessage("调整标题中……");

    const res = await sql(
        `select id from blocks where root_id = '${detail.data.rootID}' and subtype = 'h${originTitleLevel}'`
    );

    const doOperations: doOperation[] = [];
    const undoOperations: doOperation[] = [];

    for (const item of res) {
        const response = await request("/api/block/getHeadingLevelTransaction", {
            id: item.id,
            level: Number(toTitleLevel),
        });

        if (includeSub) {
            response.doOperations.forEach((operation: doOperation) => {
                detail.protyle.wysiwyg.element
                    .querySelectorAll(`[data-node-id="${operation.id}"]`)
                    .forEach((itemElement: HTMLElement) => {
                        itemElement.outerHTML = operation.data;
                    });
            });
            doOperations.push(...response.doOperations);
            undoOperations.push(...response.undoOperations);
        } else {
            detail.protyle.wysiwyg.element
                .querySelectorAll(`[data-node-id="${response.doOperations[0].id}"]`)
                .forEach((itemElement: HTMLElement) => {
                    itemElement.outerHTML = response.doOperations[0].data;
                });

            doOperations.push(response.doOperations[0]);
            undoOperations.push(response.undoOperations[0]);
        }
    }

    if (doOperations.length > 0) {
        detail.protyle.getInstance().transaction(doOperations, undoOperations);
    }

    if (doOperations.length > 0) {
        await request("/api/outline/getDocOutline", {
            id: detail.data.rootID,
            preview: false,
        });
    }

    showMessage("调整标题完成！");
}

/**
 * 加载模块
 */
export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    plugin_.eventBus.on("click-blockicon", onBlockGutterClicked);
    plugin_.eventBus.on("click-editortitleicon", onDocGutterClicked);
    plugin = plugin_;
    enabled = true;
};

/**
 * 卸载模块
 */
export const unload = (plugin_?: FMiscPlugin) => {
    if (!enabled) return;
    const p = plugin_ || plugin;
    if (p) {
        p.eventBus.off("click-blockicon", onBlockGutterClicked);
        p.eventBus.off("click-editortitleicon", onDocGutterClicked);
    }
    plugin = null;
    enabled = false;
};
