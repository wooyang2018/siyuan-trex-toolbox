/**
 * SRS Core — Native Riffcard Repository
 *
 * SiYuan's native riffcard decks are the source of truth for flashcards.
 * This adapter keeps only an in-memory projection for the plugin UI and never
 * persists cards to plugin-owned JSON files.
 */
import type { SRSCard, Rating, SRSSettings, ReviewLogEntry } from '@/types/srs';
import { CardType } from '@/types/srs';
import type { UndoSnapshot } from '../review/types';
import { loadReviewLog, saveReviewLog } from './storage';
import {
    addRiffCards,
    batchSetRiffCardsDueTime,
    createRiffDeck,
    getRiffCards,
    getRiffCardsByBlockIDs,
    getRiffDecks,
    removeRiffCards,
    resetRiffCards,
    reviewRiffCard,
    setBlockAttrs,
    sql,
} from '@/api';

// ===== In-memory projection =====
let cardCache: Map<string, SRSCard> = new Map();
let reviewLogCache: ReviewLogEntry[] = [];
let initialized = false;
let refreshing: Promise<void> | null = null;

const DEFAULT_DECK_NAME = 'default';
const PREFERRED_EXISTING_DECK_NAME = 'wiki-cards';
const CARD_ID_SEPARATOR = '::';

interface NativeDeck {
    id: string;
    name: string;
}

interface NativeRiffCard {
    ID?: string;
    id?: string;
    BlockID?: string;
    blockID?: string;
    blockId?: string;
    DeckID?: string;
    deckID?: string;
    deckId?: string;
    Created?: string | number;
    Updated?: string | number;
    Due?: string | number;
    State?: number | string;
    Reviews?: number;
    Lapses?: number;
    Interval?: number;
}

interface BlockRow {
    id: string;
    content?: string;
    markdown?: string;
    root_id?: string;
    updated?: string | number;
    created?: string | number;
}

interface CardAttrs {
    type?: CardType;
    front?: string;
    back?: string;
    tags?: string[];
    clozeIndex?: number;
    cdfMode?: SRSCard['cdfMode'];
    cdfSemantic?: SRSCard['cdfSemantic'];
    occlusions?: SRSCard['occlusions'];
    listHints?: string[];
    sourceBlockId?: string;
    excerptRecordId?: string;
}

/**
 * Initialize the card repository from SiYuan native riffcards.
 */
export async function initRepository(): Promise<void> {
    if (initialized) return;
    reviewLogCache = await loadReviewLog();
    initialized = true;
    await refreshNativeCards();
}

/**
 * Reload the in-memory projection from SiYuan native riffcard decks.
 */
export async function refreshNativeCards(): Promise<void> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
        try {
            const decks = await getNativeDecks();
            const blockIdsByDeck = new Map<string, string[]>();
            const allBlockIds = new Set<string>();

            for (const deck of decks) {
                const rawCards = await getRiffCards(deck.id, 'all');
                const blockIds = unique(rawCards.map(extractBlockId).filter(Boolean));
                blockIdsByDeck.set(deck.id, blockIds);
                blockIds.forEach((id) => allBlockIds.add(id));
                console.log(`[SRS-Core] refreshNativeCards: deck "${deck.name}" (${deck.id}) → ${blockIds.length} block IDs (rawCards: ${rawCards.length})`);
            }

            const blockIds = [...allBlockIds];
            const [blocks, attrsByBlock, nativeDetails] = await Promise.all([
                loadBlocks(blockIds),
                loadSrsAttrs(blockIds),
                loadNativeDetails(blockIds),
            ]);

            const nextCache = new Map<string, SRSCard>();
            for (const deck of decks) {
                const deckBlockIds = blockIdsByDeck.get(deck.id) ?? [];
                for (const blockId of deckBlockIds) {
                    const block = blocks.get(blockId);
                    const detail = nativeDetails.get(makeCardId(deck.id, blockId)) ?? nativeDetails.get(blockId);
                    const card = buildCard(deck, blockId, block, detail, attrsByBlock.get(blockId));
                    nextCache.set(card.id, card);
                }
            }
            cardCache = nextCache;
            console.log(`[SRS-Core] refreshNativeCards: loaded ${nextCache.size} cards from ${decks.length} decks`);
        } catch (error) {
            console.error('[SRS-Core] refreshNativeCards failed:', error);
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}

/**
 * Cards are stored by SiYuan native riffcard decks. This is intentionally a no-op.
 */
export async function persistCards(): Promise<void> {
    // Cards are persisted only by SiYuan's native riffcard subsystem.
}

