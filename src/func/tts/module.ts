/**
 * 文本朗读模块（trex-toolbox IFuncModule 接口实现）
 *
 * 仅在桌面端 Electron 中加载，实际入口见 plugin-entry.ts。
 */

import type FMiscPlugin from "@/index";
import { load as loadEntry, unload as unloadEntry } from "./plugin-entry";
import "./index.scss";

export const name = "TTS";
export let enabled = false;

export const category: SettingCategory = "toggles";
export const toggleGroup: ToggleGroup = "learning";
export const declareSetting = {
    title: "文本朗读",
    description: "桌面端在线朗读选中的块、从当前块读到文末，或整篇文档。需要联网。",
    toggle: { defaultEnabled: false },
};

/**
 * 仅在 Electron 桌面端启用
 */
export const allowToUse = (): boolean => {
    const isElectron = typeof (window as any)["require"] === "function";
    const isMobile = /mobile/i.test(navigator.userAgent);
    return isElectron && !isMobile;
};

export async function load(plugin: FMiscPlugin): Promise<void> {
    if (enabled) return;
    enabled = true;
    try {
        await loadEntry(plugin);
    } catch (error) {
        console.error("[TTS] 模块加载失败:", error);
        enabled = false;
        throw error;
    }
}

export function unload(plugin?: FMiscPlugin): void {
    if (!enabled) return;
    enabled = false;
    try {
        unloadEntry(plugin);
    } catch (error) {
        console.error("[TTS] 模块卸载失败:", error);
    }
}
