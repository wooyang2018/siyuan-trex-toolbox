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

/**
 * Card types that users can actually generate via SiYuan's native flashcard system.
 * Used to populate the type filter dropdown in ViewerView — only these 4 types
 * have reachable creation paths (native SiYuan flashcards).
 * Other types (Formula, ImageOcclusion, CDF, ConceptDefinition, OrderedList,
 * UnorderedList) have no user-accessible creation entry and are excluded to avoid
 * showing empty filter options.
 */
export const GENERATABLE_CARD_TYPES: Partial<Record<CardType, string>> = {
    [CardType.Cloze]: '填空',
    [CardType.QA]: '问答',
    [CardType.SingleChoice]: '单选',
    [CardType.MultiChoice]: '多选',
};