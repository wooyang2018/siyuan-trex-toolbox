/**
 * Advance - bring cards forward by N days
 */
import { getAllCards, updateCard } from '../../core/card-repository';

export async function advanceCards(cardIds: string[], days: number, onlyOutstanding: boolean = true): Promise<number> {
    const now = Date.now();
    const ms = days * 86400000;
    let count = 0;
    for (const id of cardIds) {
        const card = getAllCards().find(c => c.id === id);
        if (!card) continue;
        if (onlyOutstanding && card.nextReview <= now) continue;
        const newDate = Math.max(now, card.nextReview - ms);
        await updateCard(id, { nextReview: newDate });
        count++;
    }
    return count;
}
