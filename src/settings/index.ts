/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @FilePath     : /src/settings/index.ts
 * @Description  : 设置初始化与持久化逻辑
 */
import type FMiscPlugin from '@/index';
import { toggleEnable, ModulesAlwaysEnable, ModulesToEnable } from '@/func';

import Settings from "@/settings/settings";
import { solidDialog } from '@/libs/dialog';
import { debounce } from '@frostime/siyuan-plugin-kits';

/** 所有有声明的设置模块（按声明顺序，后续在 UI 中按 category 分组） */
const allModules = [...ModulesToEnable, ...ModulesAlwaysEnable].filter(
    module => module.declareSetting
);

/** 需要持久化配置的模块（有 configs 且经过统一存储） */
const modulesWithConfigs = allModules.filter(
    module => module.declareSetting?.configs && module.declareSetting.configs.length > 0
);

export const initSetting = async (plugin: FMiscPlugin) => {
    // ====== 1. 初始化 Enable 配置 ======
    let configs: any = {
        Enable: {}
    };
    ModulesToEnable.forEach(module => {
        if (module.declareSetting?.toggle) {
            configs.Enable[`Enable${module.name}`] = module.declareSetting.toggle.defaultEnabled ?? false;
        }
    });
    plugin.data['configs'] = configs;
    await plugin.loadConfigs();

    // ====== 2. 加载自定义模块配置 ======
    const storageName = 'custom-module.config.json';
    let storage = await plugin.loadData(storageName);
    storage = storage || {};

    modulesWithConfigs.forEach(module => {
        const configKey = module.name;
        if (storage[configKey] && module.declareSetting?.configLoad) {
            module.declareSetting.configLoad(storage[configKey]);
        }
    });

    // ====== 3. 配置持久化 ======
    const saveModuleConfig = async () => {
        try {
            let configsToSave = Object.fromEntries(
                modulesWithConfigs.map(module => {
                    const s = module.declareSetting;
                    if (s?.configDump) {
                        return [module.name, s.configDump()];
                    } else if (s?.configs) {
                        return [
                            module.name,
                            Object.fromEntries(s.configs.map(item => [item.key, item.get()]))
                        ];
                    }
                    return [module.name, {}];
                })
            );
            await plugin.saveData(storageName, configsToSave);
            console.debug('Module configs saved:', configsToSave);
        } catch (e) {
            console.error('Failed to save module configs:', e);
        }
    };
    let saveModuleConfigDebounced = debounce(saveModuleConfig, 1000 * 5);

    // 注入 set 函数，拦截配置变更以触发保存
    modulesWithConfigs.forEach(module => {
        const s = module.declareSetting;
        if (!s?.configs) return;
        s.configs.forEach(item => {
            let initialSetCb = item.set.bind(item);
            item.set = (value: any) => {
                initialSetCb(value);
                if (!storage[module.name]) storage[module.name] = {};
                storage[module.name][item.key] = value;
                saveModuleConfigDebounced();
            };
        });
    });

    // ====== 4. 开关切换处理 ======
    const onToggle = (moduleName: string, enabled: boolean) => {
        const enableKey = `Enable${moduleName}`;
        const pluginConfigs = plugin.data['configs'];
        if (pluginConfigs?.Enable && pluginConfigs.Enable[enableKey] !== undefined) {
            pluginConfigs.Enable[enableKey] = enabled;
        }
        // Enable 组变更立即保存，避免刷新丢失
        plugin.saveConfigs();
        // 动态启用/禁用模块
        toggleEnable(plugin, enableKey as any, enabled);
    };

    // ====== 5. 构建 enabledMap ======
    const getEnabledMap = (): Record<string, boolean> => {
        const map: Record<string, boolean> = {};
        ModulesToEnable.forEach(module => {
            map[module.name] = plugin.getConfig('Enable', `Enable${module.name}`) ?? false;
        });
        return map;
    };

    // ====== 6. 打开设置 ======
    plugin.openSetting = () => {
        solidDialog({
            title: "霸王龙工具箱设置",
            width: "1200px",
            height: "760px",
            loader: () => Settings({
                modules: allModules,
                enabledMap: getEnabledMap(),
                onToggle,
            })
        });
    };
}
