/**
 * 番茄钟计时引擎
 *
 * @description 纯逻辑实现，不依赖 DOM、思源 API 或真实定时器：
 *              - 时间来源通过 clock 注入，便于在脚本测试里用假时钟
 *              - 剩余时间一律由「绝对结束时间戳 - 当前时间」推出，不做累加，
 *                因此窗口休眠、定时器节流都不会造成漂移
 *              - 每次「结算」只产出一次记录，重复 tick 不会重复结算
 */

export type Phase = "focus" | "shortBreak" | "longBreak";

export type EngineStatus = "idle" | "running" | "paused";

export const PHASE_LABEL: Record<Phase, string> = {
    focus: "专注",
    shortBreak: "短休",
    longBreak: "长休",
};

export interface PomodoroSettings {
    /** 专注时长（分钟） */
    focusMin: number;
    /** 短休时长（分钟） */
    shortBreakMin: number;
    /** 长休时长（分钟） */
    longBreakMin: number;
    /** 每多少个专注进入一次长休 */
    longEvery: number;
    /** 专注结束后自动开始休息 */
    autoStartBreak: boolean;
    /** 休息结束后自动开始专注 */
    autoStartFocus: boolean;
    /** 结束提示音 */
    sound: boolean;
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 20,
    longEvery: 4,
    autoStartBreak: true,
    autoStartFocus: false,
    sound: true,
};

/** 阶段所属的任务上下文，记录到历史里 */
export interface PhaseContext {
    taskName: string;
    docId?: string;
    docTitle?: string;
}

export interface PomodoroRecord extends PhaseContext {
    id: string;
    phase: Phase;
    /** 阶段开始的绝对时间 */
    startedAt: number;
    /** 阶段结束的绝对时间 */
    endedAt: number;
    /** 计划时长 */
    plannedMs: number;
    /** 实际时长（放弃/跳过时小于计划时长） */
    actualMs: number;
    /** 是否自然走完 */
    completed: boolean;
}

export interface EngineSnapshot {
    phase: Phase;
    status: EngineStatus;
    startedAt: number | null;
    endAt: number | null;
    remainingMs: number;
    plannedMs: number;
    /** 当前周期内已完成的专注数（0 .. longEvery-1） */
    focusInCycle: number;
    /** 下一次开始时使用的任务上下文 */
    context: PhaseContext;
    /** 当前阶段开始时锁定的任务上下文 */
    activeContext: PhaseContext;
}

export interface TickResult {
    finishedPhase: Phase;
    record: PomodoroRecord;
    nextPhase: Phase;
    autoStarted: boolean;
}

export interface TransitionResult {
    record: PomodoroRecord;
    nextPhase: Phase;
    autoStarted: boolean;
}

const MIN_MS = 60_000;

let seq = 0;

const makeId = (): string =>
    `${Date.now().toString(36)}-${(seq++).toString(36)}`;

const normalizeMinutes = (value: unknown, fallback: number): number => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return Math.max(1, Math.round(num));
};

/** 把可能来自表单字符串的值修正为合法设置 */
export const normalizeSettings = (
    input: Partial<PomodoroSettings> | null | undefined,
): PomodoroSettings => {
    const src = input ?? {};
    return {
        focusMin: normalizeMinutes(src.focusMin, DEFAULT_SETTINGS.focusMin),
        shortBreakMin: normalizeMinutes(src.shortBreakMin, DEFAULT_SETTINGS.shortBreakMin),
        longBreakMin: normalizeMinutes(src.longBreakMin, DEFAULT_SETTINGS.longBreakMin),
        longEvery: normalizeMinutes(src.longEvery, DEFAULT_SETTINGS.longEvery),
        autoStartBreak: src.autoStartBreak ?? DEFAULT_SETTINGS.autoStartBreak,
        autoStartFocus: src.autoStartFocus ?? DEFAULT_SETTINGS.autoStartFocus,
        sound: src.sound ?? DEFAULT_SETTINGS.sound,
    };
};

