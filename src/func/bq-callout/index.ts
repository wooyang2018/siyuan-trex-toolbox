/**
 * BQ Callout - 引用块美化插件
 * 
 * @description 为引用块添加自定义样式和图标
 * @author Yp Z (frostime)
 */
import { Menu, Protyle } from "siyuan";
import "./index.scss";
import FMiscPlugin from "@/index";
import { setBlockAttrs } from "./api"
import * as callout from "./callout";
import { DynamicStyle } from "./style";

let pluginInstance: BqCalloutPlugin | null = null;
const SettingName = 'setting.json';
export let name = "BQCallout";
export let enabled = false;

/**
 * 加载 Callout 插件
 */
export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    pluginInstance = new BqCalloutPlugin(plugin_);
    pluginInstance.onload();
}

/**
 * 卸载 Callout 插件
 */
export const unload = (plugin_: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    pluginInstance?.onunload();
    pluginInstance = null;
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

        const configs = await this.siyuanPlugin.loadData(SettingName);
        Object.keys(configs).forEach(key => {
            if (key in this.configs) {
                this.configs[key] = configs[key];
            }
        });
        
        if (this.configs.DefaultCallout.length === 0) {
            this.configs.DefaultCallout = structuredClone(callout.DefaultCallouts);
        }

        this.dynamicStyle.update();
        this.resetSlash();
    }

    async onunload() {
        this.dynamicStyle.removeStyleDom();
        this.siyuanPlugin.eventBus.off("click-blockicon", this.blockIconEventBindThis);
    }

    /**
     * 重置斜杠命令
     */
    private resetSlash() {
        const addSlash = (
            ct: ICallout, calloutAttr: 'b' | 'callout', mode?: 'big' | 'small'
        ) => {
            const modeName = mode === "big" ? "标题模式" : "段落模式";
            const filterSuffix = mode ? `-${mode}` : "";
            const modenameSuffix = mode ? ` | ${modeName}` : "";

            // Default filters
            const defaultFilters = [
                `callout-${ct.id}${filterSuffix}`,
                `bq-${ct.id}${filterSuffix}`,
                callout.calloutName(ct) + filterSuffix
            ];

            // Add custom slash filters if available
            let filters = [...defaultFilters];
            if (ct.customSlash) {
                const customFilters = ct.customSlash
                    .split(',')
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
                    const toInsert = mode === undefined
                        ? `>\n{: custom-${calloutAttr}="${ct.id}" }`
                        : `>\n{: custom-${calloutAttr}="${ct.id}" custom-callout-mode="${mode}" }`;
                    protyle.insert(toInsert);
                }
            });
        }

        this.siyuanPlugin.protyleSlash = [];
        
        for (const ct of this.configs.DefaultCallout) {
            if (ct?.hide) continue;
            addSlash(ct, 'b');
            if (ct.slash?.big) addSlash(ct, 'b', 'big');
            if (ct.slash?.small) addSlash(ct, 'b', 'small');
        }
        
        for (const ct of this.configs.CustomCallout) {
            if (ct?.hide) continue;
            addSlash(ct, 'callout');
            if (ct.slash?.big) addSlash(ct, 'callout', 'big');
            if (ct.slash?.small) addSlash(ct, 'callout', 'small');
        }
    }

    /**
     * 块图标点击事件处理
     */
    private blockIconEvent({ detail }: any) {
        if (detail.blockElements.length > 1) return;
        
        const ele: HTMLDivElement = detail.blockElements[0];
        if (!ele.classList.contains("bq")) return;

        const menu: Menu = detail.menu;
        const allCallout = [...this.configs.DefaultCallout, ...this.configs.CustomCallout]
            .filter(item => !item.hide);
        
        const submenus = allCallout.map(icallout => {
            const btn = callout.createCalloutButton(ele.getAttribute("data-node-id"), icallout);
            btn.onclick = () => {
                const payload = {
                    'custom-callout': '',
                    'custom-b': ''
                };
                const key = icallout.custom ? 'custom-callout' : 'custom-b';
                payload[key] = icallout.id;
                setBlockAttrs(ele.getAttribute("data-node-id"), payload);
            };
            return { element: btn };
        });

        submenus.push({ type: 'separator' });

        // 添加模式切换按钮
        const modeButtons = [
            { mode: 'big', label: '标题模式', icon: '🇹' },
            { mode: 'small', label: '段落模式', icon: '🇵' }
        ];
        
        modeButtons.forEach(({ mode, label, icon }) => {
            submenus.push({
                element: callout.createCalloutButton("", { id: label, icon }),
                click: () => {
                    setBlockAttrs(ele.getAttribute("data-node-id"), {
                        'custom-callout-mode': mode,
                    });
                }
            });
        });

        // 添加恢复按钮
        const restoreBtn = callout.createRestoreButton(ele.getAttribute("data-node-id"));
        restoreBtn.onclick = () => {
            setBlockAttrs(ele.getAttribute("data-node-id"), {
                'custom-callout': '',
                'custom-b': ''
            });
        };
        submenus.push({ element: restoreBtn });

        menu.addItem({
            icon: "iconInfo",
            label: "Savor Callout",
            type: "submenu",
            submenu: submenus
        });
    }
}
