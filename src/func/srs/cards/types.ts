/**
 * SRS Cards — Types for card creation system
 */
import type { CardType, OcclusionRegion, CDFMode, CDFSemantic } from '@/types/srs';
import type { BlockId, DocumentId } from '@/types';

/** Context for card creation — information about the source block */
export interface CardCreationContext {
    blockId: BlockId;
    rootId: DocumentId;
    deckId: string;
    /** Selected text within the block (if any) */
    selection?: string;
    /** Block kramdown content */
    kramdown?: string;
    /** Block HTML content */
    html?: string;
}

/** Result of card creation */
export interface CardCreationResult {
    success: boolean;
    cardIds: string[];
    message?: string;
}

/** Options for cloze card creation */
export interface ClozeCreationOptions {
    /** Cloze markers, e.g. ['==', '@'] */
    markers?: string[];
    /** Create separate cards for each cloze */
    separate?: boolean;
}

/** Options for CDF card creation */
export interface CDFCreationOptions {
    mode: CDFMode;
    semantic?: CDFSemantic;
    /** Marker symbol that separates cue from answer */
    marker?: string;
}

/** Options for concept definition card creation */
export interface ConceptDefinitionOptions {
    semantic: 'forward' | 'reverse' | 'bidirectional';
    /** The concept term */
    concept: string;
    /** The definition */
    definition: string;
}

/** Options for image occlusion card creation */
export interface ImageOcclusionOptions {
    /** Image source path */
    imageSrc: string;
    /** Occlusion regions */
    occlusions: OcclusionRegion[];
    /** Optional prompt/label for the occlusion */
    prompt?: string;
}

/** Options for list template card creation */
export interface ListTemplateOptions {
    /** Progressive hint items (for ordered list) */
    hints?: string[];
    /** Summary hint (for unordered list) */
    summary?: string;
}

/** Symbol listener configuration */
export interface SymbolListenerConfig {
    enabled: boolean;
    /** Symbols that trigger card creation, e.g. ['==', '@@'] */
    symbols: string[];
    /** Whether to also process heading blocks */
    headingEnabled: boolean;
}

/** Auto card creation configuration */
export interface AutoCardConfig {
    enabled: boolean;
    /** Patterns that trigger auto card creation */
    patterns: AutoCardPattern[];
}

/** Auto card pattern */
export interface AutoCardPattern {
    id: string;
    name: string;
    /** Regex pattern to match in block content */
    pattern: string;
    /** Card type to create when pattern matches */
    cardType: CardType;
    /** Whether this pattern is active */
    active: boolean;
}

/** Batch operation options */
export interface BatchCreateOptions {
    /** Block IDs to process */
    blockIds: BlockId[];
    /** Card type to create */
    cardType: CardType;
    /** Deck ID */
    deckId: string;
    /** Whether to include child blocks */
    includeChildren: boolean;
}

/** Menu item for card creation */
export interface CardCreationMenuItem {
    label: string;
    icon: string;
    cardType: CardType;
    callback: (ctx: CardCreationContext) => void | Promise<void>;
}
