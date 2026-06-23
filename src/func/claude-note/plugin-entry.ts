/**
 * Claude Note 插件入口（trex-toolbox 模块化版）
 *
 * 改编自原 claude-note 插件 src/index.ts —— 把 class ClaudeNotePlugin extends Plugin {...}
 * 拆成模块级的 state + load/unload/openClaudeNoteSettings 等纯函数，与 trex-toolbox 的
 * IFuncModule 协议契合。
 */

import { Dialog, showMessage } from "siyuan";
import type { IMenuItem } from "siyuan/types";
import type FMiscPlugin from "@/index";
import ClaudeNotePanel from "./ClaudeNotePanel.svelte";
import ClaudeNoteSettingsPanel from "./ClaudeNoteSettings.svelte";
import {
    defaultSettings,
    hydrateProjectInstructions,
    mergeSettings,
    SETTINGS_FILE,
    type ClaudeNoteSettings,
} from "./settings";
import { extractBlockIdFromElement, findSelectedBlockId } from "./siyuan-api";
import { CLAUDE_NOTE_SVG_SYMBOL, ICON_ID } from "./icon";

const DOCK_TYPE = "-claude-note-dock";

type PanelApp = InstanceType<typeof ClaudeNotePanel>;

interface PendingRef {
    kind: "block" | "doc";
    id: string;
}

interface ModuleState {
    plugin: FMiscPlugin | null;
    settings: ClaudeNoteSettings;
    panels: Set<PanelApp>;
    pendingRefs: PendingRef[];
    onClickBlockIcon: ((event: any) => void) | null;
    onOpenMenuContent: ((event: any) => void) | null;
    toolbarContributor: ((toolbar: Array<string | IMenuItem>) => Array<string | IMenuItem>) | null;
    /** 是否已经一次性注册 dock/command（思源 API 不支持运行时卸载，重复注册会报错） */
    registered: boolean;
}

const state: ModuleState = {
    plugin: null,
    settings: { ...defaultSettings },
    panels: new Set(),
    pendingRefs: [],
    onClickBlockIcon: null,
    onOpenMenuContent: null,
    toolbarContributor: null,
    registered: false,
};

// =============================================================================
// 模块生命周期
// =============================================================================

export async function load(plugin: FMiscPlugin): Promise<void> {
    state.plugin = plugin;
    state.settings = hydrateProjectInstructions(
        mergeSettings((await plugin.loadData(SETTINGS_FILE)) || null),
    );

    if (!state.registered) {
        plugin.addIcons(CLAUDE_NOTE_SVG_SYMBOL);
        registerDock(plugin);
        registerCommand(plugin);
        registerProtyleToolbar(plugin);
        state.registered = true;
    }

    registerEventListeners(plugin);
}

export function unload(plugin?: FMiscPlugin): void {
    const p = plugin || state.plugin;
    unregisterEventListeners(p);
    unregisterProtyleToolbar(p);

    for (const panel of Array.from(state.panels)) {
        try {
            panel.$destroy();
        } catch (e) {
            console.warn("[ClaudeNote] panel destroy failed", e);
        }
    }
    state.panels.clear();
    state.pendingRefs = [];
    state.plugin = null;
    // dock/command 由思源在 plugin.onunload 时统一处理；模块运行时禁用时 dock 壳子保留
}

// =============================================================================
// Dock 注册与切换
// =============================================================================

function registerDock(plugin: FMiscPlugin) {
    plugin.addDock({
        config: {
            position: "RightBottom",
            size: { width: 460, height: 0 },
            icon: ICON_ID,
            title: "Claude Note",
        },
        type: DOCK_TYPE,
        data: {},
        init: function (dock: any) {
            const el = (dock?.element || this.element) as HTMLElement;
            if (!el) return;
            el.classList.add("claude-note-dock");
            const panel = mountPanel(el, false);
            (el as any).__claude_panel = panel;
        },
        destroy: function () {
            const el = this.element as HTMLElement;
            if (!el) return;
            const panel = (el as any).__claude_panel as PanelApp | undefined;
            if (panel) {
                try {
                    panel.$destroy();
                } catch (e) {
                    console.warn("[ClaudeNote] dock destroy failed", e);
                }
                state.panels.delete(panel);
            }
        },
    });
}

