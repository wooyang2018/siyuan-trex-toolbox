/**
 * CardTable — enhanced card table with multi-sort, inline SRS editing, selection
 */
import { createSignal, For, Show } from 'solid-js';
import type { SRSCard } from '@/types/srs';
import { CARD_TYPE_LABELS } from '../../shared/card-type-labels';
import type { SortField, SortOrder } from '../types';
import { sortCards, batchDeleteCards, batchMoveToDeck, batchResetSrs, batchPostpone, editSrsData } from '../browser-controller';

const STATE_LABELS: Record<string, string> = {
    new: '新卡', learning: '学习', review: '复习', relearning: '重学',
};

function formatDate(ts: number): string {
    if (!ts) return '-';
    const d = new Date(ts);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.round(diff / 86400_000);
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    if (days === -1) return '昨天';
    if (days > 0 && days <= 30) return `${days}天后`;
    if (days < 0 && days >= -30) return `${-days}天前`;
    return d.toLocaleDateString();
}

function isDue(card: SRSCard): boolean {
    return card.nextReview <= Date.now() || card.state === 'new';
}

export function CardTable(props: {
    cards: SRSCard[];
    onCardClick: (card: SRSCard) => void;
    onRefresh: () => void;
}) {
    const [selected, setSelected] = createSignal<Set<string>>(new Set());
    const [sortField, setSortField] = createSignal<SortField>('nextReview');
    const [sortOrder, setSortOrder] = createSignal<SortOrder>('asc');
    const [showMoveMenu, setShowMoveMenu] = createSignal(false);
    const [moveDeckId, setMoveDeckId] = createSignal('');
    const [postponeDays, setPostponeDays] = createSignal(1);
    const [showPostponeInput, setShowPostponeInput] = createSignal(false);
    const [editingCell, setEditingCell] = createSignal<{ id: string; field: string } | null>(null);
    const [editValue, setEditValue] = createSignal('');

    const sortedCards = () => sortCards(props.cards, sortField(), sortOrder());

    const toggleSort = (field: SortField) => {
        if (sortField() === field) {
            setSortOrder(sortOrder() === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const sortIcon = (field: SortField): string => {
        if (sortField() !== field) return '';
        return sortOrder() === 'asc' ? ' \u2191' : ' \u2193';
    };

    const toggleSelect = (id: string) => {
        const s = new Set(selected());
        s.has(id) ? s.delete(id) : s.add(id);
        setSelected(s);
    };

    const selectAll = () => {
        if (selected().size === sortedCards().length) {
            setSelected(new Set<string>());
        } else {
            setSelected(new Set(sortedCards().map(c => c.id)));
        }
    };

    const handleBatchDelete = async () => {
        const ids = Array.from(selected());
        if (!ids.length) return;
        if (!confirm(`确认删除 ${ids.length} 张卡片？此操作不可撤销。`)) return;
        await batchDeleteCards(ids);
        setSelected(new Set<string>());
        props.onRefresh();
    };

    const handleBatchReset = async () => {
        const ids = Array.from(selected());
        if (!ids.length) return;
        if (!confirm(`确认重置 ${ids.length} 张卡片的 SRS 数据？`)) return;
        await batchResetSrs(ids);
        setSelected(new Set<string>());
        props.onRefresh();
    };

    const handleBatchMove = async () => {
        const ids = Array.from(selected());
        if (!ids.length || !moveDeckId()) return;
        await batchMoveToDeck(ids, moveDeckId());
        setSelected(new Set<string>());
        setShowMoveMenu(false);
        setMoveDeckId('');
        props.onRefresh();
    };

    const handleBatchPostpone = async () => {
        const ids = Array.from(selected());
        if (!ids.length) return;
        await batchPostpone(ids, postponeDays());
        setShowPostponeInput(false);
        setSelected(new Set<string>());
        props.onRefresh();
    };

    const handleInlineEdit = async (cardId: string, field: string, value: string) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) { setEditingCell(null); return; }
        await editSrsData(cardId, { [field]: numValue } as any);
        setEditingCell(null);
        props.onRefresh();
    };

    const availableDecks = () => {
        const decks = new Set<string>();
        for (const c of props.cards) decks.add(c.deckId);
        return [...decks];
    };

    return (
        <div class="srs-card-table-container">
            <Show when={selected().size > 0}>
                <div class="srs-batch-bar">
                    <span class="srs-batch-count">已选 {selected().size} 张</span>
                    <button class="b3-button b3-button--small b3-button--outline" onClick={() => setShowMoveMenu(!showMoveMenu())}>移动到牌组</button>
                    <button class="b3-button b3-button--small b3-button--outline" onClick={() => setShowPostponeInput(!showPostponeInput())}>推迟</button>
                    <button class="b3-button b3-button--small b3-button--outline" onClick={handleBatchReset}>重置SRS</button>
                    <button class="b3-button b3-button--small b3-button--error" onClick={handleBatchDelete}>删除</button>
                    <button class="b3-button b3-button--small b3-button--text" onClick={() => setSelected(new Set<string>())}>取消选择</button>
                </div>
            </Show>

            <Show when={showMoveMenu()}>
                <div class="srs-batch-submenu">
                    <select class="b3-select" value={moveDeckId()} onChange={e => setMoveDeckId(e.currentTarget.value)}>
                        <option value="">选择牌组...</option>
                        <For each={availableDecks()}>{d => <option value={d}>{d}</option>}</For>
                    </select>
                    <button class="b3-button b3-button--small" onClick={handleBatchMove} disabled={!moveDeckId()}>确认移动</button>
                </div>
            </Show>

            <Show when={showPostponeInput()}>
                <div class="srs-batch-submenu">
                    <span>推迟天数：</span>
                    <input class="b3-text-field" type="number" min="1" max="365" value={postponeDays()} onInput={e => setPostponeDays(parseInt(e.currentTarget.value) || 1)} style={{ width: '60px' }} />
                    <button class="b3-button b3-button--small" onClick={handleBatchPostpone}>确认推迟</button>
                </div>
            </Show>

            <div class="srs-table-wrapper">
                <table class="srs-table srs-card-table">
                    <thead>
                        <tr>
                            <th class="srs-col-check"><input type="checkbox" checked={selected().size > 0 && selected().size === sortedCards().length} onChange={selectAll} /></th>
                            <th onClick={() => toggleSort('type')}>类型{sortIcon('type')}</th>
                            <th onClick={() => toggleSort('front')}>内容{sortIcon('front')}</th>
                            <th onClick={() => toggleSort('state')}>状态{sortIcon('state')}</th>
                            <th onClick={() => toggleSort('deckId')}>牌组{sortIcon('deckId')}</th>
                            <th onClick={() => toggleSort('nextReview')}>到期{sortIcon('nextReview')}</th>
                            <th onClick={() => toggleSort('stability')}>稳定性{sortIcon('stability')}</th>
                            <th onClick={() => toggleSort('difficulty')}>难度{sortIcon('difficulty')}</th>
                            <th onClick={() => toggleSort('reps')}>复习{sortIcon('reps')}</th>
                            <th onClick={() => toggleSort('lapses')}>遗忘{sortIcon('lapses')}</th>
                            <th>标签</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={sortedCards()}>
                            {(card) => (
                                <tr classList={{ 'srs-row-selected': selected().has(card.id), 'srs-row-due': isDue(card) }}>
                                    <td class="srs-col-check"><input type="checkbox" checked={selected().has(card.id)} onChange={() => toggleSelect(card.id)} /></td>
                                    <td><span class={`srs-card-type-badge srs-card-type-badge--${card.type}`}>{CARD_TYPE_LABELS[card.type] || card.type}</span></td>
                                    <td class="srs-col-content" onClick={() => props.onCardClick(card)}>
                                        <div class="srs-card-front-preview">{card.front.slice(0, 60)}</div>
                                        <Show when={card.tags.length > 0}><div class="srs-card-tags-mini">{card.tags.slice(0, 3).join(' / ')}</div></Show>
                                    </td>
                                    <td><span class="srs-state-badge" data-state={card.state}>{STATE_LABELS[card.state] || card.state}</span></td>
                                    <td class="srs-col-deck">{card.deckId}</td>
                                    <td classList={{ 'srs-due-text': isDue(card) }}>{formatDate(card.nextReview)}</td>
                                    <td class="srs-col-editable" onDblClick={() => { setEditingCell({ id: card.id, field: 'stability' }); setEditValue(String(card.stability)); }}>
                                        <Show when={editingCell()?.id === card.id && editingCell()?.field === 'stability'} fallback={card.stability.toFixed(1)}>
                                            <input class="b3-text-field srs-inline-edit" type="number" step="0.1" value={editValue()}
                                                onInput={e => setEditValue(e.currentTarget.value)}
                                                onBlur={e => handleInlineEdit(card.id, 'stability', e.currentTarget.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(card.id, 'stability', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }}
                                            />
                                        </Show>
                                    </td>
                                    <td class="srs-col-editable" onDblClick={() => { setEditingCell({ id: card.id, field: 'difficulty' }); setEditValue(String(card.difficulty)); }}>
                                        <Show when={editingCell()?.id === card.id && editingCell()?.field === 'difficulty'} fallback={card.difficulty.toFixed(1)}>
                                            <input class="b3-text-field srs-inline-edit" type="number" step="0.1" value={editValue()}
                                                onInput={e => setEditValue(e.currentTarget.value)}
                                                onBlur={e => handleInlineEdit(card.id, 'difficulty', e.currentTarget.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(card.id, 'difficulty', e.currentTarget.value); if (e.key === 'Escape') setEditingCell(null); }}
                                            />
                                        </Show>
                                    </td>
                                    <td>{card.reps}</td>
                                    <td classList={{ 'srs-lapse-warn': card.lapses > 0 }}>{card.lapses > 0 ? card.lapses : '-'}</td>
                                    <td class="srs-col-tags">{card.tags.join(', ')}</td>
                                    <td class="srs-col-actions">
                                        <button class="b3-button b3-button--small b3-button--text" title="编辑" onClick={() => props.onCardClick(card)}>编辑</button>
                                        <button class="b3-button b3-button--small b3-button--text" title="删除" onClick={async () => { if (confirm('删除此卡片？')) { await batchDeleteCards([card.id]); props.onRefresh(); } }}>删除</button>
                                    </td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>
                <Show when={sortedCards().length === 0}>
                    <div class="srs-empty-state">
                        <p>暂无卡片</p>
                        <p class="srs-empty-hint">使用制卡功能创建闪卡，或在思源中添加原生闪卡</p>
                    </div>
                </Show>
            </div>
            <div class="srs-table-tip">双击「稳定性」「难度」单元格可行内编辑</div>
        </div>
    );
}
