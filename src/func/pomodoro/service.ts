/**
 * 番茄钟服务：把引擎、存储、状态栏和提醒串起来
 *
 * @description 单实例。状态栏元素在 addStatus() 时创建一次并常驻，
 *              模块启用/禁用只切换显隐，避免元素在运行时重新排到状态栏末尾。
 *              设置由模块的 declareSetting 持有（持久化在 custom-module.config.json），
 *              服务只读取，不单独存一份。
 */
import { showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import { getActiveDoc } from "@frostime/siyuan-plugin-kits";
import {
    PomodoroEngine,
    PHASE_LABEL,
    type Phase,
    type PomodoroRecord,
    type PomodoroSettings,
} from "./engine";
import { PomodoroStore } from "./store";
import { disposeAudio, playChime, unlockAudio } from "./sound";
import { mmss } from "./ui/format";

/** 刷新周期：只做重绘，时间由 endAt 推算，不会累积误差 */
const TICK_MS = 500;

export type ServiceListener = () => void;

export class PomodoroService {
    readonly engine: PomodoroEngine;

    private timer: ReturnType<typeof setInterval> | null = null;

    private listeners = new Set<ServiceListener>();

    private statusRoot: HTMLElement | null = null;

    private statusTime: HTMLElement | null = null;

    private statusIcon: HTMLElement | null = null;

    /** 已经画进状态栏的图标 id。阶段没变时不再拆掉重插 */
    private paintedIconId = "";

    private flashTimer: ReturnType<typeof setTimeout> | null = null;

    private constructor(
        readonly store: PomodoroStore,
        private readonly readSettings: () => PomodoroSettings,
    ) {
        this.engine = new PomodoroEngine(() => this.readSettings());
        this.engine.setContext({ taskName: store.getCurrentTask() });
    }

    /** 当前生效的设置快照 */
    getSettings(): PomodoroSettings {
        return this.readSettings();
    }

    static async create(
        plugin: FMiscPlugin,
        getSettings: () => PomodoroSettings,
    ): Promise<PomodoroService> {
        const store = await PomodoroStore.create(plugin);
        return new PomodoroService(store, getSettings);
    }

    // ==================== 生命周期 ====================

    start(): void {
        this.restoreRuntime();
        this.startTimer();
        this.render();
    }

    stop(): void {
        this.stopTimer();
        // 保留运行态快照：再次启用模块时可续跑；若期间已走完，恢复时结算一次
        this.persistRuntime();
        this.store.dispose();
        disposeAudio();
        this.listeners.clear();
        this.statusRoot = null;
        this.statusTime = null;
        this.statusIcon = null;
        this.paintedIconId = "";
    }

    /** 设置变更后刷新界面（时长变化会在下一次开始阶段时生效） */
    refreshSettings(): void {
        this.render();
    }

    // ==================== 订阅 ====================

    subscribe(listener: ServiceListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notify(): void {
        this.listeners.forEach((listener) => {
            try {
                listener();
            } catch (error) {
                console.error("[Pomodoro] 订阅回调异常:", error);
            }
        });
    }

    // ==================== 状态栏 ====================

    /** 由插件的 addStatus 调用，只创建一次 */
    attachStatusBar(root: HTMLElement): void {
        this.statusRoot = root;
        this.statusIcon = root.querySelector("[data-role='icon']") as HTMLElement | null;
        this.statusTime = root.querySelector("[data-role='time']") as HTMLElement | null;
        this.paintedIconId = "";
        this.renderStatusBar();
    }

    /** 模块启用/禁用时切换显隐 */
    setStatusBarVisible(visible: boolean): void {
        if (!this.statusRoot) return;
        this.statusRoot.style.display = visible ? "" : "none";
    }

    getStatusBarElement(): HTMLElement | null {
        return this.statusRoot;
    }

    private renderStatusBar(): void {
        const snapshot = this.engine.getSnapshot();
        if (this.statusTime) {
            // 空闲时显示计划时长，运行和暂停时显示倒计时
            const text = mmss(snapshot.status === "idle" ? snapshot.plannedMs : snapshot.remainingMs);
            this.statusTime.textContent = text;
        }
        if (this.statusIcon) {
            const iconId = snapshot.phase === "focus" ? "iconPomodoro" : "iconPomodoroBreak";
            if (this.paintedIconId !== iconId) {
                // 不写内联宽高，尺寸统一交给 CSS 控制，避免与样式表冲突
                this.statusIcon.innerHTML = `<svg viewBox="0 0 24 24"><use href="#${iconId}"></use></svg>`;
                this.paintedIconId = iconId;
            }
        }
        if (!this.statusRoot) return;
        this.statusRoot.classList.toggle("pomodoro--idle", snapshot.status === "idle");
        this.statusRoot.classList.toggle("pomodoro--running", snapshot.status === "running");
        this.statusRoot.classList.toggle("pomodoro--paused", snapshot.status === "paused");
        this.statusRoot.classList.toggle(
            "pomodoro--break",
            snapshot.phase !== "focus" && snapshot.status !== "idle",
        );
        const titles = ["番茄钟"];
        if (snapshot.status === "idle") {
            titles.push(`${PHASE_LABEL[snapshot.phase]} ${mmss(snapshot.plannedMs)} · 点击开始`);
        } else {
            titles.push(`${PHASE_LABEL[snapshot.phase]} ${mmss(snapshot.remainingMs)}`);
        }
        this.statusRoot.title = titles.join(" · ");
    }

    /** 阶段结束时闪动状态栏（CSS 里固定闪 3 次） */
    private flash(): void {
        if (!this.statusRoot) return;
        if (this.flashTimer) clearTimeout(this.flashTimer);
        this.statusRoot.classList.remove("pomodoro--flash");
        // 强制重排以便重新触发动画
        void this.statusRoot.offsetWidth;
        this.statusRoot.classList.add("pomodoro--flash");
        this.flashTimer = setTimeout(() => {
            this.statusRoot?.classList.remove("pomodoro--flash");
            this.flashTimer = null;
        }, 2400);
    }

    // ==================== 控制 ====================

    toggle(): void {
        unlockAudio();
        const snapshot = this.engine.getSnapshot();
        if (snapshot.status === "idle") {
            // 和浮层按钮同一条路径：空闲时开始要带上当前文档
            this.beginPhase(snapshot.phase);
            return;
        }
        this.engine.toggle();
        this.afterChange();
    }

    skip(): void {
        const result = this.engine.skip();
        if (!result) return;
        this.store.addRecord(result.record);
        this.afterChange();
    }

    abandon(): void {
        const record = this.engine.abandon();
        if (record) this.store.addRecord(record);
        this.afterChange();
    }

    setTask(name: string): void {
        const trimmed = (name ?? "").trim();
        this.store.setCurrentTask(trimmed);
        this.engine.setContext({ taskName: trimmed });
        this.notify();
    }

    removeTask(name: string): void {
        const trimmed = (name ?? "").trim();
        if (!trimmed) return;
        const wasCurrent = this.store.getCurrentTask() === trimmed;
        this.store.removeTask(trimmed);
        if (wasCurrent) this.engine.setContext({ taskName: "" });
        this.notify();
    }

    /** 开始阶段时把当前文档一并写进上下文，便于统计按文档聚合 */
    private beginPhase(phase: Phase): void {
        this.engine.start(phase, {
            taskName: this.store.getCurrentTask(),
            ...this.currentDoc(),
        });
        this.afterChange();
    }

    private afterChange(): void {
        this.persistRuntime();
        this.syncTicker();
        this.render();
    }

    // ==================== 内部循环 ====================

    /** 只在运行时轮询；空闲/暂停不占用定时器 */
    private syncTicker(): void {
        const running = this.engine.getSnapshot().status === "running";
        if (running && !this.timer) {
            this.timer = setInterval(() => this.onTick(), TICK_MS);
        } else if (!running && this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private startTimer(): void {
        document.addEventListener("visibilitychange", this.onVisibilityChange);
        this.syncTicker();
    }

    private stopTimer(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }

    private onVisibilityChange = (): void => {
        if (document.visibilityState === "visible") {
            this.onTick();
        }
    };

    private onTick(): void {
        const result = this.engine.tick();
        if (result) {
            this.store.addRecord(result.record);
            this.announceFinish(result.record, result.nextPhase, result.autoStarted);
            this.persistRuntime();
        }
        this.syncTicker();
        this.render();
    }

    private render(): void {
        this.renderStatusBar();
        this.notify();
    }

    // ==================== 提醒 ====================

    private announceFinish(record: PomodoroRecord, nextPhase: Phase, autoStarted: boolean): void {
        if (this.getSettings().sound) playChime(record.phase);
        this.flash();

        const nextLabel = PHASE_LABEL[nextPhase];
        const suffix = autoStarted ? `已开始${nextLabel}` : `准备好后开始${nextLabel}`;
        showMessage(`番茄钟：${PHASE_LABEL[record.phase]}结束，${suffix}`, 4000);
    }

    // ==================== 持久化 ====================

    private persistRuntime(): void {
        this.store.saveRuntime(this.engine.getSnapshot());
    }

    private restoreRuntime(): void {
        const snapshot = this.store.getRuntime();
        if (!snapshot) {
            this.persistRuntime();
            return;
        }
        this.engine.restore(snapshot);
        const restored = this.engine.getSnapshot();
        if (restored.status !== "running" || restored.endAt === null) {
            this.persistRuntime();
            return;
        }

        // 关闭期间已经走完：用引擎自身结算一次（复用周期计数与记录构造），
        // 然后立刻停回空闲——离线结束的阶段不自动开始下一段。
        const result = this.engine.tick();
        if (!result) {
            this.persistRuntime();
            return;
        }
        this.store.addRecord(result.record);
        this.engine.goIdle(result.nextPhase);
        showMessage(`番茄钟：${PHASE_LABEL[result.record.phase]}已在后台结束`, 4000);
        this.persistRuntime();
    }

    // ==================== 文档上下文 ====================

    private currentDoc(): { docId?: string; docTitle?: string } {
        try {
            const docId = getActiveDoc();
            if (!docId) return {};
            const titleEl = document.querySelector(
                `.protyle-background[data-node-id="${docId}"] .protyle-title__input`,
            ) as HTMLElement | null;
            const title =
                titleEl?.textContent?.trim() ||
                titleEl?.getAttribute("data-value") ||
                "";
            return { docId, docTitle: title };
        } catch {
            return {};
        }
    }
}
