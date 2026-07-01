/**
 * Ordered list template card creator
 * Creates cards from ordered list blocks with progressive hints during review.
 * Front shows the list topic, back shows the list items one by one.
 */
import { CardType } from '@/types/srs';
import type { CardCreationContext, CardCreationResult, ListTemplateOptions } from '../types';
import { createCard } from '../../core/card-repository';
import { stripIAL } from './utils';

/**
 * Parse an ordered list from block kramdown.
 * Returns the list items as an array of strings.
 */
export function parseOrderedList(kramdown: string): string[] {
    const cleaned = stripIAL(kramdown);
    const items: string[] = [];
    const lines = cleaned.split('\n');
    // Match ordered list items: "1. item", "2. item", etc.
    const listPattern = /^\d+\.\s+(.+)/;
    for (const line of lines) {
        const match = line.match(listPattern);
        if (match) {
            // Strip markdown formatting
            const text = match[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
            items.push(text);
        }
    }
    return items;
}

export async function createOrderedListCards(
    ctx: CardCreationContext,
    options?: ListTemplateOptions,
): Promise<CardCreationResult> {
    const content = ctx.kramdown || '';
    const items = parseOrderedList(content);

    if (items.length === 0) {
        return { success: false, cardIds: [], message: '未找到有序列表内容' };
    }

    // Create a single card with progressive hints
    const hints = options?.hints || items;
    const card = await createCard({
        blockId: ctx.blockId,
        rootId: ctx.rootId,
        type: CardType.OrderedList,
        deckId: ctx.deckId,
        front: '回忆以下列表的所有项：',
        back: items.join('\n'),
        listHints: hints,
    });

    return { success: true, cardIds: [card.id] };
}
