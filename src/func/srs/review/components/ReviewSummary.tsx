import type { ReviewSummaryData } from '../types';
import { formatElapsed, formatPercent } from '../../shared/format';

export function ReviewSummary(props: { summary: ReviewSummaryData | null; onRestart: () => void }) {
    const summary = () => props.summary;
    return (
        <div class="srs-review-summary srs-panel">
            <div class="srs-review-start__eyebrow">本轮完成</div>
            <h2>复习结束，记忆状态已写回思源闪卡</h2>
            <p>建议优先关注“重来”和“困难”的卡片，它们会形成下一轮复习的主要风险。</p>
            <div class="srs-review-summary__grid">
                <div><strong>{summary()?.reviewed || 0}</strong><span>已评分</span></div>
                <div><strong>{formatPercent(summary()?.accuracy || 0)}</strong><span>回忆成功率</span></div>
                <div><strong>{formatElapsed(summary()?.elapsedTime || 0)}</strong><span>本轮用时</span></div>
                <div><strong>{summary()?.skipped || 0}</strong><span>跳过</span></div>
            </div>
            <div class="srs-review-summary__ratings">
                <span>重来 {summary()?.ratingCounts[1] || 0}</span>
                <span>困难 {summary()?.ratingCounts[2] || 0}</span>
                <span>良好 {summary()?.ratingCounts[3] || 0}</span>
                <span>简单 {summary()?.ratingCounts[4] || 0}</span>
            </div>
            <div class="srs-review-start__actions">
                <button class="b3-button srs-review-primary" onClick={props.onRestart}>再来一轮</button>
            </div>
        </div>
    );
}
