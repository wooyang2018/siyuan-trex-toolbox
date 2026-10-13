/**
 * Copyright (c) anarion80
 * 改编自 siyuan-oembed (https://github.com/anarion80/siyuan-oembed)，
 * 原作品以 GNU Affero General Public License v3.0 授权。
 * 本文件作为合入部分继续适用 AGPL-3.0。
 *
 * 链接嵌入：oEmbed、书签卡片。
 */
import { Dialog, showMessage, type ICommand, type IProtyle, type Protyle } from "siyuan";
import type FMiscPlugin from "@/index";
import { forwardProxy, getBlockAttrs, setBlockAttrs, updateBlock } from "@/api";

import { blocksInEditor, extractUrlFromBlock, getBlocks, isEmptyParagraph } from "./block.ts";
import { convertBlock, CUSTOM_ATTRIBUTE, OEMBED_USER_AGENT, restoreBlock, type ConvertResult, type ConvertStyle, type OembedKernel } from "./convert.ts";
import { isSingleHttpUrl } from "./url.ts";

export const name = "Oembed";
export let enabled = false;
export const category: SettingCategory = "editing";

const SLASH_OEMBED = "trex-oembed";
const SLASH_BOOKMARK = "trex-bookmark-card";
const CMD_OEMBED = "oembedToggle";
const CMD_BOOKMARK = "bookmarkCardToggle";

export const declareSetting = {
    title: "链接嵌入",
    description: "把链接转成 oEmbed 嵌入或书签卡片。",
    toggle: { defaultEnabled: false },
};

const pluginKernel: OembedKernel = {
    async forwardProxy(url: string) {
        try {
            // 传 {} 时思源会给 GET 带上 JSON 正文，YouTube 回 400。null 表示不带正文。
            const res = await forwardProxy(url, "GET", null, [{ "User-Agent": OEMBED_USER_AGENT }], 7000, "text/html");
            if (!res || res.status !== 200 || !res.body) return null;
            return { status: res.status, body: res.body };
        } catch {
            return null;
        }
    },
    async updateBlockMarkdown(id, markdown) {
        try {
            await updateBlock("markdown", markdown, id);
            return true;
        } catch {
            return false;
        }
    },
    async setBlockAttrs(id, attrs) {
        await setBlockAttrs(id, attrs);
    },
    async getBlockAttrs(id) {
        try {
            return (await getBlockAttrs(id)) || {};
        } catch {
            return {};
        }
    },
};

let plugin: FMiscPlugin = null;

function report(result: ConvertResult) {
    showMessage(result === "failed" ? "链接转换失败" : "链接已转换");
}

async function applyConvert(id: string, link: string, style: ConvertStyle) {
    try {
        report(await convertBlock(pluginKernel, id, link, style));
    } catch (error) {
        console.error("[oembed] convert failed", error);
        showMessage("链接转换失败");
    }
}

function askUrl(): Promise<string | null> {
    return new Promise((resolve) => {
        const dialog = new Dialog({
            title: "插入链接",
            content: `<div class="b3-dialog__content"><textarea class="b3-text-field fn__block" placeholder="https://"></textarea></div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel">取消</button><div class="fn__space"></div>
                    <button class="b3-button b3-button--text">确定</button>
                </div>`,
            width: "520px",
        });
        const input = dialog.element.querySelector("textarea");
        const buttons = dialog.element.querySelectorAll(".b3-button");
        const close = (value: string | null) => {
            dialog.destroy();
            resolve(value);
        };
        dialog.bindInput(input, () => (buttons[1] as HTMLElement).click());
        input.focus();
        buttons[0].addEventListener("click", () => close(null));
        buttons[1].addEventListener("click", () => {
            const value = input.value.trim();
            close(isSingleHttpUrl(value) ? value : null);
            if (value && !isSingleHttpUrl(value)) showMessage("请输入以 http:// 或 https:// 开头的链接");
        });
    });
}

async function handleBlocks(blocks: HTMLElement[], style: ConvertStyle) {
    for (const block of blocks) {
        const id = block?.dataset?.nodeId;
        if (!id) continue;
        if (isEmptyParagraph(block)) {
            const link = await askUrl();
            if (!link) continue;
            await applyConvert(id, link, style);
            continue;
        }
        let original = "";
        try {
            const attrs = await pluginKernel.getBlockAttrs(id);
            original = (attrs?.[CUSTOM_ATTRIBUTE] || "").trim();
        } catch {
            original = "";
        }
        if (original) {
            const ok = await restoreBlock(pluginKernel, id, original);
            showMessage(ok ? "已还原为链接" : "还原失败");
            continue;
        }
        const link = extractUrlFromBlock(block);
        if (!link) {
            showMessage("未找到链接");
            continue;
        }
        await applyConvert(id, link, style);
    }
}

