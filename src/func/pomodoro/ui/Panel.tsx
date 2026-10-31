/**
 * 番茄钟浮层
 *
 * @description 锚定状态栏按钮上方的小面板：环形进度、当前任务、控制按钮。
 *              任务名单在卡片内部按文档流展开，底边钉住后高度只往上长。
 */
import { For, Show, createMemo, createSignal, onCleanup, onMount, type Component } from "solid-js";
import type { PomodoroService } from "../service";
import { PHASE_LABEL, type Phase } from "../engine";
import { mmss } from "./format";

interface PanelProps {
    service: PomodoroService;
    onOpenStats: () => void;
    onClose: () => void;
}

const PHASE_HINT: Record<Phase, string> = {
    focus: "专注工作，别切窗口",
    shortBreak: "起身活动一下",
    longBreak: "长休息，离开屏幕",
};

export const Panel: Component<PanelProps> = (props) => {
    const [taskDraft, setTaskDraft] = createSignal(props.service.store.getCurrentTask());
    const [showTasks, setShowTasks] = createSignal(false);
    const [revision, setRevision] = createSignal(0);

    onMount(() => {
        const unsubscribe = props.service.subscribe(() => setRevision((v) => v + 1));
        onCleanup(unsubscribe);
    });

    const taskList = createMemo(() => {
        revision();
        return props.service.store.getTasks();
    });

    const snapshot = createMemo(() => {
        revision();
        return props.service.engine.getSnapshot();
    });

    const settings = createMemo(() => {
        revision();
        return props.service.getSettings();
    });

    const progress = createMemo(() => {
        const snap = snapshot();
        if (!snap.plannedMs) return 0;
        return 1 - snap.remainingMs / snap.plannedMs;
    });

    const isIdle = () => snapshot().status === "idle";
    const isRunning = () => snapshot().status === "running";
    const isBreak = () => snapshot().phase !== "focus";

    const commitTask = (value: string) => {
        const trimmed = value.trim();
        setTaskDraft(trimmed);
        props.service.setTask(trimmed);
    };

    const selectTask = (name: string) => {
        setTaskDraft(name);
        props.service.setTask(name);
        setShowTasks(false);
    };

    const removeTask = (name: string, event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        props.service.removeTask(name);
        if (taskDraft().trim() === name) setTaskDraft("");
        if (props.service.store.getTasks().length === 0) setShowTasks(false);
    };

    const ringStyle = createMemo(() => {
        const deg = Math.max(0, Math.min(1, progress())) * 360;
        return {
            background: `conic-gradient(var(--b3-theme-primary) ${deg}deg, var(--b3-theme-surface-lighter) ${deg}deg)`,
        };
    });

    return (
        <div class="trex-pomodoro-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div class="trex-pomodoro-panel__head">
                <span class="trex-pomodoro-panel__phase">
                    {PHASE_LABEL[snapshot().phase]}
                    <span class="trex-pomodoro-panel__hint">{PHASE_HINT[snapshot().phase]}</span>
                </span>
                <span class="trex-pomodoro-panel__cycle">
                    本轮 {snapshot().focusInCycle}/{settings().longEvery}
                </span>
            </div>

            <div class="trex-pomodoro-panel__ring" style={ringStyle()}>
                <div class="trex-pomodoro-panel__ring-inner">
                    <div class="trex-pomodoro-panel__time">{mmss(snapshot().remainingMs)}</div>
                    <div class="trex-pomodoro-panel__state">
                        {isIdle() ? `计划 ${Math.round(snapshot().plannedMs / 60_000)} 分钟` : isRunning() ? "进行中" : "已暂停"}
                    </div>
                </div>
            </div>

            <div class="trex-pomodoro-panel__task">
                <input
                    class="b3-text-field trex-pomodoro-panel__task-input"
                    placeholder="当前任务（可留空）"
                    value={taskDraft()}
                    onInput={(e) => setTaskDraft(e.currentTarget.value)}
                    onBlur={(e) => commitTask(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commitTask(e.currentTarget.value);
                            setShowTasks(false);
                            e.currentTarget.blur();
                        }
                    }}
                />
                <Show when={taskList().length > 0}>
                    <button
                        type="button"
                        class="b3-button b3-button--outline trex-pomodoro-panel__task-toggle"
                        title="任务列表"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowTasks((open) => !open)}
                    >
                        <span class="trex-pomodoro-panel__caret" classList={{ "trex-pomodoro-panel__caret--open": showTasks() }} />
                    </button>
                </Show>
            </div>

            <Show when={showTasks() && taskList().length > 0}>
                <div class="trex-pomodoro-panel__tasks">
                    <For each={taskList()}>
                        {(task) => (
                            <div
                                class="trex-pomodoro-panel__task-item"
                                classList={{ "trex-pomodoro-panel__task-item--current": task.name === taskDraft().trim() }}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectTask(task.name)}
                            >
                                <span class="trex-pomodoro-panel__task-name">{task.name}</span>
                                <span class="trex-pomodoro-panel__task-count">{task.count}</span>
                                <button
                                    type="button"
                                    class="trex-pomodoro-panel__task-remove"
                                    title="移除任务"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => removeTask(task.name, e)}
                                >
                                    ×
                                </button>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            <div class="trex-pomodoro-panel__actions">
                <button type="button" class="b3-button b3-button--text trex-pomodoro-panel__primary" onClick={() => props.service.toggle()}>
                    {isIdle() ? (isBreak() ? "开始休息" : "开始专注") : isRunning() ? "暂停" : "继续"}
                </button>
                <Show when={!isIdle()}>
                    <button type="button" class="b3-button b3-button--outline" onClick={() => props.service.skip()}>
                        跳过
                    </button>
                    <button
                        type="button"
                        class="b3-button b3-button--outline trex-pomodoro-panel__abandon"
                        onClick={() => props.service.abandon()}
                    >
                        放弃
                    </button>
                </Show>
            </div>

            <div class="trex-pomodoro-panel__footer">
                <button type="button" class="b3-button b3-button--cancel" onClick={props.onClose}>
                    关闭
                </button>
                <button type="button" class="b3-button b3-button--outline" onClick={props.onOpenStats}>
                    查看统计
                </button>
            </div>
        </div>
    );
};
