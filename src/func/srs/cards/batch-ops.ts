/**
 * Batch operations for card creation and deletion
 */
import type { BatchCreateOptions, CardCreationResult } from './types';
import { CardType } from '@/types/srs';
import { createCard, deleteCardsByBlockId, getCardsByRootId, deleteCards, refreshNativeCards } from '../core/card-repository';
import { getBlockKramdown, getChildBlocks } from '@/api';
import { extractClozes } from './creators/cloze';
import { parseOrderedList } from './creators/ordered-list';
import { parseUnorderedList } from './creators/unordered-list';

export async function batchCreateCards(options: BatchCreateOptions): Promise<CardCreationResult> {
    const { blockIds, cardType, deckId, includeChildren } = options;
    const allBlockIds = [...blockIds];
    if (includeChildren) {
        for (const blockId of blockIds) {
            try {
                const children = await getChildBlocks(blockId);
                for (const child of children) {
                    if (child.id && !allBlockIds.includes(child.id)) allBlockIds.push(child.id);
                }
            } catch (e) { console.error('[SRS-Cards] getChildBlocks failed:', e); }
        }
    }
    const cardIds: string[] = [];
    let failCount = 0;
    for (const blockId of allBlockIds) {
        try {
            const result = await getBlockKramdown(blockId);
            const kramdown = result?.kramdown || '';
            if (!kramdown.trim()) continue;
            if (cardType === CardType.Cloze) {
                const clozes = extractClozes(kramdown);
                for (const cloze of clozes) {
                    const card = await createCard({ blockId, rootId: '', type: CardType.Cloze, deckId, front: cloze.front, back: cloze.back, clozeIndex: cloze.clozeIndex });
                    cardIds.push(card.id);
                }
            } else if (cardType === CardType.OrderedList) {
                const items = parseOrderedList(kramdown);
                if (items.length > 0) {
                    const card = await createCard({ blockId, rootId: '', type: CardType.OrderedList, deckId, front: '回忆以下列表：', back: items.join('\n'), listHints: items });
                    cardIds.push(card.id);
                }
            } else if (cardType === CardType.UnorderedList) {
                const items = parseUnorderedList(kramdown);
                if (items.length > 0) {
                    const card = await createCard({ blockId, rootId: '', type: CardType.UnorderedList, deckId, front: '回忆以下列表：', back: items.join('\n'), listHints: items });
                    cardIds.push(card.id);
                }
            } else {
                const card = await createCard({ blockId, rootId: '', type: cardType, deckId, front: '回忆以下内容：', back: kramdown.replace(/\n/g, ' ').trim() });
                cardIds.push(card.id);
            }
        } catch (e) { console.error('[SRS-Cards] Batch create failed:', e); failCount++; }
    }
    return { success: cardIds.length > 0, cardIds, message: cardIds.length > 0 ? `成功创建 ${cardIds.length} 张卡片${failCount > 0 ? `, ${failCount} 个块失败` : ''}` : '未能创建任何卡片' };
}

export async function batchCancelCards(blockIds: string[]): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;
    for (const blockId of blockIds) {
        try { deleted += await deleteCardsByBlockId(blockId); }
        catch (e) { console.error('[SRS-Cards] Batch cancel failed:', e); failed++; }
    }
    return { deleted, failed };
}

export async function cancelCardsInDocument(rootId: string): Promise<{ deleted: number }> {
    await refreshNativeCards();
    const docCards = getCardsByRootId(rootId);
    const count = await deleteCards(docCards.map(c => c.id));
    return { deleted: count };
}
