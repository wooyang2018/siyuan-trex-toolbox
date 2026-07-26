import { createStore, produce } from 'solid-js/store';
import type { Rating, QueueType } from '@/types/srs';
import type { ReviewSession, ReviewStats, CardRenderData, ReviewSummaryData, UndoSnapshot } from './types';
import { getCard, reviewCardById, undoLastReview, getAllCards, refreshNativeCards, getReviewLog } from '../core/card-repository';
import { getSettings } from '../core/module';
import { buildRetrievalQueue, addToQueue, persistQueues } from '../core/queue-manager';
import { getCardDisplay } from '../shared/card-display';

interface ReviewStoreState {
    session: ReviewSession | null;
    summary: ReviewSummaryData | null;
}

const [store, setStore] = createStore<ReviewStoreState>({ session: null, summary: null });

function createSummary(session: ReviewSession): ReviewSummaryData {
    const elapsedTime = Date.now() - session.startTime;
    const accuracy = session.reviewedCount ? session.correctCount / session.reviewedCount : 0;
    return {
        total: session.cardIds.length,
        reviewed: session.reviewedCount,
        correct: session.correctCount,
        skipped: session.skippedCount,
        remaining: Math.max(0, session.cardIds.length - session.currentIndex),
        elapsedTime,
        progress: session.cardIds.length ? Math.min(1, session.currentIndex / session.cardIds.length) : 0,
        ratingCounts: { ...session.ratingCounts },
        accuracy,
        currentIndex: session.currentIndex,
    };
}

function finishSession(): void {
    if (!store.session) return;
    setStore('summary', createSummary(store.session));
    setStore('session', null);
}

export async function startReview(queueType: QueueType, mode: 'tab' | 'dialog' | 'split' = 'dialog'): Promise<ReviewSession | null> {
    await refreshNativeCards();
    const settings = getSettings();
    const allCards = getAllCards();

    // Count cards already reviewed today (cross-session daily limit enforcement)
    const todayReviewed = countTodayReviewed();

    const cardIds = buildRetrievalQueue(allCards, settings, todayReviewed);
    if (cardIds.length === 0) return null;
    addToQueue(queueType, cardIds);
    await persistQueues();
    const session: ReviewSession = {
        queueType,
        mode,
        cardIds,
        currentIndex: 0,
        revealed: false,
        startTime: Date.now(),
        reviewedCount: 0,
        correctCount: 0,
        skippedCount: 0,
        ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
        lastUndo: null,
    };
    setStore({ session, summary: null });
    return session;
}

export function getCurrentCardData(): CardRenderData | null {
    const session = store.session;
    if (!session) return null;
    const cardId = session.cardIds[session.currentIndex];
    if (!cardId) return null;
    const card = getCard(cardId);
    if (!card) return null;
    return { card, display: getCardDisplay(card), isRevealed: session.revealed };
}

export function revealCard(): void {
    setStore(produce(s => { if (s.session) s.session.revealed = true; }));
}

export async function rateCard(rating: Rating, wasCorrect?: boolean): Promise<CardRenderData | null> {
    const session = store.session;
    if (!session) return null;
    const cardId = session.cardIds[session.currentIndex];
    if (!cardId) return null;

    // For choice questions, use actual answer correctness if provided;
    // otherwise fall back to rating >= 3
    const isCorrect = wasCorrect !== undefined ? wasCorrect : rating >= 3;

    const card = getCard(cardId);
    if (card) {
        setStore(produce(s => {
            if (!s.session) return;
            s.session.lastUndo = {
                cardId,
                rating,
                wasCorrect: isCorrect,
                nextReview: card.nextReview,
                state: card.state,
                reps: card.reps,
                lapses: card.lapses,
            };
        }));
    }

    const result = await reviewCardById(cardId, rating, getSettings());
    if (!result) { setStore(produce(s => { if (s.session) s.session.lastUndo = null; })); return null; }

    setStore(produce(s => {
        if (!s.session) return;
        s.session.reviewedCount++;
        s.session.ratingCounts[rating]++;
        if (isCorrect) s.session.correctCount++;
        s.session.currentIndex++;
        s.session.revealed = false;
    }));

    if (store.session!.currentIndex >= store.session!.cardIds.length) { finishSession(); return null; }

    return getCurrentCardData();
}

export async function undoLastRating(): Promise<CardRenderData | null> {
    const session = store.session;
    if (!session || !session.lastUndo) return null;
    const snapshot: UndoSnapshot = session.lastUndo;
    const success = await undoLastReview(snapshot);
    if (!success) return null;

    setStore(produce(s => {
        if (!s.session) return;
        s.session.currentIndex = Math.max(0, s.session.currentIndex - 1);
        s.session.reviewedCount = Math.max(0, s.session.reviewedCount - 1);
        s.session.ratingCounts[snapshot.rating] = Math.max(0, s.session.ratingCounts[snapshot.rating] - 1);
        if (snapshot.wasCorrect) s.session.correctCount = Math.max(0, s.session.correctCount - 1);
        s.session.revealed = false;
        s.session.lastUndo = null;
    }));

    return getCurrentCardData();
}

export function canUndo(): boolean {
    return !!store.session?.lastUndo;
}

export function skipCard(): CardRenderData | null {
    setStore(produce(s => {
        if (!s.session) return;
        s.session.skippedCount++;
        s.session.currentIndex++;
        s.session.revealed = false;
    }));
    if (store.session!.currentIndex >= store.session!.cardIds.length) { finishSession(); return null; }
    return getCurrentCardData();
}

export function getReviewStats(): ReviewStats | null {
    const session = store.session;
    if (!session) return null;
    const total = session.cardIds.length;
    return {
        total,
        reviewed: session.reviewedCount,
        correct: session.correctCount,
        skipped: session.skippedCount,
        remaining: total - session.currentIndex,
        elapsedTime: Date.now() - session.startTime,
        progress: total ? session.currentIndex / total : 0,
        currentIndex: session.currentIndex,
    };
}

export function getLastSummary(): ReviewSummaryData | null { return store.summary; }
export function endReview(): void {
    if (store.session) setStore('summary', createSummary(store.session));
    setStore('session', null);
}

/**
 * Count how many review/new cards have been reviewed today (across all sessions).
 * Uses the review log to enforce daily limits across sessions.
 */
function countTodayReviewed(): { review: number; new: number } {
    const settings = getSettings();
    const now = new Date();
    // Day boundary: if current hour < dayStartHour, the "day" started at yesterday's dayStartHour
    const dayStart = new Date(now);
    dayStart.setHours(settings.dayStartHour, 0, 0, 0);
    if (now.getHours() < settings.dayStartHour) {
        dayStart.setDate(dayStart.getDate() - 1);
    }
    const dayStartMs = dayStart.getTime();

    const logs = getReviewLog().filter(l => l.timestamp >= dayStartMs);
    const reviewLogs = logs.filter(l => l.state !== 'new');
    const newLogs = logs.filter(l => l.state === 'new');
    return { review: reviewLogs.length, new: newLogs.length };
}