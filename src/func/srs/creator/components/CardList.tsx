import { createSignal, Show, For, onMount, createEffect, createMemo } from 'solid-js';
import { getCardsByDeckId, refreshNativeCards, deleteCards } from '../../core/card-repository';
import { filterCardsBySearchAndType } from '../../viewer/card-filter';
import { parseFlashcard, type ParsedFlashcard } from '../../viewer/card-parser';
import { GENERATABLE_CARD_TYPES, CARD_TYPE_LABELS } from '../../shared/card-type-labels';
import { getBlockKramdown, getBlockAttrs, removeRiffCards, addRiffCards, sql } from '@/api';
import { CardType } from '@/types/srs';
import type { SRSCard } from '@/types/srs';

type SortBy = 'created' | 'updated' | 'type';

export function CardList(props: {
    deckId: string;
    notebookId?: string;
    onSelectCard: (card: ParsedFlashcard | null, blockId: string) => void;
    searchText?: string;
}) {
    const [cards, setCards] = createSignal<SRSCard[]>([]);
    const [parsedCards, setParsedCards] = createSignal<{ card: SRSCard; parsed: ParsedFlashcard }[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [searchText, setSearchText] = createSignal(props.searchText ?? '');
    const [cardType, setCardType] = createSignal<string>('');
    const [sortBy, setSortBy] = createSignal<SortBy>('created');
    const [selectedBlockIds, setSelectedBlockIds] = createSignal<Set<string>>(new Set());
    const [hoveredBlockId, setHoveredBlockId] = createSignal<string | null>(null);
    let searchTimer: ReturnType<typeof setTimeout> | null = null;

    // Sync external search text
    createEffect(() => {
        if (props.searchText !== undefined) {
            setSearchText(props.searchText);
            loadCards();
        }
    });

    // Reload when deck or notebook changes
    createEffect(() => {
        const deckId = props.deckId;
        const nbId = props.notebookId;
        if (deckId) loadCards();
    });

    onMount(() => {
        loadCards();
    });

    const loadCards = async () => {
        const deckId = props.deckId;
        const nbId = props.notebookId;
        if (!deckId) { setParsedCards([]); return; }
        setLoading(true);
        try {
            await refreshNativeCards();
            let deckCards = getCardsByDeckId(deckId);
            // Filter by notebook if selected
            if (nbId) {
                const cardBlockIds = deckCards.map(c => c.blockId).filter(Boolean);
                if (cardBlockIds.length > 0) {
                    const placeholders = cardBlockIds.map(() => '?').join(',');
                    const rows = await sql(
                        `SELECT b.id FROM blocks b INNER JOIN blocks d ON b.root_id = d.id WHERE d.box = ? AND b.id IN (${placeholders}) LIMIT 500`,
                        [nbId, ...cardBlockIds]
                    );
                    const validBlockIds = new Set((rows || []).map((r: any) => r.id).filter(Boolean));
                    deckCards = deckCards.filter(c => validBlockIds.has(c.blockId));
                }
            }
            const search = searchText();
            const type = cardType();
            deckCards = filterCardsBySearchAndType(deckCards, search, type);
            deckCards = sortCards(deckCards);

            const results: { card: SRSCard; parsed: ParsedFlashcard }[] = [];
            for (const card of deckCards) {
                try {
                    const [kramdownResult, attrsResult] = await Promise.all([getBlockKramdown(card.blockId), getBlockAttrs(card.blockId)]);
                    const markdown = kramdownResult?.kramdown || card.front || '';
                    const ct = attrsResult?.['custom-card-type'] || inferTypeFromContent(markdown);
                    results.push({ card, parsed: parseFlashcard(markdown, ct) });
                } catch (e) {
                    console.error('[CardList] parse card failed:', card.blockId, e);
                    results.push({
                        card,
                        parsed: { type: 'unknown', question: card.front || card.blockId, answer: card.back || '', options: [], explanation: '', raw: card.front || '' },
                    });
                }
            }
            setParsedCards(results);
            setCards(deckCards);
        } catch (e) {
            console.error('[CardList] loadCards failed:', e);
            setParsedCards([]);
        } finally {
            setLoading(false);
        }
    };

    const sortCards = (cards: SRSCard[]): SRSCard[] => {
        const by = sortBy();
        const copy = [...cards];
        switch (by) {
            case 'created':
                return copy.sort((a, b) => b.createdAt - a.createdAt);
            case 'updated':
                return copy.sort((a, b) => b.updatedAt - a.updatedAt);
            case 'type':
                return copy.sort((a, b) => String(a.type).localeCompare(String(b.type)));
            default:
                return copy;
        }
    };

    const handleSearchInput = (value: string) => {
        setSearchText(value);
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadCards(), 300);
    };

    const handleTypeChange = (value: string) => {
        setCardType(value);
        loadCards();
    };

    const handleSortChange = (value: SortBy) => {
        setSortBy(value);
        loadCards();
    };

    const toggleSelect = (blockId: string) => {
        const s = new Set(selectedBlockIds());
        if (s.has(blockId)) s.delete(blockId);
        else s.add(blockId);
        setSelectedBlockIds(s);
    };

    const toggleSelectAll = () => {
        const allIds = parsedCards().map(r => r.card.blockId);
        const current = selectedBlockIds();
        if (current.size === allIds.length && allIds.length > 0) {
            setSelectedBlockIds(new Set());
        } else {
            setSelectedBlockIds(new Set(allIds));
        }
    };

    const handleBatchDelete = async () => {
        const ids = [...selectedBlockIds()];
        if (ids.length === 0) return;
        if (!confirm(`确认删除选中的 ${ids.length} 张卡片？\n注意：这只会将卡片从卡包移除，不会删除文档块本身。`)) return;
        try {
            const cardIds = parsedCards()
                .filter(r => ids.includes(r.card.blockId))
                .map(r => r.card.id);
            await deleteCards(cardIds);
            setSelectedBlockIds(new Set());
            await loadCards();
        } catch (e) {
            console.error('[CardList] batch delete failed:', e);
        }
    };

    const handleMoveToDeck = async (targetDeckId: string) => {
        const ids = [...selectedBlockIds()];
        if (ids.length === 0 || !targetDeckId) return;
        try {
            // Remove from current deck and add to target deck
            await removeRiffCards(props.deckId, ids);
            await addRiffCards(targetDeckId, ids);
            await refreshNativeCards();
            setSelectedBlockIds(new Set());
            await loadCards();
        } catch (e) {
            console.error('[CardList] move cards failed:', e);
        }
    };

    const inferTypeFromContent = (content: string): string => {
        if (/【单选题】/.test(content)) return CardType.SingleChoice;
        if (/【多选题】/.test(content)) return CardType.MultiChoice;
        if (/==.+?==/.test(content)) return CardType.Cloze;
        return CardType.QA;
    };

    const filteredCount = createMemo(() => parsedCards().length);

    return (
        <div class="srs-card-list">
            <div class="srs-card-list__toolbar">
                <select class="b3-select srs-card-list__type-select" value={cardType()} onChange={(e) => handleTypeChange(e.currentTarget.value)}>
                    <option value="">全部题型</option>
                    <For each={Object.entries(GENERATABLE_CARD_TYPES)}>{([type, label]) => <option value={type}>{label}</option>}</For>
                </select>
                <select class="b3-select srs-card-list__sort-select" value={sortBy()} onChange={(e) => handleSortChange(e.currentTarget.value as SortBy)}>
                    <option value="created">按创建时间</option>
                    <option value="updated">按修改时间</option>
                    <option value="type">按题型</option>
                </select>
                <Show when={selectedBlockIds().size > 0}>
                    <div class="srs-card-list__batch-actions">
                        <select class="b3-select srs-card-list__move-select" onChange={(e) => { handleMoveToDeck(e.currentTarget.value); e.currentTarget.value = ''; }}>
                            <option value="">移动到…</option>
                        </select>
                        <button class="b3-button b3-button--small b3-button--outline b3-button--error" onClick={handleBatchDelete}>
                            删除 ({selectedBlockIds().size})
                        </button>
                    </div>
                </Show>
                <span class="srs-card-list__count">{filteredCount()} 张卡片</span>
            </div>

            <div class="srs-card-list__header">
                <label class="srs-card-list__check-all">
                    <input type="checkbox" checked={selectedBlockIds().size === parsedCards().length && parsedCards().length > 0} onChange={toggleSelectAll} />
                </label>
                <span class="srs-card-list__header-label">内容</span>
                <span class="srs-card-list__header-type">题型</span>
            </div>

            <div class="srs-card-list__items">
                <Show when={!loading()} fallback={<div class="srs-card-list__loading">加载中…</div>}>
                    <Show when={parsedCards().length > 0} fallback={
                        <div class="srs-card-list__empty srs-empty-card">
                            <p>{searchText() || cardType() ? '没有匹配筛选条件的卡片' : '该卡包没有卡片'}</p>
                        </div>
                    }>
                        <For each={parsedCards()}>
                            {(item, index) => (
                                <div
                                    class="srs-card-list-item"
                                    classList={{
                                        'srs-card-list-item--selected': selectedBlockIds().has(item.card.blockId),
                                        'srs-card-list-item--hover': hoveredBlockId() === item.card.blockId,
                                    }}
                                    onClick={() => props.onSelectCard(item.parsed, item.card.blockId)}
                                    onMouseEnter={() => setHoveredBlockId(item.card.blockId)}
                                    onMouseLeave={() => setHoveredBlockId(null)}
                                >
                                    <label class="srs-card-list-item__check" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedBlockIds().has(item.card.blockId)}
                                            onChange={() => toggleSelect(item.card.blockId)}
                                        />
                                    </label>
                                    <div class="srs-card-list-item__content">
                                        <div class="srs-card-list-item__front">{item.parsed.question || '(无内容)'}</div>
                                        <div class="srs-card-list-item__back">{item.parsed.answer || ''}</div>
                                    </div>
                                    <span class={`srs-card-type-badge srs-card-type-badge--${item.card.type}`}>
                                        {CARD_TYPE_LABELS[item.card.type] ?? item.card.type}
                                    </span>
                                </div>
                            )}
                        </For>
                    </Show>
                </Show>
            </div>
        </div>
    );
}
