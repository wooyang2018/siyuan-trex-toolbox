/**
 * Migrate Refs - 引用迁移工具
 * 
 * @description 将引用迁移到同一个笔记本中
 * @author frostime
 */
import { subMenu, type IGetDocInfo, type IProtyle } from "siyuan";
import type FMiscPlugin from "@/index";
import { getBlockByID, sql } from "@/api";
import { solidDialog } from "@/libs/dialog";
import RefsTable from "./refs-tables";
import { fb2p } from "./search";

export let name = "MigrateRefs";
export let enabled = false;

export const declareToggleEnabled = {
    title: '💭 迁移引用',
    description: '将引用迁移到同一个笔记本中',
    defaultEnabled: false
};

/**
 * 搜索引用块
 */
const searchRefs = async (id: BlockId) => {
    const query = `
        select * from blocks where id in (
            select block_id from refs where def_block_id = '${id}'
        ) order by updated desc limit 999;
    `;
    return await sql(query);
}

/**
 * 文档图标点击事件处理
 */
const clickDocIcon = async (event: CustomEvent<{
    menu: subMenu,
    protyle: IProtyle,
    data: IGetDocInfo,
}>) => {
    const { menu, data } = event.detail;
    const { name, rootID } = data;

    menu.addItem({
        icon: 'iconEmoji',
        label: '迁移反链',
        click: async () => {
            const defBlock = await getBlockByID(rootID);
            const queryRefBlocks = async (doFb2p?: boolean) => {
                let blocks = await searchRefs(rootID);
                if (doFb2p) {
                    blocks = await fb2p(blocks); // 依赖于 data-query 中的功能
                }
                return blocks;
            };
            
            solidDialog({
                title: `Refs ${name}`,
                loader: () => RefsTable({ defBlock, queryRefBlocks }),
                width: '1250px',
                maxWidth: '90%',
                maxHeight: '80%'
            });
        }
    });
}

/**
 * 加载引用迁移功能
 */
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    enabled = true;
    plugin.eventBus.on('click-editortitleicon', clickDocIcon);
}

/**
 * 卸载引用迁移功能
 */
export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    enabled = false;
    plugin.eventBus.off('click-editortitleicon', clickDocIcon);
}