import { createSignal, onMount, Show, createEffect } from 'solid-js';
import type { CardStats } from '../types';
import { getCardStats } from '../browser-controller';
import { getHealthTone } from '../../shared/srs-metrics';

export function StatsBar(props: { refreshTrigger: number }) {
    const [stats, setStats] = createSignal<CardStats | null>(null);

    const refresh = () => setStats(getCardStats());
    onMount(refresh);
    createEffect(() => { props.refreshTrigger; refresh(); });

    return (
        <Show when={stats()} fallback={<div class="srs-stats-bar srs-panel">加载中...</div>}>
            <div class="srs-stats-bar">
                <div class="srs-stat-card srs-stat-card--hero">
                    <span>卡包健康度</span>
                    <strong>{stats()!.health.healthScore}</strong>
                    <em class="srs-status-badge" data-tone={getHealthTone(stats()!.health.healthScore)}>Health</em>
                </div>
                <div class="srs-stat-card">
                    <span>今日待复习</span>
                    <strong>{stats()!.due}</strong>
                    <small>越早清理，遗忘压力越低</small>
                </div>
                <div class="srs-stat-card">
                    <span>遗忘风险</span>
                    <strong>{stats()!.lapseRisk}</strong>
                    <small>重学中或多次遗忘</small>
                </div>
                <div class="srs-stat-card">
                    <span>新卡 / 学习中</span>
                    <strong>{stats()!.new} / {stats()!.learning + stats()!.relearning}</strong>
                    <small>控制启动节奏</small>
                </div>
                <div class="srs-stat-card">
                    <span>总卡片</span>
                    <strong>{stats()!.total}</strong>
                    <small>{stats()!.totalReps} 次累计复习</small>
                </div>
            </div>
        </Show>
    );
}
