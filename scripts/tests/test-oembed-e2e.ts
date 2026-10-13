#!/usr/bin/env node
/**
 * 链接嵌入端到端测试。
 *
 * Part A 不连思源：书签 HTML、YouTube 本地卡片、oEmbed 站点匹配。
 * Part B 连思源：临时笔记本里把 example.com 转成书签再还原，
 * YouTube 在页面抓取失败时仍转成书签，Spotify 走 oEmbed 嵌入再还原。
 *
 * 运行: node --experimental-strip-types scripts/tests/test-oembed-e2e.ts
 */
import "./dom-parser-shim.ts";
import { convertBlock, CUSTOM_ATTRIBUTE, OEMBED_USER_AGENT, resetProviderCache, restoreBlock, type OembedKernel } from "../../src/func/oembed/convert.ts";
import { generateBookmarkHtml } from "../../src/func/oembed/html.ts";
import { parsePageMetadata, youtubeBookmark, youtubeFromOembed } from "../../src/func/oembed/metadata.ts";
import { matchProvider, type OembedProvider } from "../../src/func/oembed/oembed.ts";

const SIYUAN = process.env.SIYUAN_API || "http://127.0.0.1:6806";
const TOKEN = process.env.SIYUAN_TOKEN || "";
const EXAMPLE = "https://example.com/";
const YOUTUBE = "https://www.youtube.com/watch?v=N4YOOt9UEdA&list=RDN4YOOt9UEdA&start_radio=1";
const SPOTIFY = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(name: string) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}
function bad(name: string, detail: string) {
    fail++;
    failures.push(`${name}: ${detail}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`);
}
function assertEq(name: string, actual: unknown, expected: unknown) {
    if (actual === expected) ok(name);
    else bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(name: string, cond: unknown, detail = "expected true") {
    if (cond) ok(name);
    else bad(name, detail);
}
function assertIncludes(name: string, haystack: string, needle: string) {
    if ((haystack || "").includes(needle)) ok(name);
    else bad(name, `缺少 ${JSON.stringify(needle)}，实际 ${(haystack || "").slice(0, 180)}`);
}
function assertExcludes(name: string, haystack: string, needle: string) {
    if (!(haystack || "").includes(needle)) ok(name);
    else bad(name, `不应包含 ${JSON.stringify(needle)}`);
}

function partA() {
    console.log("\n\x1b[36mPart A: 书签 HTML、YouTube 本地卡片、站点匹配\x1b[0m");

    const card = generateBookmarkHtml({
        title: "示例标题",
        description: "示例描述",
        icon: "https://example.com/icon.png",
        author: "作者",
        link: EXAMPLE,
        thumbnail: "https://example.com/thumb.png",
        publisher: "Example",
    }, "");
    assertTrue("书签 HTML 已生成", !!card);
    assertIncludes("书签含标题", card || "", "示例标题");
    assertIncludes("书签含描述", card || "", "示例描述");
    assertIncludes("书签含链接", card || "", EXAMPLE);
    assertIncludes("书签含卡片类名", card || "", "kg-bookmark-card");

    const page = parsePageMetadata(`<!doctype html><html><head>
        <title>Example Domain</title>
        <meta name="description" content="说明文字">
        <link rel="icon" href="/favicon.ico">
        <meta property="og:image" content="https://cdn.example.com/a.png">
    </head></html>`, EXAMPLE);
    assertEq("解析标题", page.title, "Example Domain");
    assertEq("解析描述", page.description, "说明文字");
    assertEq("相对图标补全", page.icon, "https://example.com/favicon.ico");
    assertEq("解析缩略图", page.thumbnail, "https://cdn.example.com/a.png");

    const youtube = youtubeBookmark(YOUTUBE);
    assertEq("YouTube 视频号", youtube?.thumbnail, "https://i.ytimg.com/vi/N4YOOt9UEdA/hqdefault.jpg");
    assertEq("YouTube 卡片保留原链接", youtube?.link, YOUTUBE);
    assertEq("非 YouTube 不走本地卡片", youtubeBookmark(EXAMPLE), null);
    const youtubeHtml = generateBookmarkHtml(youtube!);
    assertIncludes("YouTube 卡片类名", youtubeHtml || "", "kg-bookmark-card");
    const fromOembed = youtubeFromOembed(YOUTUBE, {
        title: "月下煮茶",
        author_name: "演唱者",
        thumbnail_url: "https://i.ytimg.com/vi/N4YOOt9UEdA/hqdefault.jpg",
        provider_name: "YouTube",
    });
    assertEq("oEmbed 标题写入卡片", fromOembed?.title, "月下煮茶");
    assertEq("oEmbed 没有标题则不用", youtubeFromOembed(YOUTUBE, {}), null);

    const providers: OembedProvider[] = [{
        provider_name: "YouTube",
        provider_url: "https://www.youtube.com/",
        endpoints: [{
            schemes: ["https://*.youtube.com/watch*"],
            url: "https://www.youtube.com/oembed",
        }],
    }];
    const matched = matchProvider(YOUTUBE, providers);
    assertEq("YouTube 匹配到 endpoint", matched?.endpoint, "https://www.youtube.com/oembed");
    assertEq("未知站点没有 endpoint", matchProvider(EXAMPLE, providers), null);
}

async function siyuanPost(endpoint: string, payload: Record<string, unknown> = {}): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (TOKEN) headers.Authorization = `Token ${TOKEN}`;
    let res: Response;
    try {
        res = await fetch(`${SIYUAN}${endpoint}`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });
    } catch (error) {
        throw new Error(`无法连接思源 ${SIYUAN}: ${(error as Error).message}`);
    }
    const json = await res.json() as { code: number; msg: string; data: unknown };
    if (json.code !== 0) throw new Error(`API ${endpoint} ${json.code}: ${json.msg}`);
    return json.data;
}

