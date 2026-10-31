/**
 * 番茄钟状态栏按钮
 *
 * @description 元素只创建一次，由插件的 addStatus 统一注册，保证位置紧邻「快捷键」按钮。
 *              模块关闭时只把元素 display 设为 none，不销毁，避免重新注册跑到状态栏末尾。
 */
import type FMiscPlugin from "@/index";

const STATUS_ROOT_CLASS = "trex-pomodoro-status";

/** 创建状态栏元素并挂到 plugin；返回根元素，供 service 接管内容 */
export const addStatus = (plugin: FMiscPlugin, onClick: () => void): HTMLElement | null => {
    const existing = document.querySelector(`.${STATUS_ROOT_CLASS}`) as HTMLElement | null;
    if (existing) return existing;

    const rootEl = document.createElement("div");
    rootEl.className = `toolbar__item ${STATUS_ROOT_CLASS}`;
    rootEl.title = "番茄钟";
    rootEl.innerHTML = `
        <span class="trex-pomodoro-status__icon" data-role="icon"><svg viewBox="0 0 24 24"><use href="#iconPomodoro"></use></svg></span>
        <span class="trex-pomodoro-status__time" data-role="time"></span>
    `;
    rootEl.addEventListener("click", onClick);
    plugin.addStatusBar({ element: rootEl });
    return rootEl;
};
