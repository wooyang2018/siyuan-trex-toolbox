/**
 * Cloze card creator
 * Extracts cloze deletions from block content and creates cloze cards.
 * Supports multiple cloze markers (==, @@, etc.) and multi-cloze per block.
 */
import { CardType } from '@/types/srs';
import type { CardCreationContext, ClozeCreationOptions, CardCreationResult } from '../types';
import { createCard } from '../../core/card-repository';
import { stripIAL } from './utils';

const DEFAULT_MARKERS = ['==', '@@'];

export function extractClozes(
    text: string,
    markers: string[] = DEFAULT_MARKERS,
): Array<{ front: string; back: string; clozeIndex: number }> {
    const cleaned = stripIAL(text);
    const results: Array<{ front: string; back: string; clozeIndex: number }> = [];
    for (const marker of markers) {
        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`${escaped}(.+?)${escaped}`, 'g');
        let match: RegExpExecArray | null;
        let clozeIndex = 0;
        while ((match = pattern.exec(cleaned)) !== null) {
            const clozeText = match[1];
            // String.replace with global regex resets lastIndex — save & restore to avoid infinite loop
            const savedLastIndex = pattern.lastIndex;
            const front = cleaned.replace(pattern, '____');
            pattern.lastIndex = savedLastIndex;
            results.push({ front: front.trim(), back: clozeText.trim(), clozeIndex });
            clozeIndex++;
        }
    }
    return results;
}

export async function createClozeCards(
    ctx: CardCreationContext,
    options?: ClozeCreationOptions,
): Promise<CardCreationResult> {
    const markers = options?.markers ?? DEFAULT_MARKERS;
    const separate = options?.separate ?? true;
    const content = ctx.kramdown || ctx.selection || '';
    const clozes = extractClozes(content, markers);

    if (clozes.length === 0) {
        return { success: false, cardIds: [], message: '未找到挖空内容' };
    }

    const cardIds: string[] = [];
    if (separate) {
        for (const cloze of clozes) {
            const card = await createCard({
                blockId: ctx.blockId,
                rootId: ctx.rootId,
                type: CardType.Cloze,
                deckId: ctx.deckId,
                front: cloze.front,
                back: cloze.back,
                clozeIndex: cloze.clozeIndex,
            });
            cardIds.push(card.id);
        }
    } else {
        const card = await createCard({
            blockId: ctx.blockId,
            rootId: ctx.rootId,
            type: CardType.Cloze,
            deckId: ctx.deckId,
            front: clozes[0].front,
            back: clozes.map((c) => c.back).join(' / '),
            clozeIndex: 0,
        });
        cardIds.push(card.id);
    }
    return { success: true, cardIds };
}
