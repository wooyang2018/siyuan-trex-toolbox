/**
 * WebSocket - WebSocket通信
 * 
 * @description 启用WebSocket功能，支持实时通信
 * @author frostime
 */
import type FMiscPlugin from "@/index";
import WebSocketManager from "./ws-manager";
import { api } from "@frostime/siyuan-plugin-kits";
import { Configs } from "./components";
import { Handlers } from "./handlers";

export let name = "WebSocket";
export let enabled = false;

export const declareToggleEnabled = {
    title: '💬 WebSocket',
    description: '启用 WebSocket 功能',
    defaultEnabled: false
};

/**
 * 加载WebSocket功能
 */
export const load = async (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;

    // 检查是否在小窗模式
    if (document.body.classList.contains('body--window')) {
        console.warn(`Trex-Toolbox::WebSocket 不在 SiYuan mini windows 中运行.`);
        return;
    }

    // 检查是否已存在连接
    const info = await api.request('/api/broadcast/getChannelInfo', { name: plugin.name });
    if (info.channel?.count > 0) {
        console.info('已经存在 Web Socket 服务，无需重复连接.');
        console.log(info.channel);
        return;
    }

    // 创建WebSocket连接
    const wsManager = WebSocketManager.create(plugin, {
        reconnectInterval: 5000,
        maxReconnectAttempts: 10
    });
    wsManager.createWebSocket();

    // 注册消息处理器
    const handlers = await Handlers();
    Object.entries(handlers).forEach(([key, handler]) => {
        wsManager.registerMessageHandler(key, handler);
    });
}

/**
 * 卸载WebSocket功能
 */
export const unload = () => {
    if (!enabled) return;
    enabled = false;
    WebSocketManager.destroyInstance();
}

/**
 * 获取连接状态
 */
export const getAlive = () => {
    const wsManager = WebSocketManager.getInstance();
    return wsManager?.isOpen() ?? false;
}

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'WebSocket',
    load: () => { },
    items: [],
    customPanel: () => Configs()
}