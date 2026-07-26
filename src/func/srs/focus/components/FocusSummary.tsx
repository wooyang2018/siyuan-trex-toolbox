import { Show } from 'solid-js';
import type { ReviewSummaryData } from '../../review/types';
import { formatElapsed, formatPercent } from '../../shared/format';
import { useSrsMode } from '../../mode-router';

/**
 * FocusSummary — 学习结束闭环统计页
 * 显示统计：完成张数 / 正确率 / 总耗时 / 遗忘数 / 需复习数
 */
export function FocusSummary(props: { summary: ReviewSummaryData | null; onRestart: () => void }) {
    const { enterCreator } = useSrsMode();

    const forgottenCount = () => (props.summary?.ratingCounts[1] ?? 0);
    const needReviewCount = () =>
        (props.summary?.ratingCounts[1] ?? 0) + (props.summary?.ratingCounts[2] ?? 0);

    return (
        <Show
            when={props.summary}
            fallback={
                <div class="srs-focus-summary srs-focus-summary--empty">
                    <h2>暂无可复习的卡片</h2>
                    <p>所有卡片可能已完成今日复习，或当前队列暂无到期卡片。</p>
                    <div class="srs-focus-summary-actions">
                        <button class="srs-focus-phase-btn" onClick={enterCreator}>
                            返回管理
                        </button>
                    </div>
                </div>
            }
        >
            <div class="srs-focus-summary">
                <div class="srs-focus-summary-eyebrow">本轮完成</div>
                <h2>学习结束，记忆状态已写回思源闪卡</h2>
                <p>建议优先关注"不会"和"困难"的卡片，它们会形成下一轮复习的主要风险。</p>

                <div class="srs-focus-summary-grid">
                    <div>
                        <strong>{props.summary!.reviewed}</strong>
                        <span>完成张数</span>
                    </div>
                    <div>
                        <strong>{formatPercent(props.summary!.accuracy)}</strong>
                        <span>正确率</span>
                    </div>
                    <div>
                        <strong>{formatElapsed(props.summary!.elapsedTime)}</strong>
                        <span>总耗时</span>
                    </div>
                    <div>
                        <strong>{forgottenCount()}</strong>
                        <span>遗忘数</span>
                    </div>
                    <div>
                        <strong>{needReviewCount()}</strong>
                        <span>需复习数</span>
                    </div>
                </div>

                <div class="srs-focus-summary-ratings">
                    <span>不会 {props.summary!.ratingCounts[1] || 0}</span>
                    <span>困难 {props.summary!.ratingCounts[2] || 0}</span>
                    <span>一般 {props.summary!.ratingCounts[3] || 0}</span>
                    <span>简单 {props.summary!.ratingCounts[4] || 0}</span>
                </div>

                <div class="srs-focus-summary-actions">
                    <button class="srs-focus-phase-btn" onClick={props.onRestart}>
                        继续学习
                    </button>
                    <button
                        class="srs-focus-phase-btn srs-focus-phase-btn--outline"
                        onClick={enterCreator}
                    >
                        返回管理
                    </button>
                </div>
            </div>
        </Show>
    );
}
