#!/usr/bin/env node
/**
 * SRS 核心功能 E2E 测试 — 覆盖核心行为点
 *
 * FSRS 已移除，调度改用原生 reviewRiffCard API。
 *
 * Part A — 设置结构验证（无 FSRS 字段）
 * Part B — 每日限制跨会话生效（reviewsPerDay / newPerDay）
 * Part C — dayStartHour 用于每日限制计数
 * Part D — 闪卡地图任务筛选器边界
 * Part E — 批量操作确认逻辑
 * Part F — 闪卡地图 ClozeText 解析正确性
 * Part G — 闪卡地图选择题作答与正误判定
 * Part H — 新卡每日限制（log.state = pre-review）
 *
 * 运行: node --experimental-strip-types scripts/tests/test-srs-core-e2e.ts
 */

// ===================== 测试框架 =====================

let pass = 0;
let fail = 0;
let skipCount = 0;
const failures: string[] = [];

function ok(name: string) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
function bad(name: string, detail: string) { fail++; failures.push(`${name}: ${detail}`); console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`); }
function skip(name: string, detail: string) { skipCount++; console.log(`  \x1b[33m⚠\x1b[0m ${name}: ${detail}`); }
function assertEq(name: string, actual: unknown, expected: unknown) { if (actual === expected) ok(name); else bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function assertTrue(name: string, cond: unknown, detail = 'expected true') { if (cond) ok(name); else bad(name, detail); }
function assertFalse(name: string, cond: unknown, detail = 'expected false') { if (!cond) ok(name); else bad(name, detail); }
function assertEqLen(name: string, arr: unknown[], expected: number) { if (arr.length === expected) ok(name); else bad(name, `expected length ${expected}, got ${arr.length}`); }
function assertIncludes(name: string, haystack: string, needle: string) { if (haystack.includes(needle)) ok(name); else bad(name, `needle ${JSON.stringify(needle)} not found`); }

// ===================== 源码镜像：设置 / 类型 =====================

interface SRSSettings {
  requestRetention: number;
  maximumInterval: number;
  newPerDay: number;
  reviewsPerDay: number;
  dayStartHour: number;
  autoPostpone: boolean;
  autoSort: boolean;
  riffcardSync: boolean;
  riffcardDeckId: string;
}

const DEFAULT_SRS_SETTINGS: SRSSettings = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  newPerDay: 20,
  reviewsPerDay: 200,
  dayStartHour: 4,
  autoPostpone: false,
  autoSort: false,
  riffcardSync: false,
  riffcardDeckId: '',
};

type CardState = 'new' | 'learning' | 'review' | 'relearning';

interface SRSCard {
  id: string; blockId: string; rootId: string; type: string; deckId: string;
  front: string; back: string; stability: number; difficulty: number;
  lastReview: number; nextReview: number; reps: number; lapses: number;
  state: CardState; tags: string[]; createdAt: number; updatedAt: number;
}

// ===================== 源码镜像：到期判定 =====================

function isCardDue(card: SRSCard, _dayStartHour: number): boolean {
  return card.nextReview <= Date.now() || card.state === 'new';
}

// ===================== 源码镜像：队列构建 =====================

function buildRetrievalQueue(
  cards: SRSCard[], settings: SRSSettings, todayReviewed?: { review: number; new: number },
): string[] {
  const dueCards = cards.filter(c => isCardDue(c, settings.dayStartHour));
  const reviewedToday = todayReviewed ?? { review: 0, new: 0 };
  const remainingReviewSlots = Math.max(0, settings.reviewsPerDay - reviewedToday.review);
  const remainingNewSlots = Math.max(0, settings.newPerDay - reviewedToday.new);
  const reviewCards = dueCards.filter(c => c.state !== 'new').sort((a, b) => a.nextReview - b.nextReview).slice(0, remainingReviewSlots);
  const newCards = dueCards.filter(c => c.state === 'new').slice(0, remainingNewSlots);
  return [...reviewCards.map(c => c.id), ...newCards.map(c => c.id)];
}

// ===================== 源码镜像：筛选器 =====================

function filterCards(cards: SRSCard[], filter: {
  task?: 'all' | 'due' | 'new' | 'learning' | 'lapseRisk';
  deckId?: string; cardType?: string; dueOnly?: boolean; search?: string;
}): SRSCard[] {
  let result = cards;
  if (filter.deckId) result = result.filter(c => c.deckId === filter.deckId);
  if (filter.task === 'due') result = result.filter(c => isCardDue(c, 4));
  if (filter.task === 'new') result = result.filter(c => c.state === 'new');
  if (filter.task === 'learning') result = result.filter(c => c.state === 'learning' || c.state === 'relearning');
  if (filter.task === 'lapseRisk') result = result.filter(c => c.lapses >= 2 || c.state === 'relearning');
  if (filter.cardType) result = result.filter(c => c.type === filter.cardType);
  if (filter.dueOnly) result = result.filter(c => isCardDue(c, 4));
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q));
  }
  return result;
}

// ===================== 源码镜像：ClozeText 解析 =====================

interface ClozeSegment { type: 'plain' | 'hole'; content: string; }

function parseClozeSegments(text: string): ClozeSegment[] {
  const segments: ClozeSegment[] = [];
  const regex = /==(.+?)==/g;
  let lastIndex = 0; let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'plain', content: text.slice(lastIndex, match.index) });
    segments.push({ type: 'hole', content: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) segments.push({ type: 'plain', content: text.slice(lastIndex) });
  return segments;
}

// ===================== 测试辅助 =====================

let cardCounter = 0;
function makeCard(overrides: Partial<SRSCard> = {}): SRSCard {
  const now = Date.now(); const id = overrides.id || `test-card-${++cardCounter}`;
  return { id, blockId: `block-${id}`, rootId: `root-${id}`, type: 'qa', deckId: 'default', front: `Front ${id}`, back: `Back ${id}`, stability: 0, difficulty: 0, lastReview: 0, nextReview: now, reps: 0, lapses: 0, state: 'new', tags: [], createdAt: now, updatedAt: now, ...overrides };
}
function makeDueReviewCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return makeCard({ state: 'review', nextReview: Date.now() - 3600_000, stability: 5, difficulty: 3, lastReview: Date.now() - 86400_000, reps: 3, lapses: 0, ...overrides });
}
function makeFutureCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return makeCard({ state: 'review', nextReview: Date.now() + 86400_000, stability: 10, difficulty: 3, lastReview: Date.now(), reps: 5, lapses: 0, ...overrides });
}

// ===================== Part A: 设置结构验证 =====================

function partA() {
  console.log('\n\x1b[36mPart A: 设置结构验证（FSRS 已移除）\x1b[0m');
  const settings = DEFAULT_SRS_SETTINGS;
  assertTrue('设置不含 fsrsParams', !('fsrsParams' in settings));
  assertTrue('设置不含 enableFuzz', !('enableFuzz' in settings));
  assertTrue('设置不含 enableShortTerm', !('enableShortTerm' in settings));
  assertTrue('设置不含 learningSteps', !('learningSteps' in settings));
  assertTrue('设置不含 relearningSteps', !('relearningSteps' in settings));
  assertTrue('设置含 reviewsPerDay', 'reviewsPerDay' in settings);
  assertTrue('设置含 newPerDay', 'newPerDay' in settings);
  assertTrue('设置含 dayStartHour', 'dayStartHour' in settings);
  assertEq('reviewsPerDay 默认 200', settings.reviewsPerDay, 200);
  assertEq('newPerDay 默认 20', settings.newPerDay, 20);
}

// ===================== Part B: 每日限制跨会话生效 =====================

function partB() {
  console.log('\n\x1b[36mPart B: 每日限制跨会话生效\x1b[0m');
  const settings = { ...DEFAULT_SRS_SETTINGS, reviewsPerDay: 10, newPerDay: 5 };
  const cards = Array.from({ length: 50 }, (_, i) => makeDueReviewCard({ id: `review-${i}`, nextReview: Date.now() - (i + 1) * 1000 }));
  assertEqLen('第一次会话: 10 张 review 卡', buildRetrievalQueue(cards, settings, { review: 0, new: 0 }), 10);
  assertEqLen('第二次会话同日: 0 张（限制已用尽）', buildRetrievalQueue(cards, settings, { review: 10, new: 0 }), 0);
  assertEqLen('第三次会话同日（已复习5）: 5 张剩余', buildRetrievalQueue(cards, settings, { review: 5, new: 0 }), 5);
  const newCards = Array.from({ length: 30 }, (_, i) => makeCard({ id: `new-${i}`, state: 'new', nextReview: Date.now() }));
  assertEqLen('新卡第一次会话: 5 张', buildRetrievalQueue(newCards, settings, { review: 0, new: 0 }), 5);
  assertEqLen('新卡第二次会话同日: 0 张', buildRetrievalQueue(newCards, settings, { review: 0, new: 5 }), 0);
  const mixed = [...cards.slice(0, 20), ...newCards.slice(0, 10)];
  assertEqLen('混合场景: review 剩余7 + new 剩余3 = 10', buildRetrievalQueue(mixed, settings, { review: 3, new: 2 }), 10);
  assertEqLen('默认无追踪: 全量限制 10 张', buildRetrievalQueue(cards, settings), 10);
}

// ===================== Part C: dayStartHour 用于每日限制计数 =====================

function partC() {
  console.log('\n\x1b[36mPart C: dayStartHour 用于每日限制计数（不影响单卡到期）\x1b[0m');
  const dueCard = makeDueReviewCard({ nextReview: Date.now() - 3600_000 });
  assertTrue('到期卡: dayStartHour=4 时到期', isCardDue(dueCard, 4));
  assertTrue('到期卡: dayStartHour=0 时到期', isCardDue(dueCard, 0));
  const futureCard = makeCard({ state: 'review', nextReview: Date.now() + 3600_000, stability: 5, difficulty: 3, lastReview: Date.now() - 86400_000, reps: 3 });
  assertFalse('未到期卡: 不到期', isCardDue(futureCard, 4));
  const newCard = makeCard({ state: 'new', nextReview: Date.now() + 86400_000 });
  assertTrue('新卡始终到期: dayStartHour=4', isCardDue(newCard, 4));
  assertTrue('新卡始终到期: dayStartHour=0', isCardDue(newCard, 0));
  const cards = [makeDueReviewCard({ id: 'due-1', nextReview: Date.now() - 100 }), makeFutureCard({ id: 'future-1', nextReview: Date.now() + 100 })];
  assertEq('不同 dayStartHour 到期判定一致', cards.filter(c => isCardDue(c, 0)).length, cards.filter(c => isCardDue(c, 4)).length);
}

// ===================== Part D: 闪卡地图 — 任务筛选器 =====================

function partD() {
  console.log('\n\x1b[36mPart D: 闪卡地图 — 任务筛选器边界\x1b[0m');
  const cards: SRSCard[] = [
    makeCard({ id: 'new-a', state: 'new', deckId: 'deck-a', tags: ['geo'], type: 'cloze' }),
    makeCard({ id: 'new-b', state: 'new', deckId: 'deck-a', tags: ['math'], type: 'formula' }),
    makeDueReviewCard({ id: 'due-a', deckId: 'deck-b', tags: ['geo'], type: 'qa', nextReview: Date.now() - 2000 }),
    makeDueReviewCard({ id: 'due-b', deckId: 'deck-b', tags: ['risk'], type: 'cloze', lapses: 3, nextReview: Date.now() - 1000, front: 'risk question due-b' }),
    makeCard({ id: 'learning-a', state: 'learning', deckId: 'deck-a', tags: ['math'], nextReview: Date.now() + 86400_000 }),
    makeCard({ id: 'relearning-a', state: 'relearning', deckId: 'deck-b', tags: ['risk'], lapses: 2, nextReview: Date.now() + 86400_000, front: 'risk question relearning-a' }),
    makeFutureCard({ id: 'future-a', deckId: 'deck-a', tags: ['geo'] }),
  ];
  assertEq('筛选: 全部', filterCards(cards, { task: 'all' }).length, cards.length);
  assertEq('筛选: 到期', filterCards(cards, { task: 'due' }).length, 4);
  assertEq('筛选: 新卡', filterCards(cards, { task: 'new' }).length, 2);
  assertEq('筛选: 学习中', filterCards(cards, { task: 'learning' }).length, 2);
  assertEq('筛选: 遗忘风险', filterCards(cards, { task: 'lapseRisk' }).length, 2);
  assertEq('组合筛选: deck-a + cloze', filterCards(cards, { deckId: 'deck-a', cardType: 'cloze' }).length, 1);
  assertEq('组合筛选: deck-b + risk search', filterCards(cards, { deckId: 'deck-b', search: 'risk' }).length, 2);
  assertEq('空数组筛选', filterCards([], { task: 'all' }).length, 0);
  assertEq('无匹配 deckId', filterCards(cards, { deckId: 'nonexistent' }).length, 0);
  assertEq('无匹配搜索', filterCards(cards, { search: 'zzzznotfound' }).length, 0);
}

// ===================== Part E: 批量操作确认逻辑 =====================

function partE() {
  console.log('\n\x1b[36mPart E: 批量操作确认逻辑\x1b[0m');
  function shouldConfirmDelete(selectedCount: number): boolean { return selectedCount > 0; }
  assertTrue('删除: 5 张选中 → 需确认', shouldConfirmDelete(5));
  assertFalse('删除: 0 张选中 → 不需确认', shouldConfirmDelete(0));
}

// ===================== Part F: 闪卡地图 — ClozeText 解析 =====================

function partF() {
  console.log('\n\x1b[36mPart F: 闪卡地图 — ClozeText 解析正确性\x1b[0m');
  const single = parseClozeSegments('地球半径 ==6371== 公里');
  assertEqLen('单挖空: 3 段', single, 3);
  assertEq('单挖空: 第2段 hole', single[1].type, 'hole');
  assertEq('单挖空: 第2段内容', single[1].content, '6371');
  const multi = parseClozeSegments('==北京==是首都，==上海==是经济中心');
  assertEqLen('多挖空: 4 段', multi, 4);
  assertEq('多挖空: 第1段内容', multi[0].content, '北京');
  assertEq('多挖空: 第3段内容', multi[2].content, '上海');
  assertEqLen('无挖空: 1 段', parseClozeSegments('普通文本'), 1);
  assertEqLen('空字符串: 0 段', parseClozeSegments(''), 0);
  const adjacent = parseClozeSegments('==a====b==');
  assertEqLen('相邻挖空: 2 段', adjacent, 2);
  assertEq('相邻挖空: 第1段内容', adjacent[0].content, 'a');
}

// ===================== Part G: 闪卡地图 — 选择题作答 =====================

function partG() {
  console.log('\n\x1b[36mPart G: 闪卡地图 — 选择题作答与正误判定\x1b[0m');
  interface ChoiceOption { label: string; text: string; correct: boolean; }
  function checkSingleChoice(selected: Set<string>, options: ChoiceOption[]): boolean {
    const correctLabels = options.filter(o => o.correct).map(o => o.label);
    return selected.size === 1 && correctLabels.length === 1 && selected.has(correctLabels[0]);
  }
  function checkMultiChoice(selected: Set<string>, options: ChoiceOption[]): boolean {
    const correctLabels = new Set(options.filter(o => o.correct).map(o => o.label));
    return selected.size === correctLabels.size && [...selected].every(l => correctLabels.has(l));
  }
  const singleOpts: ChoiceOption[] = [
    { label: 'A', text: '6371', correct: true }, { label: 'B', text: '7371', correct: false }, { label: 'C', text: '5371', correct: false },
  ];
  assertTrue('单选: 选 A 正确', checkSingleChoice(new Set(['A']), singleOpts));
  assertFalse('单选: 选 B 错误', checkSingleChoice(new Set(['B']), singleOpts));
  assertFalse('单选: 空选错误', checkSingleChoice(new Set(), singleOpts));
  const multiOpts: ChoiceOption[] = [
    { label: 'A', text: '北京', correct: true }, { label: 'B', text: '上海', correct: true }, { label: 'C', text: '广州', correct: false }, { label: 'D', text: '深圳', correct: false },
  ];
  assertTrue('多选: 选 AB 正确', checkMultiChoice(new Set(['A', 'B']), multiOpts));
  assertFalse('多选: 选 A 不全错误', checkMultiChoice(new Set(['A']), multiOpts));
  assertFalse('多选: 选 ABC 错误', checkMultiChoice(new Set(['A', 'B', 'C']), multiOpts));
}

// ===================== Part H: 新卡每日限制 =====================

function partH() {
  console.log('\n\x1b[36mPart H: 新卡每日限制（log.state = pre-review）\x1b[0m');
  // log.state = pre-review state → new card reviewed today counts as 'new'
  const simulatedLogs = [
    { cardId: 'c1', state: 'new', timestamp: Date.now() - 1000 },
    { cardId: 'c2', state: 'new', timestamp: Date.now() - 2000 },
    { cardId: 'c3', state: 'new', timestamp: Date.now() - 3000 },
    { cardId: 'c4', state: 'review', timestamp: Date.now() - 4000 },
  ];
  assertEq('今日已复习新卡数 = 3', simulatedLogs.filter(l => l.state === 'new').length, 3);
  assertEq('今日已复习复习卡数 = 1', simulatedLogs.filter(l => l.state !== 'new').length, 1);
  const settings = { ...DEFAULT_SRS_SETTINGS, newPerDay: 5, reviewsPerDay: 200 };
  const newCards = Array.from({ length: 20 }, (_, i) => makeCard({ id: `new-${i}`, state: 'new', nextReview: Date.now() }));
  assertEqLen('新卡限制: 已复习3 + 限制5 → 队列2张', buildRetrievalQueue(newCards, settings, { review: 0, new: 3 }), 2);
  const limit3 = { ...settings, newPerDay: 3 };
  assertEqLen('新卡限制: 已复习3 + 限制3 → 队列0张', buildRetrievalQueue(newCards, limit3, { review: 0, new: 3 }), 0);
}

// ===================== 主入口 =====================

async function main() {
  console.log('\x1b[1m════════════ SRS 核心功能 E2E 测试 ════════════\x1b[0m');
  console.log('  覆盖: 提取练习 / 闪卡地图（FSRS 已移除）');
  partA(); partB(); partC(); partD(); partE(); partF(); partG(); partH();
  console.log('\n\x1b[1m════════════ 测试汇总 ════════════\x1b[0m');
  console.log(`  \x1b[32m${pass} 通过\x1b[0m, \x1b[31m${fail} 失败\x1b[0m, \x1b[33m${skipCount} 跳过\x1b[0m`);
  if (failures.length > 0) { console.log('\n  \x1b[31m失败详情:\x1b[0m'); for (const f of failures) console.log(`    \x1b[31m✗ ${f}\x1b[0m`); }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error('\x1b[31m测试运行失败:\x1b[0m', err); process.exit(1); });
