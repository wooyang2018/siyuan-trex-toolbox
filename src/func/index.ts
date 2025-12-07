/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:30:38
 * @FilePath     : /src/func/index.ts
 * @LastEditTime : 2025-04-17 18:15:02
 * @Description  :
 */
// import { type JSX } from "solid-js";

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
import * as pi from './pin-image'
import * as bq from './bq-callout'

let _ModulesToEnable: IFuncModule[] = [
    gpt,
    mw,
    dft,
    dc,
    wb,
    tr,
    mr,
    ws,
];

let _ModulesAlwaysEnable: IFuncModule[] = [sc, li, pi, bq];

export const ModulesToEnable = _ModulesToEnable.filter(module => module.allowToUse ? module.allowToUse() : true);
export const ModulesAlwaysEnable = _ModulesAlwaysEnable.filter(module => module.allowToUse ? module.allowToUse() : true);

const EnableKey2Module = Object.fromEntries(ModulesToEnable.map(module => [`Enable${module.name}`, module]));

export const load = (plugin: FMiscPlugin) => {
    ModulesAlwaysEnable.forEach(module => {
        module.load(plugin);
    });
    ModulesToEnable.forEach(module => {
        if (plugin.getConfig('Enable', `Enable${module.name}`)) {
            module.load(plugin);
        }
    });
}

export const unload = (plugin: FMiscPlugin) => {
    ModulesToEnable.forEach(module => {
        module.unload(plugin);
    });

    ModulesAlwaysEnable.forEach(module => {
        module.unload(plugin);
    });
}

export const addStatus = (plugin: FMiscPlugin) => {
    km.addStatus(plugin);
}

type EnableKey = keyof FMiscPlugin['data']['configs']['Enable'];

export const toggleEnable = (plugin: FMiscPlugin, key: EnableKey, enable: boolean) => {
    const DoAction = (module: IFuncModule) => {
        if (module === undefined) return;
        if (enable === true) {
            module.load(plugin);
        } else {
            module.unload(plugin);
        }
    };
    const module = EnableKey2Module?.[key];
    console.debug(`Toggle ${key} to ${enable}`);
    DoAction(module);
}
