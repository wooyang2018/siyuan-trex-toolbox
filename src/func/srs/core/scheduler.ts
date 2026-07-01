/**
 * SRS Core — FSRS v6 Scheduler
 * Wraps the ts-fsrs library to provide a clean scheduling interface.
 * Handles card state transitions, interval prediction, and review logging.
 */
import {
    fsrs,
    Rating as FSRSRating,
    State as FSRSState,
    generatorParameters,
    type Card as FSRSCard,
    type RecordLogItem,
} from 'ts-fsrs';
import type { SRSCard, SRSSettings, Rating, ReviewLogEntry } from '@/types/srs';

// ===== Scheduler instance management =====
let schedulerInstance: ReturnType<typeof fsrs> | null = null;
let currentParams: number[] | null = null;

/**
 * Get or create the FSRS scheduler with the given parameters.
 * enable_fuzz and enable_short_term are set at parameter level.
 */
function getScheduler(params: number[], settings?: Partial<SRSSettings>): ReturnType<typeof fsrs> {
    if (schedulerInstance && currentParams === params) {
        return schedulerInstance;
    }
    const f = fsrs(generatorParameters({
        w: params,
        enable_fuzz: settings?.enableFuzz ?? false,
        enable_short_term: settings?.enableShortTerm ?? true,
        request_retention: settings?.requestRetention ?? 0.9,
        maximum_interval: settings?.maximumInterval ?? 36500,
    }));
    schedulerInstance = f;
    currentParams = params;
    return f;
}

/**
 * Map our SRSCard to ts-fsrs Card format.
 */
function toFSRSCard(card: SRSCard): FSRSCard {
    const now = new Date();
    const stateMap: Record<string, FSRSState> = {
        'new': FSRSState.New,
        'learning': FSRSState.Learning,
        'review': FSRSState.Review,
        'relearning': FSRSState.Relearning,
    };
    return {
        due: card.nextReview ? new Date(card.nextReview) : now,
        stability: card.stability || 0,
        difficulty: card.difficulty || 0,
        elapsed_days: card.lastReview
            ? Math.max(0, Math.floor((now.getTime() - card.lastReview) / 86400000))
            : 0,
        scheduled_days: card.nextReview
            ? Math.max(0, Math.floor((card.nextReview - (card.lastReview || now.getTime())) / 86400000))
            : 0,
        reps: card.reps || 0,
        lapses: card.lapses || 0,
        state: stateMap[card.state] ?? FSRSState.New,
        last_review: card.lastReview ? new Date(card.lastReview) : undefined,
    } as FSRSCard;
}

/**
 * Map ts-fsrs RecordLogItem back to our SRSCard fields.
 */
function fromFSRSLog(logItem: RecordLogItem): Partial<SRSCard> {
    const stateMap: Record<number, SRSCard['state']> = {
        [FSRSState.New]: 'new',
        [FSRSState.Learning]: 'learning',
        [FSRSState.Review]: 'review',
        [FSRSState.Relearning]: 'relearning',
    };
    const logTime = logItem.log.review instanceof Date
        ? logItem.log.review.getTime()
        : new Date(logItem.log.review as any).getTime();
    return {
        stability: logItem.card.stability,
        difficulty: logItem.card.difficulty,
        reps: logItem.card.reps,
        lapses: logItem.card.lapses,
        state: stateMap[logItem.card.state] ?? 'new',
        nextReview: logItem.card.due instanceof Date
            ? logItem.card.due.getTime()
            : new Date(logItem.card.due as any).getTime(),
        lastReview: logTime,
    };
}

// ===== Public API =====

export interface ScheduleResult {
    card: SRSCard;
    log: ReviewLogEntry;
}

/**
 * Review a card with the given rating. Returns the updated card and a review log entry.
 */
export function reviewCard(
    card: SRSCard,
    rating: Rating,
    settings: SRSSettings,
): ScheduleResult {
    const scheduler = getScheduler(settings.fsrsParams, settings);
    const fsrsCard = toFSRSCard(card);
    const now = new Date();

    const fsrsRating = rating as FSRSRating;
    const result = scheduler.repeat(fsrsCard, now);
    const logItem = result[fsrsRating] as RecordLogItem;
    const updatedFields = fromFSRSLog(logItem);

    const updatedCard: SRSCard = {
        ...card,
        ...updatedFields,
        updatedAt: now.getTime(),
    };

    const log: ReviewLogEntry = {
        cardId: card.id,
        rating,
        state: updatedCard.state,
        stability: updatedCard.stability,
        difficulty: updatedCard.difficulty,
        timestamp: now.getTime(),
        elapsedDays: fsrsCard.elapsed_days,
        scheduledDays: logItem.card.scheduled_days,
    };

    return { card: updatedCard, log };
}

/**
 * Preview intervals for all 4 ratings (Again, Hard, Good, Easy).
 * Returns an array of 4 numbers representing days.
 */
export function previewIntervals(card: SRSCard, settings: SRSSettings): number[] {
    const scheduler = getScheduler(settings.fsrsParams, settings);
    const fsrsCard = toFSRSCard(card);
    const now = new Date();

    const result = scheduler.repeat(fsrsCard, now);

    return ([1, 2, 3, 4] as FSRSRating[]).map((r) => {
        const logItem = result[r] as RecordLogItem;
        const due = logItem.card.due instanceof Date
            ? logItem.card.due.getTime()
            : new Date(logItem.card.due as any).getTime();
        const intervalMs = due - now.getTime();
        return Math.max(0, Math.round(intervalMs / 86400000));
    });
}

/**
 * Create a new card with default FSRS state.
 */
export function createNewCard(partial: Partial<SRSCard>): SRSCard {
    const now = Date.now();
    return {
        id: partial.id || '',
        blockId: partial.blockId || '',
        rootId: partial.rootId || '',
        type: partial.type || ('cloze' as any),
        deckId: partial.deckId || 'default',
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
        ...partial,
    };
}

/**
 * Check if a card is due for review.
 * A card is due if its nextReview timestamp is in the past, or if it's new.
 * Note: dayStartHour is used for daily limit calculations, not individual due checks.
 */
export function isCardDue(card: SRSCard, _dayStartHour: number): boolean {
    return card.nextReview <= Date.now() || card.state === 'new';
}

/**
 * Get all due cards from a list.
 */
export function getDueCards(cards: SRSCard[], dayStartHour: number): SRSCard[] {
    return cards.filter((c) => isCardDue(c, dayStartHour));
}

/**
 * Get retrievability (probability of recall) at the given time.
 */
export function getRetrievability(card: SRSCard): number {
    if (card.state === 'new' || card.stability === 0) return 0;
    const now = Date.now();
    const elapsed = card.lastReview
        ? Math.max(0, (now - card.lastReview) / 86400000)
        : 0;
    return Math.exp(-elapsed / card.stability);
}

/**
 * Format interval for display (e.g., "<1m", "10m", "5d", "2mo").
 */
export function formatInterval(days: number): string {
    if (days < 1 / 1440) return '<1m';
    if (days < 1 / 24) return `${Math.round(days * 1440)}m`;
    if (days < 1) return `${Math.round(days * 24)}h`;
    if (days < 30) return `${Math.round(days)}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${(days / 365).toFixed(1)}y`;
}
