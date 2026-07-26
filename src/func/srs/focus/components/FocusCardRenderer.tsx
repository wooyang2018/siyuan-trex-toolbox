import { createSignal, For, Show } from 'solid-js';
import type { CardRenderData } from '../../review/types';
import { CardType } from '@/types/srs';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';
import { formatClozeQuestion, formatDisplayText, toBrowserCardType } from '../../shared/card-display';

/**
 * FocusCardRenderer — 五阶段渐进渲染器
 *
 * 阶段流转：question → hint（可选）→ answer → rating → 下一张
 * - question: 显示题目 + "显示提示"（如有）+ "显示答案"按钮
 * - hint: 显示提示内容，保持"显示答案"按钮可见
 * - answer: 显示答案 + 四档评分按钮（不会/困难/一般/简单）
 * - rating: 记录评分后自动进入下一张
 * - 无提示卡片跳过 hint 阶段
 * - 选择题类型支持选项点击作答 + 数字键选择
 */
export function FocusCardRenderer(props: {
    data: CardRenderData;
    phase: () => string;
    onReveal: (wasCorrect?: boolean) => void;
    onRate: (rating: number, wasCorrect?: boolean) => void;
    animationClass: string;
}) {
    const [selectedOptions, setSelectedOptions] = createSignal<Set<string>>(new Set());

    const display = () => props.data.display;
    const type = () => toBrowserCardType(props.data.card.type);
    const phase = () => props.phase();

    const question = () => {
        const raw = display().question || props.data.card.front;
        return type() === CardType.Cloze ? formatClozeQuestion(raw) : formatDisplayText(raw);
    };

    const answer = () => {
        if (display().answer) return formatDisplayText(display().answer);
        if (props.data.card.back && props.data.card.back !== props.data.card.front)
            return formatDisplayText(props.data.card.back);
        return '';
    };

    const hint = () => {
        const card = props.data.card;
        if (card.listHints && card.listHints.length > 0) {
            return card.listHints.join('\n');
        }
        return '';
    };

    const hasHint = () => hint().length > 0;

    const isChoice = () => type() === CardType.SingleChoice || type() === CardType.MultiChoice;

    // Check if user's selected options match the correct answers
    const isAnswerCorrect = () => {
        if (!isChoice()) return undefined;
        const correctLabels = display().options.filter(o => o.correct).map(o => o.label);
        const selected = selectedOptions();
        if (selected.size !== correctLabels.length) return false;
        return correctLabels.every(l => selected.has(l));
    };

    const RATINGS = [
        { value: 1, key: '1', label: '不会', class: 'srs-focus-rating--again' },
        { value: 2, key: '2', label: '困难', class: 'srs-focus-rating--hard' },
        { value: 3, key: '3', label: '一般', class: 'srs-focus-rating--good' },
        { value: 4, key: '4', label: '简单', class: 'srs-focus-rating--easy' },
    ];

    const toggleOption = (label: string) => {
        if (phase() === 'answer' || phase() === 'rating') return;
        if (type() === CardType.SingleChoice) {
            setSelectedOptions(new Set([label]));
            props.onReveal(isAnswerCorrect());
        } else {
            const sel = new Set(selectedOptions());
            if (sel.has(label)) sel.delete(label);
            else sel.add(label);
            setSelectedOptions(sel);
        }
    };

    const submitMultiChoice = () => {
        if (selectedOptions().size === 0) return;
        props.onReveal(isAnswerCorrect());
    };

    return (
        <div class={`srs-focus-card-content ${props.animationClass}`}>
            <div class="srs-focus-card-meta">
                <span class={`srs-card-type-badge srs-card-type-badge--${type()}`}>
                    {CARD_TYPE_LABELS[type()] ?? type()}
                </span>
            </div>

            {/* 题目区域 — question/hint/answer 阶段都可见 */}
            <Show when={phase() === 'question' || phase() === 'hint' || phase() === 'answer' || phase() === 'rating'}>
                <div class="srs-focus-card-front">{question()}</div>
            </Show>

            {/* 选择题选项 */}
            <Show when={isChoice()}>
                <div class="srs-focus-options">
                    <For each={display().options}>
                        {(opt) => {
                            const isSelected = () => selectedOptions().has(opt.label);
                            const isCorrect = () =>
                                (phase() === 'answer' || phase() === 'rating') && opt.correct;
                            const isWrong = () =>
                                (phase() === 'answer' || phase() === 'rating') &&
                                isSelected() &&
                                !opt.correct;
                            const isMissed = () =>
                                (phase() === 'answer' || phase() === 'rating') &&
                                !isSelected() &&
                                opt.correct;
                            return (
                                <div
                                    class="srs-focus-option"
                                    classList={{
                                        'srs-focus-option--selected': isSelected(),
                                        'srs-focus-option--correct': isCorrect(),
                                        'srs-focus-option--wrong': isWrong(),
                                        'srs-focus-option--missed': isMissed(),
                                        'srs-focus-option--disabled':
                                            phase() === 'answer' || phase() === 'rating',
                                    }}
                                    onClick={() => toggleOption(opt.label)}
                                >
                                    <span class="srs-focus-option-label">{opt.label}</span>
                                    <span class="srs-focus-option-text">
                                        {formatDisplayText(opt.text)}
                                    </span>
                                    <Show when={isCorrect()}>
                                        <span class="srs-focus-option-mark srs-focus-option-mark--correct">
                                            ✓
                                        </span>
                                    </Show>
                                    <Show when={isWrong()}>
                                        <span class="srs-focus-option-mark srs-focus-option-mark--wrong">
                                            ✗
                                        </span>
                                    </Show>
                                </div>
                            );
                        }}
                    </For>
                </div>
                <Show when={type() === CardType.MultiChoice && phase() === 'question'}>
                    <button
                        class="srs-focus-phase-btn srs-focus-phase-btn--outline"
                        onClick={submitMultiChoice}
                    >
                        提交答案
                    </button>
                </Show>
            </Show>

            {/* 提示区域 — hint 阶段显示 */}
            <Show when={phase() === 'hint' && hasHint()}>
                <div class="srs-focus-card-hint">
                    <div class="srs-focus-card-hint__label">提示</div>
                    <div class="srs-focus-card-hint__content">{formatDisplayText(hint())}</div>
                </div>
            </Show>

            {/* 答案区域 — answer/rating 阶段显示 */}
            <Show when={phase() === 'answer' || phase() === 'rating'}>
                <div class="srs-focus-card-back">
                    <div class="srs-focus-card-back__label">答案</div>
                    <div class="srs-focus-card-back__content">
                        {answer() || '此卡片没有单独的背面内容'}
                    </div>
                    <Show when={display().explanation}>
                        <div class="srs-focus-card-back__label srs-focus-card-back__label--sub">
                            解析
                        </div>
                        <div class="srs-focus-card-back__content">
                            {formatDisplayText(display().explanation)}
                        </div>
                    </Show>
                </div>
            </Show>

            {/* 阶段控件 */}
            <Show when={phase() === 'question'}>
                <div class="srs-focus-card-controls">
                    <Show when={hasHint()}>
                        <button
                            class="srs-focus-phase-btn srs-focus-phase-btn--outline"
                            onClick={() => {
                                /* hint 切换由父组件处理 */
                            }}
                            data-focus-action="hint"
                        >
                            显示提示 <kbd>H</kbd>
                        </button>
                    </Show>
                    <Show when={!isChoice()}>
                        <button
                            class="srs-focus-phase-btn"
                            onClick={props.onReveal}
                        >
                            显示答案 <kbd>Enter</kbd>
                        </button>
                    </Show>
                </div>
            </Show>

            <Show when={phase() === 'hint'}>
                <div class="srs-focus-card-controls">
                    <Show when={!isChoice()}>
                        <button class="srs-focus-phase-btn" onClick={props.onReveal}>
                            显示答案 <kbd>Enter</kbd>
                        </button>
                    </Show>
                </div>
            </Show>

            <Show when={phase() === 'answer'}>
                <div class="srs-focus-rating">
                    <For each={RATINGS}>
                        {(rating) => (
                            <button
                                class={`srs-focus-rating-btn ${rating.class}`}
                                onClick={() => props.onRate(rating.value, isAnswerCorrect())}
                            >
                                <span class="srs-rating-key">{rating.key}</span>
                                {rating.label}
                            </button>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
}