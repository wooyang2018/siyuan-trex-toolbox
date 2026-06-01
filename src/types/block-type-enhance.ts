/**
 * BlockType 类型增强定义
 * 提供更友好的类型定义、常量映射和类型守卫函数
 */

import type { BlockType } from './index';

/**
 * 块类型枚举常量 - 提供更具可读性的常量名称
 */
export const BLOCK_TYPE = {
  /** 文档块 (Document) */
  DOCUMENT: 'd' as const,
  /** 标题块 (Heading) */
  HEADING: 'h' as const,
  /** 段落块 (Paragraph) */
  PARAGRAPH: 'p' as const,
  /** 列表块 (List) */
  LIST: 'l' as const,
  /** 列表项块 (ListItem) */
  LIST_ITEM: 'i' as const,
  /** 代码块 (Code) */
  CODE: 'c' as const,
  /** 表格块 (Table) */
  TABLE: 't' as const,
  /** 数学公式块 (Math) */
  MATH: 'm' as const,
  /** 引用块 (Blockquote) */
  BLOCKQUOTE: 'b' as const,
  /** 脚注块 (Footnote) */
  FOOTNOTE: 'f' as const,
  /** 超级块 (SuperBlock) */
  SUPER_BLOCK: 's' as const,
  /** 属性视图块 (Attribute View) */
  ATTRIBUTE_VIEW: 'av' as const,
  /** 数据库块 (Table Block) */
  TABLE_BLOCK: 'tb' as const,
  /** 小工具块 (Widget) */
  WIDGET: 'widget' as const,
  /** 内嵌框架块 (IFrame) */
  IFRAME: 'iframe' as const,
  /** 音频块 (Audio) */
  AUDIO: 'audio' as const,
  /** 视频块 (Video) */
  VIDEO: 'video' as const,
  /** 查询嵌入块 (Query Embed) */
  QUERY_EMBED: 'query_embed' as const,
  /** HTML块 (HTML) */
  HTML: 'html' as const,
} as const;

/**
 * 块类型中文名称映射
 */
export const BLOCK_TYPE_NAME_CN = {
  [BLOCK_TYPE.DOCUMENT]: '文档',
  [BLOCK_TYPE.HEADING]: '标题',
  [BLOCK_TYPE.PARAGRAPH]: '段落',
  [BLOCK_TYPE.LIST]: '列表',
  [BLOCK_TYPE.LIST_ITEM]: '列表项',
  [BLOCK_TYPE.CODE]: '代码',
  [BLOCK_TYPE.TABLE]: '表格',
  [BLOCK_TYPE.MATH]: '数学公式',
  [BLOCK_TYPE.BLOCKQUOTE]: '引用',
  [BLOCK_TYPE.FOOTNOTE]: '脚注',
  [BLOCK_TYPE.SUPER_BLOCK]: '超级块',
  [BLOCK_TYPE.ATTRIBUTE_VIEW]: '属性视图',
  [BLOCK_TYPE.TABLE_BLOCK]: '数据库',
  [BLOCK_TYPE.WIDGET]: '小工具',
  [BLOCK_TYPE.IFRAME]: '内嵌框架',
  [BLOCK_TYPE.AUDIO]: '音频',
  [BLOCK_TYPE.VIDEO]: '视频',
  [BLOCK_TYPE.QUERY_EMBED]: '查询嵌入',
  [BLOCK_TYPE.HTML]: 'HTML',
} as const;

/**
 * 块类型英文名称映射
 */
export const BLOCK_TYPE_NAME_EN = {
  [BLOCK_TYPE.DOCUMENT]: 'Document',
  [BLOCK_TYPE.HEADING]: 'Heading',
  [BLOCK_TYPE.PARAGRAPH]: 'Paragraph',
  [BLOCK_TYPE.LIST]: 'List',
  [BLOCK_TYPE.LIST_ITEM]: 'ListItem',
  [BLOCK_TYPE.CODE]: 'Code',
  [BLOCK_TYPE.TABLE]: 'Table',
  [BLOCK_TYPE.MATH]: 'Math',
  [BLOCK_TYPE.BLOCKQUOTE]: 'Blockquote',
  [BLOCK_TYPE.FOOTNOTE]: 'Footnote',
  [BLOCK_TYPE.SUPER_BLOCK]: 'SuperBlock',
  [BLOCK_TYPE.ATTRIBUTE_VIEW]: 'AttributeView',
  [BLOCK_TYPE.TABLE_BLOCK]: 'TableBlock',
  [BLOCK_TYPE.WIDGET]: 'Widget',
  [BLOCK_TYPE.IFRAME]: 'IFrame',
  [BLOCK_TYPE.AUDIO]: 'Audio',
  [BLOCK_TYPE.VIDEO]: 'Video',
  [BLOCK_TYPE.QUERY_EMBED]: 'QueryEmbed',
  [BLOCK_TYPE.HTML]: 'HTML',
} as const;

