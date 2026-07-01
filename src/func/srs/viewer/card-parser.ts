import { CardType } from '@/types/srs';

/**
 * Card Parser — parse raw block kramdown / markdown into structured card data
 *
 * Supported card types (stored in custom-card-type attribute or inferred):
 *   cloze          — fill-in-the-blank with ==marks==
 *   qa             — question / answer superblock
 *   single-choice  — single-answer multiple choice
 *   multi-choice   — multiple-answer multiple choice
 *   formula / image / orderedList / unorderedList / cdf / concept — SRS native types
 */

export type FlashcardType = CardType | 'unknown';

export interface ChoiceOption {
    label: string;   // "A", "B", "C", "D"
    text: string;    // option text without the leading "A. "
    correct: boolean;
}

export interface ParsedFlashcard {
    type: FlashcardType;
    /** Cloze: question text with ==holes== ; QA/Choice: question prompt */
    question: string;
    /** Cloze: list of hole answers extracted from ==marks== ; QA: answer text */
    answer: string;
    /** Choice: parsed options (empty for non-choice types) */
    options: ChoiceOption[];
    /** Choice: explanation text after the answer line */
    explanation: string;
    /** Original raw markdown/kramdown */
    raw: string;
}

/**
 * Strip SiYuan IAL (Inline Attribute List) markers from kramdown.
 * Removes patterns like {: id="..." updated="..." custom-riff-decks="..."}
 * and superblock wrappers {{{row ... }}}
 */
function stripKramdownArtifacts(text: string): string {
    return text
        .replace(/\{\{\{row/g, '')
        .replace(/\}\}\}/g, '')
        .replace(/\{: [^}]*\}/g, '')
        .trim();
}

/**
 * Parse a card's markdown content + custom-card-type attribute into structured data.
 */
export function parseFlashcard(markdown: string, cardType: string): ParsedFlashcard {
    const raw = markdown;
    switch (cardType) {
        case CardType.Cloze:
            return parseCloze(raw);
        case CardType.QA:
            return parseQA(raw);
        case CardType.SingleChoice:
            return parseChoice(raw, false);
        case CardType.MultiChoice:
            return parseChoice(raw, true);
        default:
            return parseUnknown(raw);
    }
}

/** Cloze: "Go GC 采用 ==并发三色标记清除== 算法" → holes = ["并发三色标记清除"] */
function parseCloze(raw: string): ParsedFlashcard {
    const cleaned = stripKramdownArtifacts(raw);
    const question = cleaned;
    const holes: string[] = [];
    const clozeRe = /==(.+?)==/g;
    let match: RegExpExecArray | null;
    while ((match = clozeRe.exec(cleaned)) !== null) {
        holes.push(match[1].trim());
    }
    return {
        type: CardType.Cloze,
        question,
        answer: holes.join(' / '),
        options: [],
        explanation: '',
        raw,
    };
}

/** QA superblock: first block = question, second block = answer */
function parseQA(raw: string): ParsedFlashcard {
    const cleaned = stripKramdownArtifacts(raw);
    // Split on block boundaries — blocks separated by blank lines
    const blocks = cleaned
        .split(/\n\s*\n/)
        .map(b => b.trim())
        .filter(b => b.length > 0);

    const question = blocks[0] || cleaned;
    const answer = blocks.slice(1).join('\n\n');
    return {
        type: CardType.QA,
        question,
        answer,
        options: [],
        explanation: '',
        raw,
    };
}

/** Choice: parse question, options, answer, explanation from markdown list format */
function parseChoice(raw: string, multi: boolean): ParsedFlashcard {
    const clean = stripKramdownArtifacts(raw);

    // Split into question block and answer/explanation block
    // The question + options are in the first superblock row;
    // the answer + explanation are in the outer superblock.
    const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let question = '';
    const options: ChoiceOption[] = [];
    let answerLine = '';
    let explanation = '';

    // Parse lines: find question (starts with 【...题】), options, answer, explanation
    let inAnswer = false;
    let optionIndex = 0;

    for (const line of lines) {
        // Question line (starts with 【 or is the first non-option line)
        if (/^[【]/.test(line)) {
            if (!question) {
                question = line;
            }
            continue;
        }

        // Option line: "- A. text" or "- [ ] text" or "- [X] text"
        // Format 1: "- A. option text" (single-choice style)
        // Format 2: "- [ ] option text" or "- [X] option text" (multi-choice checkbox style)
        const labeledOptMatch = line.match(/^-\s*([A-Z])[.、)]\s*(.*)$/);
        const checkboxOptMatch = line.match(/^-\s*\[([ xX])\]\s*(.*)$/);

        if (labeledOptMatch) {
            // Labeled format: "- A. text"
            const label = labeledOptMatch[1];
            const text = labeledOptMatch[2];
            const correct = false; // Will be set from answer line later
            options.push({ label, text, correct });
            inAnswer = false;
            continue;
        } else if (checkboxOptMatch) {
            // Checkbox format: "- [ ] text" or "- [X] text"
            const isChecked = checkboxOptMatch[1] === 'x' || checkboxOptMatch[1] === 'X';
            const text = checkboxOptMatch[2];
            if (inAnswer && options.length > 0) {
                // This is a correct option list after the answer line — match by text
                const existing = options.find(o => o.text.trim() === text.trim());
                if (existing) {
                    existing.correct = isChecked;
                    continue;
                }
            }
            // New option from the question section
            const label = String.fromCharCode(65 + optionIndex); // A, B, C, D...
            options.push({ label, text, correct: isChecked });
            optionIndex++;
            inAnswer = false;
            continue;
        }

        // Answer line: "答案：A" or "答案：B、C、D。"
        if (line.startsWith('答案') || line.startsWith('答案：')) {
            answerLine = line;
            inAnswer = true;
            continue;
        }

        // Explanation
        if (inAnswer && (line.startsWith('解析') || !line.startsWith('-'))) {
            if (line.startsWith('解析')) {
                explanation = line.replace(/^解析[：:]\s*/, '');
            } else {
                explanation += (explanation ? '\n' : '') + line;
            }
            continue;
        }
    }

    // If options don't have correct marks from the question section, parse answerLine
    if (answerLine) {
        // Extract answer portion only — stop at first period or explanation marker
        // "答案：A。" or "答案：B、C、D。" — take text between "答案" and first "。"
        const answerPart = answerLine.replace(/^答案[：:]\s*/, '').split(/[。\.]/)[0];
        const answerLetters = answerPart.match(/[A-Z]/g);
        if (answerLetters) {
            for (const opt of options) {
                if (answerLetters.includes(opt.label)) {
                    opt.correct = true;
                }
            }
        }
    }

    return {
        type: multi ? CardType.MultiChoice : CardType.SingleChoice,
        question,
        answer: answerLine,
        options,
        explanation,
        raw,
    };
}

function parseUnknown(raw: string): ParsedFlashcard {
    return {
        type: 'unknown',
        question: stripKramdownArtifacts(raw),
        answer: '',
        options: [],
        explanation: '',
        raw,
    };
}