function toggleDock(forceState: "open" | "close") {
    const selector = `.dock__item[data-type$="${DOCK_TYPE}"], .dock__item[data-hotkeylangid$="${DOCK_TYPE}"]`;
    const dockBtn = document.querySelector(selector) as HTMLElement | null;
    if (!dockBtn) {
        console.warn("[ClaudeNote] toggleDock: dock button not found, selector=", selector);
        return;
    }
    const panelEl = document.querySelector(".claude-note-dock") as HTMLElement | null;
    const isVisible = !!(panelEl && panelEl.getClientRects().length > 0 && panelEl.offsetHeight > 0);
    if (forceState === "open" && !isVisible) {
        dockBtn.click();
    } else if (forceState === "close" && isVisible) {
        dockBtn.click();
    }
}

// =============================================================================
// 命令 / 快捷键
// =============================================================================

function registerCommand(plugin: FMiscPlugin) {
    plugin.addCommand({
        langKey: "openClaudeNote",
        langText: "打开 Claude Note",
        hotkey: "⌥⌘C",
        callback: () => {
            toggleDock("open");
        },
    });
}

// =============================================================================
// 事件监听（块菜单 / 内容菜单）
// =============================================================================

function registerEventListeners(plugin: FMiscPlugin) {
    state.onClickBlockIcon = onClickBlockIcon;
    state.onOpenMenuContent = onOpenMenuContent;
    plugin.eventBus.on("click-blockicon", state.onClickBlockIcon);
    plugin.eventBus.on("open-menu-content", state.onOpenMenuContent);
}

function unregisterEventListeners(plugin?: FMiscPlugin | null) {
    if (!plugin) return;
    if (state.onClickBlockIcon) {
        plugin.eventBus.off("click-blockicon", state.onClickBlockIcon);
        state.onClickBlockIcon = null;
    }
    if (state.onOpenMenuContent) {
        plugin.eventBus.off("open-menu-content", state.onOpenMenuContent);
        state.onOpenMenuContent = null;
    }
}

function getDetail(eventOrDetail: any) {
    return eventOrDetail?.detail || eventOrDetail || {};
}

function addMenuItem(menu: any, label: string, callback: () => void) {
    if (!menu?.addItem) return;
    menu.addItem({
        icon: ICON_ID,
        label,
        click: callback,
    });
}

function onClickBlockIcon(eventOrDetail: any) {
    const detail = getDetail(eventOrDetail);
    addMenuItem(detail.menu, "Send Claude Note", () => {
        const blocks = Array.from((detail.blockElements || []) as HTMLElement[]);
        const ids = blocks
            .map((block) => extractBlockIdFromElement(block))
            .filter(Boolean);
        for (const id of Array.from(new Set(ids))) addContextById(id, "block");
    });
}

function onOpenMenuContent(eventOrDetail: any) {
    const detail = getDetail(eventOrDetail);
    addMenuItem(detail.menu, "Send Claude Note", () => {
        const id =
            extractBlockIdFromElement(detail.element) ||
            extractBlockIdFromElement(detail.protyle?.element) ||
            detail.protyle?.block?.id ||
            detail.protyle?.options?.blockId ||
            "";
        addContextById(id, "block");
    });
}

function addContextById(id: string, kind: "block" | "doc") {
    if (!id) {
        showMessage("未识别到块 ID");
        return;
    }
    if (!state.pendingRefs.some((item) => item.kind === kind && item.id === id)) {
        state.pendingRefs.push({ kind, id });
    }
    for (const panel of state.panels) {
        try {
            panel.addPendingContext({ kind, id });
        } catch (e) {
            console.warn("[ClaudeNote] panel.addPendingContext failed", e);
        }
    }
    // 自动呼出面板，延迟 150ms 以避开菜单关闭等 UI 事件冲突
    setTimeout(() => {
        toggleDock("open");
    }, 150);
    showMessage("已加入 Claude Note 上下文");
}

