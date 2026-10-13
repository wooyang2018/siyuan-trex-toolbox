/**
 * Copyright (c) anarion80
 * 改编自 siyuan-oembed (https://github.com/anarion80/siyuan-oembed)，
 * 原作品以 GNU Affero General Public License v3.0 授权。
 * 本文件作为合入部分继续适用 AGPL-3.0。
 */

import type { LinkData } from "./html.ts";

function absUrl(value: string | null | undefined, pageUrl: string): string {
    if (!value) return "";
    try {
        return new URL(value, pageUrl).href;
    } catch {
        return value;
    }
}

function metaContent(doc: Document, selector: string): string {
    return doc.querySelector(selector)?.getAttribute("content") || "";
}

const YOUTUBE_ID = /^[\w-]{11}$/;

/** 从 YouTube / youtu.be 链接取出 11 位视频号。列表参数不影响结果。 */
export function youtubeVideoId(pageUrl: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(pageUrl);
    } catch {
        return null;
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") {
        id = parsed.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
        id = parsed.searchParams.get("v") || "";
        if (!YOUTUBE_ID.test(id)) {
            const parts = parsed.pathname.split("/").filter(Boolean);
            if (["embed", "shorts", "live"].includes(parts[0] || "") && parts[1]) id = parts[1];
        }
    }
    return YOUTUBE_ID.test(id) ? id : null;
}

/** 用 YouTube oEmbed JSON 填卡片。没有标题就返回空，交给本地兜底。 */
export function youtubeFromOembed(
    pageUrl: string,
    data: { title?: string; author_name?: string; thumbnail_url?: string; provider_name?: string },
): LinkData | null {
    const title = (data.title || "").trim();
    const id = youtubeVideoId(pageUrl);
    if (!title || !id) return null;
    return {
        title,
        description: "",
        icon: "https://www.youtube.com/favicon.ico",
        author: data.author_name || "",
        link: pageUrl,
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        publisher: data.provider_name || "YouTube",
    };
}

/** oEmbed 没有标题时的兜底：只保留原链接和缩略图地址。 */
export function youtubeBookmark(pageUrl: string): LinkData | null {
    const id = youtubeVideoId(pageUrl);
    if (!id) return null;
    return {
        title: "YouTube",
        description: "",
        icon: "https://www.youtube.com/favicon.ico",
        author: "",
        link: pageUrl,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        publisher: "YouTube",
    };
}

/** 从页面 HTML 读取书签卡片用的标题、描述、图标和缩略图。 */
export function parsePageMetadata(html: string, pageUrl: string): LinkData {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    const title =
        metaContent(doc, 'meta[property="og:title"]') ||
        doc.querySelector("title")?.textContent?.trim() ||
        doc.title ||
        "";
    const description =
        metaContent(doc, 'meta[property="og:description"]') ||
        metaContent(doc, 'meta[name="description"]');
    const iconHref =
        doc.querySelector('link[rel="icon"]')?.getAttribute("href") ||
        doc.querySelector('link[rel="shortcut icon"]')?.getAttribute("href") ||
        doc.querySelector('link[rel="alternate icon"]')?.getAttribute("href") ||
        doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ||
        "";
    const thumbnail =
        metaContent(doc, 'meta[property="og:image"]') ||
        metaContent(doc, 'meta[name="twitter:image"]');
    const author = metaContent(doc, 'meta[name="author"]');
    const publisher =
        metaContent(doc, 'meta[name="publisher"]') ||
        metaContent(doc, 'meta[property="og:site_name"]') ||
        (() => {
            try {
                return new URL(pageUrl).hostname;
            } catch {
                return "";
            }
        })();

    return {
        title,
        description,
        icon: absUrl(iconHref, pageUrl),
        author,
        link: pageUrl,
        thumbnail: absUrl(thumbnail, pageUrl),
        publisher,
    };
}
