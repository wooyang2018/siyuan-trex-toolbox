/**
 * SRS shared type definitions — used across all srs-* modules
 */

/** Card types supported by the SRS system */
export enum CardType {
    Cloze = 'cloze',
    QA = 'qa',
    Formula = 'formula',
    ImageOcclusion = 'image',
    OrderedList = 'orderedList',
    UnorderedList = 'unorderedList',
    CDF = 'cdf',
    ConceptDefinition = 'concept',
    SingleChoice = 'single-choice',
    MultiChoice = 'multi-choice',
}

/** Rating grades (SM-2 based, via SiYuan native riffcard) */
export type Rating = 1 | 2 | 3 | 4;

/** Card scheduling state */
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

/** Queue types */
export type QueueType = 'retrieval';

/** Occlusion region for image occlusion cards */
export interface OcclusionRegion {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
}

/** CDF (Concept Descriptor Framework) mode */
export type CDFMode = 'concept' | 'descriptor';

/** CDF semantic direction */
export type CDFSemantic = 'forward' | 'reverse' | 'bidirectional';

/** Core SRS card projection derived from SiYuan native riffcard decks */
export interface SRSCard {
    id: string;
    blockId: string;
    rootId: string;
    type: CardType;
    deckId: string;
    deckName?: string;
    front: string;
    back: string;
    lastReview: number;       // timestamp ms
    nextReview: number;       // timestamp ms
    reps: number;
    lapses: number;
    state: CardState;
    /** Extension fields by card type */
    clozeIndex?: number;
    cdfMode?: CDFMode;
    cdfSemantic?: CDFSemantic;
    occlusions?: OcclusionRegion[];
    listHints?: string[];
    /** Source lineage for progressive reading */
    sourceBlockId?: string;
    excerptRecordId?: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
}

/** Queue model stored in queues.json */
export interface SRSQueue {
    type: QueueType;
    cardIds: string[];
    currentIndex: number;
}

/** SRS settings stored in settings.json */
export interface SRSSettings {
    /** New cards per day */
    newPerDay: number;
    /** Reviews per day */
    reviewsPerDay: number;
    /** Day starts at hour (0-23) */
    dayStartHour: number;
    /** Auto postpone enabled */
    autoPostpone: boolean;
    /** Auto sort enabled */
    autoSort: boolean;
}

/** Review log entry for daily limit tracking */
export interface ReviewLogEntry {
    cardId: string;
    rating: Rating;
    /** Pre-review state (state of the card when it was reviewed, before the rating was applied) */
    state: CardState;
    /** Post-review reps count (current reps after this review) */
    reps: number;
    /** Post-review lapses count (current lapses after this review) */
    lapses: number;
    timestamp: number;
    elapsedDays: number;
    scheduledDays: number;
}

/** Default SRS settings */
export const DEFAULT_SRS_SETTINGS: SRSSettings = {
    newPerDay: 20,
    reviewsPerDay: 200,
    dayStartHour: 4,
    autoPostpone: false,
    autoSort: false,
};
