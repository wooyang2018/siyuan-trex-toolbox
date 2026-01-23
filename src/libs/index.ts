import { id2block } from "@frostime/siyuan-plugin-kits";
import { request } from "@frostime/siyuan-plugin-kits/api";

/**
 * Redirects first block IDs to their parent containers
 * @param inputs - Array of blocks or block IDs
 * @param enable - Configuration for heading and doc processing
 * @param enable.heading - Whether to process heading blocks
 * @param enable.doc - Whether to process document blocks
 * @returns Processed blocks or block IDs
 * @alias `redirect`
 */
export const fb2p = async (inputs: Block[], enable?: { heading?: boolean, doc?: boolean }) => {
    inputs = structuredClone(inputs);
    let types = typeof inputs[0] === 'string' ? 'id' : 'block';
    let ids = types === 'id' ? inputs : (inputs as Block[]).map(b => b.id);
    let blocks: Block[] = inputs as Block[];
    enable = { heading: true, doc: true, ...(enable ?? {}) };

    if (types == 'id') {
        //@ts-ignore
        blocks = blocks.map(id => ({ id: id }));
    }

    let data: { [key: BlockId]: any } = await request('/api/block/getBlockTreeInfos', {
        ids: ids
    });
    let result: Block[] = [];

    let ReplaceContentTask = {
        blocks: {} as Record<BlockId, Block>,
        addTask: (block: Block) => {
            ReplaceContentTask.blocks[block.id] = block;
        },
        run: async () => {
            let blocks = await id2block(Object.keys(ReplaceContentTask.blocks));
            for (let block of blocks) {
                if (ReplaceContentTask.blocks[block.id]) {
                    Object.assign(ReplaceContentTask.blocks[block.id], block);
                }
            }
        }
    };

    for (let block of blocks) {
        result.push(block);
        let info = data[block.id];
        if (info.type !== 'NodeParagraph') continue;

        const content = block.content.trim();
        const refPattern = /#(文档引用|DOCREF)#/;
        if (refPattern.test(content)) {
            let resultp = result[result.length - 1];
            resultp.id = block.root_id;
            resultp.type = 'd';
            ReplaceContentTask.addTask(resultp);
            continue;
        }

        if (
            info.previousID === '' &&
            ['NodeBlockquote', 'NodeListItem', 'NodeSuperBlock'].includes(info.parentType)
        ) {
            let resultp = result[result.length - 1];
            resultp.id = info.parentID;
            resultp.type = { 'NodeBlockquote': 'b', 'NodeListItem': 'i', 'NodeSuperBlock': 'sb' }[info.parentType];
        } else if (enable.heading && info.previousType === "NodeHeading") {
            let resultp = result[result.length - 1];
            resultp.id = info.previousID;
            resultp.type = 'h';
            ReplaceContentTask.addTask(resultp);
        } else if (
            enable.doc &&
            info.previousID === '' &&
            info.parentType === "NodeDocument"
        ) { // 文档下第一个段落
            let resultp = result[result.length - 1];
            resultp.id = info.parentID;
            resultp.type = 'd';
            ReplaceContentTask.addTask(resultp);
        }
    }
    await ReplaceContentTask.run();
    return result
}

export const windowRequire = (name: string) => {
    return window?.require?.(name);
}
