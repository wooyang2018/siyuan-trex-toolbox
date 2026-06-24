/**
 * 文本节点扁平化匹配纯函数（findRangeInBlock 的核心逻辑）。
 * 从 AuditNotePanel.svelte 抽离，不依赖 DOM，便于单元测试直接 import。
 */

export interface FlatRange {
  /** 起始文本片段索引 */
  startIdx: number;
  /** 起始片段内的字符偏移 */
  startOffset: number;
  /** 结束文本片段索引 */
  endIdx: number;
  /** 结束片段内的字符偏移（exclusive） */
  endOffset: number;
}

/**
 * 在一组文本片段（模拟 DOM 连续文本节点）拼成的扁平字符串中查找 searchKey，
 * 返回其在片段数组中的起止索引与偏移。支持跨片段（剥离 md 后的纯文本可能横跨
 * <strong> 等内联标签的多个文本节点）。endOffset 为 exclusive。
 */
export function findRangeInFlat(texts: string[], searchKey: string): FlatRange | null {
  if (!searchKey) return null;
  let flat = "";
  const offsets: { start: number; len: number }[] = [];
  for (const s of texts) {
    offsets.push({ start: flat.length, len: s.length });
    flat += s;
  }
  const idx = flat.indexOf(searchKey);
  if (idx < 0) return null;
  const end = idx + searchKey.length;

  const startIdx = offsets.findIndex(o => idx >= o.start && idx < o.start + o.len);
  const endIdx = offsets.findIndex(o => end > o.start && end <= o.start + o.len);
  if (startIdx < 0 || endIdx < 0) return null;

  return {
    startIdx,
    startOffset: idx - offsets[startIdx]!.start,
    endIdx,
    endOffset: end - offsets[endIdx]!.start,
  };
}
