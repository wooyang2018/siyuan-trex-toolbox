/**
 * Copyright (c) anarion80
 * 改编自 siyuan-oembed (https://github.com/anarion80/siyuan-oembed)，
 * 原作品以 GNU Affero General Public License v3.0 授权。
 * 本文件作为合入部分继续适用 AGPL-3.0。
 */

import { generateBookmarkHtml, wrapOembedHtml } from "./html.ts";
import { parsePageMetadata, youtubeBookmark, youtubeFromOembed, youtubeVideoId } from "./metadata.ts";
import { buildOembedEndpoint, matchProvider, type OembedProvider } from "./oembed.ts";
import { isSingleHttpUrl } from "./url.ts";

export type ConvertStyle = "oembed" | "bookmarkCard";

export const CUSTOM_ATTRIBUTE = "custom-oembed-link";
const PROVIDERS_URL = "https://oembed.com/providers.json";

export const OEMBED_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export interface ProxyResult {
    status: number;
    body: string;
}

export interface OembedKernel {
    forwardProxy(url: string): Promise<ProxyResult | null>;
    updateBlockMarkdown(id: string, markdown: string): Promise<boolean>;
    setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void>;
    getBlockAttrs(id: string): Promise<Record<string, string>>;
}

export type ConvertResult = "converted" | "failed";

let providerCache: OembedProvider[] | null = null;

export function resetProviderCache() {
    providerCache = null;
}

async function loadProviders(kernel: OembedKernel): Promise<OembedProvider[] | null> {
    if (providerCache) return providerCache;
    const res = await kernel.forwardProxy(PROVIDERS_URL);
    if (!res || res.status !== 200 || !res.body) return null;
    try {
        const providers = JSON.parse(res.body) as OembedProvider[];
        if (!Array.isArray(providers)) return null;
        providerCache = providers;
        return providers;
    } catch {
        return null;
    }
}

export async function renderLink(
    kernel: OembedKernel,
    link: string,
    style: ConvertStyle,
): Promise<string | null> {
    if (style === "oembed") {
        const providers = await loadProviders(kernel);
        if (!providers) return null;
        const matched = matchProvider(link, providers);
        if (!matched) return null;
        const requestUrl = buildOembedEndpoint(matched.endpoint, link, matched.provider.provider_name);
        const res = await kernel.forwardProxy(requestUrl);
        if (res && res.status === 200 && res.body) {
            try {
                const data = JSON.parse(res.body) as { html?: string };
                if (data.html) return wrapOembedHtml(data.html, link);
            } catch {
                // 响应不是 oEmbed JSON 时，YouTube 仍可用本地 iframe。
            }
        }
        const videoId = youtubeVideoId(link);
        if (!videoId) return null;
        return wrapOembedHtml(
            `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`,
            link,
        );
    }

    if (youtubeVideoId(link)) {
        const card = (await youtubeCardFromOembed(kernel, link)) || youtubeBookmark(link);
        if (card) return generateBookmarkHtml(card);
    }

    const page = await kernel.forwardProxy(link);
    if (page && page.status === 200 && page.body) {
        return generateBookmarkHtml(parsePageMetadata(page.body, link));
    }
    return null;
}

async function youtubeCardFromOembed(kernel: OembedKernel, link: string): Promise<ReturnType<typeof youtubeFromOembed>> {
    const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`;
    const res = await kernel.forwardProxy(endpoint);
    if (!res || res.status !== 200 || !res.body) return null;
    try {
        return youtubeFromOembed(link, JSON.parse(res.body));
    } catch {
        return null;
    }
}

export async function convertBlock(
    kernel: OembedKernel,
    id: string,
    link: string,
    style: ConvertStyle,
): Promise<ConvertResult> {
    if (!id || !isSingleHttpUrl(link)) return "failed";
    const html = await renderLink(kernel, link, style);
    if (!html) return "failed";
    // 整段挤在一行时，思源会把它当成普通段落，标签会直接显示出来。
    // 外层 div 单独成行才会收成 HTML 块；内部不能再单独成行，否则块会提前结束。
    const compact = html.trim().replace(/\s*\n\s*/g, "");
    const updated = await kernel.updateBlockMarkdown(id, `<div>\n${compact}\n</div>`);
    if (!updated) return "failed";
    await kernel.setBlockAttrs(id, { [CUSTOM_ATTRIBUTE]: link });
    return "converted";
}

export async function restoreBlock(kernel: OembedKernel, id: string, link: string): Promise<boolean> {
    if (!id || !link) return false;
    const safe = link.replace(/\)/g, "%29");
    const updated = await kernel.updateBlockMarkdown(id, `[${safe}](${safe})`);
    if (!updated) return false;
    await kernel.setBlockAttrs(id, { [CUSTOM_ATTRIBUTE]: "" });
    return true;
}
