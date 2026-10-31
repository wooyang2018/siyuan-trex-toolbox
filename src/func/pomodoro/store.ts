/**
 * 番茄钟本机存储
 *
 * @description 全部数据只落在当前设备上（pomodoro.device@<deviceId>.json），
 *              不写入任何文档内容。记录做容量与时间双重裁剪，写入合并防抖。
 */
import type FMiscPlugin from "@/index";
import { useLocalDeviceStorage } from "@frostime/siyuan-plugin-kits";
import type { EngineSnapshot, PomodoroRecord } from "./engine";

const STORAGE_FILE = "pomodoro.device";
const SCHEMA = 1;
/** 最多保留的记录条数 */
const MAX_RECORDS = 2000;
/** 最多保留的天数 */
const MAX_AGE_DAYS = 180;
/** 最多记住的任务名数量 */
const MAX_TASKS = 40;

export interface TaskItem {
    name: string;
    lastUsedAt: number;
    /** 累计完成的专注番茄数 */
    count: number;
}

interface PomodoroState {
    schema: number;
    records: PomodoroRecord[];
    tasks: TaskItem[];
    currentTask: string;
    runtime: EngineSnapshot | null;
}

type Storage = Awaited<ReturnType<typeof useLocalDeviceStorage>>;

const emptyState = (): PomodoroState => ({
    schema: SCHEMA,
    records: [],
    tasks: [],
    currentTask: "",
    runtime: null,
});

export class PomodoroStore {
    private state: PomodoroState = emptyState();

    private storage: Storage | null = null;

    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    static async create(plugin: FMiscPlugin): Promise<PomodoroStore> {
        const store = new PomodoroStore();
        await store.init(plugin);
        return store;
    }

    private async init(plugin: FMiscPlugin): Promise<void> {
        try {
            this.storage = await useLocalDeviceStorage(plugin, STORAGE_FILE);
            const raw = this.storage?.storage ?? {};
            this.state = {
                schema: SCHEMA,
                records: Array.isArray(raw.records) ? raw.records : [],
                tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
                currentTask: typeof raw.currentTask === "string" ? raw.currentTask : "",
                runtime: raw.runtime ?? null,
            };
            this.prune();
        } catch (error) {
            console.error("[Pomodoro] 读取存储失败:", error);
            this.state = emptyState();
        }
    }

    // ==================== 记录 ====================

    getRecords(): PomodoroRecord[] {
        return this.state.records;
    }

    addRecord(record: PomodoroRecord): void {
        this.state.records.push(record);
        if (record.completed && record.phase === "focus") {
            this.bumpTaskCount(record.taskName);
        }
        this.prune();
        this.scheduleSave();
    }

    // ==================== 任务 ====================

    getCurrentTask(): string {
        return this.state.currentTask;
    }

    setCurrentTask(name: string): void {
        const trimmed = (name ?? "").trim();
        this.state.currentTask = trimmed;
        if (trimmed) {
            const existing = this.state.tasks.find((t) => t.name === trimmed);
            if (existing) {
                existing.lastUsedAt = Date.now();
            } else {
                this.state.tasks.unshift({ name: trimmed, lastUsedAt: Date.now(), count: 0 });
            }
            this.sortTasks();
        }
        this.scheduleSave();
    }

    getTasks(): TaskItem[] {
        return this.state.tasks;
    }

    removeTask(name: string): void {
        this.state.tasks = this.state.tasks.filter((t) => t.name !== name);
        if (this.state.currentTask === name) this.state.currentTask = "";
        this.scheduleSave();
    }

    private bumpTaskCount(name: string): void {
        const trimmed = (name ?? "").trim();
        if (!trimmed) return;
        const existing = this.state.tasks.find((t) => t.name === trimmed);
        if (existing) {
            existing.count += 1;
            existing.lastUsedAt = Date.now();
        } else {
            this.state.tasks.unshift({ name: trimmed, lastUsedAt: Date.now(), count: 1 });
        }
        this.sortTasks();
    }

    private sortTasks(): void {
        this.state.tasks.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
        if (this.state.tasks.length > MAX_TASKS) {
            this.state.tasks = this.state.tasks.slice(0, MAX_TASKS);
        }
    }

    // ==================== 运行态 ====================

    getRuntime(): EngineSnapshot | null {
        return this.state.runtime;
    }

    saveRuntime(snapshot: EngineSnapshot | null): void {
        this.state.runtime = snapshot;
        this.scheduleSave();
    }

    // ==================== 内部 ====================

    private prune(): void {
        const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
        let records = this.state.records.filter(
            (r) => typeof r?.endedAt === "number" && r.endedAt >= cutoff,
        );
        if (records.length > MAX_RECORDS) {
            records = records.slice(records.length - MAX_RECORDS);
        }
        this.state.records = records;
    }

    /** 合并 1s 内的写入，避免频繁落盘 */
    private scheduleSave(): void {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.flush();
        }, 1000);
    }

    async flush(): Promise<void> {
        if (!this.storage) return;
        try {
            await this.storage.set("schema", SCHEMA, false);
            await this.storage.set("records", this.state.records, false);
            await this.storage.set("tasks", this.state.tasks, false);
            await this.storage.set("currentTask", this.state.currentTask, false);
            await this.storage.set("runtime", this.state.runtime, false);
            // 前面都用 save=false，最后统一落盘一次，避免重复写文件
            await this.storage.save();
        } catch (error) {
            console.error("[Pomodoro] 保存存储失败:", error);
        }
    }

    /** 立即落盘并取消待执行写入（模块卸载/页面关闭时用） */
    dispose(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        void this.flush();
    }
}
