/**
 * Mini Window - 中键点击打开小窗功能
 * 
 * @description 「网页视图」插件中打开小窗口的功能
 * @open_source 摘抄自「网页视图」插件
 * @author frostime
 */
import { openWindow } from "siyuan";
import { updateStyleDom } from "@frostime/siyuan-plugin-kits";


export const declareToggleEnabled = {
    title: '🖥️ 中键小窗',
    description: '中键点击元素时打开独立小窗',
    defaultEnabled: true
};


/**
 * 检查当前是否在小窗模式
 */
const InMiniWindow = () => document.querySelector('body')?.classList.contains('body--window');

/**
 * 计算窗口居中位置
 */
const pos = (loc: number, size: number) => Math.max(loc - size / 2, 0);

/**
 * 打开思源小窗
 * @param id 块ID
 * @param e 鼠标事件
 */
const openSiyuanWindow = (id: BlockId, e?: MouseEvent): void => {
    openWindow({
        position: {
            x: pos(e?.x || 0, 750),
            y: pos(e?.y || 0, 500),
        },
        height: 500,
        width: 750,
        doc: { id }
    });
}

const id = 'trex-toolbox__min-win';


const StyleHideAtFullscreen = `
.protyle.fullscreen {
    & .protyle-breadcrumb__bar,
    & button[data-type] {
        display: none;
    }
}
.layout__center .fn__flex-column > .fn__flex > .layout-tab-bar {
    & .item:not(.item--readonly) {
        &.item--focus {
            &::after {
                display: none;
            }
        }
    }
}
`;

export let name = 'MiniWindow';
export let enabled = false;

/**
 * 加载小窗功能
 */
export function load() {
    if (enabled) return;
    
    document.addEventListener('mousedown', onMouseClick);
    enabled = true;

    if (InMiniWindow()) {
        updateStyleDom(id, StyleHideAtFullscreen);
    }
}

/**
 * 卸载小窗功能
 */
export function unload() {
    if (!enabled) return;
    
    document.removeEventListener('mousedown', onMouseClick);
    enabled = false;
}


/**
 * 鼠标点击事件处理
 */
const onMouseClick = (e: MouseEvent) => {
    if (e.button !== 1) return; // 仅处理中键点击
    
    const blockId = getBlockID(e);
    if (blockId) {
        e.preventDefault();
        e.stopPropagation();
        openSiyuanWindow(blockId, e);
    }
}

// 块ID和URL正则表达式 (From Zuoqiu-Yingyi)
const Regex = {
    id: /^\d{14}-[0-9a-z]{7}$/,
    url: /^siyuan:\/\/blocks\/(\d{14}-[0-9a-z]{7})/,
}

/**
 * 从事件中查询块ID
 * @param e 事件对象
 * @returns 块ID或undefined
 * @see https://github.com/Zuoqiu-Yingyi/siyuan-packages-monorepo
 */
export function getBlockID(e: Event): BlockId | void {
    const path = e.composedPath();
    
    for (const element of path) {
        const dataset = (element as HTMLElement).dataset;
        if (!dataset) continue;
        
        // 按优先级检查各种可能的ID字段
        const idFields = ['nodeId', 'id', 'oid', 'avId', 'colId', 'rootId'];
        for (const field of idFields) {
            const value = dataset[field];
            if (value && Regex.id.test(value)) {
                return value;
            }
        }
    }
}
