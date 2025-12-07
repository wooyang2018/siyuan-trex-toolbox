/*
 * Copyright (c) 2023 by Yp Z (frostime). All Rights Reserved.
 * @Author       : Yp Z
 * @Date         : 2023-10-02 20:30:13
 * @FilePath     : /src/index.ts
 * @LastEditTime : 2025-03-14 19:00:44
 * @Description  : 
 */
import {
    Menu,
    Protyle,
} from "siyuan";
import "./index.scss";
import FMiscPlugin from "@/index";
import { setBlockAttrs } from "./api"
import * as callout from "./callout";
import { DynamicStyle } from "./style";


let pluginInstance: BqCalloutPlugin | null = null;
const SettingName = 'setting.json';
export let name = "BQCallout";
export let enabled = false;

export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    pluginInstance = new BqCalloutPlugin(plugin_);
    pluginInstance.onload();
}

export const unload = (plugin_: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    if (pluginInstance) {
        pluginInstance.onunload();
        pluginInstance = null;
    }
}

export default class BqCalloutPlugin {
    private blockIconEventBindThis = this.blockIconEvent.bind(this);
    private dynamicStyle: DynamicStyle;
    private siyuanPlugin: FMiscPlugin;

    configs: IConfigs = {
        EmojiFont: `'Twitter Emoji', 'Noto Color Emoji', 'OpenMoji', sans-serif`,
        CustomCSS: '',
        CalloutOrder: '',
        DefaultCallout: [],
        CustomCallout: [],
        DefaultMode: 'big',
        VarIconTop: {
            Big: '0.35em',
            Small: '0.45em'
        }
    };

    constructor(siyuanPlugin: FMiscPlugin) {
        this.siyuanPlugin = siyuanPlugin;
    }

    async onload() {
        this.dynamicStyle = new DynamicStyle(this);
        this.siyuanPlugin.eventBus.on("click-blockicon", this.blockIconEventBindThis);

        let configs = await this.siyuanPlugin.loadData(SettingName);
        for (let key in configs) {
            if (key in this.configs) {
                this.configs[key] = configs[key];
            }
        }
        if (this.configs.DefaultCallout.length === 0) {
            this.configs.DefaultCallout = JSON.parse(JSON.stringify(callout.DefaultCallouts));
        }

        this.dynamicStyle.update();
        this.resetSlash();
    }

    async onunload() {
        this.dynamicStyle.removeStyleDom();
        this.siyuanPlugin.eventBus.off("click-blockicon", this.blockIconEventBindThis);
    }

    private resetSlash() {
        const addSlash = (
            ct: ICallout, calloutAttr: 'b' | 'callout', mode?: 'big' | 'small'
        ) => {
            let modeName = mode == "big" ? "标题模式" : "段落模式";
            let filterSuffix = mode ? `-${mode}` : "";
            let modenameSuffix = mode ? ` | ${modeName}` : "";

            // Default filters
            const defaultFilters = [
                `callout-${ct.id}${filterSuffix}`,
                `bq-${ct.id}${filterSuffix}`,
                callout.calloutName(ct) + filterSuffix
            ];

            // Add custom slash filters if available
            let filters = [...defaultFilters];
            if (ct.customSlash) {
                const customFilters = ct.customSlash.split(',')
                    .map(filter => filter.trim())
                    .filter(filter => filter.length > 0)
                    .map(filter => filter + filterSuffix);
                filters = [...customFilters, ...defaultFilters];
            }

            this.siyuanPlugin.protyleSlash.push({
                filter: filters,
                html: `<span class="b3-menu__label">${ct.icon}${callout.calloutName(ct)}${modenameSuffix}</span>`,
                id: ct.id + filterSuffix,
                callback: (protyle: Protyle) => {
                    console.log('Insert', ct.id, mode);
                    let toInsert = "";
                    if (mode === undefined) {
                        toInsert = `>\n{: custom-${calloutAttr}="${ct.id}" }`;
                    } else {
                        toInsert = `>\n{: custom-${calloutAttr}="${ct.id}" custom-callout-mode="${mode}" }`;
                    }
                    protyle.insert(toInsert);
                }
            });
        }

        this.siyuanPlugin.protyleSlash = [];
        for (let ct of this.configs.DefaultCallout) {
            if (ct?.hide) continue;
            addSlash(ct, 'b');
            if (ct.slash?.big) addSlash(ct, 'b', 'big');
            if (ct.slash?.small) addSlash(ct, 'b', 'small');
        }
        for (let ct of this.configs.CustomCallout) {
            if (ct?.hide) continue;
            addSlash(ct, 'callout');
            if (ct.slash?.big) addSlash(ct, 'callout', 'big');
            if (ct.slash?.small) addSlash(ct, 'callout', 'small');
        }
    }

    private blockIconEvent({ detail }: any) {
        console.log(detail);
        if (detail.blockElements.length > 1) {
            return;
        }
        let ele: HTMLDivElement = detail.blockElements[0];
        if (!ele.classList.contains("bq")) {
            return;
        }

        let menu: Menu = detail.menu;
        let submenus = [];
        const allCallout = this.configs.DefaultCallout.concat(this.configs.CustomCallout).filter((item) => !item.hide);
        for (let icallout of allCallout) {
            if (icallout.hide) continue;
            let btn = callout.createCalloutButton(ele.getAttribute("data-node-id"), icallout);
            btn.onclick = () => {
                let payload = {
                    'custom-callout': '',
                    'custom-b': ''
                };
                let key = icallout.custom ? 'custom-callout' : 'custom-b';
                payload[key] = icallout.id;
                setBlockAttrs(ele.getAttribute("data-node-id"), payload);
            }
            submenus.push({
                element: btn,
            })
        }
        submenus.push({
            type: 'separator'
        });
        let big = "标题模式"
        let small = "段落模式"
        submenus.push({
            element: callout.createCalloutButton("", { id: big, icon: '🇹' }),
            click: () => {
                setBlockAttrs(ele.getAttribute("data-node-id"), {
                    'custom-callout-mode': 'big',
                });
            }
        });
        submenus.push({
            element: callout.createCalloutButton("", { id: small, icon: '🇵' }),
            click: () => {
                setBlockAttrs(ele.getAttribute("data-node-id"), {
                    'custom-callout-mode': 'small',
                });
            }
        });

        let btn = callout.createRestoreButton(ele.getAttribute("data-node-id"));
        btn.onclick = () => {
            setBlockAttrs(ele.getAttribute("data-node-id"), {
                'custom-callout': '',
                'custom-b': ''
            });
        }
        submenus.push({
            element: btn
        });
        menu.addItem({
            icon: "iconInfo",
            label: "Savor Callout",
            type: "submenu",
            submenu: submenus
        });
    }
}
