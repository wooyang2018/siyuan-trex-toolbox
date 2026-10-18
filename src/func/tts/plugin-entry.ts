/**
 * 文本朗读入口：命令、顶栏、状态栏、块菜单和文档标题菜单。
 */

import { Menu, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { request } from "@/api";
import { Controller, DEFAULT_VOICE, type TtsStatusSink } from "./engine";

const STORAGE_FILE = "tts-config.json";
const CMD_QUICK_OPEN = "ttsQuickOpen";

const metadataMap: Record<string, string> = {
    "晓晓-中文女声": "zh-CN-XiaoxiaoNeural",
    "云曦-中文男声": "zh-CN-YunxiNeural",
    "云阳-中文男声": "zh-CN-YunyangNeural",
    "Connor-英文男声": "en-IE-ConnorNeural",
};

const playbackRates = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 3, 5, 10];

let plugin: FMiscPlugin | null = null;
let controller: Controller | null = null;
let currentMetadata = DEFAULT_VOICE;
let playbackRate = 1;
let topBarElement: HTMLElement | null = null;
let statusRoot: HTMLElement | null = null;
let statusText: HTMLElement | null = null;

const host: TtsStatusSink = {
    setStatus(content: string) {
        if (statusText) statusText.textContent = content;
    },
};

async function loadStorage() {
    if (!plugin) return;
    try {
        const config = await plugin.loadData(STORAGE_FILE);
        if (config?.currentMetadata) currentMetadata = config.currentMetadata;
        if (typeof config?.playbackRate === "number") playbackRate = config.playbackRate;
    } catch (error) {
        console.error("[TTS] 读取配置失败:", error);
    }
}

async function saveStorage() {
    if (!plugin) return;
    await plugin.saveData(STORAGE_FILE, {
        currentMetadata,
        playbackRate,
    });
}

function startController(load: (next: Controller) => void) {
    controller?.stop();
    controller = new Controller({ currentMetadata, playbackRate }, host);
    load(controller);
    const current = controller;
    current.play().catch((error) => {
        if (controller !== current) return;
        console.error("[TTS] 播放失败:", error);
        current.stop();
        host.setStatus("播放失败, 已停止");
    });
}

function prepareSelectedBlocks(blockElements: HTMLElement[]) {
    return blockElements.map((block) => {
        if (block.classList.contains("code-block")) return null;
        const clone = block.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('span[data-type*="sup"]').forEach((sup) => sup.remove());
        return clone;
    }).filter((block): block is HTMLElement => block !== null);
}

function stripDocument(dom: string) {
    const doc = new DOMParser().parseFromString(dom, "text/html");
    doc.querySelectorAll('span[data-type*="sup"]').forEach((span) => span.remove());
    doc.querySelectorAll('div[data-type="NodeCodeBlock"]').forEach((code) => code.remove());
    return Array.from(doc.body.children);
}

async function loadDocumentBlocks(docId: string, fromBlockId?: string) {
    const data = await request("/api/block/getBlockDOM", { id: docId });
    const blocks = stripDocument(data?.dom || "");
    if (!fromBlockId) return blocks;
    let found = false;
    return blocks.filter((block) => {
        if (block.getAttribute("data-node-id") === fromBlockId) found = true;
        return found;
    });
}

function onBlockIcon(event: CustomEvent) {
    const detail = event.detail;
    const blocks = prepareSelectedBlocks(detail.blockElements || []);
    detail.menu.addItem({
        icon: "iconRecord",
        label: "朗读选块",
        click: () => {
            if (blocks.length === 0) {
                showMessage("没有可以朗读的选中内容");
                return;
            }
            startController((next) => next.loadBlocks(blocks));
        },
    });
    detail.menu.addItem({
        icon: "iconRecord",
        label: "朗读到文末",
        click: async () => {
            const currentBlockId = blocks[0]?.getAttribute("data-node-id");
            const rootId = detail.protyle?.block?.rootID;
            if (!currentBlockId || !rootId) {
                showMessage("没有可以朗读的选中内容");
                return;
            }
            try {
                const allBlocks = await loadDocumentBlocks(rootId, currentBlockId);
                if (allBlocks.length === 0) {
                    showMessage("没有可以朗读的选中内容");
                    return;
                }
                startController((next) => next.loadBlocks(allBlocks));
            } catch (error) {
                console.error("[TTS] 读取文档失败:", error);
                showMessage("没有可以朗读的选中内容");
            }
        },
    });
}

