/**
 * Claude Note 模块 - 主插件集成版本
 * @description Claude 笔记功能的模块接口实现，符合 IFuncModule 接口要求
 */

import type { FMiscPlugin } from "@/index";
import { load as loadIntegration, unload as unloadIntegration, declareSettingPanel } from "./integration.tsx";

// ===== 模块元数据 =====
export const name = 'ClaudeNote';
export let enabled = false;

export const declareToggleEnabled = {
    title: '📝 Claude 笔记',
    description: 'Claude 笔记功能，支持与 Claude 交互的笔记创建和管理',
    defaultEnabled: false,
};

// ===== 模块状态 =====
let pluginInstance: FMiscPlugin | null = null;

/**
 * 检查模块是否可用
 */
export function allowToUse(): boolean {
    // 这里可以添加环境检查逻辑
    // 例如：检查 API 密钥是否配置、网络连接等
    return true;
}

/**
 * 加载模块
 */
export async function load(plugin: FMiscPlugin): Promise<void> {
    if (enabled) return;

    console.log('[ClaudeNote] 开始加载模块...');
    pluginInstance = plugin;

    try {
        // 先加载核心功能
        await loadCoreModule(plugin);

        // 再加载集成功能
        await loadIntegration(plugin);

        enabled = true;
        console.log('[ClaudeNote] 模块加载完成');

    } catch (error) {
        console.error('[ClaudeNote] 模块加载失败:', error);
        pluginInstance = null;
        enabled = false;
        throw error;
    }
}

/**
 * 卸载模块
 */
export function unload(plugin?: FMiscPlugin): void {
    if (!enabled) return;

    console.log('[ClaudeNote] 开始卸载模块...');

    try {
        // 卸载集成功能
        unloadIntegration(plugin);

        // 卸载核心功能
        unloadCoreModule(plugin);

        pluginInstance = null;
        enabled = false;
        console.log('[ClaudeNote] 模块卸载完成');

    } catch (error) {
        console.error('[ClaudeNote] 模块卸载失败:', error);
        // 即使出错也要继续清理
        pluginInstance = null;
        enabled = false;
    }
}

// ===== 核心模块加载/卸载 =====

/**
 * 加载核心模块功能
 */
async function loadCoreModule(plugin: FMiscPlugin): Promise<void> {
    // 这里加载 Claude Note 的核心功能
    // 目前使用动态导入来避免循环依赖
    const { load: loadCore } = await import('./index');
    await loadCore(plugin);
}

/**
 * 卸载核心模块功能
 */
function unloadCoreModule(plugin?: FMiscPlugin): void {
    // 这里卸载 Claude Note 的核心功能
    // 使用动态导入来避免循环依赖
    import('./index').then(({ unload: unloadCore }) => {
        unloadCore(plugin);
    }).catch(error => {
        console.error('[ClaudeNote] 核心模块卸载失败:', error);
    });
}

// ===== 导出设置面板 =====
export { declareSettingPanel };

// ===== 向后兼容性导出 =====

/**
 * 向后兼容的模块接口
 * @deprecated 请使用新的模块接口
 */
export * from "./index";

// ===== 模块统计信息 =====

/**
 * 获取模块统计信息
 */
export async function getModuleStats() {
    if (!enabled) {
        return {
            enabled: false,
            lastError: '模块未启用'
        };
    }

    try {
        const { getStats, checkHealth } = await import('./index');
        const [stats, health] = await Promise.all([
            getStats(),
            checkHealth()
        ]);

        return {
            enabled: true,
            health: health.isHealthy,
            notesCreated: stats.notesCreated,
            apiCalls: stats.apiCalls,
            lastActivity: stats.lastActivity,
            services: health.services
        };
    } catch (error) {
        return {
            enabled: true,
            health: false,
            lastError: error instanceof Error ? error.message : String(error)
        };
    }
}