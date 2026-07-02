import type FMiscPlugin from "@/index";
import { showMessage, openTab, type App } from "siyuan";
import { solidDialog } from "@/libs/dialog";
import { load as initCore, unload as unloadCore } from "./core/module";
import { getAllCards, refreshNativeCards } from "./core/card-repository";
import { ReviewView } from "./review/components/ReviewView";
import { BrowserView } from "./browser/components/BrowserView";
import { ViewerView } from "./viewer/components/ViewerView";
import { startBlockReview } from "./review/block-review";
import type { QueueType } from "@/types/srs";
import "./core/index.scss";
import "./review/index.scss";
import "./browser/index.scss";
import "./viewer/index.scss";

export const name = "SRS";
export let enabled = false;

let pluginApp: App | null = null;

export function getPluginApp(): App | null {
    return pluginApp;
}

export function openSourceBlock(blockId: string): void {
    const app = getPluginApp();
    if (!app) return;
    openTab({ app, doc: { id: blockId, zoomIn: true } });
}

export const category: SettingCategory = 'document';
export const declareSetting = {
    title: "SRS 学习复习",
    description: "统一提供提取练习、卡包管理、闪卡地图三个核心功能，底层复用思源原生闪卡与 FSRS 调度。",
    toggle: { defaultEnabled: false },
};

function openReviewDialog(queueType: QueueType = "retrieval"): void {
    const dialog = solidDialog({
        title: "SRS 提取练习",
        width: "900px",
        height: "680px",
        maxWidth: "96vw",
        loader: () => ReviewView({ queueType, onClose: () => dialog?.close() }),
    });
}

async function openReviewWithGuard(queueType: QueueType = "retrieval"): Promise<void> {
    await refreshNativeCards();
    const allCards = getAllCards();
    if (allCards.length === 0) {
        showMessage("暂无闪卡，请先在思源原生闪卡中添加卡片后再复习", 3000);
        return;
    }
    openReviewDialog(queueType);
}

function openBrowserDialog(): void {
    solidDialog({
        title: "SRS 卡包管理",
        width: "94%",
        height: "88vh",
        maxWidth: "1480px",
        loader: () => BrowserView(),
    });
}

function openViewerDialog(): void {
    const dialog = solidDialog({
        title: "SRS 闪卡地图",
        width: "94%",
        height: "88vh",
        maxWidth: "1180px",
        loader: () => ViewerView({ onClose: () => dialog?.close() }),
    });
}

function registerTopMenu(plugin: FMiscPlugin): void {
    plugin.registerMenuTopMenu("srs", [
        { label: "提取练习", icon: "iconRiffCard", click: () => openReviewWithGuard("retrieval") },
        { label: "卡包管理", icon: "iconList", click: () => openBrowserDialog() },
        { label: "闪卡地图", icon: "iconEye", click: () => openViewerDialog() },
    ]);
}

function registerCommands(plugin: FMiscPlugin): void {
    plugin.addCommandV2({ langKey: "srsReview_retrieval", hotkey: "⌥+R", callback: () => openReviewWithGuard("retrieval") });
    plugin.addCommandV2({ langKey: "srsOpenBrowser", hotkey: "⌥+B", callback: () => openBrowserDialog() });
    plugin.addCommandV2({ langKey: "srsOpenViewer", hotkey: "⌥+M", callback: () => openViewerDialog() });
}

function registerBlockReview(plugin: FMiscPlugin): void {
    plugin.eventBus.on("click-blockicon", (event: CustomEvent) => {
        const detail = event.detail;
        const blocks = Array.from((detail.blockElements || []) as HTMLElement[]);
        const blockId = blocks
            .map((el) => el.closest("[data-node-id]")?.getAttribute("data-node-id") || "")
            .find((id) => /^\d{14}-[a-z0-9]{7}$/.test(id));
        if (!blockId) return;
        detail.menu.addItem({
            label: "复习此处闪卡",
            icon: "iconRiffCard",
            click: async () => {
                const cardIds = await startBlockReview(blockId);
                if (cardIds.length === 0) {
                    showMessage("当前块及其子块没有闪卡", 2000);
                    return;
                }
                openReviewDialog("retrieval");
            },
        });
    });
}

export async function load(plugin: FMiscPlugin): Promise<void> {
    if (enabled) return;
    enabled = true;
    pluginApp = plugin.app;
    try {
        await initCore(plugin);
        registerTopMenu(plugin);
        registerCommands(plugin);
        registerBlockReview(plugin);
        console.debug("[SRS] Unified module loaded");
    } catch (error) {
        enabled = false;
        console.error("[SRS] load failed:", error);
        throw error;
    }
}

export function unload(plugin?: FMiscPlugin): void {
    if (!enabled) return;
    enabled = false;
    pluginApp = null;
    unloadCore(plugin);
    console.debug("[SRS] Unified module unloaded");
}
