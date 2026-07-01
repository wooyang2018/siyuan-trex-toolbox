/**
 * Unordered list template card creator
 * Creates cards from unordered list blocks with summary hints during review.
 */
import { CardType } from '@/types/srs';
import type { CardCreationContext, CardCreationResult, ListTemplateOptions } from '../types';
import { createCard } from '../../core/card-repository';
import { stripIAL } from './utils';

export function parseUnorderedList(kramdown: string): string[] {
    const cleaned = stripIAL(kramdown);
    const items: string[] = [];
    const lines = cleaned.split('\n');
    const listPattern = /^[-*+]\s+(.+)/;
    for (const line of lines) {
        const match = line.match(listPattern);
        if (match) {
            const text = match[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
            items.push(text);
        }
    }
    return items;
}

export async function createUnorderedListCards(
    ctx: CardCreationContext,
    options?: ListTemplateOptions,
): Promise<CardCreationResult> {
    const content = ctx.kramdown || '';
    const items = parseUnorderedList(content);

    if (items.length === 0) {
        return { success: false, cardIds: [], message: '未找到无序列表内容' };
    }

    const summary = options?.summary || `共 ${items.length} 项`;
    const card = await createCard({
        blockId: ctx.blockId,
        rootId: ctx.rootId,
        type: CardType.UnorderedList,
        deckId: ctx.deckId,
        front: `回忆以下列表（${summary}）：`,
        back: items.join('\n'),
        listHints: items,
    });

    return { success: true, cardIds: [card.id] };
}
