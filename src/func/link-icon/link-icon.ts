/**
 * 链接图标插件
 * @description 自动为文档引用和链接添加图标
 */
"use strict";

import * as siyuan from "siyuan";
import { uploadCustomIcon, useDynamicStyle } from "./custom-icon";
import './style.css';
import FMiscPlugin from "@/index";

const ICON_CLASS = "plugin-link-icon";
const EVENT_LOADED_PROTYLE = 'loaded-protyle-static';

type TEventLoadedProtyle = CustomEvent<siyuan.IEventBusMap['loaded-protyle-static']>;

/**
 * 发起请求
 */
const request = async (url: string, data: any) => {
    const response = await siyuan.fetchSyncPost(url, data);
    return response.code === 0 ? response.data : null;
};

/**
 * 执行 SQL 查询
 */
const sql = async (sql: string) => {
    return request('/api/query/sql', { stmt: sql });
};

/**
 * 获取文档块的图标
 * @returns 图标信息对象，若不是文档块则返回 null
 */
const queryDocIcon = async (block_id: string) => {
    const blocks = await sql(`select * from blocks where id = '${block_id}'`);
    if (blocks?.length === 0 || blocks[0].type !== 'd') {
        return null;
    }

    const response = await siyuan.fetchSyncPost('/api/block/getDocInfo', { id: block_id });
    if (response.code !== 0) {
        return null;
    }

    const icon_code = response.data.icon;
    const sub_file_cnt = response.data.subFileCount;

    // 默认文档图标
    if (icon_code === "") {
        const code = sub_file_cnt > 0 ? '📑' : '📄';
        const dom = `<span data-type="text" class="${ICON_CLASS}">${code}</span>`;
        return { type: 'unicode', dom, code };
    }

    const result = {
        type: "unicode",
        dom: "",
        code: icon_code
    };

    // 使用了自定义的 svg 图标 vs 使用 unicode 编码的 emoji
    if (icon_code.toLowerCase().endsWith(".svg")) {
        result.type = "svg";
        result.dom = `<img alt="${icon_code}" class="emoji ${ICON_CLASS}" src="/emojis/${icon_code}" title="${icon_code}">`;
    } else if (icon_code.toLowerCase().match(/\.(jpeg|jpg|png)$/)) {
        result.type = "image";
        result.dom = `<img alt="${icon_code}" class="${ICON_CLASS}" src="/emojis/${icon_code}" title="${icon_code}" style="width: 1.625em; height: 1.625em; padding-right: 3px; padding-bottom:3px; border-radius: 0.5em">`;
    } else {
        result.type = "unicode";
        result.code = String.fromCodePoint(parseInt(icon_code, 16));
        result.dom = `<span data-type="text" class="${ICON_CLASS}">${result.code}</span>`;
    }

    return result;
};

/**
 * 判断文本是否为 Unicode 表情符号
 */
const isUnicodeEmoji = (text: string) => {
    const regex = /\p{Emoji}/u;
    return regex.test(text);
};

const ConfigFile = 'config.json';
const customIconsFile = 'custom-icons.json';

/**
 * 创建简单对话框
 */
const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    const dialog = new siyuan.Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: flex; height: 100%;"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    dialog.element.querySelector(".dialog-content").appendChild(args.ele);
    return dialog;
};

const dynamicStyle = useDynamicStyle();

/**
 * 链接图标插件类
 */
export default class LinkIconPlugin {
    private siyuanPlugin: FMiscPlugin;
    Listener = this.listeners.bind(this);

    config = {
        InsertDocRefIcon: true,
        InsertDocLinkIcon: false
    };

    customIcons: { href: string, iconUrl: string }[] = [];

    constructor(siyuanPlugin: FMiscPlugin) {
        this.siyuanPlugin = siyuanPlugin;
    }

    /**
     * 插件加载
     */
    async onload() {
        this.siyuanPlugin.registerMenuTopMenu('link-icon', [
            {
                icon: 'iconPrivatePlugin',
                label: '上传链接图标',
                click: () => {
                    const ele = uploadCustomIcon((hrefName: string, url: string) => {
                        dialog.destroy();
                        this.onCustomIconUpload(hrefName, url);
                    });
                    const dialog = simpleDialog({
                        title: "Upload Custom Icon",
                        ele: ele,
                        width: '560px',
                    });
                }
            }
        ]);

        // 加载配置文件
        const conf = await this.siyuanPlugin.loadData(ConfigFile);
        const customIcons = await this.siyuanPlugin.loadData(customIconsFile);
        this.customIcons = customIcons || [];
        
        if (conf) {
            Object.keys(this.config).forEach(key => {
                const val = conf?.[key];
                if (val !== undefined) {
                    this.config[key] = val;
                }
            });
        }
        
        // 将自定义图标添加到动态样式中
        this.customIcons.forEach(icon => {
            dynamicStyle.addIcon(icon.href, icon.iconUrl, false);
        });
        dynamicStyle.flushStyle();
        
        this.siyuanPlugin.eventBus.on(EVENT_LOADED_PROTYLE, this.Listener);
    }

    /**
     * 插件卸载
     */
    async onunload() {
        this.siyuanPlugin.eventBus.off(EVENT_LOADED_PROTYLE, this.Listener);
        dynamicStyle.clearStyle();
    }

    /**
     * 处理自定义图标上传事件
     */
    private onCustomIconUpload(href: string, iconUrl: string) {
        console.debug(`Upload custom icon: ${href} -> ${iconUrl}`);
        dynamicStyle.addIcon(href, iconUrl);
        this.customIcons.push({ href, iconUrl });
        this.siyuanPlugin.saveData(customIconsFile, this.customIcons);
    }

    /**
     * 事件监听器
     */
    async listeners(event: TEventLoadedProtyle) {
        const doc = event.detail?.protyle?.element;

        if (!doc) {
            console.warn("Listener failed to get protyle element");
            return;
        }

        if (this.config.InsertDocRefIcon) {
            const ref_list = doc.querySelectorAll("span[data-type='block-ref']");
            ref_list.forEach(async (element) => {
                const block_id = element.attributes["data-id"].value;
                this.insertDocIconBefore(element, block_id);
            });
        }

        if (this.config.InsertDocLinkIcon) {
            const url_list = doc.querySelectorAll("span[data-type=a][data-href^=siyuan]");
            url_list.forEach(async (element) => {
                const data_href = element.attributes["data-href"].value;
                const pattern = new RegExp("siyuan:\\/\\/blocks\\/(.*)");
                const result = data_href.match(pattern);
                if (result) {
                    const block_id = result[1];
                    this.insertDocIconBefore(element, block_id);
                }
            });
        }
    }

    /**
     * 在元素前插入文档图标
     */
    async insertDocIconBefore(element: Element, block_id: string) {
        const previes_sibling = element.previousElementSibling;
        
        // 如果前面的 span 元素是我们自定义插入的 icon, 就直接退出
        if (previes_sibling !== null && previes_sibling?.classList?.contains(ICON_CLASS)) {
            return false;
        }
        
        const previous_txt = previes_sibling?.textContent;
        if (isUnicodeEmoji(previous_txt)) {
            return true;
        }

        const result = await queryDocIcon(block_id);
        if (result === null) {
            return false;
        }
        
        // 思源有可能把 icon 的 span 元素保留了下来
        if (result.type === 'unicode' && result.code === previous_txt?.trim()) {
            previes_sibling.classList.add(ICON_CLASS);
            return true;
        }
        
        element.insertAdjacentHTML('beforebegin', result.dom);
        return true;
    }
}