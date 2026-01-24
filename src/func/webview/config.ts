/**
 * Webview 自定义 URL 配置管理
 */
import { thisPlugin } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";
import { sharedConfigs } from "../shared-configs";

let cp: any;
try {
    cp = window?.require?.('child_process');
} catch (e) {
    cp = null;
}

const customUrlConfig = 'custom-urls.json';

interface CustomUrl {
    name: string;
    url: string;
    icon?: string;
}

let customUrls: CustomUrl[] = [];

/**
 * 获取自定义 URL 列表
 */
export const getCustomUrls = async () => {
    if (customUrls.length > 0) {
        return customUrls;
    }
    await loadCustomUrls();
    return customUrls;
};

/**
 * 加载自定义 URL 配置
 */
const loadCustomUrls = async () => {
    const plugin = thisPlugin();
    const savedUrls = await plugin.loadData(customUrlConfig);
    if (savedUrls) {
        customUrls = savedUrls;
    }
};

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: 'CustomUrls',
    title: '打开新标签页',
    load: loadCustomUrls,
    items: [{
        type: 'button',
        title: '自定义URL列表',
        key: 'customUrlsButton',
        description: `编辑 /data/storage/petal/siyuan-trex-toolbox/${customUrlConfig} 配置文件`,
        get: () => customUrls,
        set: (urls: CustomUrl[]) => {
            customUrls = urls;
        },
        button: {
            label: '编辑',
            callback: () => {
                if (!cp) {
                    showMessage('非桌面端环境无法编辑代码', 3000, 'error');
                    return;
                }
                const plugin = thisPlugin();
                const dataDir = window.siyuan.config.system.dataDir;
                const jsonPath = `${dataDir}/storage/petal/${plugin.name}/${customUrlConfig}`;
                const editorCmd = `${sharedConfigs('codeEditor')} ${jsonPath}`;
                try {
                    cp.exec(editorCmd);
                } catch (error) {
                    showMessage(`打开编辑器失败: ${error.message}`, 3000, 'error');
                }
            }
        }
    }],
};