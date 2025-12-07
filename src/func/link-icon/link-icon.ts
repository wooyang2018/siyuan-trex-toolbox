// 使用严格模式
"use strict";

import * as siyuan from "siyuan";
import { uploadCustomIcon, useDynamicStyle } from "./custom-icon";
import './style.css';
import FMiscPlugin from "@/index";

// 定义图标类名常量
const ICON_CLASS = "plugin-link-icon";
// 定义加载 protyle 静态资源的事件名称常量
const EVENT_LOADED_PROTYLE = 'loaded-protyle-static';

// 定义加载 protyle 静态资源事件的类型
type TEventLoadedProtyle = CustomEvent<siyuan.IEventBusMap['loaded-protyle-static']>;

/**
 * 发起请求的异步函数
 * @param {string} url 请求的 URL
 * @param {any} data 请求的数据
 * @returns {Promise<any>} 请求成功返回响应数据，失败返回 null
 */
async function request(url, data) {
    // 注释掉的打印请求信息的代码
    // info(`Request: ${url}; data = ${JSON.stringify(data)}`);
    // 发起同步的 POST 请求
    let response = await siyuan.fetchSyncPost(url, data);
    // 根据响应代码判断是否成功，成功则返回响应数据，失败返回 null
    let res = response.code === 0 ? response.data : null;
    return res;
}

/**
 * 执行 SQL 查询的异步函数
 * @param {string} sql SQL 查询语句
 * @returns {Promise<any>} 查询结果
 */
async function sql(sql) {
    // 构造 SQL 查询的数据对象
    let sqldata = {
        stmt: sql,
    };
    // 定义 SQL 查询的接口 URL
    let url = '/api/query/sql';
    // 调用 request 函数发起请求
    return request(url, sqldata);
}

/**
 * 获取文档块的图标
 * @param {string} block_id 文档块的 ID
 * @returns {Promise<{type: string, dom: string, code: string} | null>} 图标信息对象，若不是文档块则返回 null
 */
async function queryDocIcon(block_id) {
    // 如果不是文档块，则不添加图标
    let blocks = await sql(`select * from blocks where id = '${block_id}'`);
    if (blocks?.length === 0 || blocks[0].type !== 'd') {
        return null;
    }

    // 获取文档信息
    let response = await siyuan.fetchSyncPost(
        '/api/block/getDocInfo',
        {
            id: block_id
        }
    );
    // 如果获取文档信息失败，则返回 null
    if (response.code !== 0) {
        return null;
    }

    // 获取文档图标代码和子文件数量
    let icon_code = response.data.icon;
    let sub_file_cnt = response.data.subFileCount;

    // 默认文档图标
    if (icon_code === "") {
        // 根据子文件数量选择默认图标
        let code = sub_file_cnt > 0 ? '📑' : '📄';
        // 构造图标 DOM 元素
        let dom = `<span data-type="text" class="${ICON_CLASS}">${code}</span>`
        return {
            type: 'unicode',
            dom: dom,
            code: code
        }
    }

    // 初始化图标信息对象
    let result = {
        type: "unicode",
        dom: "",
        code: icon_code
    }
    // 使用了自定义的 svg 图标 vs 使用 unicode 编码的 emoji
    if (icon_code.toLowerCase().endsWith(".svg")) {
        // 如果是 SVG 图标，更新图标信息对象
        result.type = "svg";
        result.dom = `<img alt="${icon_code}" class="emoji ${ICON_CLASS}" src="/emojis/${icon_code}" title="${icon_code}">`
    } else if (icon_code.toLowerCase().match(/\.(jpeg|jpg|png)$/)) {
        // 如果是图片图标，更新图标信息对象
        result.type = "image";
        result.dom = `<img alt="${icon_code}" class="${ICON_CLASS}" src="/emojis/${icon_code}" title="${icon_code}" style="width: 1.625em; height: 1.625em; padding-right: 3px; padding-bottom:3px; border-radius: 0.5em">`
    } else {
        // 如果是 Unicode 图标，更新图标信息对象
        result.type = "unicode";
        result.code = String.fromCodePoint(parseInt(icon_code, 16))
        result.dom = `<span data-type="text" class="${ICON_CLASS}">${result.code}</span>`
    }

    return result;
}

/**
 * 判断文本是否为 Unicode 表情符号
 * @param {string} text 要判断的文本
 * @returns {boolean} 是否为 Unicode 表情符号
 */
function isUnicodeEmoji(text) {
    // 定义匹配 Unicode 表情符号的正则表达式
    const regex = /\p{Emoji}/u;
    // 执行正则匹配并返回结果
    return regex.test(text);
}

// 定义配置文件名称常量
const ConfigFile = 'config.json';
// 定义自定义图标文件名称常量
const customIconsFile = 'custom-icons.json';

/**
 * 创建简单对话框的函数
 * @param {{title: string, ele: HTMLElement | DocumentFragment, width?: string, height?: string, callback?: () => void}} args 对话框参数
 * @returns {siyuan.Dialog} 对话框实例
 */
const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    // 创建对话框实例
    const dialog = new siyuan.Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: flex; height: 100%;"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    // 将元素添加到对话框内容区域
    dialog.element.querySelector(".dialog-content").appendChild(args.ele);
    return dialog;
}

// 使用动态样式函数获取动态样式实例
const dynamicStyle = useDynamicStyle();

/**
 * 链接图标插件类
 */
export default class LinkIconPlugin {
    private siyuanPlugin: FMiscPlugin;

    // 绑定事件监听器方法
    Listener = this.listeners.bind(this);

    // 插件配置对象
    config = {
        InsertDocRefIcon: true,
        InsertDocLinkIcon: false
    }

