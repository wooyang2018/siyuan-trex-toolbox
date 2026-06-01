/**
 * BlockType 增强功能使用示例
 * 展示如何在项目中使用增强的类型定义和工具函数
 */

import {
  BLOCK_TYPE,
  BLOCK_TYPE_NAME_CN,
  BLOCK_TYPE_NAME_EN,
  isDocumentBlock,
  isCodeBlock,
  isMediaBlock,
  isEditableBlock,
  isContainerBlock,
  getBlockTypeInfo,
  getBlockTypeDescription,
  safeCastBlock,
  assertDocumentBlock,
  BLOCK_TYPE_GROUPS,
  isBlockInGroup,
  EDITABLE_BLOCK_TYPES,
  CONTAINER_BLOCK_TYPES,
  MEDIA_BLOCK_TYPES,
} from './block-type-enhance';

import type { Block, BlockType } from './index';

/**
 * 示例1: 使用常量替代硬编码的字符串
 */
export function exampleUsingConstants() {
  // 旧方式 - 硬编码字符串
  const oldWay = "SELECT id FROM blocks WHERE type = 'd'";

  // 新方式 - 使用常量
  const newWay = `SELECT id FROM blocks WHERE type = '${BLOCK_TYPE.DOCUMENT}'`;

  console.log('旧方式:', oldWay);
  console.log('新方式:', newWay);

  // 输出块类型名称
  console.log('文档块中文名:', BLOCK_TYPE_NAME_CN[BLOCK_TYPE.DOCUMENT]);
  console.log('代码块英文名:', BLOCK_TYPE_NAME_EN[BLOCK_TYPE.CODE]);
}

/**
 * 示例2: 使用类型守卫函数进行安全类型检查
 */
export function exampleTypeGuards(block: Block) {
  // 检查是否为文档块
  if (isDocumentBlock(block)) {
    console.log('这是一个文档块，可以进行文档相关操作');
    // 在此处，TypeScript 知道 block.type 是 'd'
  }

  // 检查是否为代码块
  if (isCodeBlock(block)) {
    console.log('这是一个代码块，可以进行语法高亮等操作');
  }

  // 检查是否为媒体块
  if (isMediaBlock(block)) {
    console.log('这是一个媒体块，需要进行媒体处理');
  }

  // 检查是否可编辑
  if (isEditableBlock(block)) {
    console.log('这个块可以编辑');
  }

  // 检查是否为容器块
  if (isContainerBlock(block)) {
    console.log('这个块可以包含其他块');
  }
}

/**
 * 示例3: 使用类型断言进行强制类型检查
 */
export function exampleTypeAssertions(block: Block) {
  try {
    // 断言块为文档块
    assertDocumentBlock(block);
    // 在此处，TypeScript 确信 block.type 是 'd'
    console.log('成功断言为文档块');
  } catch (error) {
    console.error('类型断言失败:', error.message);
  }
}

/**
 * 示例4: 安全类型转换
 */
export function exampleSafeCasting(block: Block) {
  // 安全转换为文档块
  const documentBlock = safeCastBlock(block, BLOCK_TYPE.DOCUMENT);
  if (documentBlock) {
    console.log('成功转换为文档块');
  }

  // 安全转换为代码块
  const codeBlock = safeCastBlock(block, BLOCK_TYPE.CODE);
  if (codeBlock) {
    console.log('成功转换为代码块');
  }
}

/**
 * 示例5: 获取块类型详细信息
 */
export function exampleBlockTypeInfo(block: Block) {
  const typeInfo = getBlockTypeInfo(block.type);

  console.log('块类型信息:', {
    类型代码: typeInfo.code,
    中文名称: typeInfo.nameCN,
    英文名称: typeInfo.nameEN,
    是否可编辑: typeInfo.editable,
    是否为容器: typeInfo.container,
    是否为媒体: typeInfo.media,
    详细描述: typeInfo.description,
  });

  // 获取特定描述
  const description = getBlockTypeDescription(block.type);
  console.log('块类型描述:', description);
}

/**
 * 示例6: 块类型分组检查
 */
