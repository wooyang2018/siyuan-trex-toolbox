/**
 * 番茄钟模块
 *
 * @description 状态栏倒计时 + 浮层快捷控制 + 统计弹窗。记录只存本机设备存储，
 *              不写入文档内容。设置走 declareSetting，持久化在 custom-module.config.json。
 */
import type FMiscPlugin from "@/index";
import { DEFAULT_SETTINGS, normalizeSettings, type PomodoroSettings } from "./engine";
import { PomodoroService } from "./service";
import { addStatus as addStatusElement } from "./status-bar";
import { PomodoroPopover } from "./ui/popover";
import "./index.scss";

export const name = "Pomodoro";
export let enabled = false;

export const category: SettingCategory = "pomodoro";

const config: PomodoroSettings = { ...DEFAULT_SETTINGS };

type NumericSettingKey = "focusMin" | "shortBreakMin" | "longBreakMin" | "longEvery";

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
};

const numberItem = (
    key: NumericSettingKey,
    title: string,
    description: string,
    min: number,
    max: number,
) => ({
    key,
    type: "number" as const,
    title,
    description,
    number: { min, max, step: 1 },
    get: () => config[key],
    set: (value: any) => {
        config[key] = clampNumber(value, min, max, DEFAULT_SETTINGS[key]);
        syncService();
    },
});

const toggleItem = (
    key: "autoStartBreak" | "autoStartFocus" | "sound",
    title: string,
    description: string,
) => ({
    key,
    type: "checkbox" as const,
    title,
    description,
    get: () => config[key],
    set: (value: any) => {
        config[key] = Boolean(value);
        syncService();
    },
});

export const declareSetting = {
    title: "番茄钟",
    description: "状态栏倒计时，经典 25/5/20 周期，内置任务清单与历史统计。",
    toggle: { defaultEnabled: true },
    configLoad: (values: Record<string, any>) => {
        Object.assign(config, normalizeSettings({ ...config, ...(values ?? {}) }));
    },
    configDump: () => ({ ...config }),
    configs: [
        numberItem("focusMin", "专注时长（分钟）", "一个番茄的长度，默认 25 分钟。", 1, 180),
        numberItem("shortBreakMin", "短休时长（分钟）", "每个番茄之后的短休息，默认 5 分钟。", 1, 60),
        numberItem("longBreakMin", "长休时长（分钟）", "跑满一轮之后的长时间休息，默认 20 分钟。", 1, 120),
        numberItem("longEvery", "长休间隔（个）", "每完成多少个番茄进入一次长休，默认 4 个。", 1, 12),
        toggleItem("autoStartBreak", "专注结束自动开始休息", "关闭后需要手动点开始。"),
        toggleItem("autoStartFocus", "休息结束自动开始专注", "默认关闭，避免休息结束后被动进入专注。"),
        toggleItem("sound", "结束提示音", "阶段结束时播放提示音；状态栏闪动与气泡提示不受此开关影响。"),
    ],
};

let plugin: FMiscPlugin | null = null;
let service: PomodoroService | null = null;
let popover: PomodoroPopover | null = null;
let statusElement: HTMLElement | null = null;
let booting: Promise<PomodoroService | null> | null = null;

/** 设置变更后同步给运行中的引擎 */
function syncService(): void {
    service?.refreshSettings();
}

const CMD_TOGGLE = "pomodoroToggle";
const CMD_SKIP = "pomodoroSkip";
const CMD_OPEN = "pomodoroOpen";

/** 是否处于小窗模式：小窗不启动计时，避免两个渲染进程写同一份存储 */
const isMiniWindow = (): boolean => document.body.classList.contains("body--window");

async function ensureService(): Promise<PomodoroService | null> {
    if (service) return service;
    if (!plugin) return null;
    if (booting) return booting;

    booting = (async () => {
        try {
            const instance = await PomodoroService.create(plugin!, () => ({ ...config }));
            instance.start();
            service = instance;
            popover = new PomodoroPopover(instance);
            // 状态栏元素统一由 addStatus 创建，保证位置紧跟「快捷键」按钮。
            if (statusElement) instance.attachStatusBar(statusElement);
            instance.setStatusBarVisible(enabled);
            return instance;
        } catch (error) {
            console.error("[Pomodoro] 服务启动失败:", error);
            return null;
        } finally {
            booting = null;
        }
    })();
    return booting;
}

function onStatusClick(): void {
    // 首次点击可能早于服务初始化完成，先等 ensureService 再开面板
    void ensureService().then(() => popover?.toggle(statusElement));
}

/**
 * 由插件的 addStatus 调用。
 * 元素在这里创建一次并常驻状态栏，模块禁用时只隐藏——避免开关模块后位置跑到末尾。
 */
export const addStatus = (plugin_: FMiscPlugin): void => {
    plugin = plugin_;
    if (isMiniWindow()) return;
    if (!statusElement) {
        statusElement = addStatusElement(plugin_, onStatusClick);
    }
    statusElement.style.display = enabled ? "" : "none";
    if (service) {
        service.attachStatusBar(statusElement);
        service.setStatusBarVisible(enabled);
    }
};

export const load = async (plugin_: FMiscPlugin): Promise<void> => {
    if (enabled) return;
    if (isMiniWindow()) return;
    plugin = plugin_;
    enabled = true;

    // 快捷键先注册：即使存储初始化失败，命令仍在，只是会提示不可用
    plugin.addCommandV2({
        langKey: CMD_TOGGLE,
        langText: "番茄钟：开始/暂停",
        callback: () => service?.toggle(),
    });
    plugin.addCommandV2({
        langKey: CMD_SKIP,
        langText: "番茄钟：跳过当前阶段",
        callback: () => service?.skip(),
    });
    plugin.addCommandV2({
        langKey: CMD_OPEN,
        langText: "番茄钟：打开控制面板",
        callback: () => {
            void ensureService().then(() => popover?.open(statusElement));
        },
    });

    // 状态栏元素由 addStatus 创建（addStatus 在 load 之后执行）。
    // 运行时从设置里启用模块时元素已存在，这里直接显示。
    if (statusElement) {
        statusElement.style.display = "";
    }

    // 服务异步初始化；失败只记日志，不让插件加载失败
    void ensureService().catch((error) => {
        console.error("[Pomodoro] 服务启动失败:", error);
    });
};

export const unload = (plugin_?: FMiscPlugin): void => {
    if (!enabled) return;
    enabled = false;
    const target = plugin_ ?? plugin;

    target?.delCommand(CMD_TOGGLE);
    target?.delCommand(CMD_SKIP);
    target?.delCommand(CMD_OPEN);

    popover?.dispose();
    popover = null;
    service?.stop();
    service = null;
    booting = null;

    if (statusElement) {
        statusElement.style.display = "none";
    }
};
