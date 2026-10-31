/**
 * 番茄钟格式化工具
 */

/** 毫秒 -> mm:ss；超过 1 小时显示 h:mm:ss */
export const mmss = (ms: number): string => {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** 毫秒 -> 人类可读时长，如 "1 小时 12 分" */
export const humanDuration = (ms: number): string => {
    if (ms <= 0) return "0 分钟";
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return "不足 1 分钟";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} 分钟`;
    if (m === 0) return `${h} 小时`;
    return `${h} 小时 ${m} 分`;
};

/** 本地日期键 YYYY-MM-DD，用于按天分组统计 */
export const dayKey = (ts: number): string => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 从今天 0 点开始的连续 n 天的日期键（升序，最后一个是今天） */
export const recentDayKeys = (n: number, now: number = Date.now()): string[] => {
    const keys: string[] = [];
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base.getTime() - i * 86_400_000);
        keys.push(dayKey(d.getTime()));
    }
    return keys;
};
