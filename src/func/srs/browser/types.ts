import type { CardType, CardState } from '@/types/srs';
import type { DeckHealthSummary } from '../shared/srs-metrics';

export type BrowserTaskFilter = 'all' | 'due' | 'new' | 'learning' | 'lapseRisk';

export interface BrowserFilter {
    cardType?: CardType;
    deckId?: string;
    dueOnly?: boolean;
    tag?: string;
    state?: CardState;
    searchText?: string;
    sqlQuery?: string;
    task?: BrowserTaskFilter;
}

export type SortField = 'nextReview' | 'type' | 'deckId' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'state' | 'front';
export type SortOrder = 'asc' | 'desc';

export interface DeckInfo {
    id: string;
    name: string;
    type: 'native';
    cardCount: number;
    dueCount?: number;
    riskCount?: number;
    healthScore?: number;
}

export interface CardStats {
    total: number;
    due: number;
    new: number;
    learning: number;
    review: number;
    relearning: number;
    lapseRisk: number;
    health: DeckHealthSummary;
    byType: Record<string, number>;
    byDeck: Record<string, number>;
    avgStability: number;
    avgDifficulty: number;
    totalReps: number;
}
