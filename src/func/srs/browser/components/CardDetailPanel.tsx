import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import type { SRSCard, CardState } from '@/types/srs';
import type { DeckInfo } from '../types';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';
import { editSrsData } from '../browser-controller';
import { formatInterval } from '../../core/scheduler';
import { formatClozeQuestion, formatDisplayText, getCardDisplay, stripKramdownArtifacts, toBrowserCardType } from '../card-display';
import { CardType } from '@/types/srs';

const STATES: CardState[] = ['new', 'learning', 'review', 'relearning'];
const STATE_LABELS: Record<string, string> = { new: '新卡', learning: '学习中', review: '复习中', relearning: '重学中' };

export function CardDetailPanel(props: {
    card: SRSCard | null;
    decks: DeckInfo[];
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}) {
    const [stability, setStability] = createSignal('');
    const [difficulty, setDifficulty] = createSignal('');
    const [nextReview, setNextReview] = createSignal('');
    const [reps, setReps] = createSignal('');
    const [lapses, setLapses] = createSignal('');
    const [state, setState] = createSignal<CardState>('new');
    const [deckId, setDeckId] = createSignal('');
    const [tags, setTags] = createSignal('');
    const [saving, setSaving] = createSignal(false);

    let lastCardId = '';
    const toDateTimeInput = (timestamp: number) => {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '';
        return date.toISOString().slice(0, 16);
    };

    createEffect(() => {
        const card = props.card;
        if (!card) {
            lastCardId = '';
            return;
        }
        if (card.id === lastCardId) return;
        lastCardId = card.id;
        setStability(String(card.stability));
        setDifficulty(String(card.difficulty));
        setNextReview(toDateTimeInput(card.nextReview));
        setReps(String(card.reps));
        setLapses(String(card.lapses));
        setState(card.state);
        setDeckId(card.deckId);
        setTags(card.tags.join(', '));
        setSaving(false);
    });

    const handleSave = async () => {
        if (!props.card) return;
        setSaving(true);
        const ts = new Date(nextReview()).getTime();
        await editSrsData(props.card.id, {
            stability: parseFloat(stability()) || 0,
            difficulty: parseFloat(difficulty()) || 0,
            nextReview: isNaN(ts) ? Date.now() : ts,
            reps: parseInt(reps()) || 0,
            lapses: parseInt(lapses()) || 0,
            state: state(),
            deckId: deckId(),
            tags: tags().split(',').map(t => t.trim()).filter(Boolean),
        });
        setSaving(false);
        lastCardId = '';
        await props.onSaved();
    };

    const handleReset = () => {
        if (!props.card || !confirm('重置此卡片的 SRS 数据？')) return;
        setStability('0');
        setDifficulty('0');
        setReps('0');
        setLapses('0');
        setState('new');
        setNextReview(new Date().toISOString().slice(0, 16));
    };

    const cardInterval = () => {
        if (!props.card) return '-';
        const days = (props.card.nextReview - Date.now()) / 86400_000;
        return formatInterval(days);
    };
    const displayType = () => props.card ? toBrowserCardType(props.card.type) : undefined;
    const display = createMemo(() => props.card ? getCardDisplay(props.card) : null);
    const deckLabel = () => props.card?.deckName || props.card?.deckId || '';

    return (
        <Show when={props.card}>
            <aside class="srs-card-detail-panel srs-panel">
                <div class="srs-card-detail-header">
                    <div>
                        <span class={`srs-card-type-badge srs-card-type-badge--${displayType()}`}>
                            {CARD_TYPE_LABELS[displayType()!] || '卡片'}
                        </span>
                        <div class="srs-card-detail-title">{props.card!.id.slice(0, 20)}</div>
                    </div>
                    <button class="b3-button b3-button--text" onClick={props.onClose}>x</button>
                </div>

                <div class="srs-card-detail-body">
                    <div class="srs-card-preview-section">
                        <div class="srs-card-preview-label">正面</div>
                        <div class="srs-card-preview-text">
                            {displayType() === CardType.Cloze
                                ? formatClozeQuestion(display()?.question || props.card!.front)
                                : formatDisplayText(display()?.question || stripKramdownArtifacts(props.card!.front))}
                        </div>
                        <Show when={display()?.options.length}>
                            <div class="srs-card-choice-options">
                                <For each={display()!.options}>
                                    {opt => (
                                        <div class="srs-card-choice-option" classList={{ 'srs-card-choice-option--correct': opt.correct }}>
                                            <span>{opt.label}</span>
                                            <p>{opt.text}</p>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Show>
                        <Show when={display()?.answer && display()?.answer !== display()?.question}>
                            <div class="srs-card-preview-label">背面</div>
                            <div class="srs-card-preview-text">{formatDisplayText(display()?.answer || '')}</div>
                        </Show>
                        <Show when={display()?.explanation}>
                            <div class="srs-card-preview-label">解析</div>
                            <div class="srs-card-preview-text">{formatDisplayText(display()?.explanation || '')}</div>
                        </Show>
                        <div class="srs-card-meta-line">
                            <span>来源块: {props.card!.blockId?.slice(0, 20) || '-'}</span>
                            <span>牌组: {deckLabel()}</span>
                            <span>创建: {new Date(props.card!.createdAt).toLocaleDateString()}</span>
                            <span>当前间隔: {cardInterval()}</span>
                        </div>
                    </div>

                    <div class="srs-srs-editor-section">
                        <div class="srs-srs-editor-title">SRS 调度数据</div>
                        <div class="srs-srs-editor-grid">
                            <label class="srs-edit-field">
                                <span>稳定性 (S)</span>
                                <input class="b3-text-field" type="number" step="0.1" value={stability()} onInput={e => setStability(e.currentTarget.value)} />
                            </label>
                            <label class="srs-edit-field">
                                <span>难度 (D)</span>
                                <input class="b3-text-field" type="number" step="0.1" value={difficulty()} onInput={e => setDifficulty(e.currentTarget.value)} />
                            </label>
                            <label class="srs-edit-field">
                                <span>复习次数</span>
                                <input class="b3-text-field" type="number" min="0" value={reps()} onInput={e => setReps(e.currentTarget.value)} />
                            </label>
                            <label class="srs-edit-field">
                                <span>遗忘次数</span>
                                <input class="b3-text-field" type="number" min="0" value={lapses()} onInput={e => setLapses(e.currentTarget.value)} />
                            </label>
                            <label class="srs-edit-field">
                                <span>状态</span>
                                <select class="b3-select" value={state()} onChange={e => setState(e.currentTarget.value as CardState)}>
                                    <For each={STATES}>{s => <option value={s}>{STATE_LABELS[s]}</option>}</For>
                                </select>
                            </label>
                            <label class="srs-edit-field">
                                <span>下次复习</span>
                                <input class="b3-text-field" type="datetime-local" value={nextReview()} onInput={e => setNextReview(e.currentTarget.value)} />
                            </label>
                            <label class="srs-edit-field srs-edit-field--full">
                                <span>牌组</span>
                                <select class="b3-select" value={deckId()} onChange={e => setDeckId(e.currentTarget.value)}>
                                    <For each={props.decks}>{deck => <option value={deck.id}>{deck.name}</option>}</For>
                                </select>
                            </label>
                            <label class="srs-edit-field srs-edit-field--full">
                                <span>标签 (逗号分隔)</span>
                                <input class="b3-text-field" type="text" value={tags()} onInput={e => setTags(e.currentTarget.value)} placeholder="tag1, tag2, ..." />
                            </label>
                        </div>
                    </div>
                </div>

                <div class="srs-card-detail-footer">
                    <button class="b3-button b3-button--outline" onClick={handleReset}>重置SRS</button>
                    <button class="b3-button b3-button--contain" onClick={handleSave} disabled={saving()}>
                        {saving() ? '保存中...' : '保存'}
                    </button>
                </div>
            </aside>
        </Show>
    );
}
