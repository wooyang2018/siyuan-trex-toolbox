#!/usr/bin/env node
/**
 * 锚定文本端到端测试
 *
 * 验证链路: 标注选区 → 生成 anchor_text → extractSearchKey/stripInlineMd
 *           → 在渲染后纯文本中可匹配 (findRangeInFlat/findAnchorBlock 核心)
 *
 * 被测函数直接 import 源码 (非镜像)，确保测试与源码一致:
 *   - stripInlineMd / extractSearchKey / stripKramdownIAL / findSelectionOffsets
 *       ← src/func/audit-note/lib/markdown.ts
 *   - findRangeInFlat  ← src/func/audit-note/lib/range-match.ts
 *   - computeAnchor    ← src/func/audit-note/lib/anchor-core.ts
 *   - siyuanPost       ← scripts/debug-siyuan.mjs (端到端测试一环，复用其 API 调用能力)
 *
 * 运行: node --experimental-strip-types scripts/tests/test-anchor-e2e.ts
 */

import { stripInlineMd, extractSearchKey, stripKramdownIAL, findSelectionOffsets } from '../../src/func/audit-note/lib/markdown.ts';
import { findRangeInFlat } from '../../src/func/audit-note/lib/range-match.ts';
import { computeAnchor } from '../../src/func/audit-note/lib/anchor-core.ts';

const SIYUAN = process.env.SIYUAN_API || 'http://127.0.0.1:6806';

