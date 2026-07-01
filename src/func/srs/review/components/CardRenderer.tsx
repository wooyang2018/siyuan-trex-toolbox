import { Show } from 'solid-js';
import type { CardRenderData } from '../types';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';

export function CardRenderer(props: { data: CardRenderData; onReveal: () => void; onJumpSource: () => void }) {
    const handleCardClick = () => {
        if (!props.data.isRevealed) props.onReveal();
    };

    return (
        <div
            class="srs-card-content srs-panel"
            classList={{
                'srs-card-content--revealed': props.data.isRevealed,
                'srs-card-content--clickable': !props.data.isRevealed,
            }}
            onClick={handleCardClick}
        >
            <div class="srs-card-content__meta">
                <span class={`srs-card-type-badge srs-card-type-badge--${props.data.card.type}`}>{CARD_TYPE_LABELS[props.data.card.type] ?? props.data.card.type}</span>
                <button
                    class="srs-pill srs-jump-source"
                    title="在编辑器中打开源文档并定位到此块"
                    onClick={(e) => { e.stopPropagation(); props.onJumpSource(); }}
                >源块</button>
                <span class="srs-pill">ID {props.data.card.blockId.slice(0, 6)}</span>
            </div>
            <div class="srs-card-front" innerHTML={props.data.front} />
            <Show when={props.data.isRevealed}>
                <div class="srs-card-back">
                    <div class="srs-card-back__label">答案与反馈</div>
                    <div innerHTML={props.data.back} />
                </div>
            </Show>
            <Show when={!props.data.isRevealed}>
                <button class="b3-button srs-reveal-action" onClick={(e) => { e.stopPropagation(); props.onReveal(); }}>显示答案 <span>Space</span></button>
            </Show>
        </div>
    );
}
