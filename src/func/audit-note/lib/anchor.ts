import type { Anchor } from "./schema";
import { computeAnchor, offsetsToLines } from "./anchor-core";

export { computeAnchor, offsetsToLines };

export interface ResolvedAnchor {
  charStart: number;
  charEnd: number;
  lineStart: number;
  lineEnd: number;
  /**
   * How the anchor was resolved. Useful for telling the user that a match was
   * found by fuzzy search and lines may need updating.
   */
  via: "line" | "unique-text" | "context-window";
}

/**
 * Resolve an anchor against a possibly-drifted file. Returns null if the
 * anchor cannot be located unambiguously.
 *
 * Algorithm:
 *   1) Check whether text at target_lines still contains anchor_text. If yes, done.
 *   2) Otherwise, search the whole file for anchor_text. If exactly one match, use it.
 *   3) Otherwise, search for anchor_before + anchor_text + anchor_after. If exactly one match, use it.
 *   4) Otherwise return null: stale anchor, must be re-anchored by a human.
 */
export function resolveAnchor(fileText: string, anchor: Anchor): ResolvedAnchor | null {
  // Step 1: line-based attempt.
  const lineHit = tryLineMatch(fileText, anchor);
  if (lineHit) return lineHit;

  // Step 2: unique occurrence of anchor_text.
  const occurrences = findAll(fileText, anchor.anchor_text);
  if (occurrences.length === 1) {
    const charStart = occurrences[0]!;
    const charEnd = charStart + anchor.anchor_text.length;
    const { lineStart, lineEnd } = offsetsToLines(fileText, charStart, charEnd);
    return { charStart, charEnd, lineStart, lineEnd, via: "unique-text" };
  }

  // Step 3: disambiguate with surrounding context.
  if (occurrences.length > 1 || occurrences.length === 0) {
    const combined = anchor.anchor_before + anchor.anchor_text + anchor.anchor_after;
    if (combined.length > 0) {
      const idx = fileText.indexOf(combined);
      if (idx >= 0 && fileText.indexOf(combined, idx + 1) < 0) {
        const charStart = idx + anchor.anchor_before.length;
        const charEnd = charStart + anchor.anchor_text.length;
        const { lineStart, lineEnd } = offsetsToLines(fileText, charStart, charEnd);
        return { charStart, charEnd, lineStart, lineEnd, via: "context-window" };
      }
    }
  }

  return null;
}

function tryLineMatch(fileText: string, anchor: Anchor): ResolvedAnchor | null {
  const [ls, le] = anchor.target_lines;
  const lines = fileText.split("\n");
  if (ls < 1 || le > lines.length || ls > le) return null;
  const rangeText = lines.slice(ls - 1, le).join("\n");
  const idxInRange = rangeText.indexOf(anchor.anchor_text);
  if (idxInRange < 0) return null;
  let lineStartOffset = 0;
  for (let i = 0; i < ls - 1; i++) {
    lineStartOffset += lines[i]!.length + 1;
  }
  const charStart = lineStartOffset + idxInRange;
  const charEnd = charStart + anchor.anchor_text.length;
  const { lineStart, lineEnd } = offsetsToLines(fileText, charStart, charEnd);
  return { charStart, charEnd, lineStart, lineEnd, via: "line" };
}

function findAll(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    out.push(idx);
    from = idx + 1;
  }
  return out;
}
