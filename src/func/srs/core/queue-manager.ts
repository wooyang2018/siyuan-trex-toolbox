/**
 * SRS Core — Queue Manager
 * Manages queue commit semantics: New → Learning → Review → Relearning.
 * Each queue has independent commit/rollback rules.
 */
import type { SRSCard, QueueType, SRSSettings } from '@/types/srs';
import { loadQueues, saveQueues } from './storage';

// ===== In-memory queue state =====
let queues: Record<string, any> = {};
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
 * Build the retrieval practice queue from due cards.
 * Review cards sorted by due date, new cards limited by newPerDay.
 * Total review cards limited by reviewsPerDay.
 *
 * Daily limits are tracked across sessions using the review log:
 * if the user has already reviewed N cards today, the remaining
 * allowance is max(0, limit - N).
 */
export function buildRetrievalQueue(
    cards: SRSCard[],
    settings: SRSSettings,
    todayReviewedCount?: { review: number; new: number },
): string[] {
    const dueCards = cards.filter((c) => isCardDueInline(c, settings.dayStartHour));

    // Cross-session daily limit enforcement
    const reviewedToday = todayReviewedCount ?? { review: 0, new: 0 };
    const remainingReviewSlots = Math.max(0, settings.reviewsPerDay - reviewedToday.review);
    const remainingNewSlots = Math.max(0, settings.newPerDay - reviewedToday.new);

    // Sort: new cards last, then by due date
    const reviewCards = dueCards
        .filter((c) => c.state !== 'new')
        .sort((a, b) => a.nextReview - b.nextReview)
        .slice(0, remainingReviewSlots);
    const newCards = dueCards
        .filter((c) => c.state === 'new')
        .slice(0, remainingNewSlots);
    return [...reviewCards.map((c) => c.id), ...newCards.map((c) => c.id)];
}

/**
 * Check if a card is due for review (inlined from former scheduler.ts).
 * A card is due if its nextReview timestamp is in the past, or if it's new.
 * Learning/Relearning cards already reviewed today won't reappear.
 */
function isCardDueInline(card: SRSCard, dayStartHour: number): boolean {
    if (card.state === 'new') return true;
    const now = Date.now();
    if (card.nextReview > now) return false;
    if ((card.state === 'learning' || card.state === 'relearning') && card.lastReview > 0) {
        const d = new Date(now);
        d.setHours(dayStartHour, 0, 0, 0);
        if (d.getTime() > now) d.setDate(d.getDate() - 1);
        if (card.lastReview >= d.getTime()) return false;
    }
    return true;
}