/**
 * 可编辑的块类型集合
 */
export const EDITABLE_BLOCK_TYPES: BlockType[] = [
  BLOCK_TYPE.DOCUMENT,
  BLOCK_TYPE.HEADING,
  BLOCK_TYPE.PARAGRAPH,
  BLOCK_TYPE.LIST_ITEM,
  BLOCK_TYPE.CODE,
  BLOCK_TYPE.TABLE,
  BLOCK_TYPE.MATH,
  BLOCK_TYPE.BLOCKQUOTE,
  BLOCK_TYPE.HTML,
];

/**
 * 容器块类型（可以包含其他块的块）
 */
export const CONTAINER_BLOCK_TYPES: BlockType[] = [
  BLOCK_TYPE.DOCUMENT,
  BLOCK_TYPE.LIST,
  BLOCK_TYPE.SUPER_BLOCK,
  BLOCK_TYPE.ATTRIBUTE_VIEW,
  BLOCK_TYPE.TABLE_BLOCK,
];

/**
 * 媒体块类型
 */
export const MEDIA_BLOCK_TYPES: BlockType[] = [
  BLOCK_TYPE.AUDIO,
  BLOCK_TYPE.VIDEO,
  BLOCK_TYPE.IFRAME,
];

/**
 * 类型守卫函数
 */

/**
 * 检查是否为文档块
 */
export function isDocumentBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.DOCUMENT;
}

/**
 * 检查是否为标题块
 */
export function isHeadingBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.HEADING;
}

/**
 * 检查是否为段落块
 */
export function isParagraphBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.PARAGRAPH;
}

/**
 * 检查是否为代码块
 */
export function isCodeBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.CODE;
}

/**
 * 检查是否为表格块
 */
export function isTableBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.TABLE;
}

/**
 * 检查是否为数学公式块
 */
export function isMathBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.MATH;
}

/**
 * 检查是否为引用块
 */
export function isBlockquoteBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.BLOCKQUOTE;
}

/**
 * 检查是否为超级块
 */
export function isSuperBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.SUPER_BLOCK;
}

/**
 * 检查是否为属性视图块
 */
export function isAttributeViewBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.ATTRIBUTE_VIEW;
}

/**
 * 检查是否为数据库块
 */
export function isTableBlockBlock(block: { type: BlockType }): boolean {
  return block.type === BLOCK_TYPE.TABLE_BLOCK;
}

/**
 * 检查是否为媒体块（音频、视频、iframe）
 */
export function isMediaBlock(block: { type: BlockType }): boolean {
  return MEDIA_BLOCK_TYPES.includes(block.type);
}

/**
 * 检查块是否可编辑
 */
export function isEditableBlock(block: { type: BlockType }): boolean {
  return EDITABLE_BLOCK_TYPES.includes(block.type);
}

/**
 * 检查块是否为容器块
 */
export function isContainerBlock(block: { type: BlockType }): boolean {
  return CONTAINER_BLOCK_TYPES.includes(block.type);
}

/**
 * 获取块类型的中文名称
 */
export function getBlockTypeNameCN(type: BlockType): string {
  return BLOCK_TYPE_NAME_CN[type] || '未知类型';
}

/**
 * 获取块类型的英文名称
 */
export function getBlockTypeNameEN(type: BlockType): string {
  return BLOCK_TYPE_NAME_EN[type] || 'Unknown';
}

/**
 * 类型断言函数
 */

/**
 * 断言块为文档块
 */
export function assertDocumentBlock(block: { type: BlockType }): asserts block is { type: typeof BLOCK_TYPE.DOCUMENT } {
  if (!isDocumentBlock(block)) {
    throw new Error(`Expected document block, got ${block.type}`);
  }
}

/**
 * 断言块为标题块
 */
export function assertHeadingBlock(block: { type: BlockType }): asserts block is { type: typeof BLOCK_TYPE.HEADING } {
  if (!isHeadingBlock(block)) {
    throw new Error(`Expected heading block, got ${block.type}`);
  }
}

/**
 * 类型转换工具
 */

/**
 * 安全地将块转换为特定类型，如果类型不匹配则返回 null
 */
export function safeCastBlock<T extends BlockType>(
  block: { type: BlockType },
  expectedType: T
): { type: T } | null {
  return block.type === expectedType ? block as { type: T } : null;
}