function onBlockIcon(event: CustomEvent) {
    const blocks = (event.detail?.blockElements || []) as HTMLElement[];
    if (blocks.length === 0) return;
    event.detail.menu.addItem({
        icon: "iconOembed",
        label: "链接嵌入",
        type: "submenu",
        submenu: [
            {
                icon: "iconOembed",
                label: "切换嵌入链接",
                click: () => { void handleBlocks(blocks, "oembed"); },
            },
            {
                icon: "iconLink",
                label: "切换书签卡片",
                click: () => { void handleBlocks(blocks, "bookmarkCard"); },
            },
        ],
    });
}

function contributeToolbar(toolbar: Array<string | { name?: string; icon?: string; hotkey?: string; tip?: string; click?: () => void }>) {
    toolbar.push(
        {
            name: "toggle-oembed",
            icon: "iconOembed",
            hotkey: "⇧⌘O",
            tip: "切换嵌入链接",
            click: () => { void handleBlocks(getBlocks(), "oembed"); },
        },
        {
            name: "toggle-bookmarkCard",
            icon: "iconLink",
            hotkey: "⇧⌘C",
            tip: "切换书签卡片",
            click: () => { void handleBlocks(getBlocks(), "bookmarkCard"); },
        },
    );
    return toolbar;
}

function addSlash(plugin_: FMiscPlugin, id: string, filter: string[], label: string, style: ConvertStyle) {
    plugin_.addProtyleSlash({
        id,
        filter,
        html: `<div class="b3-list-item__first"><span class="b3-list-item__text">${label}</span></div>`,
        callback: (protyle: Protyle, nodeElement: HTMLElement) => {
            void handleBlocks(blocksInEditor(protyle?.protyle, nodeElement), style);
        },
    });
}

const commands: ICommand[] = [
    {
        langKey: CMD_OEMBED,
        langText: "切换嵌入链接",
        hotkey: "⇧⌘O",
        editorCallback: (protyle: IProtyle) => { void handleBlocks(blocksInEditor(protyle), "oembed"); },
    },
    {
        langKey: CMD_BOOKMARK,
        langText: "切换书签卡片",
        hotkey: "⇧⌘C",
        editorCallback: (protyle: IProtyle) => { void handleBlocks(blocksInEditor(protyle), "bookmarkCard"); },
    },
];

export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin = plugin_;
    plugin.addIcons(`<symbol id="iconOembed" viewBox="0 0 32 32"><path d="M 16.0314 0.109395 C 7.2121 0.109396 0.0626228 7.25887 0.0626218 16.0782 C 0.062623 24.8975 7.2121 32.047 16.0314 32.047 C 24.8508 32.047 32.0002 24.8975 32.0002 16.0782 C 32.0002 7.25887 24.8508 0.109396 16.0314 0.109395 Z M 16.0314 3.99417 C 19.2364 3.99399 22.3101 5.26707 24.5763 7.5333 C 26.8426 9.79954 28.1156 12.8733 28.1155 16.0782 C 28.1156 19.2831 26.8426 22.3569 24.5763 24.6231 C 22.3101 26.8893 19.2364 28.1624 16.0314 28.1622 C 12.8265 28.1624 9.75276 26.8893 7.48653 24.6231 C 5.2203 22.3569 3.94722 19.2831 3.9474 16.0782 C 3.94722 12.8733 5.2203 9.79954 7.48653 7.5333 C 9.75276 5.26707 12.8265 3.99399 16.0314 3.99417 Z M 16.6056 7.47075 L 13.2697 24.4982 L 15.5002 24.9357 L 18.8361 7.90825 L 16.6056 7.47075 Z M 20.4006 9.86724 L 18.8342 11.4356 L 23.465 16.0684 L 18.8127 20.7208 L 20.3811 22.2872 L 25.0334 17.6348 L 25.0393 17.6407 L 26.6076 16.0743 L 20.4006 9.86724 Z M 11.7267 9.92974 L 7.07437 14.5841 L 7.06851 14.5782 L 5.50014 16.1446 L 11.7052 22.3497 L 13.2736 20.7833 L 8.64078 16.1505 L 13.2951 11.4981 L 11.7267 9.92974 Z"/></symbol>`);
    plugin.eventBus.on("click-blockicon", onBlockIcon);
    plugin.registerProtyleToolbarContribution(contributeToolbar);
    addSlash(plugin, SLASH_OEMBED, ["oembed", "Oembed", "oe"], "嵌入链接", "oembed");
    addSlash(plugin, SLASH_BOOKMARK, ["card", "bookmark", "bk"], "书签卡片", "bookmarkCard");
    commands.forEach((command) => plugin.addCommandV2(command));
};

export const unload = (plugin_: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    const target = plugin_ || plugin;
    target?.eventBus.off("click-blockicon", onBlockIcon);
    target?.unregisterProtyleToolbarContribution(contributeToolbar);
    target?.delProtyleSlash(SLASH_OEMBED);
    target?.delProtyleSlash(SLASH_BOOKMARK);
    target?.delCommand(CMD_OEMBED);
    target?.delCommand(CMD_BOOKMARK);
    plugin = null;
};
