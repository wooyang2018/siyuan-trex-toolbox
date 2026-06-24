/**
 * Markdown 文本处理纯函数（用于锚定文本搜索）。
 * 从 AuditNotePanel.svelte / plugin-entry.ts 抽离，不依赖 DOM，便于单元测试直接 import。
 */

/**
 * 剥离常见行内 markdown 语法字符，返回纯文本。
 * anchor_text 存的是 raw markdown（带 **、`、[]() 等），而 DOM 文本节点是渲染后的
 * 纯文本（`**xxx**` → <strong>xxx</strong>，文本节点不含 `**`），直接用 raw md
 * 在 DOM 中搜索必然失败，故需先剥离。
 */
export function stripInlineMd(text: string): string {
  let s = text;
  // 还原转义字符 \X -> X（先处理，避免后续误判）
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!~|>])/g, "$1");
  // 图片 ![alt](url) -> alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 链接 [text](url) -> text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // 粗体 **xxx** / __xxx__（先于斜体，避免误吞 **）
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  s = s.replace(/__(.+?)__/g, "$1");
  // 删除线 ~~xxx~~
  s = s.replace(/~~(.+?)~~/g, "$1");
  // 行内代码 `xxx`
  s = s.replace(/`([^`]+)`/g, "$1");
  // 斜体 *xxx* / _xxx_（粗体已剥离；opening 标记后须非空白、closing 标记前须非空白，
  // 避免把数学乘号 a * b * c 误判为斜体）
  s = s.replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g, "$1");
  s = s.replace(/_(?=\S)([^_\n]+?)(?<=\S)_(?!_)/g, "$1");
  // 行首标题 / 列表 / 引用 / 有序列表前缀
  s = s.replace(/^#{1,6}\s*/, "");
  s = s.replace(/^[*>\-+]\s+/, "");
  s = s.replace(/^\d+\.\s+/, "");
  // 去除零宽字符（思源 kramdown 可能插入 U+200B 等，而 DOM 渲染纯文本不含）
  s = s.replace(/[\u200B\uFEFF]/g, "");
  return s;
}

/** 从 anchorText 提取用于 DOM 搜索的关键词（处理选中文本和整块两种情况） */
export function extractSearchKey(anchorText: string): string {
  const lines = anchorText
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("{:"));
  // 剥离行内 markdown 标记后再作为搜索词，确保与 DOM 渲染后的纯文本可匹配
  const cleanLines = lines.map(l => stripInlineMd(l).trim()).filter(Boolean);
  return (cleanLines.find(l => l.length >= 3) || cleanLines[0] || "").slice(0, 60);
}

/**
 * Strip SiYuan kramdown inline attribute blocks (IAL) like `{: id="..." updated="..."}`.
 * Used when anchoring a whole block so the anchor_text stays clean.
 */
export function stripKramdownIAL(kramdown: string): string {
  return kramdown
    .replace(/^\s*\{:[^}]*\}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Find the character offsets of selectedText in markdown.
 * Falls back to [0, 0] if not found.
 */
export function findSelectionOffsets(markdown: string, selectedText: string): { selStart: number; selEnd: number } {
  if (!selectedText) return { selStart: 0, selEnd: 0 };
  const idx = markdown.indexOf(selectedText);
  if (idx >= 0) {
    return { selStart: idx, selEnd: idx + selectedText.length };
  }
  // Try finding a substring match
  const lines = selectedText.split("\n").filter(l => l.trim());
  if (lines.length > 0) {
    const firstLine = lines[0]!.trim();
    const idx2 = markdown.indexOf(firstLine);
    if (idx2 >= 0) {
      return { selStart: idx2, selEnd: idx2 + firstLine.length };
    }
  }
  return { selStart: 0, selEnd: 0 };
}