const emptyContext = (): PhaseContext => ({ taskName: "" });

export class PomodoroEngine {
    private phase: Phase = "focus";

    private status: EngineStatus = "idle";

    private startedAt: number | null = null;

    private endAt: number | null = null;

    private frozenRemainingMs = 0;

    private focusInCycle = 0;

    private context: PhaseContext = emptyContext();

    private activeContext: PhaseContext = emptyContext();

    private readonly getSettings: () => PomodoroSettings;

    private readonly clock: () => number;

    constructor(
        getSettings: () => PomodoroSettings,
        clock: () => number = () => Date.now(),
    ) {
        this.getSettings = getSettings;
        this.clock = clock;
    }

    // ==================== 查询 ====================

    phaseDurationMs(phase: Phase = this.phase): number {
        const settings = normalizeSettings(this.getSettings());
        const minutes =
            phase === "focus"
                ? settings.focusMin
                : phase === "shortBreak"
                    ? settings.shortBreakMin
                    : settings.longBreakMin;
        return minutes * MIN_MS;
    }

    remainingMs(now: number = this.clock()): number {
        if (this.status === "running" && this.endAt !== null) {
            return Math.max(0, this.endAt - now);
        }
        if (this.status === "paused") {
            return Math.max(0, this.frozenRemainingMs);
        }
        return this.phaseDurationMs();
    }

    getSnapshot(now: number = this.clock()): EngineSnapshot {
        return {
            phase: this.phase,
            status: this.status,
            startedAt: this.startedAt,
            endAt: this.endAt,
            remainingMs: this.remainingMs(now),
            plannedMs: this.phaseDurationMs(),
            focusInCycle: this.focusInCycle,
            context: { ...this.context },
            activeContext: { ...this.activeContext },
        };
    }

    // ==================== 任务上下文 ====================

    /**
     * 更新任务上下文。
     * 同时同步 activeContext：当前阶段进行中改任务名，记录里也应该用新名字，
     * 否则"先开始番茄、后填任务"会让整条记录的任务名是空的。
     */
    setContext(patch: Partial<PhaseContext>): void {
        this.context = { ...this.context, ...patch };
        this.activeContext = { ...this.activeContext, ...patch };
    }

    // ==================== 控制 ====================

    start(phase: Phase = this.phase, context?: Partial<PhaseContext>): void {
        if (context) this.setContext(context);
        const now = this.clock();
        this.phase = phase;
        this.status = "running";
        this.startedAt = now;
        this.endAt = now + this.phaseDurationMs(phase);
        this.frozenRemainingMs = 0;
        this.activeContext = { ...this.context };
    }

    pause(): boolean {
        if (this.status !== "running") return false;
        this.frozenRemainingMs = this.remainingMs();
        this.status = "paused";
        return true;
    }

    resume(): boolean {
        if (this.status !== "paused") return false;
        const remaining = Math.max(0, this.frozenRemainingMs);
        this.endAt = this.clock() + remaining;
        this.status = "running";
        return true;
    }

    toggle(): void {
        if (this.status === "idle") this.start();
        else if (this.status === "running") this.pause();
        else this.resume();
    }

    /** 回到空闲态；默认停在专注阶段，方便下一次开始 */
    goIdle(phase: Phase = "focus"): void {
        this.phase = phase;
        this.status = "idle";
        this.startedAt = null;
        this.endAt = null;
        this.frozenRemainingMs = 0;
    }

    /** 放弃当前阶段，返回未完成记录 */
    abandon(): PomodoroRecord | null {
        if (this.status === "idle") return null;
        const record = this.buildRecord(false);
        this.goIdle("focus");
        return record;
    }

