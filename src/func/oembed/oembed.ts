/**
 * Copyright (c) anarion80
 * 改编自 siyuan-oembed (https://github.com/anarion80/siyuan-oembed)，
 * 原作品以 GNU Affero General Public License v3.0 授权。
 * 本文件作为合入部分继续适用 AGPL-3.0。
 */

export interface OembedProvider {
    provider_name: string;
    provider_url: string;
    endpoints: Array<{
        schemes?: string[];
        discovery?: boolean;
        url: string;
    }>;
}

export interface ProviderMatch {
    provider: OembedProvider;
    endpoint: string;
}

export function matchProvider(url: string, providers: OembedProvider[]): ProviderMatch | null {
    if (!providers) return null;
    for (const provider of providers) {
        for (const endpoint of provider.endpoints || []) {
            const matched = endpoint.schemes?.some((scheme) => {
                const pattern = scheme.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "(.*)");
                return new RegExp(pattern).test(url);
            });
            if (matched && endpoint.url) {
                return { provider, endpoint: endpoint.url };
            }
        }
    }
    return null;
}

export function buildOembedEndpoint(endpoint: string, pageUrl: string, providerName: string): string {
    const requestUrl = new URL(endpoint.includes("{format}") ? endpoint.replace("{format}", "json") : endpoint);
    requestUrl.searchParams.set("url", pageUrl);
    if (providerName === "Twitter" || providerName === "X") {
        requestUrl.searchParams.set("theme", "dark");
        requestUrl.searchParams.set("dnt", "true");
        requestUrl.searchParams.set("omit_script", "false");
    }
    requestUrl.searchParams.set("format", "json");
    return requestUrl.toString();
}
