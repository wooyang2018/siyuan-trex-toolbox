import { For } from 'solid-js';
import { getFormattedIntervals } from '../review-controller';

const RATINGS = [
    { value: 1, key: '1', label: '重来', hint: '完全忘记', class: 'srs-rating-btn--again' },
    { value: 2, key: '2', label: '困难', hint: '勉强想起', class: 'srs-rating-btn--hard' },
    { value: 3, key: '3', label: '良好', hint: '正常回忆', class: 'srs-rating-btn--good' },
    { value: 4, key: '4', label: '简单', hint: '轻松掌握', class: 'srs-rating-btn--easy' },
];

export function RatingBar(props: { intervals: number[]; onRate: (rating: number) => void }) {
    const labels = () => getFormattedIntervals(props.intervals);
    return (
        <div class="srs-rating-bar srs-review-actions">
            <For each={RATINGS}>
                {(rating, i) => (
                    <button class={`srs-rating-btn ${rating.class}`} onClick={() => props.onRate(rating.value)}>
                        <span class="srs-rating-key">{rating.key}</span>
                        {rating.label}
                        <small>{rating.hint}</small>
                        <span class="srs-rating-interval">下次 {labels()[i()]}</span>
                    </button>
                )}
            </For>
        </div>
    );
}
