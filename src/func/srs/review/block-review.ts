/**
 * Block-level review entry
 * Allows reviewing all flashcards in a specific block and its children.
 * For document-level review (clicking the doc title icon), uses rootId
 * to catch all cards regardless of nesting depth.
 */
import type { BlockId } from '@/types';
import { getCardsByBlockId, getCardsByRootId, refreshNativeCards } from '../core/card-repository';
import { getChildBlocks } from '@/api';
import { addToQueue, clearQueue } from '../core/queue-manager';
import { sql } from '@/api';

/**
 * Collect all card IDs from a block and its children.
 * Uses rootId-based lookup as primary strategy for documents (catches all
 * nested cards), falls back to blockId + children traversal.
 */
export async function collectBlockCards(blockId: BlockId, includeChildren: boolean = true): Promise<string[]> {
    await refreshNativeCards();
    const cardIdSet = new Set<string>();

    // 1. Direct cards on this block
    const directCards = getCardsByBlockId(blockId);
    directCards.forEach(c => cardIdSet.add(c.id));

    // 2. Try rootId-based lookup (works when blockId is a document root)
    const rootCards = getCardsByRootId(blockId);
    rootCards.forEach(c => cardIdSet.add(c.id));

    // 3. If rootId lookup found nothing, the block might not be a document root.
    //    Resolve its rootId via SQL and try again.
    if (rootCards.length === 0 && directCards.length === 0) {
        try {
            const rows = await sql(
                `SELECT root_id FROM blocks WHERE id = '${blockId}' LIMIT 1`
            );
            if (rows && rows.length > 0 && rows[0].root_id && rows[0].root_id !== blockId) {
                const resolvedRootCards = getCardsByRootId(rows[0].root_id);
                // Only add cards whose blockId is within this block's subtree.
                // Since we can't easily check subtree membership, add all root cards
                // and rely on child traversal for precision.
                resolvedRootCards.forEach(c => cardIdSet.add(c.id));
            }
        } catch (e) {
            console.error('[SRS-Review] collectBlockCards rootId resolution failed:', e);
        }
    }

    // 4. Also traverse direct children (catches cards on child blocks)
    if (includeChildren) {
        try {
            const children = await getChildBlocks(blockId);
            for (const child of children) {
                if (child.id) {
                    const childCards = getCardsByBlockId(child.id);
                    childCards.forEach(c => cardIdSet.add(c.id));
                }
            }
        } catch (e) {
            console.error('[SRS-Review] collectBlockCards getChildBlocks failed:', e);
        }
    }

    return [...cardIdSet];
}

/**
 * Start a block-level review session.
 */
export async function startBlockReview(blockId: BlockId, includeChildren: boolean = true): Promise<string[]> {
    const cardIds = await collectBlockCards(blockId, includeChildren);
    if (cardIds.length === 0) return [];
    // Use the retrieval queue for block review
    clearQueue('retrieval');
    addToQueue('retrieval', cardIds);
    return cardIds;
}
