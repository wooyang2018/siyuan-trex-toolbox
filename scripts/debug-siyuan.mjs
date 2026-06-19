#!/usr/bin/env node
/**
 * SiYuan 通用调试工具 — 脱离插件 UI，在命令行直接探查 SiYuan 本地 API
 *
 * 用法:
 *   node scripts/debug-siyuan.mjs <command> [options]
 *
 * 命令:
 *   notebooks                              列出所有笔记本
 *   docs    -n <notebook> [-p /] [-r]      列出文档（-r 递归展开子文档）
 *   block   <id>                           查看块详情
 *   attrs   <id>                           查看块属性
 *   sql     <statement>                    执行 SQL 查询
 *   api     <endpoint> [jsonPayload]       调用任意 API
 *   tree    -n <notebook> [-p /] [-d 0]    递归展示文档树（-d 最大深度, 0=无限）
 *
 * 通用选项:
 *   --json        原始 JSON 输出（不做格式化裁剪）
 *   --limit <n>   限制列表/查询结果条数（默认 20）
 *
 * 示例:
 *   node scripts/debug-siyuan.mjs notebooks
 *   node scripts/debug-siyuan.mjs docs -n 编程基础
 *   node scripts/debug-siyuan.mjs docs -n 编程基础 -p / -r
 *   node scripts/debug-siyuan.mjs block 20240514232418-cswj0ir
 *   node scripts/debug-siyuan.mjs sql "SELECT id,content,type FROM blocks WHERE root_id='xxx' LIMIT 5"
 *   node scripts/debug-siyuan.mjs api /api/system/version
 *   node scripts/debug-siyuan.mjs api /api/filetree/listDocsByPath '{"notebook":"xxx","path":"/"}'
 *   node scripts/debug-siyuan.mjs tree -n 编程基础 -d 2
 */

const SIYUAN_API = 'http://127.0.0.1:6806';

// ===================== HTTP =====================

async function siyuanPost(endpoint, payload = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${SIYUAN_API}${endpoint}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.code !== 0) {
        throw new Error(`API Error (${json.code}): ${json.msg}`);
    }
    return json.data;
}

// ===================== 参数解析 =====================

function parseArgs(argv) {
    const positional = [];
    const flags = {};
    let i = 0;
    while (i < argv.length) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith('-')) {
                flags[key] = next;
                i += 2;
            } else {
                flags[key] = true;
                i += 1;
            }
        } else if (arg.startsWith('-') && arg.length === 2) {
            const key = arg.slice(1);
            const next = argv[i + 1];
            if (next && !next.startsWith('-')) {
                flags[key] = next;
                i += 2;
            } else {
                flags[key] = true;
                i += 1;
            }
        } else {
            positional.push(arg);
            i += 1;
        }
    }
    return { positional, flags };
}

// ===================== 格式化工具 =====================

function pretty(obj, rawJson = false) {
    if (rawJson) return JSON.stringify(obj, null, 2);
    if (obj === null || obj === undefined) return '(empty)';
    if (typeof obj !== 'object') return String(obj);
    return JSON.stringify(obj, null, 2);
}

function truncateStr(s, max = 80) {
    if (!s) return '';
    s = String(s).replace(/\n/g, '\\n');
    return s.length > max ? s.slice(0, max) + '...' : s;
}

function limit(arr, limit = 20) {
    if (!Array.isArray(arr)) return arr;
    if (arr.length <= limit) return arr;
    return arr.slice(0, limit);
}

// ===================== 命令: notebooks =====================

async function cmdNotebooks(flags) {
    const data = await siyuanPost('/api/notebook/lsNotebooks', {});
    const notebooks = data?.notebooks || data;
    if (!Array.isArray(notebooks)) {
        console.log(pretty(data, flags.json));
        return;
    }
    if (flags.json) {
        console.log(JSON.stringify(notebooks, null, 2));
        return;
    }
    console.log(`\n共 ${notebooks.length} 个笔记本:\n`);
    for (const nb of notebooks) {
        console.log(`  ${nb.name}  (ID: ${nb.id})`);
    }
}

// ===================== 命令: docs =====================

async function cmdDocs(flags) {
    const notebookId = await resolveNotebookId(flags.n);
    const path = flags.p || '/';

    const data = await siyuanPost('/api/filetree/listDocsByPath', { notebook: notebookId, path });
    const files = data?.files;

    if (!files?.length) {
        console.log('\n(该路径下没有子文档)');
        return;
    }

    if (flags.json) {
        console.log(JSON.stringify(files, null, 2));
        return;
    }

    console.log(`\n路径 "${path}" 下共 ${files.length} 个文档:\n`);

    if (flags.r) {
        // 递归模式
        await printDocsRecursive(notebookId, files, 0, 0, flags);
    } else {
        const lim = parseInt(flags.limit) || 20;
        const shown = limit(files, lim);
        for (let i = 0; i < shown.length; i++) {
            printDocRow(shown[i], '', i);
        }
        if (files.length > lim) {
            console.log(`  ... 还有 ${files.length - lim} 个文档 (用 --limit 调整)`);
        }
    }
}