// SiYuan API 调用（测试工具，非被测函数，故自实现而非 import 源码）
async function siyuanPost(endpoint, payload = {}) {
  const res = await fetch(`${SIYUAN}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`API ${json.code}: ${json.msg}`);
  return json.data;
}

// ===================== 测试框架 =====================

let pass = 0, fail = 0;
const failures = [];

function ok(name) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
function bad(name, detail) {
  fail++; failures.push(`${name}: ${detail}`);
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`);
}
function assertEq(name, actual, expected) {
  if (actual === expected) ok(name);
  else bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(name, cond, detail = "") {
  if (cond) ok(name); else bad(name, detail || "expected true");
}
function assertIncludes(name, haystack, needle) {
  if (haystack && needle && haystack.includes(needle)) ok(name);
  else bad(name, `needle ${JSON.stringify(needle)} NOT in haystack ${JSON.stringify((haystack || "").slice(0, 80))}`);
}
/** 去除所有空白后比较 (整块锚定首行截断时, SiYuan 渲染会规范化 bold 后空格,
 *  SQL content 与 kramdown 的空白可能差异, 故按非空白字符序列验证定位能力) */
function assertIncludesNoWS(name, haystack, needle) {
  const h = (haystack || "").replace(/\s/g, "");
  const n = (needle || "").replace(/\s/g, "");
  if (h && n && h.includes(n)) ok(name);
  else bad(name, `needle(noWS) ${JSON.stringify(n)} NOT in haystack(noWS) ${JSON.stringify(h.slice(0, 80))}`);
}

// ===================== Part A: 纯函数边界 =====================

function partA() {
  console.log("\n\x1b[36mPart A: stripInlineMd / extractSearchKey 纯函数边界\x1b[0m");

  console.log("\n[A1] 行内标记剥离");
  assertEq("粗体 **x**", stripInlineMd("**bold**"), "bold");
  assertEq("斜体 *x*", stripInlineMd("*italic*"), "italic");
  assertEq("粗体 __x__", stripInlineMd("__bold__"), "bold");
  assertEq("斜体 _x_", stripInlineMd("_italic_"), "italic");
  assertEq("行内代码 `x`", stripInlineMd("`code`"), "code");
  assertEq("删除线 ~~x~~", stripInlineMd("~~del~~"), "del");
  assertEq("链接 [t](u)", stripInlineMd("[text](http://x)"), "text");
  assertEq("图片 ![a](u)", stripInlineMd("![alt](http://x)"), "alt");
  assertEq("转义 \\*", stripInlineMd("\\*"), "*");
  assertEq("标题 # x", stripInlineMd("# 标题"), "标题");
  assertEq("列表 - x", stripInlineMd("- 列表"), "列表");
  assertEq("引用 > x", stripInlineMd("> 引用"), "引用");
  assertEq("有序 1. x", stripInlineMd("1. 有序"), "有序");
  assertEq("用户例子 **三种检索对比**：向量", stripInlineMd("**三种检索对比**：向量(语义模糊匹配)"), "三种检索对比：向量(语义模糊匹配)");
  assertEq("混合 **粗**和*斜*及`code`", stripInlineMd("**粗**和*斜*及`code`"), "粗和斜及code");
  assertEq("空字符串", stripInlineMd(""), "");
  assertEq("纯文本无标记", stripInlineMd("hello world"), "hello world");
  assertEq("公式 score(d) 保留", stripInlineMd("score(d) = Σ 1/(k+rank_i(d))"), "score(d) = Σ 1/(k+rank_i(d))");
  assertEq("不配对 **未闭合 保留", stripInlineMd("**未闭合"), "**未闭合");
  assertEq("零宽空格去除", stripInlineMd("a\u200Bb\u200Bc"), "abc");

  console.log("\n[A2] 边界陷阱 (乘号/列表星号)");
  assertEq("乘号 a * b * c 保留星号", stripInlineMd("a * b * c"), "a * b * c");
  assertEq("乘号 2 * 3 = 6", stripInlineMd("2 * 3 = 6"), "2 * 3 = 6");
  assertEq("列表项 * item", stripInlineMd("* item"), "item");
  assertEq("无空格 a*b*c", stripInlineMd("a*b*c"), "abc");

  console.log("\n[A3] extractSearchKey 选区/整块");
  const wholeBlock = "**三种检索对比**：向量(语义模糊匹配)、关键词(精确专有名词)、图谱(多跳关系推理)。融合策略推荐RRF：score(d) = Σ 1/(k+rank_i(d))，无需校准分数尺度。\n\n{: id=\"x\" updated=\"y\"}\n\n第二段内容";
  const sk = extractSearchKey(wholeBlock);
  assertTrue("整块 searchKey 以纯文本开头", sk.startsWith("三种检索对比"), `got=${JSON.stringify(sk)}`);
  assertTrue("整块 searchKey 不含 **", !sk.includes("**"), `got=${JSON.stringify(sk)}`);
  assertTrue("整块 searchKey 截断 60", sk.length === 60, `len=${sk.length}`);
  assertEq("选中文本 **三种检索对比**", extractSearchKey("**三种检索对比**"), "三种检索对比");
  assertEq("首行过短回退下一行", extractSearchKey("a\n\n**三种检索对比**"), "三种检索对比");
  assertTrue("长文本截断 60", extractSearchKey("A".repeat(100)).length === 60);
  assertEq("空输入", extractSearchKey(""), "");
  assertEq("仅 IAL 行", extractSearchKey('{: id="x"}'), "");
}

// ===================== Part B: 跨节点 Range 映射 =====================

function partB() {
  console.log("\n\x1b[36mPart B: findRangeInFlat 跨文本节点映射 (源码纯函数)\x1b[0m");

  console.log("\n[B1] 跨 2 节点匹配 (模拟 <strong>x</strong>y)");
  let r = findRangeInFlat(["三种检索对比", "：向量(语义模糊匹配)"], "三种检索对比：向量");
  assertTrue("跨节点命中", !!r, "未命中");
  if (r) {
    assertEq("起始 idx=0", r.startIdx, 0);
    assertEq("起始偏移=0", r.startOffset, 0);
    assertEq("结束 idx=1", r.endIdx, 1);
    assertEq("结束偏移=3 (：向量)", r.endOffset, 3);
  }

  console.log("\n[B2] 单节点内匹配");
  r = findRangeInFlat(["hello world foo"], "world");
  assertTrue("单节点命中", !!r);
  if (r) {
    assertEq("startIdx=0", r.startIdx, 0);
    assertEq("startOffset=6", r.startOffset, 6);
    assertEq("endOffset=11", r.endOffset, 11);
  }

  console.log("\n[B3] 跨 3 节点匹配 (abbc 在 aabbcc 中, end exclusive)");
  r = findRangeInFlat(["aa", "bb", "cc"], "abbc");
  assertTrue("跨 3 节点命中", !!r);
  if (r) {
    assertEq("start 0:1", `${r.startIdx}:${r.startOffset}`, "0:1");
    assertEq("end 2:1", `${r.endIdx}:${r.endOffset}`, "2:1");
  }

  console.log("\n[B4] 未命中 → null");
  assertTrue("不存在返回 null", findRangeInFlat(["abc"], "xyz") === null);

  console.log("\n[B5] 末尾恰在节点边界");
  r = findRangeInFlat(["abc", "def"], "abcdef");
  assertTrue("边界命中", !!r);
  if (r) {
    assertEq("end idx=1", r.endIdx, 1);
    assertEq("endOffset=3", r.endOffset, 3);
  }

  console.log("\n[B6] 用户例子: 渲染后跨节点 + searchKey(60) 命中");
  const domNodes = [
    "三种检索对比",
    "：向量(语义模糊匹配)、关键词(精确专有名词)、图谱(多跳关系推理)。融合策略推荐RRF：score(d) = Σ 1/(k+rank_i(d))，无需校准分数尺度。",
  ];
  const searchKey = extractSearchKey("**三种检索对比**：向量(语义模糊匹配)、关键词(精确专有名词)、图谱(多跳关系推理)。融合策略推荐RRF：score(d)");
  r = findRangeInFlat(domNodes, searchKey);
  assertTrue("用户例子跨节点命中", !!r, `searchKey=${JSON.stringify(searchKey)}`);
  if (r) {
    assertTrue("起于节点0", r.startIdx === 0);
    assertTrue("止于节点1", r.endIdx === 1);
  }
}

// ===================== Part C: 真实 SiYuan 端到端 =====================

async function partC() {
  console.log("\n\x1b[36mPart C: 真实 SiYuan 文档端到端 (blocks.content 纯文本基准)\x1b[0m");

  try {
    await siyuanPost('/api/system/version', {});
  } catch (e) {
    console.log(`  \x1b[33m⚠ SiYuan 离线，跳过 Part C\x1b[0m`);
    return;
  }

  const queries = [
    { tag: "粗体 **", sql: "SELECT id, content, markdown FROM blocks WHERE type='p' AND markdown LIKE '%**%' AND length(markdown) BETWEEN 20 AND 400 LIMIT 3" },
    { tag: "链接 [t](u)", sql: "SELECT id, content, markdown FROM blocks WHERE type='p' AND markdown LIKE '%](http%' AND length(markdown) BETWEEN 20 AND 400 LIMIT 3" },
    { tag: "行内代码 `", sql: "SELECT id, content, markdown FROM blocks WHERE type='p' AND markdown LIKE '%`%' AND length(markdown) BETWEEN 20 AND 400 LIMIT 3" },
  ];

  for (const { tag, sql } of queries) {
    console.log(`\n[C] 标记类型: ${tag}`);
    let rows;
    try {
      rows = await siyuanPost('/api/query/sql', { stmt: sql });
    } catch (e) {
      console.log(`  \x1b[33m⚠ 查询失败: ${e.message}\x1b[0m`);
      continue;
    }
    if (!rows || !rows.length) {
      console.log(`  \x1b[33m⚠ 无匹配块\x1b[0m`);
      continue;
    }
    for (const row of rows) {
      await testRealBlock(row, tag);
    }
  }
}

async function testRealBlock(row, tag) {
  const { id, content, markdown } = row;
  const label = `${tag} [${String(id).slice(-6)}]`;

  let kramdown;
  try {
    const data = await siyuanPost('/api/block/getBlockKramdown', { id });
    kramdown = data?.kramdown || '';
  } catch (e) {
    console.log(`  \x1b[33m⚠ ${label} 获取 kramdown 失败: ${e.message}\x1b[0m`);
    return;
  }
  if (!kramdown) {
    console.log(`  \x1b[33m⚠ ${label} kramdown 为空\x1b[0m`);
    return;
  }

  // 场景 1: 整块锚定
  const rawMd = stripKramdownIAL(kramdown);
  const anchorWhole = computeAnchor(rawMd, 0, rawMd.length);
  assertTrue(`${label} 整块 before/after 为空`, !anchorWhole.anchor_before && !anchorWhole.anchor_after);
  const sk1 = extractSearchKey(anchorWhole.anchor_text);
  assertIncludesNoWS(`${label} 整块 searchKey 命中 content`, content, sk1);

  // 场景 2: 选中文本锚定
  const markMatch = kramdown.match(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|~~[^~]+~~)/);
  if (markMatch) {
    const selectedText = markMatch[0];
    const { selStart, selEnd } = findSelectionOffsets(kramdown, selectedText);
    if (selStart < selEnd) {
      const anchorSel = computeAnchor(kramdown, selStart, selEnd);
      assertTrue(`${label} 选中锚定 before/after 非空`, anchorSel.anchor_before || anchorSel.anchor_after);
      const sk2 = extractSearchKey(anchorSel.anchor_text);
      assertIncludes(`${label} 选中 searchKey 命中 content`, content, sk2);
    } else {
      console.log(`  \x1b[33m⚠ ${label} 选区定位失败，跳过\x1b[0m`);
    }
  } else {
    console.log(`  \x1b[33m⚠ ${label} 未找到标记片段，跳过选中测试\x1b[0m`);
  }
}

// ===================== 主入口 =====================

async function main() {
  console.log("\x1b[1m锚定文本端到端测试 (直接 import 源码)\x1b[0m");
  partA();
  partB();
  await partC();

  console.log("\n\x1b[1m──────── 汇总 ────────\x1b[0m");
  console.log(`  \x1b[32m通过: ${pass}\x1b[0m  \x1b[31m失败: ${fail}\x1b[0m`);
  if (fail > 0) {
    console.log("\n\x1b[31m失败明细:\x1b[0m");
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("\n\x1b[32m全部通过 ✓\x1b[0m");
  }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
