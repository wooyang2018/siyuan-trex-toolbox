/**
 * Image occlusion card creator
 * Creates cards from images with occlusion regions.
 */
import { CardType } from '@/types/srs';
import type { OcclusionRegion } from '@/types/srs';
import type { CardCreationContext, CardCreationResult, ImageOcclusionOptions } from '../types';
import { createCard } from '../../core/card-repository';

export async function createImageOcclusionCard(
    ctx: CardCreationContext,
    options: ImageOcclusionOptions,
): Promise<CardCreationResult> {
    if (!options.imageSrc) {
        return { success: false, cardIds: [], message: '未找到图片' };
    }
    if (!options.occlusions || options.occlusions.length === 0) {
        return { success: false, cardIds: [], message: '未创建遮挡区域' };
    }
    const cardIds: string[] = [];
    for (const occlusion of options.occlusions) {
        const card = await createCard({
            blockId: ctx.blockId,
            rootId: ctx.rootId,
            type: CardType.ImageOcclusion,
            deckId: ctx.deckId,
            front: options.prompt || '回忆被遮挡的区域',
            back: occlusion.label || '',
            occlusions: [occlusion],
        });
        cardIds.push(card.id);
    }
    return { success: true, cardIds };
}

export function extractImageSrc(kramdown: string): string | null {
    const match = kramdown.match(/!\[.*?\]\((.+?)\)/);
    return match ? match[1] : null;
}

export function generateOcclusionId(): string {
    return 'occ-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

export function createOcclusion(
    x: number, y: number, width: number, height: number, label?: string,
): OcclusionRegion {
    return { id: generateOcclusionId(), x, y, width, height, label };
}
