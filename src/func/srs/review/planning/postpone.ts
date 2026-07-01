/**
 * Postpone - delay cards by N days
 */
import { getAllCards, updateCard } from '../../core/card-repository';

export async function postponeCards(cardIds: string[], days: number, onlyOutstanding: boolean = true): Promise<number> {
    const now = Date.now();
    const ms = days * 86400000;
    let count = 0;
    for (const id of cardIds) {
        const card = getAllCards().find(c => c.id === id);
        if (!card) continue;
        if (onlyOutstanding && card.nextReview > now) continue;
        await updateCard(id, { nextReview: card.nextReview + ms });
        count++;
    }
    return count;
}
