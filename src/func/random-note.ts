import { openTab, showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { sql } from "@/api";

export let name = "RandomNote";
export let enabled = false;

export const declareToggleEnabled = {
    title: '🎲 随机浏览',
    description: '点击顶栏图标随机跳转到一篇文档或块',
    defaultEnabled: false
};

let plugin: FMiscPlugin = null;
let topbarElement: HTMLElement = null;
let cacheIds: string[] = [];

const config = {
    rangeSQL: "SELECT id FROM blocks WHERE type = 'd'",
    limitNum: 30,
};

export const declareModuleConfig: IFuncModule['declareModuleConfig'] = {
    key: "random-note",
    title: "随机浏览",
    load: (itemValues: any) => {
        if (itemValues) {
            Object.assign(config, itemValues);
        }
    },
    dump: () => structuredClone(config),
    items: [
        {
            key: 'rangeSQL',
            type: 'textarea' as const,
            title: '随机浏览的范围',
            description: '通过 SQL 限定随机浏览的范围，如 SELECT id FROM blocks WHERE type = \'d\'',
            placeholder: "SELECT id FROM blocks WHERE type = 'd'",
            get: () => config.rangeSQL,
            set: (value: string) => {
                config.rangeSQL = value;
                cacheIds = [];
            }
        },
        {
            key: 'limitNum',
            type: 'number' as const,
            title: '缓存数量',
            description: '每次预查询缓存的随机条目数量',
            placeholder: '默认一次查询 30 条缓存',
            get: () => config.limitNum,
            set: (value: number) => {
                config.limitNum = value;
                cacheIds = [];
            }
        }
    ]
};

/**
 * 执行随机跳转
 */
async function execRandomNote() {
    let sqlRange = config.rangeSQL?.trim();
    if (!sqlRange) {
        sqlRange = "SELECT id FROM blocks WHERE type = 'd'";
    }

    if (cacheIds.length === 0) {
        // 先立即查 1 条并跳转
        const data = await sql(
            `SELECT id FROM (${sqlRange}) ORDER BY RANDOM() LIMIT 1`
        );
        if (!data || data.length === 0) {
            showMessage("随机浏览：未找到任何匹配的条目");
            return;
        }
        openTab({
            app: plugin.app,
            doc: { id: data[0].id },
        });

        // 后台预缓存多条
        const limitNum = config.limitNum || 30;
        sql(`SELECT id FROM (${sqlRange}) ORDER BY RANDOM() LIMIT ${limitNum}`).then((res) => {
            if (res && res.length > 0) {
                cacheIds = res.map((item: any) => item.id);
            }
        });
    } else {
        openTab({
            app: plugin.app,
            doc: { id: cacheIds.pop() },
        });
    }
}

/**
 * 加载模块
 */
export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    plugin = plugin_;
    enabled = true;

    topbarElement = plugin.addTopBar({
        icon: 'iconRandomNote',
        title: '随机浏览',
        position: 'right',
        callback: execRandomNote
    });
};

/**
 * 卸载模块
 */
export const unload = (plugin_?: FMiscPlugin) => {
    if (!enabled) return;
    if (topbarElement) {
        topbarElement.remove();
        topbarElement = null;
    }
    cacheIds = [];
    plugin = null;
    enabled = false;
};
