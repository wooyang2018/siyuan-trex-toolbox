/**
 * Spread - distribute cards over a period
 */
import { updateCard } from '../../core/card-repository';

export async function spreadCards(cardIds: string[], collectingPeriodDays: number, intervalDays: number): Promise<number> {
    if (cardIds.length === 0) return 0;
    const now = Date.now();
    const periodMs = collectingPeriodDays * 86400000;
    const intervalMs = intervalDays * 86400000;
    const startDate = now + periodMs;
    let count = 0;
    for (let i = 0; i < cardIds.length; i++) {
        await updateCard(cardIds[i], { nextReview: startDate + i * intervalMs });
        count++;
    }
    return count;
}
