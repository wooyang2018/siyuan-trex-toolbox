import { For } from 'solid-js';
import type { ParsedFlashcard } from '../card-parser';
import { CARD_TYPE_SHORT_LABELS } from '../../shared/card-type-labels';

export function CardMapRail(props: { cards: ParsedFlashcard[]; current: number; answered: Set<number>; onJump: (index: number) => void }) {
    return (
        <div class="srs-card-map-rail srs-panel">
            <div class="srs-card-map-rail__title">卡片地图</div>
            <For each={props.cards}>
                {(card, index) => (
                    <button class="srs-card-map-item" classList={{ 'srs-card-map-item--active': props.current === index(), 'srs-card-map-item--done': props.answered.has(index()) }} onClick={() => props.onJump(index())}>
                        <span>{index() + 1}</span>
                        <small>{typeLabel(card.type)}</small>
                    </button>
                )}
            </For>
        </div>
    );
}

function typeLabel(type: string): string {
    if (type === 'unknown') return '未知';
    return CARD_TYPE_SHORT_LABELS[type] ?? type;
}
