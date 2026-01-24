/**
 * Copyright (c) 2023 by Yp Z (frostime). All Rights Reserved.
 * @description Callout 样式管理
 */
import type BqCalloutPlugin from ".";

export const StyleDOMId = 'snippetCSS-BqCallout';

const TemplateEmojiFont = `.protyle-wysiwyg .bq[custom-b]::after,
.protyle-wysiwyg .bq[custom-callout]::after {
  font-family: {{var}} !important; 
}`;

/** 默认数据库 Callout 样式 */
const defaultDbCallout = (callout: ICallout) => `
.protyle-wysiwyg div[data-node-id].bq[custom-b="${callout.id}"]::after {
    content: "${callout.icon}" !important;
}

html[data-theme-mode="light"] .protyle-wysiwyg [data-node-id].bq[custom-b="${callout.id}"] {
    background-color: ${callout.bg.light} !important;
    box-shadow: 0 0 0 2px ${callout.box.light} inset;
}

html[data-theme-mode="dark"] .protyle-wysiwyg [data-node-id].bq[custom-b="${callout.id}"] {
    background-color: ${callout.bg.dark} !important;
    box-shadow: 0 0 0 2px ${callout.box.dark} inset;
}
`;

/** 自定义 Callout 样式 */
const customCallout = (callout: ICallout) => `
.protyle-wysiwyg div[data-node-id].bq[custom-callout="${callout.id}"]::after {
    content: "${callout.icon}" !important;
}

html[data-theme-mode="light"] .protyle-wysiwyg [data-node-id].bq[custom-callout="${callout.id}"] {
    background-color: ${callout.bg.light} !important;
    box-shadow: 0 0 0 2px ${callout.box.light} inset;
}

html[data-theme-mode="dark"] .protyle-wysiwyg [data-node-id].bq[custom-callout="${callout.id}"] {
    background-color: ${callout.bg.dark} !important;
    box-shadow: 0 0 0 2px ${callout.box.dark} inset;
}
`;

/**
 * 设置全局默认的 Callout 显示模式
 * @param mode big 模式或者 small 模式
 * @returns 返回 root 变量定义
 */
const toggleVarsByMode = (mode: 'big' | 'small') => {
    const StyleVars = [
        'icon-top',
        'icon-left',
        'icon-font-size',
        'fc-font-size',
        'fc-padding',
        'fc-font-weight'
    ];
    
    const css = StyleVars.map(v => 
        `\t--callout-default-${v}: var(--callout-${mode}-${v});`
    ).join('\n');

    return `
    :root {
    ${css}
    }
    `;
};

/** 动态样式管理类 */
export class DynamicStyle {
    private css: string;
    plugin: BqCalloutPlugin;
    private configs: IConfigs;

    constructor(plugin: BqCalloutPlugin) {
        this.css = "";
        this.plugin = plugin;
        this.configs = plugin.configs;
    }

    update() {
        this.buildStyle();
        this.updateStyleDom();
    }

    /**
     * 根据 this.css 更新 style 标签内容
     */
    updateStyleDom() {
        let style: HTMLStyleElement = document.getElementById(StyleDOMId) as HTMLStyleElement;
        if (!style) {
            style = document.createElement('style');
            style.id = StyleDOMId;
            document.head.appendChild(style);
        }
        style.innerHTML = this.css;
    }

    /**
     * 移除 style 标签
     */
    removeStyleDom() {
        document.getElementById(StyleDOMId)?.remove();
    }

    private buildStyle() {
        this.css = "";
        const styles = [
            this.configs.CustomCSS,
            TemplateEmojiFont.replace("{{var}}", this.configs.EmojiFont)
        ];

        // 合并样式
        this.css = styles.join("\n");
        
        // 合并自定义 callout 样式
        const customCallouts = this.configs.CustomCallout ?? [];
        customCallouts.forEach(callout => {
            this.css += customCallout(callout);
        });
        
        // 修改默认 callout 样式
        this.plugin.configs.DefaultCallout.forEach(callout => {
            this.css += defaultDbCallout(callout);
        });

        // 设置全局 callout 模式
        this.css += toggleVarsByMode(this.plugin.configs.DefaultMode);

        // 设置动态 css 变量
        document.documentElement.style.setProperty('--callout-big-icon-top', this.configs.VarIconTop.Big);
        document.documentElement.style.setProperty('--callout-small-icon-top', this.configs.VarIconTop.Small);
    }
}