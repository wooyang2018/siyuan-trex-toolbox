#!/usr/bin/env node
/**
 * 番茄钟计时引擎测试
 *
 * 纯逻辑，不连思源：用可控的假时钟验证周期、暂停、跳过、放弃与恢复。
 *
 * 运行: node --experimental-strip-types scripts/tests/test-pomodoro-engine.ts
 */
import {
    DEFAULT_SETTINGS,
    PomodoroEngine,
    normalizeSettings,
    type PomodoroSettings,
} from "../../src/func/pomodoro/engine.ts";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(name: string) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}
function bad(name: string, detail: string) {
    fail++;
    failures.push(`${name}: ${detail}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`);
}
function assertEq(name: string, actual: unknown, expected: unknown) {
    if (actual === expected) ok(name);
    else bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(name: string, cond: unknown, detail = "expected true") {
    if (cond) ok(name);
    else bad(name, detail);
}

const MIN = 60_000;

/** 假时钟：手动推进 */
class FakeClock {
    now = 1_700_000_000_000;

    advance(ms: number) {
        this.now += ms;
    }
}

const makeEngine = (overrides: Partial<PomodoroSettings> = {}) => {
    const clock = new FakeClock();
    const settings: PomodoroSettings = { ...DEFAULT_SETTINGS, ...overrides };
    const engine = new PomodoroEngine(() => settings, () => clock.now);
    return { engine, clock, settings };
};

// ===================== Part A：默认设置与周期 =====================

console.log("\n\x1b[1mPart A：默认周期\x1b[0m");
{
    assertEq("默认专注 25 分钟", DEFAULT_SETTINGS.focusMin, 25);
    assertEq("默认短休 5 分钟", DEFAULT_SETTINGS.shortBreakMin, 5);
    assertEq("默认长休 20 分钟", DEFAULT_SETTINGS.longBreakMin, 20);
    assertEq("默认 4 个番茄一次长休", DEFAULT_SETTINGS.longEvery, 4);

    const { engine, clock } = makeEngine({ focusMin: 1, shortBreakMin: 1, longBreakMin: 2 });
    const idle = engine.getSnapshot();
    assertEq("初始处于空闲", idle.status, "idle");
    assertEq("初始阶段是专注", idle.phase, "focus");
    assertEq("空闲时剩余等于计划时长", idle.remainingMs, MIN);

    engine.start("focus");
    assertEq("开始后进入运行", engine.getSnapshot().status, "running");
    clock.advance(30_000);
    assertEq("剩余时间按绝对时间推算", engine.remainingMs(), MIN - 30_000);
}

// ===================== Part B：完整一轮 =====================

console.log("\n\x1b[1mPart B：4 个番茄后进长休\x1b[0m");
{
    const { engine, clock } = makeEngine({
        focusMin: 1,
        shortBreakMin: 1,
        longBreakMin: 2,
        longEvery: 4,
        autoStartBreak: false,
        autoStartFocus: false,
    });

    const phases: string[] = [];
    for (let i = 0; i < 4; i++) {
        engine.start("focus");
        clock.advance(MIN);
        const result = engine.tick();
        assertTrue(`第 ${i + 1} 个番茄结算`, result !== null);
        if (!result) continue;
        assertTrue(`第 ${i + 1} 个番茄记录为完成`, result.record.completed);
        assertEq(`第 ${i + 1} 个番茄实际时长`, result.record.actualMs, MIN);
        phases.push(result.nextPhase);

        if (result.nextPhase !== "focus") {
            // 跑完休息再进入下一个专注
            engine.start(result.nextPhase);
            clock.advance(engine.phaseDurationMs(result.nextPhase));
            engine.tick();
        }
    }
    assertEq("第 1 个番茄后短休", phases[0], "shortBreak");
    assertEq("第 2 个番茄后短休", phases[1], "shortBreak");
    assertEq("第 3 个番茄后短休", phases[2], "shortBreak");
    assertEq("第 4 个番茄后长休", phases[3], "longBreak");
}

// ===================== Part C：重复 tick 不重复结算 =====================

console.log("\n\x1b[1mPart C：结算只发生一次\x1b[0m");
{
    const { engine, clock } = makeEngine({ focusMin: 1, autoStartBreak: false });
    engine.start("focus");
    clock.advance(MIN + 5_000);
    const first = engine.tick();
    assertTrue("第一次 tick 产出记录", first !== null);
    const second = engine.tick();
    assertEq("重复 tick 不再产出记录", second, null);
}

// ===================== Part D：暂停 / 继续 =====================

console.log("\n\x1b[1mPart D：暂停与继续\x1b[0m");
{
    const { engine, clock } = makeEngine({ focusMin: 2, autoStartBreak: false });
    engine.start("focus");
    clock.advance(30_000);
    assertEq("运行 30s 后剩余", engine.remainingMs(), 2 * MIN - 30_000);

    engine.pause();
    assertEq("暂停后状态", engine.getSnapshot().status, "paused");
    const frozen = engine.remainingMs();
    clock.advance(10 * MIN);
    assertEq("暂停期间剩余时间不变", engine.remainingMs(), frozen);

    engine.resume();
    assertEq("继续后状态", engine.getSnapshot().status, "running");
    assertEq("继续后剩余时间保持", engine.remainingMs(), frozen);
    clock.advance(frozen);
    const result = engine.tick();
    assertTrue("继续后走完能结算", result !== null);
}

// ===================== Part E：跳过不计数 =====================

console.log("\n\x1b[1mPart E：跳过当前阶段\x1b[0m");
{
    const { engine, clock } = makeEngine({
        focusMin: 1,
        longEvery: 2,
        autoStartBreak: false,
        autoStartFocus: false,
    });
    engine.start("focus");
    clock.advance(10_000);
    const skipped = engine.skip();
    assertTrue("跳过返回结果", skipped !== null);
    assertTrue("跳过记未完成", skipped?.record.completed === false);
    assertEq("跳过按实际时长记录", skipped?.record.actualMs, 10_000);
    assertEq("跳过后进入短休", skipped?.nextPhase, "shortBreak");
    assertEq("跳过不推进周期计数", engine.getSnapshot().focusInCycle, 0);
}

// ===================== Part F：放弃 =====================

console.log("\n\x1b[1mPart F：放弃当前番茄\x1b[0m");
{
    const { engine, clock } = makeEngine({ focusMin: 1 });
    engine.start("focus");
    clock.advance(12 * 60_000);
    const record = engine.abandon();
    assertTrue("放弃返回记录", record !== null);
    assertEq("放弃记未完成", record?.completed, false);
    assertEq("放弃实际时长不超过计划", record?.actualMs, MIN);
    assertEq("放弃后回到空闲", engine.getSnapshot().status, "idle");
    assertEq("放弃后停在专注阶段", engine.getSnapshot().phase, "focus");
}

// ===================== Part G：自动开始设置 =====================

console.log("\n\x1b[1mPart G：自动开始休息\x1b[0m");
{
    const auto = makeEngine({ focusMin: 1, autoStartBreak: true });
    auto.engine.start("focus");
    auto.clock.advance(MIN);
    const result = auto.engine.tick();
    assertTrue("自动开始休息已触发", result?.autoStarted === true);
    assertEq("自动开始后阶段", auto.engine.getSnapshot().phase, "shortBreak");
    assertEq("自动开始后仍在运行", auto.engine.getSnapshot().status, "running");

    const manual = makeEngine({ focusMin: 1, autoStartBreak: false });
    manual.engine.start("focus");
    manual.clock.advance(MIN);
    const manualResult = manual.engine.tick();
    assertTrue("未自动开始", manualResult?.autoStarted === false);
    assertEq("未自动开始时处于空闲", manual.engine.getSnapshot().status, "idle");
    assertEq("未自动开始但阶段已切到休息", manual.engine.getSnapshot().phase, "shortBreak");
}

// ===================== Part H：设置归一化 =====================

console.log("\n\x1b[1mPart H：设置归一化\x1b[0m");
{
    const normalized = normalizeSettings({
        focusMin: "0" as unknown as number,
        shortBreakMin: undefined,
        longBreakMin: -3,
        longEvery: 4.6,
    });
    assertEq("0 分钟回落到默认", normalized.focusMin, 25);
    assertEq("缺省短休回落默认", normalized.shortBreakMin, 5);
    assertEq("负长休回落默认", normalized.longBreakMin, 20);
    assertEq("小数间隔四舍五入", normalized.longEvery, 5);
}

// ===================== Part I：恢复运行态 =====================

console.log("\n\x1b[1mPart I：重启恢复\x1b[0m");
{
    const { engine, clock } = makeEngine({ focusMin: 10 });
    engine.setContext({ taskName: "写文档" });
    engine.start("focus");
    clock.advance(3 * MIN);
    const snapshot = engine.getSnapshot();

    const restored = new PomodoroEngine(() => ({ ...DEFAULT_SETTINGS, focusMin: 10 }), () => clock.now);
    restored.restore(JSON.parse(JSON.stringify(snapshot)));
    const after = restored.getSnapshot();
    assertEq("恢复后仍运行", after.status, "running");
    assertEq("恢复后阶段一致", after.phase, "focus");
    assertEq("恢复后剩余时间一致", Math.round(after.remainingMs / 1000), Math.round(snapshot.remainingMs / 1000));
    assertEq("恢复后任务名一致", after.activeContext.taskName, "写文档");

    clock.advance(11 * MIN);
    const result = restored.tick();
    assertTrue("恢复后仍能正常结算", result !== null);
}

// ===================== 汇总 =====================

console.log("\n\x1b[1m════════════ 番茄钟引擎 ════════════\x1b[0m");
console.log(`  通过 \x1b[32m${pass}\x1b[0m，失败 \x1b[31m${fail}\x1b[0m`);
if (fail > 0) {
    failures.forEach((f) => console.log(`  \x1b[31m- ${f}\x1b[0m`));
    process.exit(1);
}