/**
 * 块类型描述信息
 */
export interface BlockTypeInfo {
  /** 类型代码 */
  code: BlockType;
  /** 中文名称 */
  nameCN: string;
  /** 英文名称 */
  nameEN: string;
  /** 是否可编辑 */
  editable: boolean;
  /** 是否为容器块 */
  container: boolean;
  /** 是否为媒体块 */
  media: boolean;
  /** 描述信息 */
  description: string;
}

/**
 * 获取块类型的完整信息
 */
export function getBlockTypeInfo(type: BlockType): BlockTypeInfo {
  return {
    code: type,
    nameCN: getBlockTypeNameCN(type),
    nameEN: getBlockTypeNameEN(type),
    editable: EDITABLE_BLOCK_TYPES.includes(type),
    container: CONTAINER_BLOCK_TYPES.includes(type),
    media: MEDIA_BLOCK_TYPES.includes(type),
    description: getBlockTypeDescription(type),
  };
}

/**
 * 获取块类型的详细描述
 */
export function getBlockTypeDescription(type: BlockType): string {
  const descriptions: Partial<Record<BlockType, string>> = {
    [BLOCK_TYPE.DOCUMENT]: '文档块，代表一篇完整的文档，可以包含其他所有类型的块',
    [BLOCK_TYPE.HEADING]: '标题块，用于组织文档结构，支持多级标题',
    [BLOCK_TYPE.PARAGRAPH]: '段落块，基本的文本内容块',
    [BLOCK_TYPE.LIST]: '列表块，用于组织列表项块的容器',
    [BLOCK_TYPE.LIST_ITEM]: '列表项块，列表中的单个项目',
    [BLOCK_TYPE.CODE]: '代码块，用于展示和编辑代码，支持语法高亮',
    [BLOCK_TYPE.TABLE]: '表格块，用于创建和编辑表格数据',
    [BLOCK_TYPE.MATH]: '数学公式块，支持 LaTeX 数学公式渲染',
    [BLOCK_TYPE.BLOCKQUOTE]: '引用块，用于突出显示引用的内容',
    [BLOCK_TYPE.SUPER_BLOCK]: '超级块，可以包含多个块并支持布局控制',
    [BLOCK_TYPE.ATTRIBUTE_VIEW]: '属性视图块，用于创建数据库式的视图',
    [BLOCK_TYPE.TABLE_BLOCK]: '数据库块，功能强大的数据库功能',
    [BLOCK_TYPE.WIDGET]: '小工具块，用于嵌入各种小工具和组件',
    [BLOCK_TYPE.IFRAME]: '内嵌框架块，用于嵌入外部网页内容',
    [BLOCK_TYPE.AUDIO]: '音频块，用于嵌入和播放音频文件',
    [BLOCK_TYPE.VIDEO]: '视频块，用于嵌入和播放视频文件',
    [BLOCK_TYPE.QUERY_EMBED]: '查询嵌入块，用于嵌入查询结果',
    [BLOCK_TYPE.HTML]: 'HTML块，用于直接编写和渲染HTML代码',
    ['f' as BlockType]: '脚注块，文档脚注内容',
  };

  return descriptions[type] || '未知块类型';
}

/**
 * 块类型分组信息
 */
export const BLOCK_TYPE_GROUPS = {
  /** 文本相关块 */
  TEXT: [BLOCK_TYPE.PARAGRAPH, BLOCK_TYPE.HEADING, BLOCK_TYPE.BLOCKQUOTE],
  /** 代码相关块 */
  CODE: [BLOCK_TYPE.CODE, BLOCK_TYPE.MATH, BLOCK_TYPE.HTML],
  /** 数据相关块 */
  DATA: [BLOCK_TYPE.TABLE, BLOCK_TYPE.ATTRIBUTE_VIEW, BLOCK_TYPE.TABLE_BLOCK],
  /** 媒体相关块 */
  MEDIA: MEDIA_BLOCK_TYPES,
  /** 容器相关块 */
  CONTAINER: CONTAINER_BLOCK_TYPES,
  /** 特殊功能块 */
  SPECIAL: [BLOCK_TYPE.WIDGET, BLOCK_TYPE.QUERY_EMBED, BLOCK_TYPE.SUPER_BLOCK],
} as const;

/**
 * 检查块是否属于指定分组
 */
export function isBlockInGroup(block: { type: BlockType }, group: keyof typeof BLOCK_TYPE_GROUPS): boolean {
  const groupTypes = BLOCK_TYPE_GROUPS[group] as readonly BlockType[];
  return groupTypes.includes(block.type);
}