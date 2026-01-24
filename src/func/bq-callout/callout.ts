/**
 * Callout 样式定义和工具函数
 * 
 * @description 提供 Callout 样式配置和按钮创建功能
 * @author frostime
 */
import { sql } from "./api";

/**
 * Callout 名称映射表
 */
const CALLOUT_NAMES: Record<string, string> = {
    "error": "异常",
    "warn": "警告",
    "bug": "Bug",
    "check": "确认",
    "light": "灵感",
    "question": "问题",
    "wrong": "错误",
    "info": "信息",
    "pen": "笔记",
    "note": "注记",
    "bell": "提醒",
    "default": "恢复默认样式"
};

/**
 * 首字母大写
 */
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * 获取 Callout 显示名称
 */
export const calloutName = (callout: ICallout) => {
    const name = callout.custom !== true && CALLOUT_NAMES[callout.id] 
        ? CALLOUT_NAMES[callout.id] 
        : callout.id;
    return capitalize(name);
}

/**
 * 查询 Callout 块
 */
export const queryCalloutBlock = async (id: string, custom: boolean): Promise<Block[]> => {
    const name = custom ? 'custom-callout' : 'custom-b';
    return sql(`
        SELECT B.*
        FROM blocks AS B
        WHERE B.id IN (
            SELECT A.block_id
            FROM attributes AS A
            WHERE A.name = '${name}'
            AND A.value = '${id}'
        ) limit 999;
    `);
}

export const DefaultCallouts: ICallout[] = [
    {
        id: 'info',
        icon: 'ℹ',
        title: '',
        bg: {
            light: 'rgba(221, 235, 241, .5)',
            dark: 'rgba(54, 73, 84, .3)'
        },
        box: {
            light: 'rgba(221, 235, 241, 1)',
            dark: 'rgba(54, 73, 84, 1)'
        }
    },
    {
        id: 'light',
        icon: '💡',
        title: '',
        bg: {
            light: 'rgba(250, 235, 221, .5)',
            dark: 'rgba(89, 79, 59, .3)'
        },
        box: {
            light: 'rgba(250, 235, 221, 1)',
            dark: 'rgba(89, 79, 59, 1)'
        }
    },
    {
        id: 'bell',
        icon: '🔔',
        title: '',
        bg: {
            light: 'rgba(246, 225, 205, .5)',
            dark: 'rgba(89, 74, 58, .3)'
        },
        box: {
            light: 'rgba(246, 225, 205, 1)',
            dark: 'rgba(89, 74, 58, 1)'
        }
    },
    {
        id: 'check',
        icon: '✅',
        title: '',
        bg: {
            light: 'rgba(221, 237, 226, .5)',
            dark: 'rgba(53, 76, 75, .3)'
        },
        box: {
            light: 'rgba(221, 237, 226, 1)',
            dark: 'rgba(53, 76, 75, 1)'
        }
    },
    {
        id: 'question',
        icon: '❓',
        title: '',
        bg: {
            light: 'rgba(244, 223, 235, .5)',
            dark: 'rgba(83, 59, 76, .3)'
        },
        box: {
            light: 'rgba(244, 223, 235, 1)',
            dark: 'rgba(83, 59, 76, 1)'
        }
    },
    {
        id: 'warn',
        icon: '⚠',
        title: '',
        bg: {
            light: 'rgba(251, 243, 219, .5)',
            dark: 'rgba(89, 86, 59, .3)'
        },
        box: {
            light: 'rgba(251, 243, 219, 1)',
            dark: 'rgba(89, 86, 59, 1)'
        }
    },
    {
        id: 'wrong',
        icon: '❌',
        title: '',
        bg: {
            light: 'rgba(251, 228, 228, .5)',
            dark: 'rgba(89, 65, 65, .3)'
        },
        box: {
            light: 'rgba(251, 228, 228, 1)',
            dark: 'rgba(89, 65, 65, 1)'
        }
    },
    {
        id: 'error',
        icon: '🚫',
        title: '',
        bg: {
            light: 'rgba(251, 228, 228, .5)',
            dark: 'rgba(89, 65, 65, .3)'
        },
        box: {
            light: 'rgba(251, 228, 228, 1)',
            dark: 'rgba(89, 65, 65, 1)'
        }
    },
    {
        id: 'bug',
        icon: '🐛',
        title: '',
        bg: {
            light: 'rgba(234, 228, 242, .5)',
            dark: 'rgba(68, 63, 87, .3)'
        },
        box: {
            light: 'rgba(234, 228, 242, 1)',
            dark: 'rgba(68, 63, 87, 1)'
        }
    },
    {
        id: 'note',
        icon: '📓',
        title: '',
        bg: {
            light: 'rgba(198, 203, 208, .5)',
            dark: 'rgba(35, 38, 40, .3)'
        },
        box: {
            light: 'rgba(198, 203, 208, 1)',
            dark: 'rgba(35, 38, 40, 1)'
        }
    },
    {
        id: 'pen',
        icon: '🖋',
        title: '',
        bg: {
            light: 'rgba(235, 236, 237, .5)',
            dark: 'rgba(69, 75, 78, .3)'
        },
        box: {
            light: 'rgba(235, 236, 237, 1)',
            dark: 'rgba(69, 75, 78, 1)'
        }
    }
]

/**
 * 创建 Callout 按钮
 */
export function createCalloutButton(selectid: BlockId, callout: ICallout): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "b3-menu__item";
    button.setAttribute("data-node-id", selectid);
    
    const name = callout.custom ? 'callout' : 'b';
    button.setAttribute("custom-attr-name", name);
    button.setAttribute("custom-attr-value", callout.id);
    button.innerHTML = `<span class="b3-menu__label">${callout.icon}${calloutName(callout)}</span>`;
    
    return button;
}

/**
 * 创建恢复默认样式按钮
 */
export function createRestoreButton(selectid: BlockId): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "b3-menu__item";
    button.setAttribute("data-node-id", selectid);
    button.setAttribute("custom-attr-name", "b");
    button.setAttribute("custom-attr-value", "");
    button.innerHTML = `<svg class="b3-menu__icon" style=""><use xlink:href="#iconRefresh"></use></svg><span class="b3-menu__label">${i18n.button.default}</span>`;
    
    return button;
}
