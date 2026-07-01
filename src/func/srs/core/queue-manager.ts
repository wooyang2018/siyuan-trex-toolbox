/**
 * SRS Core — Queue Manager
 * Manages queue commit semantics: New → Learning → Review → Relearning.
 * Each queue has independent commit/rollback rules.
 */
import type { SRSCard, SRSQueue, QueueType, SRSSettings } from '@/types/srs';
import { loadQueues, saveQueues } from './storage';
import { isCardDue } from './scheduler';

// ===== In-memory queue state =====
let queues: Record<string, SRSQueue> = {};
let initialized = false;

const QUEUE_KEYS: Record<QueueType, string> = {
    retrieval: 'srs-retrieval',
};

/**
 * Initialize queues from storage. Call once at module load.
 */
export async function initQueues(): Promise<void> {
    if (initialized) return;
    queues = await loadQueues();
    // Ensure all queue types exist
    for (const type of Object.keys(QUEUE_KEYS) as QueueType[]) {
        const key = QUEUE_KEYS[type];
        if (!queues[key]) {
            queues[key] = { type, cardIds: [], currentIndex: 0 };
        }
    }
    initialized = true;
}

/**
 * Persist queues to storage (debounced by caller).
 */
export async function persistQueues(): Promise<void> {
    await saveQueues(queues);
}

/**
 * Get a queue by type.
 */
export function getQueue(type: QueueType): SRSQueue {
    return queues[QUEUE_KEYS[type]] ?? { type, cardIds: [], currentIndex: 0 };
}

/**
 * Add cards to a specific queue.
 */
export function addToQueue(type: QueueType, cardIds: string[], insertAt?: number): void {
    const key = QUEUE_KEYS[type];
    if (!queues[key]) queues[key] = { type, cardIds: [], currentIndex: 0 };
    const queue = queues[key];
    const newIds = cardIds.filter((id) => !queue.cardIds.includes(id));
    if (insertAt !== undefined && insertAt >= 0 && insertAt <= queue.cardIds.length) {
        queue.cardIds.splice(insertAt, 0, ...newIds);
    } else {
        queue.cardIds.push(...newIds);
    }
}

/**
 * Remove cards from a specific queue.
 */
export function removeFromQueue(type: QueueType, cardIds: string[]): void {
    const key = QUEUE_KEYS[type];
    if (!queues[key]) return;
    const queue = queues[key];
    queue.cardIds = queue.cardIds.filter((id) => !cardIds.includes(id));
    if (queue.currentIndex >= queue.cardIds.length) {
        queue.currentIndex = Math.max(0, queue.cardIds.length - 1);
    }
}

/**
 * Clear a queue.
 */
export function clearQueue(type: QueueType): void {
    const key = QUEUE_KEYS[type];
    if (queues[key]) {
        queues[key].cardIds = [];
        queues[key].currentIndex = 0;
    }
}

/**
 * Get the current card ID in a queue.
 */
export function getCurrentCardId(type: QueueType): string | null {
    const queue = getQueue(type);
    return queue.cardIds[queue.currentIndex] ?? null;
}

/**
 * Advance to the next card in a queue. Returns null if at end.
 */
export function advanceQueue(type: QueueType): string | null {
    const key = QUEUE_KEYS[type];
    if (!queues[key]) return null;
    const queue = queues[key];
    queue.currentIndex++;
    if (queue.currentIndex >= queue.cardIds.length) {
        return null;
    }
    return queue.cardIds[queue.currentIndex];
}

/**
 * Get the current index and total for a queue.
 */
export function getQueueProgress(type: QueueType): { current: number; total: number } {
    const queue = getQueue(type);
    return { current: queue.currentIndex + 1, total: queue.cardIds.length };
}

/**
 * Build the retrieval practice queue from due cards.
 * Review cards sorted by due date, new cards limited by newPerDay.
 * Total review cards limited by reviewsPerDay.
 */
export function buildRetrievalQueue(cards: SRSCard[], settings: SRSSettings): string[] {
    const dueCards = cards.filter((c) => isCardDue(c, settings.dayStartHour));
    // Sort: new cards last, then by due date
    const reviewCards = dueCards
        .filter((c) => c.state !== 'new')
        .sort((a, b) => a.nextReview - b.nextReview)
        .slice(0, settings.reviewsPerDay);
    const newCards = dueCards
        .filter((c) => c.state === 'new')
        .slice(0, settings.newPerDay);
    return [...reviewCards.map((c) => c.id), ...newCards.map((c) => c.id)];
}

/**
 * Sort a queue by the given comparator.
 */
export function sortQueue(type: QueueType, compareFn: (a: string, b: string) => number): void {
    const key = QUEUE_KEYS[type];
    if (!queues[key]) return;
    queues[key].cardIds.sort(compareFn);
    queues[key].currentIndex = 0;
}

/**
 * Insert a card at a specific position in the queue.
 */
export function insertAtPosition(type: QueueType, cardId: string, position: number): void {
    const key = QUEUE_KEYS[type];
    if (!queues[key]) queues[key] = { type, cardIds: [], currentIndex: 0 };
    const queue = queues[key];
    const existingIdx = queue.cardIds.indexOf(cardId);
    if (existingIdx >= 0) {
        queue.cardIds.splice(existingIdx, 1);
    }
    const insertPos = Math.min(position, queue.cardIds.length);
    queue.cardIds.splice(insertPos, 0, cardId);
}
