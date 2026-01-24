/**
 * 块移动工具
 * 
 * @description 提供各种块移动和迁移功能
 * @author frostime
 */
import {
    getChildBlocks, moveBlock, prependBlock, foldBlock,
    unfoldBlock, deleteBlock, moveDocs, createDocWithMd,
    getIDsByHPath, sql, getBlockByID
} from "@/api";
import { createDiary, searchDailynote } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";

/**
 * 移动块到文档
 */
const moveBlockToDoc = async (block: Block, docId: string) => {
    if (block.type === 'i') {
        // 列表项需要先创建列表容器
        const ans = await prependBlock('markdown', '* ', docId);
        const newListId = ans[0].doOperations[0].id;
        await moveBlock(block.id, null, newListId);
        console.debug(`移动列表项 ${block.id} --> ${newListId}`);
        
        // 删除多余的空列表项
        const allChild = await getChildBlocks(newListId);
        await deleteBlock(allChild[1].id);
    } else if (block.type === 'h') {
        // 标题块处理折叠状态
        const isFolded = block.ial.includes('fold="1"');
        if (!isFolded) {
            await foldBlock(block.id);
        }
        await moveBlock(block.id, null, docId);
        if (!isFolded) {
            setTimeout(() => unfoldBlock(block.id), 500);
        }
    } else {
        await moveBlock(block.id, null, docId);
    }
}

/**
 * 确保路径存在（通过 HPath）
 */
const ensureHpath = async (box: NotebookId, hpath: string) => {
    const docs = await getIDsByHPath(box, hpath);
    return docs.length > 0 ? docs[0] : null;
}

/**
 * 确保路径存在（通过 Path）
 */
const ensurePath = async (box: NotebookId, path: string) => {
    const docs = await sql(`SELECT * FROM blocks WHERE box = '${box}' AND path = '${path}'`);
    return docs.length > 0 ? docs[0].id : null;
}

/**
 * 将块作为文档移动
 */
const moveBlockAsDoc = async (block: Block, box: NotebookId, parent: {
    path?: string,
    hpath?: string
}) => {
    // 文档移动
    if (block.type === 'd' && parent?.path) {
        if (block.box === box && block.path.startsWith(parent.path.replace('.sy', ''))) {
            showMessage(`原文档已经在目标文档的目录树下, 无需重复移动`, 3000, 'error');
            return false;
        }

        if (!await ensurePath(box, parent.path)) {
            showMessage(`目标路径 ${parent.path} 不存在`, 3000, 'error');
            return false;
        }

        await moveDocs([block.path], box, parent.path);
        return true;
    }

    // 块转文档
    if (!parent?.hpath) {
        showMessage(`无法找到目标路径 hpath`, 3000, 'error');
        return false;
    }

    if (!await ensureHpath(box, parent.hpath)) {
        showMessage(`目标路径 ${parent.hpath} 不存在`, 3000, 'error');
        return false;
    }

    const title = block.fcontent || block.content;
    const doc = await createDocWithMd(box, `${parent.hpath}/${title}`, '');
    await moveBlockToDoc(block, doc);
    return true;
}

/**
 * 移动到当前文档
 */
const moveToThisDoc = async (refBlock: Block, defBlock: Block) => {
    if (refBlock.type === 'd') {
        showMessage(`${refBlock.content} 是文档块，不能移动到文档中`, 3000, 'error');
        return false;
    }

    await moveBlockToDoc(refBlock, defBlock.id);
    return true;
}

/**
 * 移动到子文档
 */
const moveToChildDoc = async (refBlock: Block, defBlock: Block) => {
    if (refBlock.box === defBlock.box && refBlock.path.startsWith(defBlock.path.replace('.sy', ''))) {
        showMessage(`原文档已经在目标文档的目录树下, 无需重复移动`, 3000, 'error');
        return false;
    }
    
    await moveBlockAsDoc(refBlock, defBlock.box, {
        path: defBlock.path,
        hpath: defBlock.hpath
    });
    return true;
}

/**
 * 移动到收件箱
 */
const moveToInbox = async (refBlock: Block, defBlock: Block, inboxHpath: string = '/Inbox') => {
    let docId = await ensureHpath(defBlock.box, inboxHpath);
    if (!docId) {
        docId = await createDocWithMd(defBlock.box, inboxHpath, '');
    }

    const doc = await getBlockByID(docId);
    return await moveToChildDoc(refBlock, doc);
}

/**
 * 移动到日记
 */
const moveToDailyNote = async (refBlock: Block, defBlock: Block) => {
    if (refBlock.type === 'd') {
        showMessage(`${refBlock.content} 是文档块，不能移动到日记中`, 3000, 'error');
        return false;
    }

    const createdTime = refBlock.created;
    const date = new Date(
        `${createdTime.slice(0, 4)}-${createdTime.slice(4, 6)}-${createdTime.slice(6, 8)}`
    );
    
    let dailynote: Block = await searchDailynote(defBlock.box, date) as Block;
    let dnId = dailynote?.id;
    
    if (!dailynote) {
        dnId = await createDiary(defBlock.box, date);
    }

    await moveBlockToDoc(refBlock, dnId);
    return true;
}

/**
 * 执行移动操作
 * @param refBlock 引用块
 * @param defBlock 定义块
 * @param type 移动类型
 * @param props 额外参数
 */
export const doMove = async (
    refBlock: Block, 
    defBlock: Block, 
    type: TMigrate, 
    props?: { inboxHpath?: string }
) => {
    try {
        switch (type) {
            case 'no':
                return false;
            case 'thisdoc':
                return moveToThisDoc(refBlock, defBlock);
            case 'childdoc':
                return moveToChildDoc(refBlock, defBlock);
            case 'inbox':
                return moveToInbox(refBlock, defBlock, props?.inboxHpath);
            case 'dailynote':
                return moveToDailyNote(refBlock, defBlock);
            default:
                return false;
        }
    } catch (e) {
        console.error(e);
        return false;
    }
}