/**
 * Persist review log to storage. Review history is not card storage.
 */
export async function persistReviewLog(): Promise<void> {
    await saveReviewLog(reviewLogCache);
}

export function getCard(cardId: string): SRSCard | undefined {
    return cardCache.get(cardId);
}

export function getAllCards(): SRSCard[] {
    return Array.from(cardCache.values());
}

export function getCardsByBlockId(blockId: string): SRSCard[] {
    return getAllCards().filter((c) => c.blockId === blockId);
}

export function getCardsByRootId(rootId: string): SRSCard[] {
    return getAllCards().filter((c) => c.rootId === rootId);
}

export function getCardsByDeckId(deckId: string): SRSCard[] {
    return getAllCards().filter((c) => c.deckId === deckId);
}

/**
 * Create a new native riffcard by adding the source block to a SiYuan deck.
 * Presentation metadata is stored as block attrs, not as plugin card JSON.
 */
export async function createCard(partial: Omit<Partial<SRSCard>, 'id'> & { blockId: string; type: SRSCard['type'] }): Promise<SRSCard> {
    const deckId = await resolveDeckId(partial.deckId);
    await writeSrsAttrs(partial.blockId, partial);
    await addRiffCards(deckId, [partial.blockId]);
    await refreshNativeCards();
    const id = makeCardId(deckId, partial.blockId);
    const card = cardCache.get(id);
    if (card) return card;

    const now = Date.now();
    const fallback: SRSCard = {
        id,
        blockId: partial.blockId,
        rootId: partial.rootId || '',
        type: partial.type,
        deckId,
        front: partial.front || '',
        back: partial.back || '',
        stability: 0,
        difficulty: 0,
        lastReview: 0,
        nextReview: now,
        reps: 0,
        lapses: 0,
        state: 'new',
        tags: partial.tags || [],
        createdAt: now,
        updatedAt: now,
        clozeIndex: partial.clozeIndex,
        cdfMode: partial.cdfMode,
        cdfSemantic: partial.cdfSemantic,
        occlusions: partial.occlusions,
        listHints: partial.listHints,
        sourceBlockId: partial.sourceBlockId,
        excerptRecordId: partial.excerptRecordId,
    };
    cardCache.set(id, fallback);
    return fallback;
}

export async function createCards(partials: Array<Omit<Partial<SRSCard>, 'id'> & { blockId: string; type: SRSCard['type'] }>): Promise<SRSCard[]> {
    const cards: SRSCard[] = [];
    for (const partial of partials) {
        cards.push(await createCard(partial));
    }
    return cards;
}

export async function updateCard(cardId: string, updates: Partial<SRSCard>): Promise<SRSCard | null> {
    const card = cardCache.get(cardId);
    if (!card) return null;

    let deckId = card.deckId;
    if (updates.deckId && updates.deckId !== card.deckId) {
        deckId = await resolveDeckId(updates.deckId);
        await addRiffCards(deckId, [card.blockId]);
        await removeRiffCards(card.deckId, [card.blockId]);
    }

    await writeSrsAttrs(card.blockId, { ...card, ...updates, deckId });

    if (typeof updates.nextReview === 'number' && updates.nextReview !== card.nextReview) {
        await batchSetRiffCardsDueTime([{ id: card.blockId, due: formatDueForNative(updates.nextReview) }]);
    }

    if (updates.state === 'new' && updates.reps === 0 && updates.lapses === 0) {
        await resetRiffCards(deckId, [card.blockId]);
    }

    await refreshNativeCards();
    return cardCache.get(makeCardId(deckId, card.blockId)) ?? { ...card, ...updates, deckId, updatedAt: Date.now() };
}

export async function deleteCard(cardId: string): Promise<boolean> {
    const card = cardCache.get(cardId);
    if (!card) return false;
    await removeRiffCards(card.deckId, [card.blockId]);
    cardCache.delete(cardId);
    return true;
}

export async function deleteCards(cardIds: string[]): Promise<number> {
    const blockIdsByDeck = new Map<string, string[]>();
    for (const id of cardIds) {
        const card = cardCache.get(id);
        if (!card) continue;
        if (!blockIdsByDeck.has(card.deckId)) blockIdsByDeck.set(card.deckId, []);
        blockIdsByDeck.get(card.deckId)!.push(card.blockId);
    }

    let count = 0;
    for (const [deckId, blockIds] of blockIdsByDeck) {
        const uniqueBlockIds = unique(blockIds);
        await removeRiffCards(deckId, uniqueBlockIds);
        count += uniqueBlockIds.length;
    }
    if (count > 0) {
        await refreshNativeCards();
    }
    return count;
}

