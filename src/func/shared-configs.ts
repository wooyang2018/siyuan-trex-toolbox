/**
 * 全局共享配置模块
 * @description 管理全局配置项和用户自定义常量
 */
import { importJavascriptFile, createJavascriptFile } from "@frostime/siyuan-plugin-kits";

export const name = "global-configs";
export const enabled = true;

interface IDefaultConfigs {
    codeEditor: string;
}

/**
 * 全局配置常量
 *
 * @description 这些值很少需要改，所以不放进设置界面，直接在这里改源码即可。
 *              改完需要重新构建插件（pnpm run build）。
 */
const CONFIGS: IDefaultConfigs = {
    /** 在本地打开代码文件时调用的命令；默认用 VS Code 的 code */
    codeEditor: 'code',
};

export const sharedConfigs = (key: keyof IDefaultConfigs) => CONFIGS[key] ?? '';

/** 用户自定义常量文件名 */
export const userConstJsName = 'custom.user-constants.js';

/** 默认用户常量文件内容 */
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

/** 默认常量（会与用户常量合并） */
export const defaultConstants = {
    promptSummarize: '',
    quickDraftWinSize: {
        width: 1000,
        height: 600
    }
};

/** 合并后的常量（在整个应用中使用） */
export let userConst: typeof defaultConstants = { ...defaultConstants };

/**
 * 从 JS 文件加载用户自定义常量
 * @description 如果文件不存在，创建默认文件
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

/**
 * 监控标签页更新并应用自定义样式
 * @param targetTexts 需要监控的标签文本数组
 */
export const MonitorTabUpdates = (targetTexts: string[]) => {
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type !== 'childList') continue;
            
            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;
                
                const targetElements = document.querySelectorAll(
                    'html[data-light-theme="Savor"] .layout__center .fn__flex-column > .fn__flex > .layout-tab-bar .item:not(.item--readonly).item--focus'
                );
                
                targetElements.forEach((element) => {
                    Array.from(element.children).forEach((child) => {
                        if (child.tagName === 'SPAN' && targetTexts.includes(child.textContent || '')) {
                            element.setAttribute('data-content', child.textContent || '');
                        }
                    });
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
};
