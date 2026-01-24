/**
 * 功能模块管理
 * 负责加载、卸载和切换各个功能模块
 */
import type FMiscPlugin from "@/index";
import * as mw from './mini-window';
import * as tr from './transfer-ref';
import * as dc from './doc-context';
import * as ws from './websocket';
import * as wb from './webview';
import * as mr from './migrate-refs';
import * as gpt from './gpt';
import * as sc from './shared-configs';
import * as dft from './docfile-tools';
import * as km from './keymap';
import * as li from './link-icon';
import * as pi from './pin-image';
import * as bq from './bq-callout';

// 可切换的功能模块列表
const _ModulesToEnable: IFuncModule[] = [gpt, mw, dft, dc, wb, tr, mr, ws];

// 始终启用的功能模块列表
const _ModulesAlwaysEnable: IFuncModule[] = [sc, li, pi, bq];

// 过滤出可用的模块
export const ModulesToEnable = _ModulesToEnable.filter(
    module => !module.allowToUse || module.allowToUse()
);
export const ModulesAlwaysEnable = _ModulesAlwaysEnable.filter(
    module => !module.allowToUse || module.allowToUse()
);

// EnableKey 到模块的映射表
const EnableKey2Module = Object.fromEntries(
    ModulesToEnable.map(module => [`Enable${module.name}`, module])
);

/**
 * 加载所有模块
 */
export const load = (plugin: FMiscPlugin) => {
    // 加载始终启用的模块
    ModulesAlwaysEnable.forEach(module => module.load(plugin));
    
    // 加载用户启用的模块
    ModulesToEnable.forEach(module => {
        if (plugin.getConfig('Enable', `Enable${module.name}`)) {
            module.load(plugin);
        }
    });
};

/**
 * 卸载所有模块
 */
export const unload = (plugin: FMiscPlugin) => {
    ModulesToEnable.forEach(module => module.unload(plugin));
    ModulesAlwaysEnable.forEach(module => module.unload(plugin));
};

/**
 * 添加状态栏图标
 */
export const addStatus = (plugin: FMiscPlugin) => {
    km.addStatus(plugin);
};

type EnableKey = keyof FMiscPlugin['data']['configs']['Enable'];

/**
 * 动态切换模块启用状态
 */
export const toggleEnable = (plugin: FMiscPlugin, key: EnableKey, enable: boolean) => {
    const module = EnableKey2Module?.[key];
    if (!module) return;
    
    console.debug(`Toggle ${key} to ${enable}`);
    enable ? module.load(plugin) : module.unload(plugin);
};

