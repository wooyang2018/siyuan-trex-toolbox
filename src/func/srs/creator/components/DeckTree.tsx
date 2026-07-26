import { createSignal, Show, For, onMount, createMemo } from 'solid-js';
import { getRiffDecks, createRiffDeck, renameRiffDeck, removeRiffDeck } from '@/api';
import { getCardsByDeckId, refreshNativeCards } from '../../core/card-repository';

const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

export interface DeckNode {
    id: string;
    name: string;
    isBuiltin: boolean;
}

export function DeckTree(props: {
    decks: DeckNode[];
    selectedDeckId: string;
    onSelectDeck: (deckId: string) => void;
    onDecksChanged: () => void;
}) {
    const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; deck: DeckNode | null } | null>(null);
    const [editingId, setEditingId] = createSignal<string | null>(null);
    const [editName, setEditName] = createSignal('');
    const [newName, setNewName] = createSignal('');
    const [showCreateInput, setShowCreateInput] = createSignal(false);
    const [cardCounts, setCardCounts] = createSignal<Record<string, number>>({});

    onMount(async () => {
        await refreshNativeCards();
        loadCardCounts();
    });

    const loadCardCounts = () => {
        const counts: Record<string, number> = {};
        for (const deck of props.decks) {
            counts[deck.id] = getCardsByDeckId(deck.id).length;
        }
        setCardCounts(counts);
    };

    // Refresh counts when decks change
    createMemo(() => {
        props.decks;
        loadCardCounts();
    });

    const handleContextMenu = (e: MouseEvent, deck: DeckNode) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, deck });
    };

    const closeContextMenu = () => setContextMenu(null);

    const handleCreate = async () => {
        const name = newName().trim();
        if (!name) return;
        try {
            await createRiffDeck(name);
            setNewName('');
            setShowCreateInput(false);
            await refreshNativeCards();
            props.onDecksChanged();
        } catch (e) {
            console.error('[DeckTree] createDeck failed:', e);
        }
    };

    const handleRename = async (deckId: string) => {
        const name = editName().trim();
        if (!name) return;
        try {
            await renameRiffDeck(deckId, name);
            setEditingId(null);
            await refreshNativeCards();
            props.onDecksChanged();
        } catch (e) {
            console.error('[DeckTree] renameDeck failed:', e);
        }
    };

    const handleDelete = async (deck: DeckNode) => {
        closeContextMenu();
        if (!confirm(`确认删除卡包"${deck.name}"？\n注意：这只会将卡片从该卡包移除，不会删除文档块本身。`)) return;
        try {
            await removeRiffDeck(deck.id);
            await refreshNativeCards();
            props.onDecksChanged();
        } catch (e) {
            console.error('[DeckTree] deleteDeck failed:', e);
        }
    };

    const handleExport = async (deck: DeckNode) => {
        closeContextMenu();
        try {
            const cards = getCardsByDeckId(deck.id);
            const data = JSON.stringify({ deckId: deck.id, deckName: deck.name, cardCount: cards.length, cards }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${deck.name}-export.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('[DeckTree] export failed:', e);
        }
    };

    const startRename = (deck: DeckNode) => {
        closeContextMenu();
        setEditingId(deck.id);
        setEditName(deck.name);
    };

    const handleBackgroundContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, deck: null });
    };

    return (
        <div class="srs-deck-tree" onClick={closeContextMenu} onContextMenu={handleBackgroundContextMenu}>
            <div class="srs-deck-tree__header">
                <span class="srs-deck-tree__title">卡包</span>
                <button class="b3-button b3-button--small b3-button--outline srs-deck-tree__add" onClick={() => setShowCreateInput(!showCreateInput())}>+</button>
            </div>

            <Show when={showCreateInput()}>
                <div class="srs-deck-tree__create">
                    <input
                        class="b3-text-field srs-deck-tree__input"
                        placeholder="新卡包名称"
                        value={newName()}
                        onInput={(e) => setNewName(e.currentTarget.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreateInput(false); }}
                    />
                    <button class="b3-button b3-button--small" onClick={handleCreate} disabled={!newName().trim()}>添加</button>
                </div>
            </Show>

            <div class="srs-deck-tree__list">
                <For each={props.decks}>
                    {(deck) => (
                        <div
                            class="srs-deck-tree__item"
                            classList={{ 'srs-deck-tree__item--active': deck.id === props.selectedDeckId, 'srs-deck-tree__item--builtin': deck.isBuiltin }}
                            onClick={() => { if (editingId() !== deck.id) props.onSelectDeck(deck.id); }}
                            onContextMenu={(e) => handleContextMenu(e, deck)}
                        >
                            <Show when={editingId() === deck.id} fallback={
                                <div class="srs-deck-tree__item-content">
                                    <span class="srs-deck-tree__item-icon">{deck.isBuiltin ? '📦' : '📁'}</span>
                                    <span class="srs-deck-tree__item-name">{deck.name}</span>
                                    <span class="srs-deck-tree__item-count">({cardCounts()[deck.id] ?? 0})</span>
                                </div>
                            }>
                                <input
                                    class="b3-text-field srs-deck-tree__edit-input"
                                    value={editName()}
                                    onInput={(e) => setEditName(e.currentTarget.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(deck.id); if (e.key === 'Escape') setEditingId(null); }}
                                    onBlur={() => handleRename(deck.id)}
                                />
                            </Show>
                            <Show when={deck.isBuiltin && editingId() !== deck.id}>
                                <span class="srs-deck-tree__builtin-badge" title="内置卡包">内置</span>
                            </Show>
                        </div>
                    )}
                </For>
            </div>

            <Show when={contextMenu()}>
                {(menu) => (
                    <div
                        class="srs-deck-tree__context-menu"
                        style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Show when={menu().deck}>
                            {(deck) => (
                                <>
                                    <div class="srs-deck-tree__ctx-item" onClick={() => { props.onSelectDeck(deck().id); closeContextMenu(); }}>
                                        选中
                                    </div>
                                    <Show when={!deck().isBuiltin}>
                                        <div class="srs-deck-tree__ctx-item" onClick={() => startRename(deck())}>
                                            重命名
                                        </div>
                                        <div class="srs-deck-tree__ctx-item srs-deck-tree__ctx-item--danger" onClick={() => handleDelete(deck())}>
                                            删除
                                        </div>
                                    </Show>
                                    <div class="srs-deck-tree__ctx-item" onClick={() => handleExport(deck())}>
                                        导出
                                    </div>
                                </>
                            )}
                        </Show>
                        <Show when={!menu().deck}>
                            <div class="srs-deck-tree__ctx-item" onClick={() => { setShowCreateInput(true); closeContextMenu(); }}>
                                新增卡包
                            </div>
                        </Show>
                    </div>
                )}
            </Show>
        </div>
    );
}
