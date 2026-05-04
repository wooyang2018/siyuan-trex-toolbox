/**
 * Text chunking utilities — split large documents into LLM-sized pieces.
 * Word-count based (like NotEMD), splitting on sentence boundaries.
 */

/**
 * Estimate token count from text (rough: ~1.3 chars/token for CJK-heavy text,
 * ~4 chars/token for pure English).
 */
export function estimateTokens(text: string): number {
    const cjkCount = (text.match(/[一-鿿぀-ヿ]/g) || []).length;
    const latin = text.length - cjkCount;
    return Math.ceil(cjkCount * 1.3 + latin / 4);
}

/**
 * Count words (CJK characters count as 1 word each; Latin words split by whitespace).
 */
export function countWords(text: string): number {
    const cjkCount = (text.match(/[一-鿿぀-ヿ]/g) || []).length;
    const latinWords = text
        .replace(/[一-鿿぀-ヿ]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 0).length;
    return cjkCount + latinWords;
}

/**
 * Split content into chunks of approximately `targetWordCount` words.
 * Tries to split on paragraph boundaries (double newline), then on
 * sentence boundaries (period/question/exclamation).
 */
export function splitIntoChunks(text: string, targetWordCount = 800): string[] {
    if (countWords(text) <= targetWordCount) {
        return [text];
    }

    // Split on paragraphs first
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
        const candidate = current ? current + '\n\n' + para : para;
        if (countWords(candidate) <= targetWordCount) {
            current = candidate;
        } else {
            if (current) {
                chunks.push(current.trim());
                current = '';
            }
            // If single paragraph is too long, split on sentences
            if (countWords(para) > targetWordCount) {
                const sentenceChunks = splitBySentences(para, targetWordCount);
                chunks.push(...sentenceChunks);
            } else {
                current = para;
            }
        }
    }
    if (current.trim()) {
        chunks.push(current.trim());
    }

    return chunks.filter(c => c.length > 0);
}

function splitBySentences(text: string, targetWordCount: number): string[] {
    // Match sentence endings: . ! ? followed by space or newline, or Chinese equivalents
    const sentences = text.split(/(?<=[.!?。！？\n])\s*/);
    const chunks: string[] = [];
    let current = '';

    for (const sent of sentences) {
        const candidate = current ? current + ' ' + sent : sent;
        if (countWords(candidate) <= targetWordCount) {
            current = candidate;
        } else {
            if (current) chunks.push(current.trim());
            current = sent;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}
