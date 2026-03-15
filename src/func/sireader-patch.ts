/**
 * SiReader 授权拦截模块
 * @description 拦截 siyuan-sireader 插件对 api.745201.xyz 的授权验证请求，
 *              返回伪造的 lifetime 会员响应，绕过订阅限制。仅供个人本地使用。
 *
 * 策略：在模块文件加载时**立即**安装 fetch hook，确保在 sireader 加载前生效。
 *       作为"始终启用"模块注册，不需要用户手动开关。
 */
import type FMiscPlugin from "@/index";

const TAG = '[SiReader-Patch]';
const TARGET_HOST = 'api.745201.xyz';
const CLOUD_USER_API = '/api/setting/getCloudUser';
const HITOKOTO_HOST = 'v1.hitokoto.cn';

/** 使用霸王龙工具箱自己的 icon 作为替代头像 */
const LOCAL_AVATAR = '/plugins/siyuan-trex-toolbox/icon.png';

/**
 * 构造伪造的 lifetime 授权响应数据
 * 字段与 sireader LicenseInfo 对齐，确保 spread 合并后数据完整
 */
function buildFakeLicenseData(): Record<string, any> {
    return {
        type: 'lifetime',
        activatedAt: Date.now() - 86400000 * 365, // 1 年前激活
        expiresAt: 0,       // 0 = 永不过期
        features: ['*'],    // 全部功能
        daysRemaining: -1,  // 无限
    };
}

/** 保存原始 fetch 引用 */
let originalFetch: typeof window.fetch | null = null;

/** 当前已安装的 patched fetch 引用，用于 unload 时精确恢复 */
let patchedFetch: typeof window.fetch | null = null;

/**
 * 创建伪造的成功 Response
 */
function createFakeResponse(data: object): Response {
    return new Response(JSON.stringify(data), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * 安装 fetch 拦截
 */
function installHook() {
    if (originalFetch) {
        console.warn(TAG, 'Hook 已安装，跳过重复安装');
        return;
    }

    originalFetch = window.fetch;

    const _originalFetch = originalFetch; // 闭包中持有，避免 null 检查

    patchedFetch = function (
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> {
        const url = typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.href
                : input instanceof Request
                    ? input.url
                    : '';

        try {
            if (url.includes(TARGET_HOST)) {
                const fakeData = buildFakeLicenseData();
                if (url.includes('/activate')) {
                    console.log(TAG, '拦截 /activate 请求 →', url);
                    console.log(TAG, '返回伪造 lifetime 授权:', fakeData);
                    return Promise.resolve(createFakeResponse(fakeData));
                }
                if (url.includes('/verify')) {
                    console.log(TAG, '拦截 /verify 请求 →', url);
                    console.log(TAG, '返回伪造 lifetime 授权:', fakeData);
                    return Promise.resolve(createFakeResponse(fakeData));
                }
                // 其他 api.745201.xyz 路径也拦截，防止遗漏
                console.log(TAG, `拦截未知端点: ${url}，返回伪造授权`);
                return Promise.resolve(createFakeResponse(fakeData));
            }

            // 拦截 getCloudUser 响应，替换头像 URL 避免外部图片加载失败
            if (url.includes(CLOUD_USER_API)) {
                return _originalFetch.apply(globalThis, [input, init] as any).then(async (res: Response) => {
                    try {
                        const cloned = res.clone();
                        const json = await cloned.json();
                        if (json?.code === 0 && json?.data?.userAvatarURL) {
                            json.data.userAvatarURL = LOCAL_AVATAR;
                            console.log(TAG, '替换 userAvatarURL → 本地头像');
                            return new Response(JSON.stringify(json), {
                                status: res.status,
                                statusText: res.statusText,
                                headers: res.headers,
                            });
                        }
                    } catch { /* 解析失败则返回原始响应 */ }
                    return res;
                });
            }

            // 拦截一言 API，返回本地静态数据，避免 SSL 错误刷屏控制台
            if (url.includes(HITOKOTO_HOST)) {
                console.log(TAG, '拦截 hitokoto 请求，返回本地静态诗词');
                return Promise.resolve(createFakeResponse({
                    id: 0,
                    uuid: 'local-fallback',
                    hitokoto: '多学以广才，多想以深思，多问以解惑，多练以致用。',
                    type: 'i',
                    from: '座右铭',
                    from_who: null,
                    creator: 'local',
                    creator_uid: 0,
                    reviewer: 0,
                    commit_from: 'local',
                    created_at: '',
                    length: 10,
                }));
            }
        } catch (e) {
            console.error(TAG, '拦截逻辑异常，透传原始请求:', e);
        }

        // 非目标请求，透传给原始 fetch
        return _originalFetch.apply(globalThis, [input, init] as any);
    } as typeof window.fetch;

    window.fetch = patchedFetch;
    console.log(TAG, '✅ Fetch 拦截已安装（立即生效）');
}

/**
 * 卸载 fetch 拦截，恢复原始 fetch
 */
function uninstallHook() {
    if (!originalFetch) {
        console.warn(TAG, 'Hook 未安装，跳过卸载');
        return;
    }

    // 仅当 window.fetch 仍为我们替换的版本时才恢复，避免覆盖其他插件的 patch
    if (window.fetch === patchedFetch) {
        window.fetch = originalFetch;
        console.log(TAG, '✅ 已恢复原始 fetch');
    } else {
        console.warn(TAG, '⚠️ window.fetch 已被其他代码修改，跳过恢复以避免冲突');
    }

    originalFetch = null;
    patchedFetch = null;
}

// ===================== 立即安装 hook =====================
// 在模块文件被 import 时就执行，确保在所有插件 onload 之前生效
installHook();

// ===================== 模块导出 =====================

export const name = 'SiReaderPatch';
export let enabled = true; // 标记为已启用（hook 已在文件加载时安装）

export const load = (_plugin: FMiscPlugin) => {
    // hook 已在文件加载时自动安装，这里确保状态正确
    if (!originalFetch) {
        installHook();
    }
    enabled = true;
};

export const unload = (_plugin?: FMiscPlugin) => {
    if (!enabled) return;
    uninstallHook();
    enabled = false;
};
