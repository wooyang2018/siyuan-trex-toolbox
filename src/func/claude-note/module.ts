/**
 * Claude Note 模块（trex-toolbox IFuncModule 接口实现）
 *
 * 这是 Claude Note 在 trex-toolbox 中的入口，负责：
 *   1. 暴露符合 IFuncModule 协议的导出（name/enabled/load/unload/declareSetting/allowToUse）
 *   2. 引入模块样式（index.scss）
 *   3. 在桌面端 Electron 环境下委托 plugin-entry.ts 完成实际加载
 */

import type FMiscPlugin from "@/index";
import { load as loadEntry, unload as unloadEntry, openClaudeNoteSettings } from "./plugin-entry";
import "./index.scss";

// ===== 模块元数据 =====
export const name = "ClaudeNote";
export let enabled = false;

export const category: SettingCategory = 'ai';
export const declareSetting = {
    title: "Claude Note",
    description:
        "在思源内调起本地 Claude Code CLI，作为常驻 AI 协作面板。仅桌面端可用，需先安装 claude 命令行工具。",
    toggle: { defaultEnabled: false },
};

/**
 * 仅在 Electron 桌面端启用：
 *   - 必须能 require Node.js 模块（child_process / fs / os）
 *   - 不能在移动端 webview 里运行
 */
export const allowToUse = (): boolean => {
    const isElectron = !!(window as any)?.require;
    const isMobile = /mobile/i.test(navigator.userAgent);
    return isElectron && !isMobile;
};

// ===== 模块生命周期 =====

export async function load(plugin: FMiscPlugin): Promise<void> {
    if (enabled) return;
    enabled = true;
    try {
        await loadEntry(plugin);
    } catch (error) {
        console.error("[ClaudeNote] 模块加载失败:", error);
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
        console.error("[ClaudeNote] 模块卸载失败:", error);
    }
}

// 重新导出，方便外部（如 trex 设置面板）调用 Claude Note 设置对话框
export { openClaudeNoteSettings };