async function printDocsRecursive(notebookId, files, depth, index, flags) {
    const maxDepth = parseInt(flags.d) || 0;
    if (maxDepth > 0 && depth >= maxDepth) return;

    for (let i = 0; i < files.length; i++) {
        const doc = files[i];
        const indent = '  '.repeat(depth);
        const icon = doc.subFileCount > 0 ? '📁' : '📄';
        console.log(`${indent}${icon} ${doc.name}  (ID: ${doc.id}, subFileCount: ${doc.subFileCount})`);

        if (doc.subFileCount > 0) {
            try {
                const subData = await siyuanPost('/api/filetree/listDocsByPath', { notebook: notebookId, path: doc.path });
                if (subData?.files?.length) {
                    await printDocsRecursive(notebookId, subData.files, depth + 1, i, flags);
                }
            } catch (e) {
                console.log(`${indent}  ⚠️ 加载子文档失败: ${e.message}`);
            }
        }
    }
}

function printDocRow(doc, prefix, index) {
    const icon = doc.subFileCount > 0 ? '📁' : '📄';
    console.log(`  [${index}] ${icon} ${doc.name}`);
    console.log(`      id: ${doc.id}  |  path: ${doc.path}  |  subFileCount: ${doc.subFileCount}`);
}

// ===================== 命令: block =====================

async function cmdBlock(flags) {
    const id = flags.positional[1];
    if (!id) {
        console.error('用法: debug-siyuan.mjs block <blockId>');
        process.exit(1);
    }

    const rows = await siyuanPost('/api/query/sql', { stmt: `SELECT * FROM blocks WHERE id = '${id}'` });
    if (!rows?.length) {
        console.log(`\n未找到块: ${id}`);
        return;
    }

    const block = rows[0];
    if (flags.json) {
        console.log(JSON.stringify(block, null, 2));
        return;
    }

    console.log('\n块详情:\n');
    for (const [key, value] of Object.entries(block)) {
        console.log(`  ${key}: ${truncateStr(value, 120)}`);
    }
}

// ===================== 命令: attrs =====================

async function cmdAttrs(flags) {
    const id = flags.positional[1];
    if (!id) {
        console.error('用法: debug-siyuan.mjs attrs <blockId>');
        process.exit(1);
    }

    const attrs = await siyuanPost('/api/attr/getBlockAttrs', { id });
    if (flags.json) {
        console.log(JSON.stringify(attrs, null, 2));
        return;
    }

    console.log(`\n块 ${id} 的属性:\n`);
    if (!attrs || Object.keys(attrs).length === 0) {
        console.log('  (无属性)');
        return;
    }
    for (const [key, value] of Object.entries(attrs)) {
        console.log(`  ${key}: ${truncateStr(value, 120)}`);
    }
}

// ===================== 命令: sql =====================

async function cmdSql(flags) {
    const stmt = flags.positional.slice(1).join(' ');
    if (!stmt) {
        console.error('用法: debug-siyuan.mjs sql "<SQL statement>"');
        process.exit(1);
    }

    const rows = await siyuanPost('/api/query/sql', { stmt });

    if (!rows?.length) {
        console.log('\n(查询无结果)');
        return;
    }

    if (flags.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
    }

    const lim = parseInt(flags.limit) || 20;
    const shown = limit(rows, lim);
    const keys = Object.keys(shown[0]);

    console.log(`\n查询结果: ${rows.length} 行${rows.length > lim ? ` (显示前 ${lim} 行)` : ''}\n`);

    for (const row of shown) {
        const parts = keys.map(k => `${k}=${truncateStr(row[k], 40)}`);
        console.log(`  ${parts.join(' | ')}`);
    }
}

// ===================== 命令: api =====================

async function cmdApi(flags) {
    const endpoint = flags.positional[1];
    if (!endpoint) {
        console.error('用法: debug-siyuan.mjs api <endpoint> [jsonPayload]');
        console.error('示例: debug-siyuan.mjs api /api/system/version');
        console.error('      debug-siyuan.mjs api /api/filetree/listDocsByPath \'{"notebook":"xxx","path":"/"}\'');
        process.exit(1);
    }

    let payload = {};
    if (flags.positional[2]) {
        try {
            payload = JSON.parse(flags.positional[2]);
        } catch (e) {
            console.error(`JSON 解析失败: ${e.message}`);
            process.exit(1);
        }
    }

    const data = await siyuanPost(endpoint, payload);
    console.log(pretty(data, flags.json));
}

// ===================== 命令: tree =====================

