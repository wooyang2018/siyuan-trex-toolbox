import type { Rating, SRSCard, QueueType, CardState } from '@/types/srs';

export type ReviewMode = 'tab' | 'dialog' | 'split';

export interface UndoSnapshot {
    cardId: string;
    rating: Rating;
    nextReview: number;
    state: CardState;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
}

export interface ReviewSession {
    queueType: QueueType;
    mode: ReviewMode;
    cardIds: string[];
    currentIndex: number;
    revealed: boolean;
    startTime: number;
    reviewedCount: number;
    correctCount: number;
    skippedCount: number;
    ratingCounts: Record<Rating, number>;
    lastUndo: UndoSnapshot | null;
}

export interface ReviewStats {
    total: number;
    reviewed: number;
    correct: number;
    skipped: number;
    remaining: number;
    elapsedTime: number;
    progress: number;
    currentIndex: number;
}

export interface ReviewSummaryData extends ReviewStats {
    ratingCounts: Record<Rating, number>;
    accuracy: number;
}

export interface CardRenderData {
    card: SRSCard;
    front: string;
    back: string;
    isRevealed: boolean;
    intervals: number[];
}

export interface PlanningOptions {
    days: number;
    onlyOutstanding: boolean;
}
