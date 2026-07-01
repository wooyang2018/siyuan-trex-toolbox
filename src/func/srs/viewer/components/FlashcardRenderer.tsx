import { createSignal, For, Show, createEffect } from 'solid-js';
import type { ParsedFlashcard } from '../card-parser';
import { CardType } from '@/types/srs';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';

export function FlashcardRenderer(props: {
    card: ParsedFlashcard;
    index: number;
    total: number;
    onNext: () => void;
    onPrev: () => void;
    onAnswered?: (correct?: boolean) => void;
}) {
    const [revealed, setRevealed] = createSignal(false);
    const [selectedOptions, setSelectedOptions] = createSignal<Set<string>>(new Set());
    const [answered, setAnswered] = createSignal(false);

    createEffect(() => {
        props.index;
        props.card.question;
        setRevealed(false);
        setSelectedOptions(new Set<string>());
        setAnswered(false);
    });

    const reveal = () => {
        setRevealed(true);
        setAnswered(true);
        props.onAnswered?.(true);
    };

    const toggleOption = (label: string) => {
        if (answered()) return;
        const sel = new Set(selectedOptions());
        if (props.card.type === CardType.SingleChoice) {
            sel.clear();
            sel.add(label);
        } else if (props.card.type === CardType.MultiChoice) {
            sel.has(label) ? sel.delete(label) : sel.add(label);
        }
        setSelectedOptions(sel);
    };

    const isCorrect = () => {
        const sel = selectedOptions();
        const correct = props.card.options.filter(o => o.correct).map(o => o.label);
        if (sel.size !== correct.length) return false;
        return correct.every(l => sel.has(l));
    };

    const submitChoice = () => {
        setAnswered(true);
        setRevealed(true);
        props.onAnswered?.(isCorrect());
    };

    const clozeQuestion = () => props.card.question.replace(/==(.+?)==/g, (_, text) => (
        revealed() ? `<span class="srs-cloze-hole srs-cloze-revealed">${text}</span>` : '<span class="srs-cloze-hole">[...]</span>'
    ));

    return (
        <div class="srs-viewer-card srs-panel">
            <div class="srs-viewer-card-header">
                <span class={`srs-viewer-card-type-badge srs-type-${props.card.type}`}>{typeLabel(props.card.type)}</span>
                <span class="srs-viewer-card-progress">{props.index + 1} / {props.total}</span>
            </div>

            <Show when={props.card.type === CardType.Cloze}>
                <div class="srs-viewer-card-body">
                    <div class="srs-viewer-question" innerHTML={clozeQuestion()} />
                    <Show when={!revealed()}><button class="b3-button srs-reveal-btn" onClick={reveal}>揭示填空</button></Show>
                    <Show when={revealed()}><div class="srs-viewer-answer"><span class="srs-answer-label">答案：</span><span>{props.card.answer}</span></div></Show>
                </div>
            </Show>

            <Show when={props.card.type === CardType.QA}>
                <div class="srs-viewer-card-body">
                    <div class="srs-viewer-question">{props.card.question}</div>
                    <Show when={!revealed()}><button class="b3-button srs-reveal-btn" onClick={reveal}>显示答案</button></Show>
                    <Show when={revealed()}><div class="srs-viewer-answer"><span class="srs-answer-label">答案：</span><div class="srs-answer-content">{props.card.answer}</div></div></Show>
                </div>
            </Show>

            <Show when={props.card.type === CardType.SingleChoice || props.card.type === CardType.MultiChoice}>
                <div class="srs-viewer-card-body">
                    <div class="srs-viewer-question">{props.card.question}</div>
                    <div class="srs-viewer-options">
                        <For each={props.card.options}>{(opt) => {
                            const isSelected = () => selectedOptions().has(opt.label);
                            const isOptWrong = () => answered() && isSelected() && !opt.correct;
                            const isOptMissed = () => answered() && !isSelected() && opt.correct;
                            return <div class="srs-viewer-option" classList={{ 'srs-option-selected': isSelected(), 'srs-option-correct': answered() && opt.correct, 'srs-option-wrong': isOptWrong(), 'srs-option-missed': isOptMissed() }} onClick={() => toggleOption(opt.label)}>
                                <span class="srs-option-label">{opt.label}</span><span class="srs-option-text">{opt.text}</span>
                                <Show when={answered() && opt.correct}><span class="srs-option-icon">✓</span></Show>
                                <Show when={isOptWrong()}><span class="srs-option-icon">✗</span></Show>
                            </div>;
                        }}</For>
                    </div>
                    <Show when={!answered() && selectedOptions().size > 0}><button class="b3-button srs-submit-btn" onClick={submitChoice}>提交答案</button></Show>
                    <Show when={answered()}>
                        <div class="srs-viewer-result" classList={{ 'srs-result-correct': isCorrect(), 'srs-result-wrong': !isCorrect() }}>{isCorrect() ? '回答正确' : '回答错误'}</div>
                        <Show when={props.card.explanation}><div class="srs-viewer-explanation"><span class="srs-explanation-label">解析：</span><span>{props.card.explanation}</span></div></Show>
                    </Show>
                </div>
            </Show>

            <Show when={props.card.type === 'unknown'}><div class="srs-viewer-card-body"><div class="srs-viewer-question">{props.card.question}</div></div></Show>

            <div class="srs-viewer-card-footer">
                <button class="b3-button b3-button--outline" onClick={props.onPrev} disabled={props.index === 0}>上一张 <span class="srs-key-hint">←</span></button>
                <button class="b3-button srs-review-primary" onClick={props.onNext}>{props.index + 1 < props.total ? '下一张' : '完成'} <span class="srs-key-hint">→/Space</span></button>
            </div>
        </div>
    );
}

function typeLabel(type: string): string {
    if (type === 'unknown') return '未知';
    return CARD_TYPE_LABELS[type] ?? type;
}
