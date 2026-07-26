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
