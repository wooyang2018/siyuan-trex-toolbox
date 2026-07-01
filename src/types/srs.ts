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

/** FSRS rating grades (1=Again, 2=Hard, 3=Good, 4=Easy) */
export type Rating = 1 | 2 | 3 | 4;

/** FSRS card state */
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
    front: string;
    back: string;
    /** FSRS fields */
    stability: number;
    difficulty: number;
    lastReview: number;       // timestamp ms
    nextReview: number;       // timestamp ms
    reps: number;
    lapses: number;
    state: CardState;
    /** FSRS learning steps (for short-term scheduler) */
    step?: number;
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
    /** FSRS parameters (19 floats) */
    fsrsParams: number[];
    /** Request retention (0-1) */
    requestRetention: number;
    /** Maximum interval in days */
    maximumInterval: number;
    /** Enable fuzz factor */
    enableFuzz: boolean;
    /** Enable short-term scheduler (learning steps) */
    enableShortTerm: boolean;
    /** Learning steps (in minutes) */
    learningSteps: number[];
    /** Relearning steps (in minutes) */
    relearningSteps: number[];
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
    /** Riffcard sync enabled */
    riffcardSync: boolean;
    /** Riffcard deck ID */
    riffcardDeckId: string;
}

/** Review log entry for FSRS optimizer */
export interface ReviewLogEntry {
    cardId: string;
    rating: Rating;
    state: CardState;
    stability: number;
    difficulty: number;
    timestamp: number;
    elapsedDays: number;
    scheduledDays: number;
}

/** Default FSRS parameters (v6, 19 weights) */
export const DEFAULT_FSRS_PARAMS: number[] = [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102,
    0.5316, 1.0651, 0.0234, 1.616, 0.1544,
    1.0824, 1.9813, 0.0953, 0.2975, 2.2042,
    0.2407, 2.9466, 0.5034, 0.6567,
];

/** Default SRS settings */
export const DEFAULT_SRS_SETTINGS: SRSSettings = {
    fsrsParams: DEFAULT_FSRS_PARAMS,
    requestRetention: 0.9,
    maximumInterval: 36500,
    enableFuzz: false,
    enableShortTerm: true,
    learningSteps: [1, 10],
    relearningSteps: [10],
    newPerDay: 20,
    reviewsPerDay: 200,
    dayStartHour: 4,
    autoPostpone: false,
    autoSort: false,
    riffcardSync: false,
    riffcardDeckId: '',
};