    /**
     * 跳过当前阶段：不计入完成数，直接推进到下一阶段。
     * 是否自动开始按对应设置决定。
     */
    skip(): TransitionResult | null {
        if (this.status === "idle") return null;
        const record = this.buildRecord(false);
        const nextPhase = this.followingPhase(this.phase, false);
        this.advance(nextPhase);
        return {
            record,
            nextPhase,
            autoStarted: this.status === "running",
        };
    }

    /**
     * 推进时间。跨过结束时间时结算一次。
     * @param now 当前时间
     */
    tick(now: number = this.clock()): TickResult | null {
        if (this.status !== "running" || this.endAt === null) return null;
        if (now < this.endAt) return null;

        const finishedPhase = this.phase;
        const plannedMs = this.phaseDurationMs(finishedPhase);
        const record: PomodoroRecord = {
            id: makeId(),
            phase: finishedPhase,
            startedAt: this.startedAt ?? this.endAt - plannedMs,
            endedAt: this.endAt,
            plannedMs,
            actualMs: plannedMs,
            completed: true,
            ...this.snapshotContext(),
        };

        const nextPhase = this.followingPhase(finishedPhase, true);
        this.advance(nextPhase);

        return {
            finishedPhase,
            record,
            nextPhase,
            autoStarted: this.status === "running",
        };
    }

    // ==================== 持久化 ====================

    restore(snapshot: EngineSnapshot | null | undefined): void {
        if (!snapshot) return;
        this.phase = snapshot.phase ?? "focus";
        this.status = snapshot.status ?? "idle";
        this.startedAt = snapshot.startedAt ?? null;
        this.endAt = snapshot.endAt ?? null;
        this.focusInCycle = Math.max(0, snapshot.focusInCycle ?? 0);
        this.context = { taskName: "", ...(snapshot.context ?? {}) };
        this.activeContext = { taskName: "", ...(snapshot.activeContext ?? snapshot.context ?? {}) };

        if (this.status === "running" && this.endAt === null) {
            this.status = "idle";
        }
        if (this.status === "paused") {
            this.frozenRemainingMs = Math.max(0, snapshot.remainingMs ?? 0);
            if (this.startedAt === null) this.startedAt = this.clock();
        }
        if (this.status === "idle") {
            this.startedAt = null;
            this.endAt = null;
            this.frozenRemainingMs = 0;
        }
    }

    // ==================== 内部 ====================

    private snapshotContext(): PhaseContext {
        return {
            taskName: this.activeContext.taskName ?? "",
            docId: this.activeContext.docId,
            docTitle: this.activeContext.docTitle,
        };
    }

    private buildRecord(completed: boolean): PomodoroRecord {
        const now = this.clock();
        const plannedMs = this.phaseDurationMs(this.phase);
        const remaining = this.remainingMs(now);
        return {
            id: makeId(),
            phase: this.phase,
            startedAt: this.startedAt ?? now,
            endedAt: now,
            plannedMs,
            actualMs: Math.max(0, Math.min(plannedMs, plannedMs - remaining)),
            completed,
            ...this.snapshotContext(),
        };
    }

    /**
     * 计算下一个阶段。
     * @param finished 刚结束的阶段
     * @param countIt 是否把这次专注计入周期（tick 结算为 true，skip 为 false）
     */
    private followingPhase(finished: Phase, countIt: boolean): Phase {
        if (finished !== "focus") return "focus";
        const settings = normalizeSettings(this.getSettings());
        const nextCount = this.focusInCycle + (countIt ? 1 : 0);
        if (countIt && nextCount >= settings.longEvery) {
            this.focusInCycle = 0;
            return "longBreak";
        }
        if (countIt) this.focusInCycle = nextCount;
        return "shortBreak";
    }

    /** 切到指定阶段；按设置决定是否自动开始 */
    private advance(nextPhase: Phase): void {
        const settings = normalizeSettings(this.getSettings());
        const autoStart = nextPhase === "focus" ? settings.autoStartFocus : settings.autoStartBreak;
        if (!autoStart) {
            this.goIdle(nextPhase);
            return;
        }
        this.start(nextPhase);
    }
}