export async function deleteCardsByBlockId(blockId: string): Promise<number> {
    const cards = getCardsByBlockId(blockId);
    return deleteCards(cards.map((c) => c.id));
}

/**
 * Review a card in SiYuan native riffcard storage.
 */
export async function reviewCardById(
    cardId: string,
    rating: Rating,
    _settings: SRSSettings,
): Promise<{ card: SRSCard; log: ReviewLogEntry } | null> {
    const card = cardCache.get(cardId);
    if (!card) return null;

    await reviewRiffCard(card.deckId, card.blockId, rating);
    await refreshNativeCards();
    const updatedCard = cardCache.get(cardId) ?? { ...card, lastReview: Date.now(), reps: card.reps + 1 };
    const timestamp = Date.now();
    const log: ReviewLogEntry = {
        cardId,
        rating,
        state: updatedCard.state,
        stability: updatedCard.stability,
        difficulty: updatedCard.difficulty,
        timestamp,
        elapsedDays: card.lastReview ? Math.max(0, Math.floor((timestamp - card.lastReview) / 86400000)) : 0,
        scheduledDays: Math.max(0, Math.round((updatedCard.nextReview - timestamp) / 86400000)),
    };

    reviewLogCache.push(log);
    if (reviewLogCache.length > 10000) {
        reviewLogCache = reviewLogCache.slice(-10000);
    }

    await persistReviewLog();
    return { card: updatedCard, log };
}

/**
 * Undo the most recent review: restore native due time and in-memory card fields.
 * FSRS internal state (stability/difficulty) is best-effort restored from snapshot.
 */
export async function undoLastReview(snapshot: UndoSnapshot): Promise<boolean> {
    const card = cardCache.get(snapshot.cardId);
    if (!card) return false;

    try {
        await batchSetRiffCardsDueTime([{ id: card.blockId, due: formatDueForNative(snapshot.nextReview) }]);
    } catch (e) {
        console.error('[SRS-Core] undoLastReview: restore due time failed:', e);
    }

    const restored: SRSCard = {
        ...card,
        nextReview: snapshot.nextReview,
        state: snapshot.state,
        stability: snapshot.stability,
        difficulty: snapshot.difficulty,
        reps: snapshot.reps,
        lapses: snapshot.lapses,
        updatedAt: Date.now(),
    };
    cardCache.set(snapshot.cardId, restored);

    const lastLog = reviewLogCache[reviewLogCache.length - 1];
    if (lastLog && lastLog.cardId === snapshot.cardId) {
        reviewLogCache.pop();
        await persistReviewLog();
    }

    return true;
}

export function getReviewLog(): ReviewLogEntry[] {
    return [...reviewLogCache];
}

export function getCardReviewLog(cardId: string): ReviewLogEntry[] {
    return reviewLogCache.filter((l) => l.cardId === cardId);
}

export function searchCards(query: string): SRSCard[] {
    const lower = query.toLowerCase();
    return getAllCards().filter(
        (c) =>
            c.front.toLowerCase().includes(lower) ||
            c.back.toLowerCase().includes(lower) ||
            c.tags.some((t) => t.toLowerCase().includes(lower)),
    );
}

function makeCardId(deckId: string, blockId: string): string {
    return `${deckId}${CARD_ID_SEPARATOR}${blockId}`;
}

function extractBlockId(card: any): string {
    if (typeof card === 'string') return card;
    return card?.BlockID ?? card?.blockID ?? card?.blockId ?? card?.id ?? card?.ID ?? '';
}

