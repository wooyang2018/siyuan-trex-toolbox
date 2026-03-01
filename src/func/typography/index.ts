import { confirm, fetchSyncPost, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { getBlockKramdown, getChildBlocks, updateBlock } from "@/api";
import { formatUtil } from "./utils";

export let name = "Typography";
export let enabled = false;

export const declareToggleEnabled = {
    title: '📝 中文排版',
    description: '格式化文档中的中英文间距、标点符号等排版问题',
    defaultEnabled: false
};

let plugin: FMiscPlugin = null;
let topbarElement: HTMLElement = null;

const availableBlocks = ["NodeParagraph", "NodeHeading"];

/**
 * 格式化选中的块元素（块菜单入口）
 */
function formatBlockElements(blockElements: HTMLElement[], protyle: any) {
    const doOperations: doOperation[] = [];
    blockElements = [].concat(blockElements || []);

    blockElements.forEach((item: HTMLElement) => {
        const editElements = item.querySelectorAll(
            availableBlocks
                .map((t) => `[data-type=${t}] [contenteditable="true"]`)
                .join(",")
        );

        editElements.forEach((editElement: HTMLElement) => {
            if (!editElement) return;

            const hasElementChildren = Array.from(editElement.childNodes).some(
                (node) =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node as HTMLElement).getAttribute("data-type") !== "virtual-block-ref"
            );

            if (hasElementChildren) {
                editElement.childNodes.forEach((node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const formatted = formatUtil.formatContent(node.textContent);
                        if (formatted !== node.textContent) {
                            node.textContent = formatted;
                        }
                    }
                });
            } else {
                const formatted = formatUtil.formatContent(editElement.textContent);
                if (formatted !== editElement.textContent) {
                    editElement.textContent = formatted;
                }
            }
        });

        doOperations.push({
            id: item.dataset.nodeId,
            data: item.outerHTML,
            action: "update",
        } as doOperation);
    });

    protyle.getInstance().transaction(doOperations);
}

/**
 * 格式化文档标题
 */
async function formatTitle(docId: string) {
    const res = await fetchSyncPost("/api/block/getDocInfo", { id: docId });
    if (!res?.data) return;

    const { ial, rootID, name: docName } = res.data;
    const originTitle = ial?.title || docName || "";
    if (!originTitle) return;

    let title = formatUtil.replaceFullNumbersAndChars(originTitle);
    title = title.replace(/"(.*?)"/g, "\u201c$1\u201d");
    title = formatUtil.insertSpace(title);
    title = formatUtil.replacePunctuations(title).trim();

    if (title === originTitle) return;

    // 通过 getDocInfo 获取到 notebook 和 path 后重命名
    const infoRes = await fetchSyncPost("/api/block/getBlockInfo", { id: rootID || docId });
    if (!infoRes?.data) return;

    await fetchSyncPost("/api/filetree/renameDoc", {
        notebook: infoRes.data.box,
        path: infoRes.data.path,
        title: title,
    });
}

/**
 * 全文格式化
 */
async function formatDoc(parentId: string) {
    const childrenBlocks = await getChildBlocks(parentId);
    if (!childrenBlocks) return;

    const formatCount = 100;
    for (let i = 0; i < childrenBlocks.length; i++) {
        if (i === 0 || i % formatCount === 0) {
            showMessage(
                `正在格式化第${i + 1}至第${i + formatCount}个内容块，请勿进行其它操作。`
            );
        }

        const type = childrenBlocks[i].type;
        const id = childrenBlocks[i].id;
        if (type !== "p" && type !== "b" && type !== "l" && type !== "h") {
            continue;
        }

        const result = await getBlockKramdown(id);
        if (!result) continue;

        // 空内容块删除
        if (/^\{:.*\}$/.test(result.kramdown)) {
            await fetchSyncPost("/api/block/deleteBlock", { id: id });
            continue;
        }

        // 备注块跳过
        if (/\^[（(].*[）)]\^/.test(result.kramdown)) {
            continue;
        }

        // 含 style 属性的行内块跳过
        const matches = /(\{:.*?\})/.exec(result.kramdown);
        if (matches) {
            if (
                matches[1].search("style") > 0 &&
                matches[1].search("parent-style") <= 0
            ) {
                continue;
            }
        }

        const formatResult = formatUtil.formatContent(result.kramdown);
        if (formatResult === result.kramdown) {
            continue;
        }

        await updateBlock("markdown", formatResult, id);
    }

    showMessage("格式化完成！");
}

/**
 * 执行全文格式化（顶栏按钮入口）
 */
async function execFormatDoc() {
    const parentId = formatUtil.getDocid();
    if (!parentId) {
        showMessage("未找到当前文档");
        return;
    }

    confirm(
        "⚠️ 操作前强烈建议先备份数据，若转换效果不理想可从历史恢复。",
        "确认执行全文格式化吗？",
        async () => {
            await formatTitle(parentId);
            await formatDoc(parentId);
        }
    );
}

/**
 * 块菜单事件处理
 */
function onBlockIconClick(event: CustomEvent) {
    const detail = event.detail;
    detail.menu.addItem({
        icon: "iconEdit",
        label: "格式化文本",
        click: () => {
            formatBlockElements(detail.blockElements, detail.protyle);
        },
    });
}

export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    plugin = plugin_;
    enabled = true;

    // 添加顶栏图标
    topbarElement = plugin.addTopBar({
        icon: 'iconTypography',
        title: '格式化该文档',
        position: 'left',
        callback: execFormatDoc
    });

    // 注册块菜单事件
    plugin.eventBus.on("click-blockicon", onBlockIconClick);
};

export const unload = () => {
    if (!enabled) return;

    if (plugin) {
        plugin.eventBus.off("click-blockicon", onBlockIconClick);
    }
    if (topbarElement) {
        topbarElement.remove();
        topbarElement = null;
    }
    plugin = null;
    enabled = false;
};
