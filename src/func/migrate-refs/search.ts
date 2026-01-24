/**
 * First Block to Parent - 引用搜索优化
 * 
 * @description 将段落块引用转换为父块引用（标题、文档等）
 * @author frostime
 */
import { request } from "@/api";
import { id2block } from "@frostime/siyuan-plugin-kits";

/**
 * First Block to Parent
 * 将段落块的引用转换为其父块（标题/文档/容器块）的引用
 * 
 * @param inputs 输入的块数组或ID数组
 * @param enable 启用选项：heading-标题, doc-文档
 */
export const fb2p = async (
    inputs: Block[], 
    enable?: { heading?: boolean, doc?: boolean }
) => {
    // 处理输入参数
    const types = typeof inputs[0] === 'string' ? 'id' : 'block';
    const ids = types === 'id' ? inputs : (inputs as Block[]).map(b => b.id);
    let blocks: Block[] = types === 'id' 
        ? (inputs as any).map(id => ({ id }))
        : inputs as Block[];
    
    enable = { heading: true, doc: true, ...enable };

    // 获取块的上下文关系
    const data: Record<BlockId, any> = await request('/api/block/getBlockTreeInfos', { ids });
    const result: Block[] = [];

    // 内容替换任务管理器
    const ReplaceContentTask = {
        blocks: {} as Record<BlockId, Block>,
        addTask(block: Block) {
            this.blocks[block.id] = block;
        },
        async run() {
            const blocks = await id2block(Object.keys(this.blocks));
            blocks.forEach(block => {
                if (this.blocks[block.id]) {
                    Object.assign(this.blocks[block.id], block);
                }
            });
        }
    };

    // 文档引用标识正则
    const REF_PATTERN = /#(文档引用|DOCREF)#/;
    
    // 块类型映射
    const BLOCK_TYPE_MAP = {
        'NodeBlockquote': 'b',
        'NodeListItem': 'i'
    } as const;

    // 执行 fb2p 转换
    for (const block of blocks) {
        result.push(block);
        const info = data[block.id];
        
        if (info.type !== 'NodeParagraph') continue;

        // 特殊处理：文档引用标识
        if (REF_PATTERN.test(block.content.trim())) {
            console.debug('发现文档引用', block.id);
            const resultp = result[result.length - 1];
            resultp.id = block.root_id;
            resultp.type = 'd';
            ReplaceContentTask.addTask(resultp);
            continue;
        }

        // 常规 fb2p 处理逻辑
        const resultp = result[result.length - 1];
        
        // 容器块的第一个段落
        if (info.previousID === '' && BLOCK_TYPE_MAP[info.parentType]) {
            resultp.id = info.parentID;
            resultp.type = BLOCK_TYPE_MAP[info.parentType];
        } 
        // 标题块下方第一个段落
        else if (enable.heading && info.previousType === "NodeHeading") {
            resultp.id = info.previousID;
            resultp.type = 'h';
            ReplaceContentTask.addTask(resultp);
        } 
        // 文档下第一个段落
        else if (enable.doc && info.previousID === '' && info.parentType === "NodeDocument") {
            resultp.id = info.parentID;
            resultp.type = 'd';
            ReplaceContentTask.addTask(resultp);
        }
    }

    await ReplaceContentTask.run();
    return result;
}