function onTitleIcon(event: CustomEvent) {
    const detail = event.detail;
    detail.menu.addItem({
        icon: "iconRecord",
        label: "朗读整篇",
        click: async () => {
            const docId = detail.protyle?.block?.rootID;
            if (!docId) {
                showMessage("没有可以朗读的选中内容");
                return;
            }
            try {
                const blocks = await loadDocumentBlocks(docId);
                if (blocks.length === 0) {
                    showMessage("没有可以朗读的选中内容");
                    return;
                }
                startController((next) => next.loadBlocks(blocks));
            } catch (error) {
                console.error("[TTS] 读取文档失败:", error);
                showMessage("没有可以朗读的选中内容");
            }
        },
    });
}

function openTopMenu(rect: DOMRect) {
    const menu = new Menu("ttsPluginTopBarMenu");
    menu.addItem({
        icon: "iconPause",
        label: controller?.isPaused ? "继续" : "暂停",
        click: () => {
            if (!controller) return;
            if (controller.isPaused) controller.resume();
            else controller.pause();
        },
    });
    menu.addItem({
        icon: "iconFocus",
        label: "滚动到当前播放块",
        click: () => {
            const currentBlock = controller?.blocks[controller.playIndex];
            const nodeId = currentBlock?.el?.getAttribute("data-node-id");
            if (!nodeId) return;
            document.querySelector(`.protyle-wysiwyg [data-node-id="${nodeId}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        },
    });
    menu.addItem({
        icon: "iconClose",
        label: "停止",
        click: () => controller?.stop(),
    });
    menu.addItem({
        icon: "",
        label: "切换声源",
        type: "submenu",
        submenu: Object.keys(metadataMap).map((label) => ({
            icon: metadataMap[label] === currentMetadata ? "iconSelect" : "",
            label,
            click: () => {
                currentMetadata = metadataMap[label];
                saveStorage();
            },
        })),
    });
    menu.addItem({
        icon: "",
        label: "播放速率",
        type: "submenu",
        submenu: playbackRates.map((rate) => ({
            icon: rate === playbackRate ? "iconSelect" : "",
            label: String(rate),
            click: () => {
                playbackRate = rate;
                saveStorage();
            },
        })),
    });
    menu.open({
        x: rect.right,
        y: rect.bottom,
        isLeft: true,
    });
}

function addStatusBar() {
    if (!plugin) return;
    const template = document.createElement("template");
    template.innerHTML = `<div class="toolbar__item">
      <span class="tts-nav-btn" style="margin: 0; padding: 0; font-size: unset;" data-type="pause">
        <svg><use xlink:href="#iconRecord"></use></svg>
      </span>
      <span id="tts-content">文本朗读</span>
    </div>`;
    const element = template.content.firstElementChild as HTMLElement;
    element.querySelector('[data-type="pause"]')?.addEventListener("click", () => {
        if (!controller) return;
        if (controller.isPaused) controller.resume();
        else controller.pause();
    });
    statusRoot = element;
    statusText = element.querySelector("#tts-content");
    plugin.addStatusBar({ element });
}

function readSelection() {
    const content = window.getSelection()?.toString();
    if (content) {
        startController((next) => next.loadContent(content));
        return;
    }
    const blocks = Array.from(document.querySelectorAll(".protyle-wysiwyg--select"));
    if (blocks.length > 0) {
        startController((next) => next.loadBlocks(blocks));
        return;
    }
    showMessage("没有可以朗读的选中内容");
}

export async function load(hostPlugin: FMiscPlugin) {
    plugin = hostPlugin;
    await loadStorage();
    plugin.addCommandV2({
        langKey: CMD_QUICK_OPEN,
        langText: "朗读当前选中内容",
        hotkey: "⌥⌘W",
        callback: readSelection,
    });
    topBarElement = plugin.addTopBar({
        icon: "iconRecord",
        title: "文本朗读",
        position: "right",
        callback: () => {
            if (!topBarElement) return;
            let rect = topBarElement.getBoundingClientRect();
            if (rect.width === 0) {
                const more = document.querySelector("#barMore");
                if (more) rect = more.getBoundingClientRect();
            }
            openTopMenu(rect);
        },
    });
    plugin.eventBus.on("click-blockicon", onBlockIcon);
    plugin.eventBus.on("click-editortitleicon", onTitleIcon);
    addStatusBar();
}

export function unload(hostPlugin?: FMiscPlugin) {
    const target = hostPlugin || plugin;
    controller?.stop();
    controller = null;
    target?.eventBus.off("click-blockicon", onBlockIcon);
    target?.eventBus.off("click-editortitleicon", onTitleIcon);
    target?.delCommand(CMD_QUICK_OPEN);
    topBarElement?.remove();
    statusRoot?.remove();
    topBarElement = null;
    statusRoot = null;
    statusText = null;
    plugin = null;
}