export function exampleBlockGroups(block: Block) {
  // 检查块是否属于文本组
  if (isBlockInGroup(block, 'TEXT')) {
    console.log('这是一个文本相关的块');
  }

  // 检查块是否属于代码组
  if (isBlockInGroup(block, 'CODE')) {
    console.log('这是一个代码相关的块');
  }

  // 检查块是否属于媒体组
  if (isBlockInGroup(block, 'MEDIA')) {
    console.log('这是一个媒体相关的块');
  }
}

/**
 * 示例7: 批量处理特定类型的块
 */
export function exampleBatchProcessing(blocks: Block[]) {
  // 过滤出所有可编辑的块
  const editableBlocks = blocks.filter(isEditableBlock);
  console.log(`找到 ${editableBlocks.length} 个可编辑块`);

  // 过滤出所有容器块
  const containerBlocks = blocks.filter(isContainerBlock);
  console.log(`找到 ${containerBlocks.length} 个容器块`);

  // 过滤出所有媒体块
  const mediaBlocks = blocks.filter(isMediaBlock);
  console.log(`找到 ${mediaBlocks.length} 个媒体块`);
}

/**
 * 示例8: 在SQL查询中使用类型常量
 */
export function exampleSQLQueries() {
  // 查询所有文档块
  const documentQuery = `SELECT * FROM blocks WHERE type = '${BLOCK_TYPE.DOCUMENT}'`;

  // 查询所有可编辑的块
  const editableQuery = `SELECT * FROM blocks WHERE type IN (${EDITABLE_BLOCK_TYPES.map(type => `'${type}'`).join(', ')})`;

  // 查询所有容器块
  const containerQuery = `SELECT * FROM blocks WHERE type IN (${CONTAINER_BLOCK_TYPES.map(type => `'${type}'`).join(', ')})`;

  console.log('文档查询:', documentQuery);
  console.log('可编辑块查询:', editableQuery);
  console.log('容器块查询:', containerQuery);
}

/**
 * 示例9: 条件渲染基于块类型
 */
export function exampleConditionalRendering(block: Block) {
  // 根据块类型决定渲染方式
  switch (block.type) {
    case BLOCK_TYPE.DOCUMENT:
      return renderDocumentBlock(block);
    case BLOCK_TYPE.CODE:
      return renderCodeBlock(block);
    case BLOCK_TYPE.TABLE:
      return renderTableBlock(block);
    case BLOCK_TYPE.AUDIO:
    case BLOCK_TYPE.VIDEO:
      return renderMediaBlock(block);
    default:
      return renderDefaultBlock(block);
  }
}

// 模拟渲染函数
function renderDocumentBlock(block: Block) {
  console.log('渲染文档块:', block.id);
}

function renderCodeBlock(block: Block) {
  console.log('渲染代码块:', block.id);
}

function renderTableBlock(block: Block) {
  console.log('渲染表格块:', block.id);
}

function renderMediaBlock(block: Block) {
  console.log('渲染媒体块:', block.id);
}

function renderDefaultBlock(block: Block) {
  console.log('渲染默认块:', block.id);
}

/**
 * 示例10: 类型安全的事件处理
 */
export function exampleEventHandling(block: Block, eventType: string) {
  // 只有在块可编辑时才处理输入事件
  if (eventType === 'input' && !isEditableBlock(block)) {
    console.warn('不可编辑的块不支持输入事件');
    return;
  }

  // 只有在块是容器时才处理子块相关事件
  if (eventType === 'childAdded' && !isContainerBlock(block)) {
    console.warn('非容器块不支持子块添加事件');
    return;
  }

  console.log(`处理 ${eventType} 事件，块类型: ${block.type}`);
}

// 导出所有示例函数供测试使用
export const examples = {
  exampleUsingConstants,
  exampleTypeGuards,
  exampleTypeAssertions,
  exampleSafeCasting,
  exampleBlockTypeInfo,
  exampleBlockGroups,
  exampleBatchProcessing,
  exampleSQLQueries,
  exampleConditionalRendering,
  exampleEventHandling,
};