function extractDeckId(card: NativeRiffCard, fallbackDeckId: string = ''): string {
    return card.DeckID ?? card.deckID ?? card.deckId ?? fallbackDeckId;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

async function getNativeDecks(): Promise<NativeDeck[]> {
    const decks = await getRiffDecks();
    return decks
        .map((d: any) => ({ id: String(d.id ?? d.ID ?? d.deckID ?? ''), name: String(d.name ?? d.Name ?? d.id ?? '') }))
        .filter((d) => d.id);
}

async function resolveDeckId(deckIdOrName?: string): Promise<string> {
    const decks = await getNativeDecks();
    const requested = deckIdOrName?.trim();
    if (requested && requested !== DEFAULT_DECK_NAME) {
        const byId = decks.find((d) => d.id === requested);
        if (byId) return byId.id;
        const byName = decks.find((d) => d.name === requested);
        if (byName) return byName.id;
        return createRiffDeck(requested);
    }

    const preferred = decks.find((d) => d.name === PREFERRED_EXISTING_DECK_NAME);
    if (preferred) return preferred.id;
    if (decks[0]) return decks[0].id;
    return createRiffDeck(DEFAULT_DECK_NAME);
}

async function loadNativeDetails(blockIds: string[]): Promise<Map<string, NativeRiffCard>> {
    const details = new Map<string, NativeRiffCard>();
    for (const chunkIds of chunk(blockIds, 100)) {
        const rows = await getRiffCardsByBlockIDs(chunkIds);
        for (const row of rows) {
            const blockId = extractBlockId(row);
            if (!blockId) continue;
            const deckId = extractDeckId(row);
            if (deckId) details.set(makeCardId(deckId, blockId), row);
            else details.set(blockId, row);
        }
    }
    return details;
}

async function loadBlocks(blockIds: string[]): Promise<Map<string, BlockRow>> {
    const blocks = new Map<string, BlockRow>();
    for (const chunkIds of chunk(blockIds, 100)) {
        if (chunkIds.length === 0) continue;
        const ids = chunkIds.map(sqlString).join(',');
        const rows = await sql(
            `SELECT id, content, markdown, root_id, updated, created FROM blocks WHERE id IN (${ids}) LIMIT ${chunkIds.length}`
        );
        for (const row of rows ?? []) {
            blocks.set(row.id, row);
        }
    }
    return blocks;
}

async function loadSrsAttrs(blockIds: string[]): Promise<Map<string, CardAttrs>> {
    const attrsByBlock = new Map<string, CardAttrs>();
    for (const chunkIds of chunk(blockIds, 100)) {
        if (chunkIds.length === 0) continue;
        const ids = chunkIds.map(sqlString).join(',');
        const rows = await sql(
            `SELECT block_id, name, value FROM attributes WHERE block_id IN (${ids}) AND (name LIKE 'custom-srs-%' OR name = 'custom-card-type') LIMIT ${chunkIds.length * 16}`
        );
        for (const row of rows ?? []) {
            const current = attrsByBlock.get(row.block_id) ?? {};
            applyAttr(current, row.name, row.value);
            attrsByBlock.set(row.block_id, current);
        }
    }
    return attrsByBlock;
}

function applyAttr(attrs: CardAttrs, name: string, value: string): void {
    switch (name) {
        case 'custom-srs-type': attrs.type = normalizeCardType(value); break;
        case 'custom-card-type': attrs.type = normalizeCardType(value); break;
        case 'custom-srs-front': attrs.front = value; break;
        case 'custom-srs-back': attrs.back = value; break;
        case 'custom-srs-tags': attrs.tags = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : []; break;
        case 'custom-srs-cloze-index': attrs.clozeIndex = toNumber(value); break;
        case 'custom-srs-cdf-mode': attrs.cdfMode = value as SRSCard['cdfMode']; break;
        case 'custom-srs-cdf-semantic': attrs.cdfSemantic = value as SRSCard['cdfSemantic']; break;
        case 'custom-srs-occlusions': attrs.occlusions = parseJson<SRSCard['occlusions']>(value); break;
        case 'custom-srs-list-hints': attrs.listHints = parseJson<string[]>(value); break;
        case 'custom-srs-source-block-id': attrs.sourceBlockId = value; break;
        case 'custom-srs-excerpt-record-id': attrs.excerptRecordId = value; break;
    }
}

function buildCard(deck: NativeDeck, blockId: string, block?: BlockRow, detail?: NativeRiffCard, attrs?: CardAttrs): SRSCard {
    const now = Date.now();
    const content = (block?.markdown || block?.content || '').trim();
    const createdAt = parseNativeTime(detail?.Created ?? block?.created) ?? now;
    const updatedAt = parseNativeTime(detail?.Updated ?? block?.updated) ?? createdAt;
    const nextReview = parseNativeTime(detail?.Due) ?? now;
    const reps = Number(detail?.Reviews ?? 0) || 0;
    const lapses = Number(detail?.Lapses ?? 0) || 0;
    const interval = Number(detail?.Interval ?? 0) || 0;

    return {
        id: makeCardId(deck.id, blockId),
        blockId,
        rootId: block?.root_id || '',
        type: attrs?.type ?? inferTypeFromContent(content),
        deckId: deck.id,
        deckName: deck.name,
        front: attrs?.front || content,
        back: attrs?.back || content,
        stability: interval,
        difficulty: 0,
        lastReview: reps > 0 ? updatedAt : 0,
        nextReview,
        reps,
        lapses,
        state: normalizeState(detail?.State, reps),
        tags: attrs?.tags ?? [],
        createdAt,
        updatedAt,
        clozeIndex: attrs?.clozeIndex,
        cdfMode: attrs?.cdfMode,
        cdfSemantic: attrs?.cdfSemantic,
        occlusions: attrs?.occlusions,
        listHints: attrs?.listHints,
        sourceBlockId: attrs?.sourceBlockId,
        excerptRecordId: attrs?.excerptRecordId,
    };
}

async function writeSrsAttrs(blockId: string, card: Partial<SRSCard>): Promise<void> {
    const attrs: Record<string, string> = {};
    if (card.type) attrs['custom-srs-type'] = card.type;
    if (card.front !== undefined) attrs['custom-srs-front'] = card.front;
    if (card.back !== undefined) attrs['custom-srs-back'] = card.back;
    if (card.tags) attrs['custom-srs-tags'] = card.tags.join(',');
    if (card.clozeIndex !== undefined) attrs['custom-srs-cloze-index'] = String(card.clozeIndex);
    if (card.cdfMode) attrs['custom-srs-cdf-mode'] = card.cdfMode;
    if (card.cdfSemantic) attrs['custom-srs-cdf-semantic'] = card.cdfSemantic;
    if (card.occlusions) attrs['custom-srs-occlusions'] = JSON.stringify(card.occlusions);
    if (card.listHints) attrs['custom-srs-list-hints'] = JSON.stringify(card.listHints);
    if (card.sourceBlockId) attrs['custom-srs-source-block-id'] = card.sourceBlockId;
    if (card.excerptRecordId) attrs['custom-srs-excerpt-record-id'] = card.excerptRecordId;
    if (Object.keys(attrs).length > 0) {
        await setBlockAttrs(blockId, attrs);
    }
}

function normalizeCardType(value: string): CardType {
    const normalized = value.trim();
    if ((Object.values(CardType) as string[]).includes(normalized)) return normalized as CardType;
    const alias = normalized.toLowerCase().replace(/[_\s]/g, '-');
    switch (alias) {
        case 'singlechoice':
        case 'single-choice': return CardType.SingleChoice;
        case 'multichoice':
        case 'multi-choice': return CardType.MultiChoice;
        case 'image-occlusion': return CardType.ImageOcclusion;
        case 'ordered-list': return CardType.OrderedList;
        case 'unordered-list': return CardType.UnorderedList;
        case 'concept-definition': return CardType.ConceptDefinition;
        default: return CardType.QA;
    }
}

function inferTypeFromContent(content: string): CardType {
    if (/【单选题】/.test(content)) return CardType.SingleChoice;
    if (/【多选题】/.test(content)) return CardType.MultiChoice;
    if (/==.+?==/.test(content)) return CardType.Cloze;
    return CardType.QA;
}

function normalizeState(state: NativeRiffCard['State'], reps: number): SRSCard['state'] {
    if (typeof state === 'string') {
        const lower = state.toLowerCase();
        if (lower.includes('relearn')) return 'relearning';
        if (lower.includes('learn')) return 'learning';
        if (lower.includes('review')) return 'review';
        if (lower.includes('new')) return 'new';
    }
    const numeric = Number(state);
    if (!Number.isFinite(numeric)) return reps > 0 ? 'review' : 'new';
    if (numeric <= 0) return 'new';
    if (numeric === 1) return reps > 0 ? 'learning' : 'new';
    if (numeric === 2) return 'review';
    return 'relearning';
}

function parseNativeTime(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return value > 1_000_000_000_000 ? value : value * 1000;
    const text = String(value).trim();
    if (/^\d{14}$/.test(text)) {
        const y = Number(text.slice(0, 4));
        const m = Number(text.slice(4, 6)) - 1;
        const d = Number(text.slice(6, 8));
        const hh = Number(text.slice(8, 10));
        const mm = Number(text.slice(10, 12));
        const ss = Number(text.slice(12, 14));
        return new Date(y, m, d, hh, mm, ss).getTime();
    }
    const time = new Date(text.replace(' ', 'T')).getTime();
    return Number.isFinite(time) ? time : null;
}

function formatDueForNative(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
}

function sqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function toNumber(value: string): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function parseJson<T>(value: string): T | undefined {
    try {
        return JSON.parse(value) as T;
    } catch (error) {
        console.error('[SRS-Core] parse card attr JSON failed:', error);
        return undefined;
    }
}
