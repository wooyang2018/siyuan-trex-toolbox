/**
 * Card content search and type filtering for ViewerView.
 * Migrated from browser-controller.ts getFilteredCards() logic.
 */
import type { SRSCard } from '@/types/srs';

/**
 * Filter cards by search text (front/back/tags substring match) and card type.
 * Both filters are optional — empty/undefined means no filtering on that dimension.
 */
export function filterCardsBySearchAndType(
    cards: SRSCard[],
    searchText?: string,
    cardType?: string,
): SRSCard[] {
    let result = cards;

    if (searchText && searchText.trim()) {
        const q = searchText.toLowerCase();
        result = result.filter(c =>
            c.front.toLowerCase().includes(q) ||
            c.back.toLowerCase().includes(q) ||
            c.tags.some(t => t.toLowerCase().includes(q))
        );
    }

    if (cardType) {
        result = result.filter(c => c.type === cardType);
    }

    return result;
}
