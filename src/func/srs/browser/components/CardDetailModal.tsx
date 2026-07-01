/**
 * CardDetailModal — modal for viewing/editing individual card SRS data
 */
import { createSignal, Show, For } from 'solid-js';
import type { SRSCard, CardState } from '@/types/srs';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';
import { editSrsData } from '../browser-controller';
import { formatInterval } from '../../core/scheduler';

const STATES: CardState[] = ['new', 'learning', 'review', 'relearning'];
const STATE_LABELS: Record<string, string> = { new: '新卡', learning: '学习中', review: '复习中', relearning: '重学中' };

export function CardDetailModal(props: {
    card: SRSCard | null;
    onClose: () => void;
    onSaved: () => void;
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
    const syncFromCard = () => {
        if (!props.card || props.card.id === lastCardId) return;
        lastCardId = props.card.id;
        setStability(String(props.card.stability));
        setDifficulty(String(props.card.difficulty));
        setNextReview(new Date(props.card.nextReview).toISOString().slice(0, 16));
        setReps(String(props.card.reps));
        setLapses(String(props.card.lapses));
        setState(props.card.state);
        setDeckId(props.card.deckId);
        setTags(props.card.tags.join(', '));
    };
    syncFromCard();

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
        props.onSaved();
        props.onClose();
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

    return (
        <Show when={props.card}>
            <div class="srs-modal-overlay" onClick={props.onClose}>
                <div class="srs-modal-content" onClick={e => e.stopPropagation()}>
                    <div class="srs-modal-header">
                        <span class="srs-modal-title">
                            {CARD_TYPE_LABELS[props.card!.type] || '卡片'} - {props.card!.id.slice(0, 20)}
                        </span>
                        <button class="b3-button b3-button--text" onClick={props.onClose}>x</button>
                    </div>

                    <div class="srs-modal-body">
                        <div class="srs-card-preview-section">
                            <div class="srs-card-preview-label">正面</div>
                            <div class="srs-card-preview-text">{props.card!.front}</div>
                            <Show when={props.card!.back && props.card!.back !== props.card!.front}>
                                <div class="srs-card-preview-label">背面</div>
                                <div class="srs-card-preview-text">{props.card!.back}</div>
                            </Show>
                            <div class="srs-card-meta-line">
                                <span>来源块: {props.card!.blockId?.slice(0, 20) || '-'}</span>
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
                                <label class="srs-edit-field">
                                    <span>牌组</span>
                                    <input class="b3-text-field" type="text" value={deckId()} onInput={e => setDeckId(e.currentTarget.value)} />
                                </label>
                                <label class="srs-edit-field srs-edit-field--full">
                                    <span>标签 (逗号分隔)</span>
                                    <input class="b3-text-field" type="text" value={tags()} onInput={e => setTags(e.currentTarget.value)} placeholder="tag1, tag2, ..." />
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="srs-modal-footer">
                        <button class="b3-button b3-button--outline" onClick={handleReset}>重置SRS</button>
                        <div style={{ 'flex': '1' }} />
                        <button class="b3-button b3-button--text" onClick={props.onClose}>取消</button>
                        <button class="b3-button b3-button--contain" onClick={handleSave} disabled={saving()}>
                            {saving() ? '保存中...' : '保存'}
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    );
}
