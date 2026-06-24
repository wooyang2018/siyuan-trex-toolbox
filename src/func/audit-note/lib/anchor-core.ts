/**
 * 锚点计算纯函数（computeAnchor / offsetsToLines），零依赖，便于 Node 原生
 * type stripping 直接运行测试。
 *
 * 注意：context 默认值 80 必须与 schema.ts 的 CONTEXT_CHARS 保持一致。
 */

export function offsetsToLines(
  text: string,
  start: number,
  end: number,
): { lineStart: number; lineEnd: number } {
  let line = 1;
  let lineStart = 1;
  let lineEnd = 1;
  let seenStart = false;
  let seenEnd = false;
  for (let i = 0; i < text.length; i++) {
    if (!seenStart && i >= start) {
      lineStart = line;
      seenStart = true;
    }
    if (!seenEnd && i >= end) {
      lineEnd = line;
      seenEnd = true;
      break;
    }
    if (text[i] === "\n") line++;
  }
  if (!seenStart) lineStart = line;
  if (!seenEnd) lineEnd = line;
  if (lineEnd < lineStart) lineEnd = lineStart;
  return { lineStart, lineEnd };
}

export function computeAnchor(
  fileText: string,
  selStart: number,
  selEnd: number,
  context = 80,
) {
  if (selStart < 0 || selEnd > fileText.length || selStart >= selEnd) {
    throw new Error(
      `computeAnchor: invalid range [${selStart}, ${selEnd}) for text of length ${fileText.length}`,
    );
  }
  const { lineStart, lineEnd } = offsetsToLines(fileText, selStart, selEnd);
  const beforeStart = Math.max(0, selStart - context);
  const afterEnd = Math.min(fileText.length, selEnd + context);
  return {
    target_lines: [lineStart, lineEnd] as [number, number],
    anchor_before: fileText.slice(beforeStart, selStart),
    anchor_text: fileText.slice(selStart, selEnd),
    anchor_after: fileText.slice(selEnd, afterEnd),
  };
}
