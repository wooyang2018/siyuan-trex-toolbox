export function formatDueDate(ts: number): string {
    if (!ts) return '未排期';
    const d = new Date(ts);
    const diffDays = Math.round((d.getTime() - Date.now()) / 86400_000);
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '明天';
    if (diffDays === -1) return '昨天';
    if (diffDays > 0 && diffDays <= 30) return `${diffDays} 天后`;
    if (diffDays < 0 && diffDays >= -30) return `逾期 ${Math.abs(diffDays)} 天`;
    return d.toLocaleDateString();
}

export function formatPercent(value: number): string {
    if (!Number.isFinite(value)) return '0%';
    return `${Math.round(value * 100)}%`;
}

export function formatElapsed(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes <= 0) return `${rest} 秒`;
    return `${minutes} 分 ${rest} 秒`;
}