async function cmdTree(flags) {
    const notebookId = await resolveNotebookId(flags.n);
    const path = flags.p || '/';
    const maxDepth = parseInt(flags.d) || 0;

    console.log(`\n文档树 (notebook: ${notebookId}, path: ${path}, maxDepth: ${maxDepth || '无限'}):\n`);

    await printTreeRecursive(notebookId, path, 0, maxDepth);
}

async function printTreeRecursive(notebookId, path, depth, maxDepth) {
    if (maxDepth > 0 && depth >= maxDepth) return;

    let data;
    try {
        data = await siyuanPost('/api/filetree/listDocsByPath', { notebook: notebookId, path });
    } catch (e) {
        console.log(`${'  '.repeat(depth)}⚠️ 加载失败: ${e.message}`);
        return;
    }

    const files = data?.files;
    if (!files?.length) return;

    for (const doc of files) {
        const indent = '  '.repeat(depth);
        const icon = doc.subFileCount > 0 ? '📁' : '📄';
        console.log(`${indent}${icon} ${doc.name}  [${doc.id}]`);

        if (doc.subFileCount > 0) {
            await printTreeRecursive(notebookId, doc.path, depth + 1, maxDepth);
        }
    }
}

// ===================== 辅助: 解析笔记本 ID =====================

let _notebooksCache = null;

async function resolveNotebookId(nameOrId) {
    if (!nameOrId) {
        console.error('请指定笔记本: -n <notebookName|notebookId>');
        process.exit(1);
    }

    // 看起来像 ID (20位字母数字)
    if (/^[a-z0-9]{20}$/.test(nameOrId)) {
        return nameOrId;
    }

    // 按名称查找
    if (!_notebooksCache) {
        const data = await siyuanPost('/api/notebook/lsNotebooks', {});
        _notebooksCache = data?.notebooks || data || [];
    }

    const found = _notebooksCache.find(nb => nb.name === nameOrId);
    if (found) return found.id;

    // 模糊匹配
    const fuzzy = _notebooksCache.filter(nb => nb.name.includes(nameOrId));
    if (fuzzy.length === 1) return fuzzy[0].id;
    if (fuzzy.length > 1) {
        console.error(`找到 ${fuzzy.length} 个匹配的笔记本，请更精确指定:`);
        fuzzy.forEach(nb => console.error(`  ${nb.name} (${nb.id})`));
        process.exit(1);
    }

    console.error(`未找到笔记本: "${nameOrId}"`);
    console.error('可用笔记本:');
    _notebooksCache.forEach(nb => console.error(`  ${nb.name} (${nb.id})`));
    process.exit(1);
}

// ===================== 主入口 =====================

async function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2));
    const command = positional[0];

    // 把 positional 和 flags 合并传给命令
    flags.positional = positional;

    if (!command) {
        console.log('SiYuan 通用调试工具');
        console.log('');
        console.log('用法: node scripts/debug-siyuan.mjs <command> [options]');
        console.log('');
        console.log('命令:');
        console.log('  notebooks                              列出所有笔记本');
        console.log('  docs    -n <notebook> [-p /] [-r]      列出文档（-r 递归展开）');
        console.log('  block   <id>                           查看块详情');
        console.log('  attrs   <id>                           查看块属性');
        console.log('  sql     <statement>                    执行 SQL 查询');
        console.log('  api     <endpoint> [jsonPayload]       调用任意 API');
        console.log('  tree    -n <notebook> [-p /] [-d 0]    递归展示文档树');
        console.log('');
        console.log('通用选项:');
        console.log('  --json        原始 JSON 输出');
        console.log('  --limit <n>   限制结果条数 (默认 20)');
        console.log('');
        console.log('示例:');
        console.log('  node scripts/debug-siyuan.mjs notebooks');
        console.log('  node scripts/debug-siyuan.mjs docs -n 编程基础');
        console.log('  node scripts/debug-siyuan.mjs sql "SELECT id,content FROM blocks WHERE root_id=\'xxx\'"');
        console.log('  node scripts/debug-siyuan.mjs api /api/system/version');
        console.log('  node scripts/debug-siyuan.mjs tree -n 编程基础 -d 2');
        return;
    }

    // 连通性检测
    try {
        await siyuanPost('/api/system/version', {});
    } catch (e) {
        console.error(`\n❌ 无法连接 SiYuan API (${SIYUAN_API})，请确认 SiYuan 正在运行`);
        process.exit(1);
    }

    const commands = {
        notebooks: cmdNotebooks,
        docs: cmdDocs,
        block: cmdBlock,
        attrs: cmdAttrs,
        sql: cmdSql,
        api: cmdApi,
        tree: cmdTree,
    };

    const handler = commands[command];
    if (!handler) {
        console.error(`未知命令: ${command}`);
        console.error('可用命令: ' + Object.keys(commands).join(', '));
        process.exit(1);
    }

    await handler(flags);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
