/**
 * Formula card creator
 * Creates cards from math formula blocks.
 */
import { CardType } from '@/types/srs';
import type { CardCreationContext, CardCreationResult } from '../types';
import { createCard } from '../../core/card-repository';
import { stripIAL } from './utils';

export function extractFormulas(text: string): string[] {
    const cleaned = stripIAL(text);
    const results: string[] = [];
    const blockPattern = /\$\$(.+?)\$\$/gs;
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(cleaned)) !== null) {
        const formula = match[1].trim();
        if (formula) results.push(formula);
    }
    if (results.length === 0) {
        // 行内公式：要求 $ 后首字符和 $ 前尾字符都是非空白，且内容不含 $ 字符
        // 避免两个独立的 $ 被误匹配为公式（如 "$100 和 $200"）
        // [^$] 确保不跨越 $ 边界，\S 确保首尾非空白
        const inlinePattern = /(?<!\$)\$(?!\$)(\S(?:[^$]*?\S)?)\$(?!\$)/g;
        while ((match = inlinePattern.exec(cleaned)) !== null) {
            const formula = match[1].trim();
            if (formula) results.push(formula);
        }
    }
    return results;
}

export async function createFormulaCards(ctx: CardCreationContext): Promise<CardCreationResult> {
    const content = ctx.kramdown || ctx.selection || '';
    const formulas = extractFormulas(content);
    if (formulas.length === 0) {
        return { success: false, cardIds: [], message: '未找到公式内容' };
    }
    const cardIds: string[] = [];
    for (const formula of formulas) {
        const card = await createCard({
            blockId: ctx.blockId,
            rootId: ctx.rootId,
            type: CardType.Formula,
            deckId: ctx.deckId,
            front: '写出以下公式：',
            back: `$$${formula}$$`,
        });
        cardIds.push(card.id);
    }
    return { success: true, cardIds };
}