// =============================================================================
// Protyle 工具栏（通过 trex-toolbox 主类的贡献机制注册）
// =============================================================================

function registerProtyleToolbar(plugin: FMiscPlugin) {
    if (typeof plugin.registerProtyleToolbarContribution !== "function") {
        console.warn("[ClaudeNote] FMiscPlugin.registerProtyleToolbarContribution 未实现，工具栏按钮将不生效");
        return;
    }
    state.toolbarContributor = (toolbar: Array<string | IMenuItem>) => {
        toolbar.push({
            name: "claude-note-send",
            icon: ICON_ID,
            tipPosition: "n",
            tip: "发送当前块给 Claude Note",
            click: (protyle: any) => {
                const root =
                    protyle?.element ||
                    protyle?.protyle?.element ||
                    protyle?.wysiwyg?.element ||
                    protyle?.protyle?.wysiwyg?.element ||
                    null;
                const blockId =
                    extractBlockIdFromElement(protyle?.selectElement) ||
                    extractBlockIdFromElement(protyle?.protyle?.selectElement) ||
                    findSelectedBlockId(root) ||
                    protyle?.block?.id ||
                    protyle?.options?.blockId ||
                    "";
                if (blockId) addContextById(blockId, "block");
                else showMessage("未识别到当前块");
            },
        });
        return toolbar;
    };
    plugin.registerProtyleToolbarContribution(state.toolbarContributor);
}

function unregisterProtyleToolbar(plugin?: FMiscPlugin | null) {
    if (!plugin || !state.toolbarContributor) return;
    if (typeof plugin.unregisterProtyleToolbarContribution === "function") {
        plugin.unregisterProtyleToolbarContribution(state.toolbarContributor);
    }
    state.toolbarContributor = null;
}

// =============================================================================
// 面板挂载
// =============================================================================

function mountPanel(target: HTMLElement, isTab = false): PanelApp {
    const plugin = state.plugin!;
    const panel = new ClaudeNotePanel({
        target,
        props: {
            i18n: plugin.i18n,
            settings: state.settings,
            isTabPanel: isTab,
            openSetting: () => openClaudeNoteSettings(plugin),
            clearPluginPendingContexts: () => {
                state.pendingRefs = [];
            },
        },
    });
    state.panels.add(panel);
    for (const ref of state.pendingRefs) {
        try {
            panel.addPendingContext(ref);
        } catch (e) {
            console.warn("[ClaudeNote] addPendingContext on mount failed", e);
        }
    }
    return panel;
}

function createSaveSettings() {
    return async (next: ClaudeNoteSettings): Promise<void> => {
        const plugin = state.plugin;
        if (!plugin) return;
        state.settings = hydrateProjectInstructions(mergeSettings(next));
        await plugin.saveData(SETTINGS_FILE, state.settings);
        for (const p of state.panels) {
            try {
                p.$set({ settings: state.settings });
            } catch (e) {
                console.warn("[ClaudeNote] panel.$set after save failed", e);
            }
        }
    };
}

// =============================================================================
// 设置对话框
// =============================================================================

export function openClaudeNoteSettings(plugin?: FMiscPlugin | null): void {
    const p = plugin || state.plugin;
    if (!p) return;

    let settingsPanel: InstanceType<typeof ClaudeNoteSettingsPanel> | undefined;
    const dialog = new Dialog({
        title: p.i18n["claudeNoteSettings"] || "Claude Note 设置",
        content: `<div id="ClaudeNoteSettings" style="height: 100%;"></div>`,
        width: "760px",
        destroyCallback: () => {
            settingsPanel?.$destroy();
        },
    });
    settingsPanel = new ClaudeNoteSettingsPanel({
        target: dialog.element.querySelector("#ClaudeNoteSettings") as HTMLElement,
        props: {
            i18n: p.i18n,
            settings: state.settings,
            saveSettings: createSaveSettings(),
        },
    });
}
