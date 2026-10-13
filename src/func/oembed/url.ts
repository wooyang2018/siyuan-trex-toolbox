/**
 * Copyright (c) anarion80
 * 改编自 siyuan-oembed (https://github.com/anarion80/siyuan-oembed)，
 * 原作品以 GNU Affero General Public License v3.0 授权。
 * 本文件作为合入部分继续适用 AGPL-3.0。
 */

/** 整段文本去掉空白后恰好是一条 http(s) URL。 */
export function isSingleHttpUrl(text: string): boolean {
    const value = (text || "").trim();
    if (!/^https?:\/\/\S+$/i.test(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}
