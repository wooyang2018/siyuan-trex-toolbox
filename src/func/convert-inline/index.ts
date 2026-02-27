/**
 * 行内元素转文本功能
 * 将选中块的行内元素（加粗、斜体、标注、标签、链接、块引等）转换为纯文本
 */
import type FMiscPlugin from "@/index";

export let name = "ConvertInline";
export let enabled = false;

export const declareToggleEnabled = {
    title: '🔄 行内元素转换',
    description: '块菜单中增加行内元素转文本的功能（加粗、斜体、标注、标签、链接、块引等）',
    defaultEnabled: false
};

let plugin: FMiscPlugin = null;

const availableBlocks = ["NodeParagraph", "NodeHeading"];

/**
 * 将行内元素转换为纯文本
 * @param detail 事件详情
 * @param querySelectorAllStr CSS 选择器字符串
 */
function blockToText(detail: any, querySelectorAllStr: string) {
    const doOperations: doOperation[] = [];

    // 从选择器中提取目标元素类型（用于处理嵌套样式）
    const targetStyleMatch = querySelectorAllStr.match(/\[data-type~="([^"]+)"\]/);
    const targetStyle = targetStyleMatch ? targetStyleMatch[1] : null;

    detail.blockElements.forEach((item: HTMLElement) => {
        const editElements = item.querySelectorAll(
            availableBlocks
                .map((t) => `[data-type=${t}] [contenteditable="true"]`)
                .join(",")
        );

        editElements.forEach((editElement: HTMLElement) => {
            editElement.querySelectorAll(querySelectorAllStr).forEach((ele: HTMLElement) => {
                const currentType = ele.getAttribute("data-type");

                // 非嵌套样式，直接转为文本节点
                if (!currentType || currentType.trim().split(" ").length === 1) {
                    const textNode = document.createTextNode(ele.textContent);
                    ele.parentNode.replaceChild(textNode, ele);
                    return;
                }

                // 嵌套样式：移除目标样式，保留其他样式
                if (targetStyle) {
                    // 移除目标样式（使用正则确保完全匹配）
                    const updatedType = currentType
                        .split(" ")
                        .filter((s) => s !== targetStyle)
                        .join(" ");

                    if (updatedType.trim() === "") {
                        ele.removeAttribute("data-type");
                    } else {
                        ele.setAttribute("data-type", updatedType);
                    }
                }
            });
        });

        doOperations.push({
            id: item.dataset.nodeId,
            data: item.outerHTML,
            action: "update",
        } as doOperation);
    });

    detail.protyle.getInstance().transaction(doOperations);
}

/**
 * 块菜单事件处理
 */
function onBlockIconClick(event: CustomEvent) {
    const detail = event.detail;
    detail.menu.addItem({
        icon: "iconConvert",
        label: "调整行内元素",
        submenu: [
            {
                iconHTML: "",
                label: "引用/块超链接👉文本",
                click: () => {
                    blockToText(detail, '[data-type~="a"][data-href^="siyuan://"]');
                    blockToText(detail, '[data-type~="block-ref"]');
                },
            },
            {
                iconHTML: "",
                label: "引用/链接👉文本",
                click: () => {
                    blockToText(detail, '[data-type~="a"]');
                    blockToText(detail, '[data-type~="block-ref"]');
                },
            },
            {
                iconHTML: "",
                label: "粗体👉文本",
                click: () => {
                    blockToText(detail, '[data-type~="strong"]');
                },
            },
            {
                iconHTML: "",
                label: "标注👉文本",
                click: () => {
                    blockToText(detail, '[data-type~="mark"]');
                },
            },
            {
                iconHTML: "",
                label: "标签👉文本",
                click: () => {
                    blockToText(detail, '[data-type~="tag"]');
                },
            },
            {
                iconHTML: "",
                label: "斜体👉文本",
                click: () => {
                    blockToText(detail, '[data-type~="em"]');
                },
            },
        ],
    });
}

/**
 * 加载模块
 */
export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    plugin = plugin_;
    enabled = true;

    plugin.eventBus.on("click-blockicon", onBlockIconClick);
};

/**
 * 卸载模块
 */
export const unload = () => {
    if (!enabled) return;

    if (plugin) {
        plugin.eventBus.off("click-blockicon", onBlockIconClick);
    }
    plugin = null;
    enabled = false;
};
