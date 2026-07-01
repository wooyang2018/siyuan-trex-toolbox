/**
 * SRS Browser — Card Manager Controller
 * Full CRUD for cards + deck management + statistics + batch operations
 */
import type { SRSCard } from '@/types/srs';
import type { BrowserFilter, SortField, SortOrder, DeckInfo, CardStats } from './types';
import { getAllCards, deleteCards, updateCard, refreshNativeCards, getCardsByDeckId } from '../core/card-repository';
import { getDeckHealth, isCardDue } from '../shared/srs-metrics';
import { sqlSearchCards } from './sql-filter';
import { getRiffDecks, createRiffDeck, renameRiffDeck, removeRiffDeck, removeRiffCards } from '@/api';

// ===== Native deck block-ID cache =====
// Maps SiYuan riff deck ID → set of block IDs in that deck.
// Populated by getAllDecks() from the card cache, consumed by getFilteredCards().
let nativeDeckBlockIds: Map<string, Set<string>> = new Map();

// ===== Card filtering & sorting =====

export async function getFilteredCards(filter: BrowserFilter): Promise<SRSCard[]> {
    await refreshNativeCards();
    let cards = getAllCards();

    // Native deck filter: use cached block IDs from getRiffCards
    if (filter.deckId) {
        const blockIdSet = nativeDeckBlockIds.get(filter.deckId);
        if (blockIdSet) {
            // Native deck — filter by blockId membership
            cards = cards.filter(c => blockIdSet.has(c.blockId));
        } else {
            // Plugin deck — filter by deckId field
            cards = cards.filter(c => c.deckId === filter.deckId);
        }
    }

    if (filter.task === 'due') cards = cards.filter(isCardDue);
    if (filter.task === 'new') cards = cards.filter(c => c.state === 'new');
    if (filter.task === 'learning') cards = cards.filter(c => c.state === 'learning' || c.state === 'relearning');
    if (filter.task === 'lapseRisk') cards = cards.filter(c => c.lapses >= 2 || c.state === 'relearning');
    if (filter.cardType) cards = cards.filter(c => c.type === filter.cardType);
    if (filter.dueOnly) cards = cards.filter(isCardDue);
    if (filter.tag) cards = cards.filter(c => c.tags.includes(filter.tag));
    if (filter.state) cards = cards.filter(c => c.state === filter.state);
    if (filter.searchText) {
        const q = filter.searchText.toLowerCase();
        cards = cards.filter(c =>
            c.front.toLowerCase().includes(q) ||
            c.back.toLowerCase().includes(q) ||
            c.tags.some(t => t.toLowerCase().includes(q))
        );
    }

    // SQL search applies on top of other filters (intersection)
    if (filter.sqlQuery) {
        const sqlResults = await sqlSearchCards(filter.sqlQuery);
        const sqlIds = new Set(sqlResults.map(c => c.id));
        cards = cards.filter(c => sqlIds.has(c.id));
    }

    return cards;
}

export function sortCards(cards: SRSCard[], field: SortField, order: SortOrder): SRSCard[] {
    const sorted = [...cards].sort((a, b) => {
        const av = a[field] as any;
        const bv = b[field] as any;
        if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv);
        return (av as number) - (bv as number);
    });
    return order === 'desc' ? sorted.reverse() : sorted;
}

// ===== Card CRUD =====

export async function batchDeleteCards(cardIds: string[]): Promise<number> {
    return deleteCards(cardIds);
}

export async function editSrsData(cardId: string, updates: Partial<SRSCard>): Promise<void> {
    await updateCard(cardId, updates);
}

export async function batchMoveToDeck(cardIds: string[], deckId: string): Promise<number> {
    let count = 0;
    for (const id of cardIds) {
        await updateCard(id, { deckId });
        count++;
    }
    return count;
}

export async function batchResetSrs(cardIds: string[]): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const id of cardIds) {
        await updateCard(id, {
            stability: 0,
            difficulty: 0,
            lastReview: 0,
            nextReview: now,
            reps: 0,
            lapses: 0,
            state: 'new',
        });
        count++;
    }
    return count;
}

export async function batchPostpone(cardIds: string[], days: number): Promise<number> {
    const ms = days * 86400_000;
    let count = 0;
    for (const id of cardIds) {
        const card = getAllCards().find(c => c.id === id);
        if (!card) continue;
        await updateCard(id, { nextReview: card.nextReview + ms });
        count++;
    }
    return count;
}

