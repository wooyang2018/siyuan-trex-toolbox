import type { Rating, QueueType } from '@/types/srs';
import type { ReviewSession, ReviewStats, CardRenderData, ReviewSummaryData, UndoSnapshot } from './types';
import { getCard, reviewCardById, undoLastReview, getAllCards, refreshNativeCards } from '../core/card-repository';
import { getSettings } from '../core/module';
import { previewIntervals, formatInterval } from '../core/scheduler';
import { buildRetrievalQueue, addToQueue, persistQueues } from '../core/queue-manager';

let currentSession: ReviewSession | null = null;
let lastSummary: ReviewSummaryData | null = null;

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
    if (!currentSession) return;
    lastSummary = createSummary(currentSession);
    currentSession = null;
}

export async function startReview(queueType: QueueType, mode: 'tab' | 'dialog' | 'split' = 'dialog'): Promise<ReviewSession | null> {
    await refreshNativeCards();
    const settings = getSettings();
    const allCards = getAllCards();
    const cardIds = buildRetrievalQueue(allCards, settings);
    if (cardIds.length === 0) return null;
    addToQueue(queueType, cardIds);
    await persistQueues();
    currentSession = {
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
    lastSummary = null;
    preloadNextCard();
    return currentSession;
}

export function getCurrentCardData(): CardRenderData | null {
    if (!currentSession) return null;
    const cardId = currentSession.cardIds[currentSession.currentIndex];
    if (!cardId) return null;
    const card = getCard(cardId);
    if (!card) return null;
    const intervals = previewIntervals(card, getSettings());
    return { card, front: card.front, back: card.back, isRevealed: currentSession.revealed, intervals };
}

export function revealCard(): void {
    if (currentSession) currentSession.revealed = true;
}

export async function rateCard(rating: Rating): Promise<CardRenderData | null> {
    if (!currentSession) return null;
    const cardId = currentSession.cardIds[currentSession.currentIndex];
    if (!cardId) return null;

    const card = getCard(cardId);
    if (card) {
        currentSession.lastUndo = {
            cardId,
            rating,
            nextReview: card.nextReview,
            state: card.state,
            stability: card.stability,
            difficulty: card.difficulty,
            reps: card.reps,
            lapses: card.lapses,
        };
    }

    const result = await reviewCardById(cardId, rating, getSettings());
    if (!result) { currentSession.lastUndo = null; return null; }
    currentSession.reviewedCount++;
    currentSession.ratingCounts[rating]++;
    if (rating >= 3) currentSession.correctCount++;
    currentSession.currentIndex++;
    currentSession.revealed = false;
    if (currentSession.currentIndex >= currentSession.cardIds.length) { finishSession(); return null; }

    preloadNextCard();
    return getCurrentCardData();
}

export async function undoLastRating(): Promise<CardRenderData | null> {
    if (!currentSession || !currentSession.lastUndo) return null;
    const snapshot: UndoSnapshot = currentSession.lastUndo;
    const success = await undoLastReview(snapshot);
    if (!success) return null;

    currentSession.currentIndex = Math.max(0, currentSession.currentIndex - 1);
    currentSession.reviewedCount = Math.max(0, currentSession.reviewedCount - 1);
    currentSession.ratingCounts[snapshot.rating] = Math.max(0, currentSession.ratingCounts[snapshot.rating] - 1);
    if (snapshot.rating >= 3) currentSession.correctCount = Math.max(0, currentSession.correctCount - 1);
    currentSession.revealed = false;
    currentSession.lastUndo = null;

    return getCurrentCardData();
}

export function canUndo(): boolean {
    return !!currentSession?.lastUndo;
}

export function skipCard(): CardRenderData | null {
    if (!currentSession) return null;
    currentSession.skippedCount++;
    currentSession.currentIndex++;
    currentSession.revealed = false;
    if (currentSession.currentIndex >= currentSession.cardIds.length) { finishSession(); return null; }
    return getCurrentCardData();
}

export function getReviewStats(): ReviewStats | null {
    if (!currentSession) return null;
    const total = currentSession.cardIds.length;
    return {
        total,
        reviewed: currentSession.reviewedCount,
        correct: currentSession.correctCount,
        skipped: currentSession.skippedCount,
        remaining: total - currentSession.currentIndex,
        elapsedTime: Date.now() - currentSession.startTime,
        progress: total ? currentSession.currentIndex / total : 0,
        currentIndex: currentSession.currentIndex,
    };
}

export function getLastSummary(): ReviewSummaryData | null { return lastSummary; }
export function endReview(): void { if (currentSession) lastSummary = createSummary(currentSession); currentSession = null; }
export function getSession(): ReviewSession | null { return currentSession; }

function preloadNextCard(): void {
    // reserved for future card preloading
}

export function getFormattedIntervals(intervals: number[]): string[] {
    return intervals.map(formatInterval);
}
