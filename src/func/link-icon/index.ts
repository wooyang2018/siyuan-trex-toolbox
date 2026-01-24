/**
 * Link Icon - 链接图标显示
 * 
 * @description 在文档链接前显示自定义图标
 */
import './style.css';
import type FMiscPlugin from "@/index";
import LinkIconPlugin from "./link-icon";

export let name = "LinkIcon";
export let enabled = false;
let pluginInstance: LinkIconPlugin | null = null;

export const declareToggleEnabled = {
    title: '🔗 链接图标',
    description: '在文档链接前显示图标',
    defaultEnabled: false
};

/**
 * 加载链接图标插件
 */
export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    addIconPrivatePlugin(plugin_);
    pluginInstance = new LinkIconPlugin(plugin_);
    pluginInstance.onload();
}

/**
 * 卸载链接图标插件
 */
export const unload = (plugin_: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    pluginInstance?.onunload();
    pluginInstance = null;
}

/**
 * 添加私有插件图标
 */
const addIconPrivatePlugin = (plugin: FMiscPlugin) => {
    if (document.querySelector('symbol#iconPrivatePlugin')) return;
    
    const symbol = `<symbol id="iconPrivatePlugin" xmlns="http://www.w3.org/2000/svg" viewBox="2 2 32 32" xml:space="preserve">
                        <path d="M25.7 5.9c-2.8-2.7-6.4-4-10.3-3.9C8.2 2.3 2.3 8.2 2 15.5c-.2 6.1 3.5 11.6 9.2 13.7.5.2 1 .3 1.4.3.9 0 1.7-.3 2.4-.8 1.2-.8 1.9-2.2 1.9-3.6v-2.2c2.3-.5 4-2.5 4-4.9v-4c0-.6-.4-1-1-1h-1v-3c0-.6-.4-1-1-1s-1 .4-1 1v3h-2v-3c0-.6-.4-1-1-1s-1 .4-1 1v3h-1c-.6 0-1 .4-1 1v4c0 2.4 1.7 4.4 4 4.9v2.2c0 .8-.4 1.5-1 2-.6.4-1.4.5-2.1.3-4.8-1.9-8-6.6-7.8-11.9C4.2 9.4 9.4 4.2 15.5 4c3.3-.1 6.4 1.1 8.8 3.3C26.7 9.6 28 12.7 28 16c0 5-3.1 9.5-7.8 11.2-.5.2-.8.8-.6 1.3s.8.8 1.3.6c5.4-2 9.1-7.3 9.1-13.1 0-3.8-1.5-7.4-4.3-10.1" transform="scale(1.125)"/>
                    </symbol>`;
    plugin.addIcons(symbol);
}
