/**
 * Concept definition card creator
 * Creates forward/reverse/bidirectional cards from concept-definition pairs.
 */
import { CardType } from '@/types/srs';
import type { CDFSemantic } from '@/types/srs';
import type { CardCreationContext, CardCreationResult, ConceptDefinitionOptions } from '../types';
import { createCard } from '../../core/card-repository';

export async function createConceptDefinitionCards(
    ctx: CardCreationContext,
    options: ConceptDefinitionOptions,
): Promise<CardCreationResult> {
    const { concept, definition, semantic } = options;
    const cardIds: string[] = [];

    if (semantic === 'forward' || semantic === 'bidirectional') {
        const card = await createCard({
            blockId: ctx.blockId,
            rootId: ctx.rootId,
            type: CardType.ConceptDefinition,
            deckId: ctx.deckId,
            front: `${concept}的定义？`,
            back: definition,
            cdfMode: 'concept',
            cdfSemantic: 'forward' as CDFSemantic,
        });
        cardIds.push(card.id);
    }

    if (semantic === 'reverse' || semantic === 'bidirectional') {
        const card = await createCard({
            blockId: ctx.blockId,
            rootId: ctx.rootId,
            type: CardType.ConceptDefinition,
            deckId: ctx.deckId,
            front: `以下是哪个概念的定义？\n${definition}`,
            back: concept,
            cdfMode: 'concept',
            cdfSemantic: 'reverse' as CDFSemantic,
        });
        cardIds.push(card.id);
    }

    return { success: true, cardIds };
}
