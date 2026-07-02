import { For, Show } from 'solid-js';
import type { CardRenderData } from '../types';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';
import { CardType } from '@/types/srs';
import { formatClozeQuestion, formatDisplayText, toBrowserCardType } from '../../browser/card-display';

export function CardRenderer(props: { data: CardRenderData; onReveal: () => void; onJumpSource: () => void }) {
    const handleCardClick = () => {
        if (!props.data.isRevealed) props.onReveal();
    };
    const display = () => props.data.display;
    const type = () => toBrowserCardType(props.data.card.type);
    const question = () => {
        const raw = display().question || props.data.card.front;
        return type() === CardType.Cloze ? formatClozeQuestion(raw) : formatDisplayText(raw);
    };
    const answer = () => {
        if (display().answer) return formatDisplayText(display().answer);
        if (props.data.card.back && props.data.card.back !== props.data.card.front) return formatDisplayText(props.data.card.back);
        return '';
    };

    return (
        <div
            class="srs-card-content srs-panel"
            classList={{
                'srs-card-content--clickable': !props.data.isRevealed,
            }}
            onClick={handleCardClick}
        >
            <div class="srs-card-content__meta">
                <span class={`srs-card-type-badge srs-card-type-badge--${type()}`}>{CARD_TYPE_LABELS[type()] ?? type()}</span>
                <button
                    class="srs-pill srs-jump-source"
                    title="在编辑器中打开源文档并定位到此块"
                    onClick={(e) => { e.stopPropagation(); props.onJumpSource(); }}
                >源块</button>
            </div>
            <div class="srs-card-front">{question()}</div>

            <Show when={type() === CardType.SingleChoice || type() === CardType.MultiChoice}>
                <div class="srs-review-options">
                    <For each={display().options}>
                        {opt => (
                            <div class="srs-review-option" classList={{ 'srs-review-option--correct': props.data.isRevealed && opt.correct }}>
                                <span>{opt.label}</span>
                                <p>{formatDisplayText(opt.text)}</p>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            <Show when={props.data.isRevealed}>
                <div class="srs-card-back">
                    <div class="srs-card-back__label">答案</div>
                    <div class="srs-card-back__content">{answer() || '此卡片没有单独的背面内容'}</div>
                    <Show when={display().explanation}>
                        <div class="srs-card-back__label srs-card-back__label--sub">解析</div>
                        <div class="srs-card-back__content">{formatDisplayText(display().explanation)}</div>
                    </Show>
                </div>
            </Show>
            <Show when={!props.data.isRevealed}>
                <button class="b3-button srs-reveal-action" onClick={(e) => { e.stopPropagation(); props.onReveal(); }}>显示答案 <span>Space</span></button>
            </Show>
        </div>
    );
}
