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

const RANGE_SQL = "SELECT id FROM blocks WHERE type = 'd'";
const CACHE_LIMIT = 30;

/**
 * 执行随机跳转
 */
async function execRandomNote() {
    if (cacheIds.length === 0) {
        const data = await sql(
            `SELECT id FROM (${RANGE_SQL}) ORDER BY RANDOM() LIMIT 1`
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
        sql(`SELECT id FROM (${RANGE_SQL}) ORDER BY RANDOM() LIMIT ${CACHE_LIMIT}`).then((res) => {
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
