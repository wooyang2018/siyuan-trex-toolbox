import type { SRSCard } from '@/types/srs';

export interface DeckHealthSummary {
    total: number;
    due: number;
    newCount: number;
    learningCount: number;
    reviewCount: number;
    relearningCount: number;
    lapseRiskCount: number;
    healthScore: number;
}

export function isCardDue(card: SRSCard): boolean {
    return card.state === 'new' || card.nextReview <= Date.now();
}

export function getDeckHealth(cards: SRSCard[]): DeckHealthSummary {
    const total = cards.length;
    const due = cards.filter(isCardDue).length;
    const lapseRiskCount = cards.filter(card => card.lapses >= 2 || card.state === 'relearning').length;
    const newCount = cards.filter(card => card.state === 'new').length;
    const learningCount = cards.filter(card => card.state === 'learning').length;
    const reviewCount = cards.filter(card => card.state === 'review').length;
    const relearningCount = cards.filter(card => card.state === 'relearning').length;
    const pressure = total ? due / total : 0;
    const risk = total ? lapseRiskCount / total : 0;
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - pressure * 45 - risk * 45)));
    return { total, due, newCount, learningCount, reviewCount, relearningCount, lapseRiskCount, healthScore };
}

export function getHealthTone(score: number): 'success' | 'warning' | 'danger' | 'info' {
    if (score >= 78) return 'success';
    if (score >= 52) return 'warning';
    if (score > 0) return 'danger';
    return 'info';
}
