import type FMiscPlugin from "@/index";
import { showMessage, openTab, type App } from "siyuan";
import { solidDialog } from "@/libs/dialog";
import { load as initCore, unload as unloadCore } from "./core/module";
import { getAllCards, refreshNativeCards } from "./core/card-repository";
import { ModeRouter } from "./mode-router/ModeRouter";
import { startBlockReview } from "./review/block-review";
import type { QueueType } from "@/types/srs";
import "./core/index.scss";
import "./creator/index.scss";
import "./focus/index.scss";

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
    description: "统一提供提取练习和闪卡地图两个核心功能，底层复用思源原生闪卡调度。",
    toggle: { defaultEnabled: false },
};

function openSrsDialog(initialMode?: 'creator' | 'focus'): void {
    const dialog = solidDialog({
        title: "SRS 闪卡",
        width: "94%",
        height: "88vh",
        maxWidth: "1180px",
        loader: () => ModeRouter({ onClose: () => dialog?.close(), initialMode }),
    });
}

function openReviewWithGuard(queueType: QueueType = "retrieval"): Promise<void> {
    return (async () => {
        await refreshNativeCards();
        const allCards = getAllCards();
        if (allCards.length === 0) {
            showMessage("暂无闪卡，请先在思源原生闪卡中添加卡片后再复习", 3000);
            return;
        }
        openSrsDialog('focus');
    })();
}

function registerTopMenu(plugin: FMiscPlugin): void {
    plugin.registerMenuTopMenu("srs", [
        { label: "管理卡片", icon: "iconEye", click: () => openSrsDialog('creator') },
        { label: "开始学习", icon: "iconRiffCard", click: () => openReviewWithGuard("retrieval") },
    ]);
}

function registerCommands(plugin: FMiscPlugin): void {
    plugin.addCommandV2({ langKey: "srsReview_retrieval", hotkey: "⌥+R", callback: () => openReviewWithGuard("retrieval") });
    plugin.addCommandV2({ langKey: "srsOpenViewer", hotkey: "⌥+M", callback: () => openSrsDialog('creator') });
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
                openSrsDialog('focus');
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
