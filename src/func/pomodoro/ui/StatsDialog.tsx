/**
 * 番茄钟统计
 *
 * @description 只看聚合趋势：今日、区间指标和每日柱状图。
 */
import { For, Show, createMemo, createSignal, onCleanup, onMount, type Component } from "solid-js";
import type { PomodoroService } from "../service";
import { dayKey, humanDuration, recentDayKeys } from "./format";

interface StatsProps {
    service: PomodoroService;
}

const RANGE_OPTIONS: { days: number; label: string }[] = [
    { days: 7, label: "近 7 天" },
    { days: 30, label: "近 30 天" },
];

/** 一天的聚合结果 */
interface DayBucket {
    key: string;
    label: string;
    /** 完成的番茄数 */
    count: number;
    /** 专注总时长（含未完成的实际投入） */
    focusMs: number;
    /** 中途放弃/跳过的次数 */
    abandoned: number;
    /** 柱高比例，0~1 */
    ratio: number;
}

const StatsDialog: Component<StatsProps> = (props) => {
    const [rangeDays, setRangeDays] = createSignal(7);
    const [revision, setRevision] = createSignal(0);

    onMount(() => {
        const unsubscribe = props.service.subscribe(() => setRevision((v) => v + 1));
        onCleanup(unsubscribe);
    });

    /** 只统计专注阶段；休息阶段不计入番茄数与专注时长 */
    const focusRecords = createMemo(() => {
        revision();
        return props.service.store.getRecords().filter((r) => r.phase === "focus");
    });

    const daily = createMemo<DayBucket[]>(() => {
        const days = recentDayKeys(rangeDays());
        const map = new Map<string, { count: number; focusMs: number; abandoned: number }>();
        days.forEach((d) => map.set(d, { count: 0, focusMs: 0, abandoned: 0 }));

        for (const r of focusRecords()) {
            const bucket = map.get(dayKey(r.endedAt));
            if (!bucket) continue;
            if (r.completed) bucket.count += 1;
            else bucket.abandoned += 1;
            bucket.focusMs += r.actualMs;
        }

        const max = Math.max(1, ...days.map((d) => map.get(d)!.count));
        return days.map((d) => {
            const b = map.get(d)!;
            return {
                key: d,
                label: d.slice(5),
                ...b,
                ratio: b.count / max,
            };
        });
    });

    const totals = createMemo(() => {
        const buckets = daily();
        return {
            count: buckets.reduce((s, b) => s + b.count, 0),
            focusMs: buckets.reduce((s, b) => s + b.focusMs, 0),
            abandoned: buckets.reduce((s, b) => s + b.abandoned, 0),
            activeDays: buckets.filter((b) => b.count > 0).length,
        };
    });

    const today = createMemo(() => {
        const key = dayKey(Date.now());
        const records = focusRecords().filter((r) => dayKey(r.endedAt) === key);
        return {
            count: records.filter((r) => r.completed).length,
            focusMs: records.reduce((s, r) => s + r.actualMs, 0),
        };
    });

    /** 连续完成天数，从今天往前数 */
    const streak = createMemo(() => {
        const counts = new Map<string, number>();
        for (const r of focusRecords()) {
            if (!r.completed) continue;
            const k = dayKey(r.endedAt);
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const keys = recentDayKeys(180).reverse();
        let n = 0;
        for (const k of keys) {
            if ((counts.get(k) ?? 0) > 0) n += 1;
            else if (n > 0) break;
        }
        return n;
    });

    /** 平均每个番茄的实际专注时长，用来发现番茄是否常被打断 */
    const avgMs = createMemo(() => {
        const done = focusRecords().filter((r) => r.completed);
        if (done.length === 0) return 0;
        return done.reduce((s, r) => s + r.actualMs, 0) / done.length;
    });

    const empty = createMemo(() => focusRecords().length === 0);

    return (
        <div class="trex-pomodoro-stats">
            <div class="trex-pomodoro-stats__head">
                <div class="trex-pomodoro-stats__summary">
                    今日 <strong>{today().count}</strong> 个番茄 · {humanDuration(today().focusMs)}
                </div>
                <div class="trex-pomodoro-stats__seg">
                    <For each={RANGE_OPTIONS}>
                        {(opt) => (
                            <button
                                type="button"
                                class="trex-pomodoro-stats__seg-item"
                                classList={{ "trex-pomodoro-stats__seg-item--active": rangeDays() === opt.days }}
                                onClick={() => setRangeDays(opt.days)}
                            >
                                {opt.label}
                            </button>
                        )}
                    </For>
                </div>
            </div>

            <div class="trex-pomodoro-stats__kpis">
                <div class="trex-pomodoro-stats__kpi">
                    <div class="trex-pomodoro-stats__kpi-value">{totals().count}</div>
                    <div class="trex-pomodoro-stats__kpi-label">完成番茄</div>
                </div>
                <div class="trex-pomodoro-stats__kpi">
                    <div class="trex-pomodoro-stats__kpi-value">{humanDuration(totals().focusMs)}</div>
                    <div class="trex-pomodoro-stats__kpi-label">专注时长</div>
                </div>
                <div class="trex-pomodoro-stats__kpi">
                    <div class="trex-pomodoro-stats__kpi-value">{streak()}</div>
                    <div class="trex-pomodoro-stats__kpi-label">连续天数</div>
                </div>
                <div class="trex-pomodoro-stats__kpi">
                    <div class="trex-pomodoro-stats__kpi-value">{totals().activeDays}</div>
                    <div class="trex-pomodoro-stats__kpi-label">有记录天数</div>
                </div>
                <div class="trex-pomodoro-stats__kpi">
                    <div class="trex-pomodoro-stats__kpi-value">{avgMs() ? humanDuration(avgMs()) : "—"}</div>
                    <div class="trex-pomodoro-stats__kpi-label">平均单次</div>
                </div>
            </div>

            <Show
                when={!empty()}
                fallback={
                    <div class="trex-pomodoro-stats__card trex-pomodoro-stats__empty-block">
                        <div class="trex-pomodoro-stats__empty">
                            还没有完成的番茄。点状态栏的番茄钟开始第一个吧。
                        </div>
                    </div>
                }
            >
                <div class="trex-pomodoro-stats__card trex-pomodoro-stats__chart-card">
                    <div class="trex-pomodoro-stats__chart-title">
                        每日完成番茄数
                        <span class="trex-pomodoro-stats__muted">
                            区间内共 {totals().count} 个
                            <Show when={totals().abandoned > 0}>
                                ，放弃 {totals().abandoned} 次
                            </Show>
                        </span>
                    </div>
                    <div class="trex-pomodoro-stats__chart">
                        <For each={daily()}>
                            {(day) => (
                                <div
                                    class="trex-pomodoro-stats__bar-slot"
                                    title={
                                        day.count === 0 && day.focusMs === 0
                                            ? `${day.key}：无记录`
                                            : `${day.key}：${day.count} 个番茄，专注 ${humanDuration(day.focusMs)}`
                                    }
                                >
                                    <div class="trex-pomodoro-stats__bar-value">{day.count || ""}</div>
                                    <div class="trex-pomodoro-stats__bar-track">
                                        <div
                                            class="trex-pomodoro-stats__bar"
                                            classList={{ "trex-pomodoro-stats__bar--empty": day.count === 0 }}
                                            style={{
                                                height: `${day.count === 0 ? 2 : Math.max(day.ratio * 100, 6)}%`,
                                            }}
                                        />
                                    </div>
                                    <div class="trex-pomodoro-stats__bar-label">{day.label}</div>
                                </div>
                            )}
                        </For>
                    </div>
                </div>

                <div class="trex-pomodoro-stats__card trex-pomodoro-stats__chart-card">
                    <div class="trex-pomodoro-stats__chart-title">每日专注时长</div>
                    <div class="trex-pomodoro-stats__chart">
                        <For each={daily()}>
                            {(day) => {
                                const maxMs = Math.max(1, ...daily().map((d) => d.focusMs));
                                const h = day.focusMs === 0 ? 2 : Math.max((day.focusMs / maxMs) * 100, 6);
                                return (
                                    <div
                                        class="trex-pomodoro-stats__bar-slot"
                                        title={`${day.key}：${humanDuration(day.focusMs)}`}
                                    >
                                        <div class="trex-pomodoro-stats__bar-value">
                                            {day.focusMs >= 3_600_000
                                                ? `${(day.focusMs / 3_600_000).toFixed(1)}h`
                                                : day.focusMs > 0
                                                    ? `${Math.round(day.focusMs / 60_000)}m`
                                                    : ""}
                                        </div>
                                        <div class="trex-pomodoro-stats__bar-track">
                                            <div
                                                class="trex-pomodoro-stats__bar trex-pomodoro-stats__bar--alt"
                                                classList={{ "trex-pomodoro-stats__bar--empty": day.focusMs === 0 }}
                                                style={{ height: `${h}%` }}
                                            />
                                        </div>
                                        <div class="trex-pomodoro-stats__bar-label">{day.label}</div>
                                    </div>
                                );
                            }}
                        </For>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default StatsDialog;
