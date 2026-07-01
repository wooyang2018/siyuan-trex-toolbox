/**
 * CDF (Concept Descriptor Framework) card creator
 * RemNote-style template system for creating cards from concept/descriptor patterns.
 */
import { CardType } from '@/types/srs';
import type { CDFSemantic } from '@/types/srs';
import type { CardCreationContext, CardCreationResult, CDFCreationOptions } from '../types';
import { createCard } from '../../core/card-repository';
import { stripIAL } from './utils';

const DEFAULT_MARKER = '::';

export function parseCDF(
    text: string,
    marker: string = DEFAULT_MARKER,
): Array<{ concept: string; definition: string }> {
    const cleaned = stripIAL(text);
    const results: Array<{ concept: string; definition: string }> = [];
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^(.+?)${escaped}(.+)$`, 'gm');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cleaned)) !== null) {
        const concept = match[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
        const definition = match[2].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
        if (concept && definition) {
            results.push({ concept, definition });
        }
    }
    return results;
}

export async function createCDFCards(
    ctx: CardCreationContext,
    options: CDFCreationOptions,
): Promise<CardCreationResult> {
    const content = ctx.kramdown || ctx.selection || '';
    const marker = options.marker || DEFAULT_MARKER;
    const items = parseCDF(content, marker);
    if (items.length === 0) {
        return { success: false, cardIds: [], message: '未找到 CDF 内容' };
    }
    const semantic = options.semantic || 'forward';
    const cardIds: string[] = [];
    for (const item of items) {
        if (semantic === 'forward') {
            const card = await createCard({
                blockId: ctx.blockId, rootId: ctx.rootId, type: CardType.CDF,
                deckId: ctx.deckId, front: `${item.concept}是什么？`, back: item.definition,
                cdfMode: options.mode, cdfSemantic: 'forward' as CDFSemantic,
            });
            cardIds.push(card.id);
        } else if (semantic === 'reverse') {
            const card = await createCard({
                blockId: ctx.blockId, rootId: ctx.rootId, type: CardType.CDF,
                deckId: ctx.deckId, front: `以下描述对应什么？\n${item.definition}`, back: item.concept,
                cdfMode: options.mode, cdfSemantic: 'reverse' as CDFSemantic,
            });
            cardIds.push(card.id);
        } else {
            const c1 = await createCard({
                blockId: ctx.blockId, rootId: ctx.rootId, type: CardType.CDF,
                deckId: ctx.deckId, front: `${item.concept}是什么？`, back: item.definition,
                cdfMode: options.mode, cdfSemantic: 'forward' as CDFSemantic,
            });
            cardIds.push(c1.id);
            const c2 = await createCard({
                blockId: ctx.blockId, rootId: ctx.rootId, type: CardType.CDF,
                deckId: ctx.deckId, front: `以下描述对应什么？\n${item.definition}`, back: item.concept,
                cdfMode: options.mode, cdfSemantic: 'reverse' as CDFSemantic,
            });
            cardIds.push(c2.id);
        }
    }
    return { success: true, cardIds };
}
