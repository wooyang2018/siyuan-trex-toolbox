/**
 * 全局共享配置模块
 * 管理全局配置项和用户自定义常量
 */
import { createSettingAdapter } from "@frostime/siyuan-plugin-kits";
import { importJavascriptFile, createJavascriptFile } from "@frostime/siyuan-plugin-kits";

export let name = "global-configs";
export let enabled = true;

interface IDefaultConfigs {
    codeEditor: string;
}

// ============ 配置定义 ============
const configDefinitions = [
    {
        key: 'codeEditor',
        type: 'textinput' as const,
        value: 'code',
        title: '打开代码编辑器',
        description: '在本地打开代码文件的命令; 默认为 code, 表示使用 VS Code 打开',
        devicewise: true
    }
];

const configAdapter = createSettingAdapter(configDefinitions);

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "global-configs",
    title: "公用配置",
    load: (itemValues: any) => configAdapter.init(itemValues),
    dump: () => configAdapter.dump(),
    items: configDefinitions.map(item => ({
        ...item,
        get: () => configAdapter.get(item.key),
        set: (value: any) => configAdapter.set(item.key, value)
    }))
};

export const sharedConfigs = (key: keyof IDefaultConfigs) => configAdapter.get(key);

// ============ 用户自定义常量 ============
export const userConstJsName = 'custom.user-constants.js';

// 默认用户常量文件内容
const DEFAULT_USER_CONST_CODE = `
/**
 * 用户自定义常量
 * 在这里定义你自己的常量，它们会与默认常量合并
 */
const userConstants = {
    // 在这里添加你的自定义常量
};

export default userConstants;
`.trimStart();

// 默认常量（会与用户常量合并）
export const defaultConstants = {
    promptSummarize: ``,
    quickDraftWinSize: {
        width: 1000,
        height: 600
    }
};

// 合并后的常量（在整个应用中使用）
export let userConst: typeof defaultConstants = { ...defaultConstants };

/**
 * 从 JS 文件加载用户自定义常量
 * 如果文件不存在，创建默认文件
 */
const reloadUserConstants = async (): Promise<void> => {
    try {
        const module = await importJavascriptFile(userConstJsName);
        if (!module) {
            createJavascriptFile(DEFAULT_USER_CONST_CODE, userConstJsName);
            return;
        }
        
        // 合并用户常量与默认常量
        const userConstants: Record<string, any> = module.default;
        userConst = { ...defaultConstants, ...userConstants };
        console.log('User constants loaded successfully');
    } catch (error) {
        console.error('Failed to load user constants:', error);
    }
};

export const load = async () => {
    await reloadUserConstants();
    globalThis.fmisc['reloadUserConstants'] = reloadUserConstants;
};

export const unload = () => {
    userConst = { ...defaultConstants };
};

// ============ 标签页更新监控 ============

/**
 * 监控标签页更新并应用自定义样式
 * @param targetTexts 需要监控的标签文本数组
 */
export function MonitorTabUpdates(targetTexts: string[]) {
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type !== 'childList') continue;
            
            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;
                
                const targetElements = document.querySelectorAll(
                    'html[data-light-theme="Savor"] .layout__center .fn__flex-column > .fn__flex > .layout-tab-bar .item:not(.item--readonly).item--focus'
                );
                
                targetElements.forEach((element) => {
                    const children = element.children;
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (child.tagName === 'SPAN' && targetTexts.includes(child.textContent || '')) {
                            element.setAttribute('data-content', child.textContent || '');
                        }
                    }
                });
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 动态添加样式
    const style = document.createElement('style');
    style.innerHTML = `
        html[data-light-theme="Savor"] .layout__center .fn__flex-column > .fn__flex > .layout-tab-bar {
            & .item:not(.item--readonly) {
                ${targetTexts.map(text => `
                    &.item--focus[data-content="${text}"] {
                        &::after {
                            display: none;
                        }
                    }
                `).join('')}
            }
        }`;
    document.head.appendChild(style);
}
