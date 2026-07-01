/**
 * SRS Core — Riffcard Bridge
 * Syncs plugin-managed cards with SiYuan's native riffcard system.
 * Provides optional interoperability: cards created in the plugin can be
 * synced to SiYuan's native flashcard system for users who want both.
 */
import type { SRSCard, SRSSettings } from '@/types/srs';
import { getRiffCards, reviewRiffCard, removeRiffCards, createRiffDeck } from '@/api';

// ===== In-memory state =====
let deckId: string = '';
let syncEnabled = false;

/**
 * Initialize the riffcard bridge.
 */
export async function initBridge(settings: SRSSettings): Promise<void> {
    syncEnabled = settings.riffcardSync;
    deckId = settings.riffcardDeckId;

    if (!syncEnabled || !deckId) return;

    try {
        const riffcards = await getRiffCards(deckId, 'all');
        console.debug('[SRS] Riffcard bridge initialized with', riffcards.length, 'native cards');
    } catch (error) {
        console.error('[SRS] Riffcard bridge init failed:', error);
        syncEnabled = false;
    }
}

/**
 * Ensure a riffcard deck exists. Returns the deck ID.
 */
export async function ensureDeck(deckName: string): Promise<string> {
    try {
        const id = await createRiffDeck(deckName);
        return id;
    } catch (error) {
        console.error('[SRS] Failed to create riffcard deck:', error);
        return '';
    }
}

/**
 * Sync a card to SiYuan's native riffcard system.
 * SiYuan riffcards are block-based, so we use the card's blockId.
 */
export async function syncCardToRiffcard(card: SRSCard): Promise<string | null> {
    if (!syncEnabled || !deckId) return null;
    try {
        return card.blockId;
    } catch (error) {
        console.error('[SRS] syncCardToRiffcard failed:', error);
        return null;
    }
}

/**
 * Remove a card's riffcard entry from SiYuan's native system.
 */
export async function removeRiffcard(_cardId: string, blockId: string): Promise<void> {
    if (!syncEnabled || !deckId) return;
    try {
        await removeRiffCards(deckId, [blockId]);
    } catch (error) {
        console.error('[SRS] removeRiffcard failed:', error);
    }
}

/**
 * Batch remove riffcards.
 */
export async function removeRiffcardsBatch(items: Array<{ cardId: string; blockId: string }>): Promise<void> {
    if (!syncEnabled || !deckId || items.length === 0) return;
    try {
        const blockIds = items.map((i) => i.blockId);
        await removeRiffCards(deckId, blockIds);
    } catch (error) {
        console.error('[SRS] removeRiffcardsBatch failed:', error);
    }
}

/**
 * Review a card in SiYuan's native riffcard system.
 */
export async function reviewRiffcard(card: SRSCard, rating: number): Promise<void> {
    if (!syncEnabled || !deckId) return;
    try {
        await reviewRiffCard(deckId, card.blockId, rating);
    } catch (error) {
        console.error('[SRS] reviewRiffcard failed:', error);
    }
}

/**
 * Get all riffcards from SiYuan's native system for a deck.
 */
export async function getNativeRiffcards(reviewType: 'all' | 'due' | 'review' | 'new' = 'all') {
    if (!syncEnabled || !deckId) return [];
    try {
        return await getRiffCards(deckId, reviewType);
    } catch (error) {
        console.error('[SRS] getNativeRiffcards failed:', error);
        return [];
    }
}

/**
 * Check if sync is enabled.
 */
export function isSyncEnabled(): boolean {
    return syncEnabled;
}

/**
 * Update sync settings.
 */
export function updateSyncSettings(settings: SRSSettings): void {
    syncEnabled = settings.riffcardSync;
    deckId = settings.riffcardDeckId;
}
