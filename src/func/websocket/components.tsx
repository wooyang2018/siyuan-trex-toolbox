/**
 * WebSocket 组件
 * 
 * @description WebSocket 状态显示和配置管理组件
 * @author frostime
 */
import { type Component, createSignal, onCleanup } from "solid-js";
import { getAlive } from ".";
import FormWrap from "@/libs/components/Form/form-wrap";
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { currentHandlers, Handlers, moduleJsName } from "./handlers";
import { FormInput } from "@/libs/components/Form";
import { showMessage } from "siyuan";
import { sharedConfigs } from "../shared-configs";
import WebSocketManager from "./ws-manager";
import { Rows } from "@/libs/components/Elements/Flex";

let timer: NodeJS.Timeout | null = null;

let cp: any;
try {
    cp = window?.require?.('child_process');
} catch (e) {
    cp = null;
}

/**
 * WebSocket 状态显示组件
 */
export const WebSocketStatus: Component = () => {
    const [alive, setAlive] = createSignal(false);
    
    if (timer) clearInterval(timer);
    setAlive(getAlive());
    
    timer = setInterval(() => {
        setAlive(getAlive());
        console.debug('Websocket Alive:', alive?.());
    }, 5000);

    onCleanup(() => {
        console.log("WebSocket Status Cleanup");
        if (timer) clearInterval(timer);
        timer = null;
    });
    
    return (
        <span class="b3-label">
            {alive() ? "🟢" : "🔴"}
        </span>
    );
}

const example = `{
    channel: "siyuan-trex-toolbox",
    message: { command: "<command-name>", body: "<command-argument>" }
}`.trim();

/**
 * WebSocket 配置面板
 */
export const Configs = () => {
    const plugin = thisPlugin();
    
    const current = () => {
        const names = Object.entries(currentHandlers)
            .filter(([, handler]) => handler)
            .map(([key]) => key);
        return names.join(', ');
    }
    
    return (
        <>
            <FormWrap
                title="Websocket"
                description="当前 Websocket 的运行状态"
                direction="row"
                action={<WebSocketStatus />}
            >
                <div 
                    class="b3-label__text" 
                    style={{ display: 'inline-block' }} 
                    innerText="向 /api/broadcast/postMessage 发送内核消息, 格式如下:" 
                />
                <pre style={{ margin: '0px' }}>
                    <code style={{ 'font-family': 'var(--b3-font-family-code)' }}>
                        {example}
                    </code>
                </pre>
                <div 
                    class="b3-label__text" 
                    style={{ display: 'inline-block' }} 
                    innerText={`Handlers: ${current()}`} 
                />
            </FormWrap>
            
            <FormWrap
                title="自定义消息处理函数"
                description={`编辑 /data/storage/petal/${plugin.name}/${moduleJsName} 文件`}
            >
                <Rows>
                    <FormInput
                        type="button"
                        button={{
                            label: '编辑',
                            callback: () => {
                                if (!cp) {
                                    showMessage('非桌面端环境无法编辑代码', 3000, 'error');
                                    return;
                                }
                                const dataDir = window.siyuan.config.system.dataDir;
                                const jsPath = `${dataDir}/storage/petal/${plugin.name}/${moduleJsName}`;
                                const editorCmd = `${sharedConfigs('codeEditor')} ${jsPath}`;
                                
                                try {
                                    cp.exec(editorCmd);
                                } catch (error) {
                                    showMessage(`打开编辑器失败: ${error.message}`, 3000, 'error');
                                }
                            }
                        }}
                    />
                    <FormInput
                        type="button"
                        button={{
                            label: '重新导入',
                            callback: async () => {
                                const handlers = await Handlers();
                                const wsManager = WebSocketManager.getInstance();
                                
                                Object.entries(handlers).forEach(([key, handler]) => {
                                    wsManager.registerMessageHandler(key, handler);
                                });
                                
                                const names = Object.keys(handlers);
                                showMessage(`导入成功: ${names.join(', ')}`, 3000);
                            }
                        }}
                    />
                </Rows>
            </FormWrap>
        </>
    );
}
