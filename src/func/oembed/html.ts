/**
 * Copyright (c) anarion80
 * 改编自 siyuan-oembed (https://github.com/anarion80/siyuan-oembed)，
 * 原作品以 GNU Affero General Public License v3.0 授权。
 * 本文件作为合入部分继续适用 AGPL-3.0。
 */

import { bookmarkCss } from "./style.ts";

export interface LinkData {
    title: string;
    description: string;
    icon: string;
    author: string;
    link: string;
    thumbnail: string;
    publisher: string;
}

export function escapeHtml(value: string): string {
    return (value || "").replace(/[&"'<>]/g, (char) => {
        switch (char) {
            case "&": return "&amp;";
            case '"': return "&quot;";
            case "'": return "&#39;";
            case "<": return "&lt;";
            case ">": return "&gt;";
            default: return char;
        }
    });
}

export function generateBookmarkHtml(conf: LinkData): string | null {
    if (!conf.link) return null;
    const css = bookmarkCss();
    const title = escapeHtml(conf.title || conf.link);
    const description = escapeHtml(conf.description || "");
    const author = escapeHtml(conf.author || "");
    const publisher = escapeHtml(conf.publisher || "");
    const link = escapeHtml(conf.link);
    const icon = escapeHtml(conf.icon || "");
    const thumbnail = escapeHtml(conf.thumbnail || "");
    return `<div data-oembed-url="${link}">
        <style>${css}</style>
        <main class="kg-card-main">
            <div class="kg-card-outer">
                <div class="kg-card kg-bookmark-card">
                    <a class="kg-bookmark-container" href="${link}">
                        <div class="kg-bookmark-content">
                            <div class="kg-bookmark-title">${title}</div>
                            <div class="kg-bookmark-description">${description}</div>
                            <div class="kg-bookmark-metadata">
                                ${icon ? `<img class="kg-bookmark-icon" src="${icon}" alt="" />` : ""}
                                ${author ? `<span class="kg-bookmark-author">${author}</span>` : ""}
                                ${publisher ? `<span class="kg-bookmark-publisher">${publisher}</span>` : ""}
                            </div>
                        </div>
                        ${thumbnail ? `<div class="kg-bookmark-thumbnail"><img src="${thumbnail}" alt="" /></div>` : ""}
                    </a>
                </div>
            </div>
        </main>
    </div>`;
}

export function wrapOembedHtml(html: string, link: string): string {
    return `<div data-oembed-url="${escapeHtml(link)}">${html}</div>`;
}
