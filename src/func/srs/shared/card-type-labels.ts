import { CardType } from '@/types/srs';

/** Unified card type labels — shared across Browser, Viewer, and Review */
export const CARD_TYPE_LABELS: Record<string, string> = {
    [CardType.Cloze]: '填空',
    [CardType.QA]: '问答',
    [CardType.Formula]: '公式',
    [CardType.ImageOcclusion]: '图片',
    [CardType.OrderedList]: '有序列表',
    [CardType.UnorderedList]: '无序列表',
    [CardType.CDF]: 'CDF',
    [CardType.ConceptDefinition]: '概念',
    [CardType.SingleChoice]: '单选',
    [CardType.MultiChoice]: '多选',
};

/** Short labels for compact UI (badges, map rail) */
export const CARD_TYPE_SHORT_LABELS: Record<string, string> = {
    [CardType.Cloze]: '填空',
    [CardType.QA]: '问答',
    [CardType.Formula]: '公式',
    [CardType.ImageOcclusion]: '图片',
    [CardType.OrderedList]: '有序',
    [CardType.UnorderedList]: '无序',
    [CardType.CDF]: 'CDF',
    [CardType.ConceptDefinition]: '概念',
    [CardType.SingleChoice]: '单选',
    [CardType.MultiChoice]: '多选',
};

export function getCardTypeLabel(type: string): string {
    return CARD_TYPE_LABELS[type] ?? type;
}

export function getCardTypeShortLabel(type: string): string {
    return CARD_TYPE_SHORT_LABELS[type] ?? type;
}