// ===== Deck management =====

export async function getAllDecks(): Promise<DeckInfo[]> {
    const decks: DeckInfo[] = [];
    nativeDeckBlockIds.clear();
    await refreshNativeCards();

    // Derive deck counts from the card cache populated by refreshNativeCards,
    // instead of making separate getRiffCards calls that can fail independently.
    try {
        const riffDecks = await getRiffDecks();
        for (const d of riffDecks) {
            const deckId = String(d.id ?? d.ID ?? d.deckID ?? '');
            const deckName = String(d.name ?? d.Name ?? d.id ?? '');
            const deckCards = getCardsByDeckId(deckId);
            const blockIds = new Set(deckCards.map(c => c.blockId));
            nativeDeckBlockIds.set(deckId, blockIds);
            decks.push({
                id: deckId,
                name: deckName,
                type: 'native',
                cardCount: deckCards.length,
            });
        }
    } catch (e) {
        console.error('[SRS-Browser] getRiffDecks failed:', e);
    }

    return decks;
}

export async function createDeck(name: string): Promise<string | null> {
    try {
        const id = await createRiffDeck(name);
        return id;
    } catch (e) {
        console.error('[SRS-Browser] createDeck failed:', e);
        return null;
    }
}

/** Rename a SiYuan native riffcard deck. */
export async function renameDeck(deckId: string, name: string, _deckType?: 'native' | 'plugin'): Promise<boolean> {
    try {
        await renameRiffDeck(deckId, name);
        await refreshNativeCards();
        return true;
    } catch (e) {
        console.error('[SRS-Browser] renameDeck failed:', e);
        return false;
    }
}

/** Delete a SiYuan native riffcard deck. */
export async function deleteDeck(deckId: string, _deckType?: 'native' | 'plugin'): Promise<boolean> {
    try {
        await removeRiffDeck(deckId);
        await refreshNativeCards();
        return true;
    } catch (e) {
        console.error('[SRS-Browser] deleteDeck failed:', e);
        return false;
    }
}

export async function removeCardsFromNativeDeck(deckId: string, blockIds: string[]): Promise<boolean> {
    try {
        await removeRiffCards(deckId, blockIds);
        return true;
    } catch (e) {
        console.error('[SRS-Browser] removeCardsFromNativeDeck failed:', e);
        return false;
    }
}

// ===== Statistics =====

export function getCardStats(): CardStats {
    const cards = getAllCards();
    const health = getDeckHealth(cards);
    const stats: CardStats = {
        total: cards.length,
        due: health.due,
        new: health.newCount,
        learning: health.learningCount,
        review: health.reviewCount,
        relearning: health.relearningCount,
        lapseRisk: health.lapseRiskCount,
        health,
        byType: {} as Record<string, number>,
        byDeck: {} as Record<string, number>,
        avgStability: 0,
        avgDifficulty: 0,
        totalReps: 0,
    };
    for (const c of cards) {
        stats.byType[c.type] = (stats.byType[c.type] || 0) + 1;
        stats.byDeck[c.deckId] = (stats.byDeck[c.deckId] || 0) + 1;
        stats.totalReps += c.reps;
    }
    const reviewed = cards.filter(c => c.reps > 0);
    if (reviewed.length > 0) {
        stats.avgStability = reviewed.reduce((s, c) => s + c.stability, 0) / reviewed.length;
        stats.avgDifficulty = reviewed.reduce((s, c) => s + c.difficulty, 0) / reviewed.length;
    }
    return stats;
}

// ===== Export =====

export function exportCardsToJson(cardIds?: string[]): string {
    const cards = cardIds ? getAllCards().filter(c => cardIds.includes(c.id)) : getAllCards();
    return JSON.stringify(cards, null, 2);
}

export function exportCardsToCsv(cardIds?: string[]): string {
    const cards = cardIds ? getAllCards().filter(c => cardIds.includes(c.id)) : getAllCards();
    const headers = ['id', 'type', 'deckId', 'front', 'back', 'state', 'stability', 'difficulty', 'nextReview', 'reps', 'lapses', 'tags'];
    const rows = cards.map(c => [
        c.id, c.type, c.deckId,
        `"${c.front.replace(/"/g, '""')}"`,
        `"${c.back.replace(/"/g, '""')}"`,
        c.state, c.stability, c.difficulty,
        new Date(c.nextReview).toISOString(),
        c.reps, c.lapses,
        c.tags.join(';'),
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
}
