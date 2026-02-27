/**
 * Transfer Ref - 引用转移工具
 * 
 * @description 将一个块的引用批量转移到另一个块
 * @author frostime
 */
import { Menu } from "siyuan";
import type FMiscPlugin from "@/index";
import TransferRefs from "./transfer-refs";
import { solidDialog } from "@/libs/dialog";

let plugin: FMiscPlugin = null;

export let name = "TransferRef";
export let enabled = false;

export const declareToggleEnabled = {
    title: '💭 转移引用',
    description: '将一个块的引用批量转移到另一个块',
    defaultEnabled: false
};

/**
 * 显示转移引用对话框
 */
const showTransferDialog = (srcBlock: BlockId) => {
    solidDialog({
        title: '转移引用',
        loader: () => TransferRefs({ plugin, srcBlockID: srcBlock }),
        width: '1450px',
        maxWidth: '90%',
        height: '600px'
    });
}

/**
 * 块菜单点击事件处理
 */
function onBlockGutterClicked({ detail }: any) {
    if (detail.blockElements.length > 1) return;
    
    const menu: Menu = detail.menu;
    const protype: HTMLElement = detail.blockElements[0];
    const blockId = protype.getAttribute('data-node-id');
    
    menu.addItem({
        label: '转移引用',
        icon: "iconTransfer",
        click: () => showTransferDialog(blockId)
    });
}

/**
 * 文档菜单点击事件处理
 */
function onDocGutterClicked({ detail }: any) {
    const menu: Menu = detail.menu;
    const blockId = detail.data.id;
    
    menu.addItem({
        label: '转移引用',
        icon: "iconTransfer",
        click: () => showTransferDialog(blockId)
    });
}

/**
 * 加载转移引用功能
 */
export const load = (plugin_: FMiscPlugin) => {
    if (enabled) return;
    plugin_.eventBus.on("click-blockicon", onBlockGutterClicked);
    plugin_.eventBus.on("click-editortitleicon", onDocGutterClicked);
    plugin = plugin_;
    enabled = true;
}

/**
 * 卸载转移引用功能
 */
export const unload = (plugin_: FMiscPlugin) => {
    if (!enabled) return;
    plugin_.eventBus.off("click-blockicon", onBlockGutterClicked);
    plugin_.eventBus.off("click-editortitleicon", onDocGutterClicked);
    plugin = null;
    enabled = false;
}
