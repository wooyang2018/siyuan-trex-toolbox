import type { ParsedFlashcard } from '../card-parser';

export function ViewerSummary(props: { cards: ParsedFlashcard[]; answered: Set<number>; onRestart: () => void; onClose: () => void }) {
    const answeredCount = () => props.answered.size;
    return (
        <div class="srs-viewer-summary srs-panel">
            <div class="srs-review-start__eyebrow">学习路径完成</div>
            <h2>本组闪卡已浏览完成</h2>
            <p>可视化模式不会强制写入 FSRS 评分，适合预习、测验和检查题型表现。</p>
            <div class="srs-review-summary__grid">
                <div><strong>{props.cards.length}</strong><span>总卡片</span></div>
                <div><strong>{answeredCount()}</strong><span>已互动</span></div>
                <div><strong>{new Set(props.cards.map(c => c.type)).size}</strong><span>题型数</span></div>
                <div><strong>{Math.round((answeredCount() / Math.max(1, props.cards.length)) * 100)}%</strong><span>完成度</span></div>
            </div>
            <div class="srs-review-start__actions">
                <button class="b3-button b3-button--outline" onClick={props.onClose}>关闭</button>
                <button class="b3-button srs-review-primary" onClick={props.onRestart}>重新学习</button>
            </div>
        </div>
    );
}
