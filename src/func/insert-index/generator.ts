import { listDocsByPath } from "@/api";
import { escapeHtml, getProcessedDocIcon, IndexQueue, IndexQueueNode } from "./utils";
import type { InsertIndexConfig } from "./index";

/**
 * 递归生成子文档目录
 */
export async function generateIndex(
    notebook: string,
    ppath: string,
    pitem: IndexQueue,
    tab: number = 0,
    config: InsertIndexConfig
) {
    const { depth, listType: listTypeSetting, linkType: linkTypeSetting, icon: iconEnabled } = config;

    if (depth === 0 || depth > tab) {
        let docs: any;
        try {
            docs = await listDocsByPath(notebook, ppath);
        } catch (err) {
            console.error(`[InsertIndex] Failed to list docs for path "${ppath}":`, err);
            return;
        }

        if (!docs?.files?.length) return;

        tab++;

        for (const doc of docs.files) {
            let data = "";
            const id = doc.id;
            let name = doc.name.slice(0, -3); // 去掉 .sy 后缀
            const icon = doc.icon;
            const subFileCount = doc.subFileCount;
            const path = doc.path;

            // 缩进
            for (let n = 1; n < tab; n++) {
                data += '    ';
            }

            name = escapeHtml(name);

            // 列表类型
            const isUnordered = listTypeSetting === "unordered";
            data += isUnordered ? "* " : "1. ";

            // 链接类型
            const isRef = linkTypeSetting === "ref";
            const iconStr = iconEnabled ? getProcessedDocIcon(icon, subFileCount !== 0) : "";
            const safeName = name.replace(/"/g, "&quot;");

            if (isRef) {
                data += `${iconStr ? iconStr + ' ' : ''}[${name}](siyuan://blocks/${id})\n`;
            } else {
                // embed (块引用)
                if (iconEnabled && iconStr) {
                    data += `${iconStr} ((${id} "${safeName}"))\n`;
                } else {
                    data += `((${id} "${safeName}"))\n`;
                }
            }

            const item = new IndexQueueNode(tab, data);
            pitem.push(item);

            if (subFileCount > 0) {
                await generateIndex(notebook, path, item.children, tab, config);
            }
        }
    }
}

/**
 * 从队列中弹出所有节点生成最终 Markdown
 */
export function queuePopAll(queue: IndexQueue, data: string, config: InsertIndexConfig): string {
    if (queue.getFront()?.depth === undefined) {
        return "";
    }

    let num = 0;
    let temp = 0;
    let times = 0;
    const depth = queue.getFront().depth;

    // 分栏处理
    if (depth === 1 && config.col !== 1) {
        data += "{{{col\n";
        temp = Math.trunc(queue.getSize() / config.col);
        times = config.col - 1;
    }

    while (!queue.isEmpty()) {
        num++;
        const item = queue.pop();

        // 折叠处理
        if (!item.children.isEmpty() && config.fold !== 0 && config.fold <= item.depth) {
            const isUnordered = config.listType === "unordered";
            if (isUnordered) {
                const n = item.text.indexOf("*");
                if (n !== -1) {
                    item.text = item.text.substring(0, n + 2) + '{: fold="1"}' + item.text.substring(n + 2);
                }
            } else {
                const n = item.text.indexOf("1");
                if (n !== -1) {
                    item.text = item.text.substring(0, n + 3) + '{: fold="1"}' + item.text.substring(n + 3);
                }
            }
        }
        data += item.text;

        if (!item.children.isEmpty()) {
            data = queuePopAll(item.children, data, config);
        }

        // 分栏分隔
        if (item.depth === 1 && num === temp && times > 0) {
            data += `\n{: id}\n`;
            num = 0;
            times--;
        }
    }

    if (depth === 1 && config.col !== 1) {
        data += "}}}";
    }

    return data;
}