function blockIdOf(insert: any): string {
    return String(insert?.[0]?.doOperations?.[0]?.id || insert?.[0]?.id || "");
}

function kernel(): OembedKernel {
    return {
        async forwardProxy(url: string) {
            try {
                const data = await siyuanPost("/api/network/forwardProxy", {
                    url,
                    method: "GET",
                    timeout: 15000,
                    contentType: "text/html",
                    headers: [{ "User-Agent": OEMBED_USER_AGENT }],
                    payload: null,
                });
                if (!data || data.status !== 200 || !data.body) return null;
                return { status: data.status, body: String(data.body) };
            } catch {
                return null;
            }
        },
        async updateBlockMarkdown(id: string, markdown: string) {
            await siyuanPost("/api/block/updateBlock", { id, dataType: "markdown", data: markdown });
            return true;
        },
        async setBlockAttrs(id: string, attrs: Record<string, string>) {
            await siyuanPost("/api/attr/setBlockAttrs", { id, attrs });
        },
        async getBlockAttrs(id: string) {
            const data = await siyuanPost("/api/attr/getBlockAttrs", { id });
            return data || {};
        },
    };
}

async function kramdown(id: string): Promise<string> {
    const data = await siyuanPost("/api/block/getBlockKramdown", { id });
    return String(data?.kramdown || "");
}

async function blockDom(id: string): Promise<string> {
    const data = await siyuanPost("/api/block/getBlockDOM", { id });
    return String(data?.dom || "");
}

async function insertParagraph(docId: string, markdown: string): Promise<string> {
    const insert = await siyuanPost("/api/block/insertBlock", {
        dataType: "markdown",
        data: markdown,
        parentID: docId,
    });
    const id = blockIdOf(insert);
    assertTrue(`插入段落 ${markdown.slice(0, 40)}`, !!id, JSON.stringify(insert)?.slice(0, 200));
    return id;
}

