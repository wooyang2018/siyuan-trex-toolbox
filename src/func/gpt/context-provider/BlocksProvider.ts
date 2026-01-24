import { BlockTypeName, getBlockByID, getMarkdown } from "@frostime/siyuan-plugin-kits";

const BLOCK_ID_REGEX = /(\d{14}-[0-9a-z]{7})/ as const;

const parseID = (text: string): string | null => {
    const match = text.match(BLOCK_ID_REGEX);
    return match?.[1] ?? null;
}

const BlocksProvider: CustomContextProvider = {
    type: "input-area",
    name: "SiyuanBlocks",
    icon: 'iconH2',
    displayTitle: "指定块内容",
    description: "每行输入一个块的 ID/链接/引用（包含块 ID 即可），自动查询对应块的内容并汇总起来",
    getContextItems: async (options: {
        query: string;
    }): Promise<ContextItem[]> => {
        const lines = options.query.split('\n').filter(line => line.trim());
        const ids: string[] = lines.map(line => parseID(line)).filter(Boolean);

        const blocks = (await Promise.all(ids.map(async (id) => {
            const block = await getBlockByID(id);
            if (!block) {
                return null;
            }
            let content = block.markdown;
            if (block.type === 'd' || block.type === 'h') {
                content = await getMarkdown(id);
            }
            return {
                name: `块: ${id}`,
                description: `${BlockTypeName[block.type]}; 文档: ${block.hpath}`,
                content: content,
            };
        }))).filter(block => block !== null);

        return blocks;
    },
};

export default BlocksProvider;