    // 自定义图标数组
    customIcons: { href: string, iconUrl: string }[] = []

    constructor(siyuanPlugin: FMiscPlugin) {
        this.siyuanPlugin = siyuanPlugin;
    }

    /**
     * 插件加载时执行的方法
     */
    async onload() {
        // 创建设置实例
        this.siyuanPlugin.registerMenuTopMenu('link-icon', [
            {
                icon: 'iconPrivatePlugin',
                label: '上传链接图标',
                click: () => {
                    // 调用上传自定义图标函数
                    let ele = uploadCustomIcon((hrefName: string, url: string) => {
                        dialog.destroy();
                        // 处理自定义图标上传事件
                        this.onCustomIconUpload(hrefName, url);
                    });
                    // 创建上传对话框
                    const dialog = simpleDialog({
                        title: "Upload Custom Icon",
                        ele: ele,
                        width: '560px',
                    });
                }
            }
        ])


        // 加载配置文件
        let conf = await this.siyuanPlugin.loadData(ConfigFile);
        // 加载自定义图标文件
        let customIcons = await this.siyuanPlugin.loadData(customIconsFile);
        // 初始化自定义图标数组
        this.customIcons = customIcons || [];
        if (conf) {
            // 更新配置对象
            for (let key in this.config) {
                let val = conf?.[key];
                if (val !== undefined) {
                    this.config[key] = val;
                }
            }
        }
        // 将自定义图标添加到动态样式中
        this.customIcons.forEach(icon => {
            dynamicStyle.addIcon(icon.href, icon.iconUrl, false);
        });
        // 刷新动态样式
        dynamicStyle.flushStyle();
        // 监听加载 protyle 静态资源事件
        this.siyuanPlugin.eventBus.on(EVENT_LOADED_PROTYLE, this.Listener);
    }

    /**
     * 插件卸载时执行的方法
     */
    async onunload() {
        // 取消监听加载 protyle 静态资源事件
        this.siyuanPlugin.eventBus.off(EVENT_LOADED_PROTYLE, this.Listener);
        // 清除动态样式
        dynamicStyle.clearStyle();
    }


    /**
     * 处理自定义图标上传事件的方法
     * @param {string} href 图标关联的链接
     * @param {string} iconUrl 图标 URL
     */
    private onCustomIconUpload(href: string, iconUrl: string) {
        console.debug(`Upload custom icon: ${href} -> ${iconUrl}`);
        // 将新图标添加到动态样式中
        dynamicStyle.addIcon(href, iconUrl);
        // 将新图标添加到自定义图标数组中
        this.customIcons.push({ href, iconUrl });
        // 保存自定义图标文件
        this.siyuanPlugin.saveData(customIconsFile, this.customIcons);
        // Assume it is implemented by others
        // No need to complete this function
    }

    /**
     * 事件监听器方法
     * @param {TEventLoadedProtyle} event 加载 protyle 静态资源事件
     */
    async listeners(event: TEventLoadedProtyle) {
        // 仅给触发加载文档的元素添加块引用图标
        let doc = event.detail?.protyle?.element;

        if (!doc) {
            console.warn("Listener failed to get protyle element");
            return;
        }

        if (this.config.InsertDocRefIcon) {
            // 获取文档中的块引用元素列表
            let ref_list = doc.querySelectorAll("span[data-type='block-ref']");
            ref_list.forEach(async (element) => {
                // 获取块引用元素的 ID
                let block_id = element.attributes["data-id"].value;
                // 在元素前插入文档图标
                this.insertDocIconBefore(element, block_id);
            });
        }

        if (this.config.InsertDocLinkIcon) {
            // 获取文档中的文档链接元素列表
            let url_list = doc.querySelectorAll("span[data-type=a][data-href^=siyuan]");
            url_list.forEach(async (element) => {
                // 获取文档链接元素的 href 属性值
                let data_href = element.attributes["data-href"].value;
                // 定义匹配文档链接的正则表达式
                const pattern = new RegExp("siyuan:\\/\\/blocks\\/(.*)");
                // 执行正则匹配
                const result = data_href.match(pattern);
                if (result) {
                    // 获取匹配到的块 ID
                    const block_id = result[1];
                    // 在元素前插入文档图标
                    this.insertDocIconBefore(element, block_id);
                }
            });
        }
    }

    /**
     * 在元素前插入文档图标的方法
     * @param {HTMLSpanElement} element 要插入图标的元素
     * @param {string} block_id 文档块的 ID
     * @returns {Promise<boolean>} 是否插入成功
     */
    async insertDocIconBefore(element, block_id) {
        // 获取元素的前一个兄弟元素
        let previes_sibling = element.previousElementSibling;
        // 如果前面的 span 元素是我们自定义插入的 icon, 就直接退出不管
        // 不过实测由于思源会把自定义的 class 删掉, 所以这行逻辑没啥卵用...
        if (previes_sibling !== null && previes_sibling?.classList?.contains(ICON_CLASS)) {
            return false;
        }
        // 获取前一个兄弟元素的文本内容
        let previous_txt = previes_sibling?.innerText;
        if (isUnicodeEmoji(previous_txt)) {
            return true;
        }

        // let block_id = element.attributes["data-id"].value;
        // 获取文档块的图标信息
        let result = await queryDocIcon(block_id);
        if (result === null) {
            return false;
        }
        // 思源有可能把 icon 的 span 元素保留了下来, 所以如果发现前面的 element 就是 icon, 就不需要再次插入
        if (result.type === 'unicode' && result.code === previous_txt?.trim()) {
            previes_sibling.classList.add(ICON_CLASS);
            return true;
        }
        // 在元素前插入图标 DOM 元素
        element.insertAdjacentHTML('beforebegin', result.dom);
        return true;
    }
}