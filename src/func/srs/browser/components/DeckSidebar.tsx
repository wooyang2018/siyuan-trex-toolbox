import { createSignal, For, Show, onMount } from 'solid-js';
import type { DeckInfo } from '../types';
import { getAllDecks, createDeck, renameDeck, deleteDeck } from '../browser-controller';
import { getHealthTone } from '../../shared/srs-metrics';

export function DeckSidebar(props: {
    selectedDeck: string | null;
    onSelectDeck: (deckId: string | null) => void;
    onRefresh: () => void;
}) {
    const [decks, setDecks] = createSignal<DeckInfo[]>([]);
    const [showCreate, setShowCreate] = createSignal(false);
    const [newDeckName, setNewDeckName] = createSignal('');
    const [editingId, setEditingId] = createSignal<string | null>(null);
    const [editName, setEditName] = createSignal('');

    const refresh = async () => setDecks(await getAllDecks());
    onMount(refresh);

    const handleCreate = async () => {
        const name = newDeckName().trim();
        if (!name) return;
        const id = await createDeck(name);
        if (id) {
            setNewDeckName('');
            setShowCreate(false);
            await refresh();
            props.onRefresh();
        }
    };

    const handleRename = async (deck: DeckInfo) => {
        const name = editName().trim();
        if (!name || name === deck.name) { setEditingId(null); return; }
        await renameDeck(deck.id, name, deck.type);
        setEditingId(null);
        await refresh();
        props.onRefresh();
    };

    const handleDelete = async (deck: DeckInfo) => {
        const msg = `确认删除思源原生卡包「${deck.name}」？卡包内的卡片会从该卡包移除。`;
        if (!confirm(msg)) return;
        await deleteDeck(deck.id, deck.type);
        if (props.selectedDeck === deck.id) props.onSelectDeck(null);
        await refresh();
        props.onRefresh();
    };

    const totalCount = () => decks().reduce((s, d) => s + d.cardCount, 0);
    const totalDue = () => decks().reduce((s, d) => s + (d.dueCount || 0), 0);

    return (
        <div class="srs-deck-sidebar">
            <div class="srs-deck-header">
                <div>
                    <span class="srs-deck-title">卡包资产</span>
                    <small>{totalCount()} 张 · {totalDue()} 待复习</small>
                </div>
                <button class="b3-button b3-button--small b3-button--outline" onClick={() => setShowCreate(!showCreate())}>+</button>
            </div>

            <Show when={showCreate()}>
                <div class="srs-deck-create">
                    <input class="b3-text-field" type="text" placeholder="新卡包名称" value={newDeckName()} onInput={e => setNewDeckName(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }} />
                    <button class="b3-button b3-button--small" onClick={handleCreate}>创建</button>
                </div>
            </Show>

            <div class="srs-deck-list">
                <div class="srs-deck-item srs-deck-item--all" classList={{ 'srs-deck-item--active': props.selectedDeck === null }} onClick={() => props.onSelectDeck(null)}>
                    <div class="srs-deck-main"><span class="srs-deck-name">全部卡片</span><span class="srs-deck-count">{totalCount()}</span></div>
                    <div class="srs-deck-meta">跨卡包总览 · {totalDue()} 待处理</div>
                </div>

                <For each={decks()}>
                    {(deck) => (
                        <div class="srs-deck-item" classList={{ 'srs-deck-item--active': props.selectedDeck === deck.id }} onClick={() => props.onSelectDeck(deck.id)}>
                            <div class="srs-deck-main">
                                <Show when={editingId() === deck.id} fallback={<span class="srs-deck-name" onDblClick={() => { setEditingId(deck.id); setEditName(deck.name); }}>{deck.name}</span>}>
                                    <input class="b3-text-field srs-deck-edit-input" type="text" value={editName()} onInput={e => setEditName(e.currentTarget.value)} onBlur={() => handleRename(deck)} onKeyDown={e => { if (e.key === 'Enter') handleRename(deck); if (e.key === 'Escape') setEditingId(null); }} />
                                </Show>
                                <span class="srs-deck-count">{deck.cardCount}</span>
                            </div>
                            <div class="srs-deck-meta">
                                <span>{deck.dueCount || 0} 到期</span>
                                <span>{deck.riskCount || 0} 风险</span>
                                <span class="srs-status-badge" data-tone={getHealthTone(deck.healthScore || 0)}>{deck.healthScore || 0}</span>
                            </div>
                            <button class="srs-deck-delete-btn" title="删除卡包" onClick={(e) => { e.stopPropagation(); handleDelete(deck); }}>×</button>
                        </div>
                    )}
                </For>
            </div>
            <div class="srs-deck-tip">双击卡包名称可重命名，健康度越低越需要治理。</div>
        </div>
    );
}
