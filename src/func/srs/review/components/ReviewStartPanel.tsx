import type { ReviewStats } from '../types';

export function ReviewStartPanel(props: { stats: ReviewStats | null; onStart: () => void }) {
    const total = () => props.stats?.total || 0;
    const estimate = () => Math.max(1, Math.ceil(total() * 0.35));
    return (
        <div class="srs-review-start srs-panel">
            <div class="srs-review-start__eyebrow">今日复习会话</div>
            <h2>用一次专注提取，清空当前记忆负债</h2>
            <p>系统已按 FSRS 到期时间和新卡上限组织队列。建议先主动回忆，再翻面评分。</p>
            <div class="srs-review-start__metrics">
                <div><strong>{total()}</strong><span>待练卡片</span></div>
                <div><strong>{estimate()} 分钟</strong><span>预计用时</span></div>
                <div><strong>4 档</strong><span>记忆评分</span></div>
            </div>
            <div class="srs-review-start__actions">
                <button class="b3-button srs-review-primary" onClick={props.onStart} disabled={total() === 0}>开始提取练习</button>
            </div>
        </div>
    );
}
