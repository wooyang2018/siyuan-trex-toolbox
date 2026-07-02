import type { SRSCard } from '@/types/srs';
import { CardType } from '@/types/srs';
import { parseFlashcard, type ParsedFlashcard } from '../viewer/card-parser';

const BROWSER_CARD_TYPES = new Set<string>([
    CardType.Cloze,
    CardType.QA,
    CardType.SingleChoice,
    CardType.MultiChoice,
]);

export function toBrowserCardType(type: string): CardType {
    return BROWSER_CARD_TYPES.has(type) ? type as CardType : CardType.QA;
}

export function getCardDisplay(card: SRSCard): ParsedFlashcard {
    const type = toBrowserCardType(card.type);
    return parseFlashcard(card.front || card.back || '', type);
}

export function getCardPreview(card: SRSCard): string {
    const display = getCardDisplay(card);
    return formatDisplayText(display.question || display.answer || stripKramdownArtifacts(card.front || card.back || ''));
}

export function stripKramdownArtifacts(text: string): string {
    return text
        .replace(/\{\{\{row\s*/g, '')
        .replace(/\}\}\}/g, '')
        .replace(/\{: [^}]*\}/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function formatDisplayText(text: string): string {
    return stripKramdownArtifacts(text)
        .replace(/==([^=]*?)==/g, '$1')
        .replace(/={2,}/g, '')
        .trim();
}

export function formatClozeQuestion(text: string): string {
    return stripKramdownArtifacts(text)
        .replace(/==([^=]*?)==/g, '____')
        .replace(/={2,}/g, '____')
        .trim();
}
