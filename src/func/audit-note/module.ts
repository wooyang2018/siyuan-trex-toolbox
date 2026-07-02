/**
 * Audit Note 模块（trex-toolbox IFuncModule 接口实现）
 *
 * 这是 Audit Note 在 trex-toolbox 中的入口，负责：
 *   1. 暴露符合 IFuncModule 协议的导出
 *   2. 引入模块样式
 *   3. 在桌面端 Electron 环境下委托 plugin-entry.ts 完成实际加载
 */

import type FMiscPlugin from "@/index";
import { load as loadEntry, unload as unloadEntry } from "./plugin-entry";
import "./index.scss";

// ===== 模块元数据 =====
export const name = "AuditNote";
export let enabled = false;

export const category: SettingCategory = 'editing';
export const declareSetting = {
    title: "Audit Note",
    description:
        "文档审计标注工具。在思源编辑器中选中文本添加反馈标注，支持审计列表查看和标记已解决。",
    toggle: { defaultEnabled: false },
};

/**
 * 仅在 Electron 桌面端启用
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
        console.error("[AuditNote] 模块加载失败:", error);
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
        console.error("[AuditNote] 模块卸载失败:", error);
    }
}
