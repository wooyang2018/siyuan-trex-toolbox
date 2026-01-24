/**
 * WebSocket 消息处理器
 */
import * as SiYuan from "siyuan";
import { searchAttr, formatDateTime, thisPlugin, api } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";
import { importJavascriptFile, createJavascriptFile } from "@frostime/siyuan-plugin-kits";
import { getBlockByID, insertBlock, prependBlock, saveBlob } from "@frostime/siyuan-plugin-kits/api";

const { request } = api;

/**
 * 创建超级块
 */
const superBlock = (content: string) => `
{{{row

${content}

}}}
`.trim();

/**
 * 把 text 添加到我的 dailynote 快记当中
 */
const appendDnList = async (text: string) => {
    const refreshDocument = () => {
        const docId = blocks[0].root_id;
        const protyles = SiYuan.getAllEditor();
        protyles.forEach((protyle) => {
            if (protyle.protyle.block.rootID == docId) {
                return;
            }
            protyle.reload(false);
        });
    };

    const name = 'custom-dn-quickh2';
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    const v = `${year}${month}${day}`;

    const hours = today.getHours().toString().padStart(2, '0');
    const minutes = today.getMinutes().toString().padStart(2, '0');
    const seconds = today.getSeconds().toString().padStart(2, '0');
    const timestr = `${hours}:${minutes}:${seconds}`;
    
    text = text.trim();
    const lines = text.split(/\r?\n\r?\n/);
    const isMultiline = lines.length > 1;
    const content = isMultiline ? superBlock(`[${timestr}] ${text}`) : `[${timestr}] ${text}`;

    const blocks = await searchAttr(name, v);
    if (blocks.length !== 1) return;
    const id = blocks[0].id;

    const headChildren = await request('/api/block/getHeadingChildrenIDs', { id });
    if (!headChildren || headChildren.length === 0) return;
    const lastChild = headChildren[headChildren.length - 1];
    await insertBlock('markdown', content, null, lastChild, null);
    refreshDocument();

    showMessage('WS: Quicklist appended!');
};

/**
 * 快速将摘录保存到文档中
 */
const saveExcerpt = async (content: string) => {
    content = content.trim();
    const docID = '20220418154352-3fdgff5';
    const titleID = '20220418154453-6b59ylm';

    const addContent = async (content: string) => {
        const title = await getBlockByID(titleID);
        if (title) {
            await insertBlock('markdown', content, null, titleID, null);
            return;
        }
        const doc = await getBlockByID(docID);
        if (doc) {
            await prependBlock('markdown', content, docID);
            return;
        }
        showMessage('无法保存摘录!', -1, 'error');
    };

    const time = formatDateTime();

    // 将连续两个以上的换行符替换为两个
    content = content.replace(/\n{2,}/g, '\n\n');

    // 计算汉字和汉字符号数量
    const hanCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const hanSymbolCount = (content.match(/[\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const chineseCount = hanCount + hanSymbolCount;

    // 计算英文单词数量
    const englishWordCount = (content.match(/\b[a-zA-Z]+(?:[''-][a-zA-Z]+)*\b/g) || []).length;

    const length = chineseCount + englishWordCount;

    if (length <= 800) {
        const toSave = superBlock(`[${time}] | ${content}`);
        await addContent(toSave);
        showMessage('WS: 添加了新的摘录' + time);
    } else {
        // 太大了就不放入文档中，而是保存为附件
        const firstLine = content.trim().split('\n')[0];
        const title = firstLine.replace(/\s/g, '').slice(0, 25) + '...';
        const titleSafe = title.replace(/[/\\:*?"<>|]/g, '');
        const path = `assets/user/excerpt/${time.replaceAll(':', '_')}-${titleSafe}.md`;
        await saveBlob('/data/' + path, `# ${time} - ${title}\n\n${content}`);
        await addContent(superBlock(`[${time}] | [${title}](${path})\n\n> ${content.slice(0, 200)}...`));
        showMessage('WS: 添加了新的摘录' + title);
    }
};

const DEFAULT_CODE = `
const defaultModule = {
    /**
     * @param {string} body - The message body
     * @param {Object} context - The context object
     * @param {require('siyuan').Plugin} context.plugin - Plugin instance
     * @param {typeof require('siyuan')} context.siyuan - SiYuan API instance
     * @param {(url: string, data: any) => Promise<any>} context.request - Kernal request, return response.data or null
     * @param context.api - Wrapped siyuan kernel api
     */
    'example': (body, context) => {
        console.log(body, context);
    }
};
export default defaultModule;
`.trimStart();

type FHandler = (body: string, context?: {
    plugin: SiYuan.Plugin,
    siyuan: typeof SiYuan,
    api: typeof api,
    request: typeof request,
}) => void;

export const moduleJsName = 'custom.ws-handlers.js';

/**
 * 解析自定义处理器模块
 */
const parseCustomHandlerModule = async () => {
    const plugin = thisPlugin();
    const module = await importJavascriptFile(moduleJsName);
    if (!module) {
        createJavascriptFile(DEFAULT_CODE, moduleJsName);
        return;
    }
    const modules: Record<string, FHandler> = module.default;
    Object.entries(modules).forEach(([key, handler]) => {
        modules[key] = (body: any) => {
            handler(body, {
                plugin,
                siyuan: SiYuan,
                request,
                api
            });
        };
    });
    return modules;
};

export let currentHandlers: Record<string, FHandler> = {};

/**
 * 获取所有处理器
 */
export const Handlers = async () => {
    const modules = await parseCustomHandlerModule();
    currentHandlers = {
        'dn-quicklist': appendDnList,
        'save-excerpt': saveExcerpt,
        ...modules
    };
    return currentHandlers;
};
