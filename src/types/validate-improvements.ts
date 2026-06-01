/**
 * BlockType 改进验证脚本
 * 验证所有改进功能是否正常工作
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
  EDITABLE_BLOCK_TYPES,
  CONTAINER_BLOCK_TYPES,
  MEDIA_BLOCK_TYPES,
} from './block-type-enhance';

import type { Block } from './index';

/**
 * 验证常量定义
 */
function validateConstants() {
  console.log('🔍 验证常量定义...');

  // 验证所有常量值
  const expectedValues = {
    DOCUMENT: 'd',
    HEADING: 'h',
    PARAGRAPH: 'p',
    LIST: 'l',
    LIST_ITEM: 'i',
    CODE: 'c',
    TABLE: 't',
    MATH: 'm',
    BLOCKQUOTE: 'b',
    FOOTNOTE: 'f',
    SUPER_BLOCK: 's',
    ATTRIBUTE_VIEW: 'av',
    TABLE_BLOCK: 'tb',
    WIDGET: 'widget',
    IFRAME: 'iframe',
    AUDIO: 'audio',
    VIDEO: 'video',
    QUERY_EMBED: 'query_embed',
    HTML: 'html',
  };

  let allPassed = true;
  for (const [key, expected] of Object.entries(expectedValues)) {
    const actual = BLOCK_TYPE[key as keyof typeof BLOCK_TYPE];
    if (actual === expected) {
      console.log(`✅ ${key}: ${actual}`);
    } else {
      console.log(`❌ ${key}: 期望 ${expected}, 实际 ${actual}`);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * 验证名称映射
 */
function validateNameMappings() {
  console.log('\n🔍 验证名称映射...');

  // 测试几个关键类型的映射
  const testCases = [
    { type: BLOCK_TYPE.DOCUMENT, expectedCN: '文档', expectedEN: 'Document' },
    { type: BLOCK_TYPE.CODE, expectedCN: '代码', expectedEN: 'Code' },
    { type: BLOCK_TYPE.TABLE, expectedCN: '表格', expectedEN: 'Table' },
    { type: BLOCK_TYPE.AUDIO, expectedCN: '音频', expectedEN: 'Audio' },
  ];

  let allPassed = true;
  for (const testCase of testCases) {
    const actualCN = BLOCK_TYPE_NAME_CN[testCase.type];
    const actualEN = BLOCK_TYPE_NAME_EN[testCase.type];

    if (actualCN === testCase.expectedCN && actualEN === testCase.expectedEN) {
      console.log(`✅ ${testCase.type}: ${actualCN} / ${actualEN}`);
    } else {
      console.log(`❌ ${testCase.type}: 期望 ${testCase.expectedCN}/${testCase.expectedEN}, 实际 ${actualCN}/${actualEN}`);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * 验证类型守卫函数
 */
function validateTypeGuards() {
  console.log('\n🔍 验证类型守卫函数...');

  const documentBlock: Block = createTestBlock('d');
  const codeBlock: Block = createTestBlock('c');
  const audioBlock: Block = createTestBlock('audio');

  let allPassed = true;

  // 测试文档块检测
  if (isDocumentBlock(documentBlock) && !isDocumentBlock(codeBlock)) {
    console.log('✅ 文档块检测正确');
  } else {
    console.log('❌ 文档块检测错误');
    allPassed = false;
  }

  // 测试代码块检测
  if (isCodeBlock(codeBlock) && !isCodeBlock(documentBlock)) {
    console.log('✅ 代码块检测正确');
  } else {
    console.log('❌ 代码块检测错误');
    allPassed = false;
  }

  // 测试媒体块检测
  if (isMediaBlock(audioBlock) && !isMediaBlock(documentBlock)) {
    console.log('✅ 媒体块检测正确');
  } else {
    console.log('❌ 媒体块检测错误');
    allPassed = false;
  }

  // 测试可编辑性检测
  if (isEditableBlock(documentBlock) && isEditableBlock(codeBlock) && !isEditableBlock(audioBlock)) {
    console.log('✅ 可编辑性检测正确');
  } else {
    console.log('❌ 可编辑性检测错误');
    allPassed = false;
  }

  // 测试容器性检测
  if (isContainerBlock(documentBlock) && !isContainerBlock(codeBlock)) {
    console.log('✅ 容器性检测正确');
  } else {
    console.log('❌ 容器性检测错误');
    allPassed = false;
  }

  return allPassed;
}

/**
 * 验证类型信息获取
 */
function validateTypeInfo() {
  console.log('\n🔍 验证类型信息获取...');

  const docInfo = getBlockTypeInfo('d');
  const codeInfo = getBlockTypeInfo('c');

  let allPassed = true;

  // 验证文档块信息
  if (docInfo.nameCN === '文档' && docInfo.nameEN === 'Document' && docInfo.editable && docInfo.container) {
    console.log('✅ 文档块信息正确');
  } else {
    console.log('❌ 文档块信息错误');
    allPassed = false;
  }

  // 验证代码块信息
  if (codeInfo.nameCN === '代码' && codeInfo.nameEN === 'Code' && codeInfo.editable && !codeInfo.container) {
    console.log('✅ 代码块信息正确');
  } else {
    console.log('❌ 代码块信息错误');
    allPassed = false;
  }

  // 验证描述信息
  const docDescription = getBlockTypeDescription('d');
  const codeDescription = getBlockTypeDescription('c');

  if (docDescription.includes('文档块') && codeDescription.includes('代码块')) {
    console.log('✅ 类型描述正确');
  } else {
    console.log('❌ 类型描述错误');
    allPassed = false;
  }

  return allPassed;
}

/**
 * 验证安全类型转换
 */
function validateSafeCasting() {
  console.log('\n🔍 验证安全类型转换...');

  const documentBlock: Block = createTestBlock('d');
  const codeBlock: Block = createTestBlock('c');

  let allPassed = true;

  // 测试成功转换
  const castedDocument = safeCastBlock(documentBlock, BLOCK_TYPE.DOCUMENT);
  if (castedDocument !== null && castedDocument.type === 'd') {
    console.log('✅ 文档块转换成功');
  } else {
    console.log('❌ 文档块转换失败');
    allPassed = false;
  }

  // 测试失败转换
  const castedCode = safeCastBlock(documentBlock, BLOCK_TYPE.CODE);
  if (castedCode === null) {
    console.log('✅ 文档块误转为代码块检测正确');
  } else {
    console.log('❌ 文档块误转为代码块检测错误');
    allPassed = false;
  }

  return allPassed;
}

/**
 * 验证类型集合
 */
function validateTypeCollections() {
  console.log('\n🔍 验证类型集合...');

  let allPassed = true;

  // 验证可编辑类型集合
  if (EDITABLE_BLOCK_TYPES.includes('d') && EDITABLE_BLOCK_TYPES.includes('c') && !EDITABLE_BLOCK_TYPES.includes('audio')) {
    console.log('✅ 可编辑类型集合正确');
  } else {
    console.log('❌ 可编辑类型集合错误');
    allPassed = false;
  }

  // 验证容器类型集合
  if (CONTAINER_BLOCK_TYPES.includes('d') && !CONTAINER_BLOCK_TYPES.includes('c')) {
    console.log('✅ 容器类型集合正确');
  } else {
    console.log('❌ 容器类型集合错误');
    allPassed = false;
  }

  // 验证媒体类型集合
  if (MEDIA_BLOCK_TYPES.includes('audio') && MEDIA_BLOCK_TYPES.includes('video') && !MEDIA_BLOCK_TYPES.includes('d')) {
    console.log('✅ 媒体类型集合正确');
  } else {
    console.log('❌ 媒体类型集合错误');
    allPassed = false;
  }

  return allPassed;
}

/**
 * 创建测试块
 */
function createTestBlock(type: string): Block {
  return {
    id: 'test-id',
    root_id: 'root-id',
    hash: 'test-hash',
    box: 'test-box',
    path: '/test/path',
    hpath: '/test/hpath',
    name: '测试块',
    alias: '',
    memo: '',
    tag: '',
    content: '测试内容',
    markdown: '测试markdown',
    length: 10,
    type: type as any,
    subtype: 'other',
    sort: 0,
    created: '2024-01-01',
    updated: '2024-01-01',
  };
}

/**
 * 运行所有验证
 */
function runAllValidations() {
  console.log('🚀 开始 BlockType 改进验证...\n');

  const results = [
    { name: '常量定义', passed: validateConstants() },
    { name: '名称映射', passed: validateNameMappings() },
    { name: '类型守卫', passed: validateTypeGuards() },
    { name: '类型信息', passed: validateTypeInfo() },
    { name: '安全转换', passed: validateSafeCasting() },
    { name: '类型集合', passed: validateTypeCollections() },
  ];

  console.log('\n📊 验证结果汇总:');
  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✅ ${result.name}: 通过`);
      totalPassed++;
    } else {
      console.log(`❌ ${result.name}: 失败`);
      totalFailed++;
    }
  }

  console.log(`\n🎯 总计: ${totalPassed} 项通过, ${totalFailed} 项失败`);

  if (totalFailed === 0) {
    console.log('\n🎉 所有验证通过！BlockType 改进成功完成。');
    console.log('\n✨ 改进总结:');
    console.log('- ✅ 详细的类型注释和文档说明');
    console.log('- ✅ 类型映射常量提高可读性');
    console.log('- ✅ 类型守卫函数增强类型安全');
    console.log('- ✅ 类型信息获取工具函数');
    console.log('- ✅ 安全类型转换和断言');
    console.log('- ✅ 类型集合和分组功能');
    console.log('- ✅ 完全向后兼容');
  } else {
    console.log('\n⚠️  部分验证失败，请检查实现。');
  }
}

// 直接运行验证
runAllValidations();

export { runAllValidations };