async function partB() {
    console.log("\n\x1b[36mPart B: 本地思源临时文档\x1b[0m");
    resetProviderCache();
    const api = kernel();
    const suffix = Date.now().toString(36);
    let notebookId = "";
    const docPath = `/oembed-e2e-${suffix}`;

    try {
        const nb = await siyuanPost("/api/notebook/createNotebook", { name: `oembed-e2e-${suffix}` });
        notebookId = String(nb?.notebook?.id || "");
        assertTrue("临时笔记本创建成功", !!notebookId, JSON.stringify(nb));

        const doc = await siyuanPost("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: docPath,
            markdown: "# oembed e2e\n",
        });
        const docId = String(doc || "");
        assertTrue("临时文档创建成功", !!docId);

        const bookmarkId = await insertParagraph(docId, EXAMPLE);
        const converted = await convertBlock(api, bookmarkId, EXAMPLE, "bookmarkCard");
        assertEq("example.com 转成书签", converted, "converted");
        const card = await kramdown(bookmarkId);
        assertIncludes("书签 kramdown 含卡片类名", card, "kg-bookmark-card");
        assertIncludes("书签 kramdown 含页面标题", card, "Example Domain");
        assertIncludes("书签是 HTML 块", await blockDom(bookmarkId), 'data-type="NodeHTMLBlock"');
        const cardAttrs = await api.getBlockAttrs(bookmarkId);
        assertEq("书签记下原链接", cardAttrs[CUSTOM_ATTRIBUTE], EXAMPLE);

        const restored = await restoreBlock(api, bookmarkId, EXAMPLE);
        assertTrue("书签还原成功", restored);
        const back = await kramdown(bookmarkId);
        assertExcludes("还原后不再是书签卡片", back, "kg-bookmark-card");
        assertIncludes("还原后仍是这条链接", back, EXAMPLE);
        const cleared = await api.getBlockAttrs(bookmarkId);
        assertTrue("还原后属性已清除", !cleared[CUSTOM_ATTRIBUTE], JSON.stringify(cleared));

        const youtubeId = await insertParagraph(docId, YOUTUBE);
        const youtubeConverted = await convertBlock(api, youtubeId, YOUTUBE, "bookmarkCard");
        assertEq("YouTube 转成书签", youtubeConverted, "converted");
        const youtubeCard = await kramdown(youtubeId);
        assertIncludes("YouTube 书签含卡片类名", youtubeCard, "kg-bookmark-card");
        assertIncludes("YouTube 书签含缩略图", youtubeCard, "i.ytimg.com/vi/N4YOOt9UEdA");
        assertIncludes("YouTube 书签含视频标题", youtubeCard, "月下煮茶");
        assertIncludes("YouTube 书签是 HTML 块", await blockDom(youtubeId), 'data-type="NodeHTMLBlock"');
        const youtubeAttrs = await api.getBlockAttrs(youtubeId);
        assertEq("YouTube 书签记下原链接", youtubeAttrs[CUSTOM_ATTRIBUTE], YOUTUBE);

        const embedId = await insertParagraph(docId, SPOTIFY);
        const embedded = await convertBlock(api, embedId, SPOTIFY, "oembed");
        assertEq("Spotify 转成嵌入", embedded, "converted");
        const embedHtml = await kramdown(embedId);
        assertTrue(
            "嵌入内容来自 provider",
            /spotify|iframe/i.test(embedHtml),
            embedHtml.slice(0, 240),
        );
        assertIncludes("嵌入是 HTML 块", await blockDom(embedId), 'data-type="NodeHTMLBlock"');
        const embedAttrs = await api.getBlockAttrs(embedId);
        assertEq("嵌入记下原链接", embedAttrs[CUSTOM_ATTRIBUTE], SPOTIFY);
        const embedRestored = await restoreBlock(api, embedId, SPOTIFY);
        assertTrue("嵌入还原成功", embedRestored);
        const embedBack = await kramdown(embedId);
        assertIncludes("嵌入还原后仍是这条链接", embedBack, "spotify.com");
        assertExcludes("嵌入还原后不再保留 iframe", embedBack.toLowerCase(), "<iframe");
    } finally {
        if (notebookId) {
            try { await siyuanPost("/api/notebook/removeNotebook", { notebook: notebookId }); } catch { /* 清理失败不掩盖前面的断言 */ }
        }
    }
}

async function main() {
    console.log("\x1b[1m链接嵌入端到端测试\x1b[0m");
    partA();
    await partB();
    console.log("\n\x1b[1m──────── 汇总 ────────\x1b[0m");
    console.log(`  \x1b[32m通过: ${pass}\x1b[0m  \x1b[31m失败: ${fail}\x1b[0m`);
    if (fail > 0) {
        console.log("\n\x1b[31m失败明细:\x1b[0m");
        failures.forEach((item) => console.log(`  - ${item}`));
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
