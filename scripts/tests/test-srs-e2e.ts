#!/usr/bin/env node
/**
 * SRS 统一插件端到端测试
 *
 * 合并原 test-srs-e2e / test-srs-cards-e2e / test-srs-native-e2e /
 * test-srs-queues-e2e。当前 SRS 对外只提供：提取练习、卡包管理、闪卡地图。
 *
 * 覆盖范围：
 *   Part A — FSRS v6 调度基础
 *   Part B — 内部卡片解析器边界
 *   Part C — 提取练习队列与卡包任务筛选
 *   Part D — 原生 riffcard 投影模型
 *   Part E — SiYuan 文件 API 安全探针（不写 srs-cards.json / srs-settings.json）
 *   Part F — 插件部署产物探针
 *   Part G — SiYuan 块 API 与解析器集成
 *   Part H — 原生 riffcard 只读集成
 *
 * 运行: node --experimental-strip-types scripts/tests/test-srs-e2e.ts
 */

import { fsrs, Rating, State, generatorParameters, createEmptyCard } from 'ts-fsrs';

const SIYUAN = process.env.SIYUAN_API || 'http://127.0.0.1:6806';
const TOKEN = process.env.SIYUAN_TOKEN || '';
const PLUGIN_NAME = process.env.SIYUAN_PLUGIN_NAME || 'siyuan-trex-toolbox';
const PLUGIN_STORAGE = `/data/storage/petal/${PLUGIN_NAME}`;
const REMOTE_BASE = `/data/plugins/${PLUGIN_NAME}`;
const REMOTE_ENABLED = process.env.SRS_E2E_REMOTE !== '0';

// ===================== 测试框架 =====================

let pass = 0;
let fail = 0;
let skipCount = 0;
const failures: string[] = [];

function ok(name: string) {
  pass++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}

function bad(name: string, detail: string) {
  fail++;
  failures.push(`${name}: ${detail}`);
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${detail}\x1b[0m`);
}

function skip(name: string, detail: string) {
  skipCount++;
  console.log(`  \x1b[33m⚠\x1b[0m ${name}: ${detail}`);
}

function assertEq(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) ok(name);
  else bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertTrue(name: string, cond: unknown, detail = 'expected true') {
  if (cond) ok(name);
  else bad(name, detail);
}

function assertFalse(name: string, cond: unknown, detail = 'expected false') {
  if (!cond) ok(name);
  else bad(name, detail);
}

function assertGte(name: string, actual: number, expected: number) {
  if (actual >= expected) ok(name);
  else bad(name, `expected ${actual} >= ${expected}`);
}

function assertLte(name: string, actual: number, expected: number) {
  if (actual <= expected) ok(name);
  else bad(name, `expected ${actual} <= ${expected}`);
}

function assertEqLen(name: string, arr: unknown[], expected: number) {
  if (arr.length === expected) ok(name);
  else bad(name, `expected length ${expected}, got ${arr.length}: ${JSON.stringify(arr)}`);
}

function assertIncludes(name: string, haystack: string, needle: string) {
  if (haystack.includes(needle)) ok(name);
  else bad(name, `needle ${JSON.stringify(needle)} not found in haystack len=${haystack.length}`);
}

function assertArrayEq(name: string, actual: unknown[], expected: unknown[]) {
  const same = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  if (same) ok(name);
  else bad(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function runRemotePart(name: string, fn: () => Promise<void>) {
  if (!REMOTE_ENABLED) {
    skip(name, 'SRS_E2E_REMOTE=0');
    return;
  }
  if (!TOKEN) {
    skip(name, '未设置 SIYUAN_TOKEN，跳过远程 SiYuan 集成部分');
    return;
  }
  try {
    await fn();
  } catch (err) {
    skip(name, (err as Error).message || String(err));
  }
}

// ===================== SiYuan API 工具 =====================

async function siyuanPost(endpoint: string, payload: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${SIYUAN}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${TOKEN}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json() as { code: number; msg: string; data: unknown };
  if (json.code !== 0) throw new Error(`API ${endpoint} ${json.code}: ${json.msg}`);
  return json.data;
}

async function sql(stmt: string): Promise<any[]> {
  const rows = await siyuanPost('/api/query/sql', { stmt });
  return Array.isArray(rows) ? rows : [];
}

async function siyuanGetFile(path: string): Promise<string | null> {
  const res = await fetch(`${SIYUAN}/api/file/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${TOKEN}` },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) return null;
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json.code !== undefined) {
      if (json.code !== 0) return null;
      return typeof json.data === 'string' ? json.data : JSON.stringify(json.data);
    }
  } catch { /* raw text */ }
  return text;
}

async function siyuanPutFile(path: string, content: string): Promise<void> {
  const formData = new FormData();
  formData.append('path', path);
  formData.append('isDir', 'false');
  formData.append('file', new Blob([content], { type: 'application/json' }), 'data.json');
  const res = await fetch(`${SIYUAN}/api/file/putFile`, {
    method: 'POST',
    headers: { Authorization: `Token ${TOKEN}` },
    body: formData,
  });
  const text = await res.text();
  const json = JSON.parse(text) as { code: number; msg: string };
  if (json.code !== 0) throw new Error(`putFile ${json.code}: ${json.msg}`);
}

async function siyuanDeleteFile(path: string): Promise<void> {
  try { await siyuanPost('/api/file/removeFile', { path }); } catch { /* ignore */ }
}

async function getRiffDecks(): Promise<any[]> {
  const result = await siyuanPost('/api/riff/getRiffDecks', {});
  return Array.isArray(result) ? result : (result?.decks ?? []);
}

function normalizeRiffBlocks(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.cards)) return result.cards;
  if (Array.isArray(result?.blocks)) return result.blocks;
  return [];
}

async function getRiffCards(deckID: string): Promise<any[]> {
  try {
    const first = await siyuanPost('/api/riff/getRiffCards', { id: deckID, page: 1, pageSize: 999 });
    return normalizeRiffBlocks(first);
  } catch {
    const legacy = await siyuanPost('/api/riff/getRiffCards', { deckID, reviewType: 'all' });
    return normalizeRiffBlocks(legacy);
  }
}

async function getRiffCardsByBlockIDs(blockIDs: string[]): Promise<any[]> {
  if (blockIDs.length === 0) return [];
  const result = await siyuanPost('/api/riff/getRiffCardsByBlockIDs', { blockIDs });
  return normalizeRiffBlocks(result);
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ===================== 源码镜像：类型 / 设置 / 解析 / 队列 =====================

const CardType = {
  Cloze: 'cloze',
  QA: 'qa',
  Formula: 'formula',
  ImageOcclusion: 'image',
  OrderedList: 'orderedList',
  UnorderedList: 'unorderedList',
  CDF: 'cdf',
  ConceptDefinition: 'concept',
} as const;

type CardTypeVal = typeof CardType[keyof typeof CardType];
type CardState = 'new' | 'learning' | 'review' | 'relearning';

interface SRSCard {
  id: string;
  blockId: string;
  rootId: string;
  type: CardTypeVal;
  deckId: string;
  front: string;
  back: string;
  stability: number;
  difficulty: number;
  lastReview: number;
  nextReview: number;
  reps: number;
  lapses: number;
  state: CardState;
  step?: number;
  clozeIndex?: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

interface SRSSettings {
  fsrsParams: number[];
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: number[];
  relearningSteps: number[];
  newPerDay: number;
  reviewsPerDay: number;
  dayStartHour: number;
  autoPostpone: boolean;
  autoSort: boolean;
  riffcardSync: boolean;
  riffcardDeckId: string;
}

interface BrowserTaskFilterInput {
  task?: 'all' | 'due' | 'new' | 'learning' | 'lapseRisk';
  deckId?: string;
  cardType?: CardTypeVal;
  tag?: string;
  dueOnly?: boolean;
  search?: string;
}

const DEFAULT_FSRS_PARAMS = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102,
  0.5316, 1.0651, 0.0234, 1.616, 0.1544,
  1.0824, 1.9813, 0.0953, 0.2975, 2.2042,
  0.2407, 2.9466, 0.5034, 0.6567,
];

const DEFAULT_SRS_SETTINGS: SRSSettings = {
  fsrsParams: DEFAULT_FSRS_PARAMS,
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: false,
  enableShortTerm: true,
  learningSteps: [1, 10],
  relearningSteps: [10],
  newPerDay: 20,
  reviewsPerDay: 200,
  dayStartHour: 4,
  autoPostpone: false,
  autoSort: false,
  riffcardSync: false,
  riffcardDeckId: '',
};

function stripIAL(kramdown: string): string {
  return kramdown
    .split('\n')
    .filter(line => !line.trim().startsWith('{:'))
    .join('\n')
    .trimEnd();
}

function extractClozes(text: string, markers: string[] = ['==', '@@']): Array<{ front: string; back: string; clozeIndex: number }> {
  const cleaned = stripIAL(text);
  const results: Array<{ front: string; back: string; clozeIndex: number }> = [];
  for (const marker of markers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}(.+?)${escaped}`, 'g');
    let match: RegExpExecArray | null;
    let clozeIndex = 0;
    while ((match = pattern.exec(cleaned)) !== null) {
      const savedLastIndex = pattern.lastIndex;
      const front = cleaned.replace(pattern, '____');
      pattern.lastIndex = savedLastIndex;
      results.push({ front: front.trim(), back: match[1].trim(), clozeIndex });
      clozeIndex++;
    }
  }
  return results;
}

function extractFormulas(text: string): string[] {
  const cleaned = stripIAL(text);
  const results: string[] = [];
  const blockPattern = /\$\$(.+?)\$\$/gs;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(cleaned)) !== null) {
    const formula = match[1].trim();
    if (formula) results.push(formula);
  }
  if (results.length === 0) {
    const inlinePattern = /(?<!\$)\$(?!\$)(\S(?:[^$]*?\S)?)\$(?!\$)/g;
    while ((match = inlinePattern.exec(cleaned)) !== null) {
      const formula = match[1].trim();
      if (formula) results.push(formula);
    }
  }
  return results;
}

function parseOrderedList(kramdown: string): string[] {
  const cleaned = stripIAL(kramdown);
  const items: string[] = [];
  for (const line of cleaned.split('\n')) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) items.push(match[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim());
  }
  return items;
}

function parseUnorderedList(kramdown: string): string[] {
  const cleaned = stripIAL(kramdown);
  const items: string[] = [];
  for (const line of cleaned.split('\n')) {
    const match = line.match(/^[-*+]\s+(.+)/);
    if (match) items.push(match[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim());
  }
  return items;
}

function parseCDF(text: string, marker = '::'): Array<{ concept: string; definition: string }> {
  const cleaned = stripIAL(text);
  const results: Array<{ concept: string; definition: string }> = [];
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(.+?)${escaped}(.+)$`, 'gm');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    const concept = match[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
    const definition = match[2].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
    if (concept && definition) results.push({ concept, definition });
  }
  return results;
}

function formatInterval(days: number): string {
  if (days < 1 / 1440) return '<1m';
  if (days < 1 / 24) return `${Math.round(days * 1440)}m`;
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function isCardDue(card: { nextReview: number; state: string }, _dayStartHour = 4): boolean {
  return card.nextReview <= Date.now() || card.state === 'new';
}

function getRetrievability(card: { state: string; stability: number; lastReview: number }): number {
  if (card.state === 'new' || card.stability === 0) return 0;
  const elapsed = card.lastReview ? Math.max(0, (Date.now() - card.lastReview) / 86400000) : 0;
  return Math.exp(-elapsed / card.stability);
}

function buildRetrievalQueue(cards: SRSCard[], settings: SRSSettings): string[] {
  const dueCards = cards.filter(c => isCardDue(c, settings.dayStartHour));
  const reviewCards = dueCards
    .filter(c => c.state !== 'new')
    .sort((a, b) => a.nextReview - b.nextReview)
    .slice(0, settings.reviewsPerDay);
  const newCards = dueCards
    .filter(c => c.state === 'new')
    .slice(0, settings.newPerDay);
  return [...reviewCards.map(c => c.id), ...newCards.map(c => c.id)];
}

function filterCardsForBrowser(cards: SRSCard[], filter: BrowserTaskFilterInput): SRSCard[] {
  let result = cards;
  if (filter.deckId) result = result.filter(c => c.deckId === filter.deckId);
  if (filter.task === 'due') result = result.filter(isCardDue);
  if (filter.task === 'new') result = result.filter(c => c.state === 'new');
  if (filter.task === 'learning') result = result.filter(c => c.state === 'learning' || c.state === 'relearning');
  if (filter.task === 'lapseRisk') result = result.filter(c => c.lapses >= 2 || c.state === 'relearning');
  if (filter.cardType) result = result.filter(c => c.type === filter.cardType);
  if (filter.dueOnly) result = result.filter(isCardDue);
  if (filter.tag) result = result.filter(c => c.tags.includes(filter.tag!));
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q));
  }
  return result;
}

function makeCardId(deckId: string, blockId: string): string {
  return `${deckId}::${blockId}`;
}

function normalizeState(state: unknown, reps: number): CardState {
  if (typeof state === 'string') {
    const lower = state.toLowerCase();
    if (lower.includes('relearn')) return 'relearning';
    if (lower.includes('learn')) return 'learning';
    if (lower.includes('review')) return 'review';
    if (lower.includes('new')) return 'new';
  }
  const numeric = Number(state);
  if (!Number.isFinite(numeric)) return reps > 0 ? 'review' : 'new';
  if (numeric <= 0) return 'new';
  if (numeric === 1) return reps > 0 ? 'learning' : 'new';
  if (numeric === 2) return 'review';
  return 'relearning';
}

function parseNativeTime(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value > 1_000_000_000_000 ? value : value * 1000;
  const text = String(value).trim();
  if (/^\d{14}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const hour = Number(text.slice(8, 10));
    const minute = Number(text.slice(10, 12));
    const second = Number(text.slice(12, 14));
    return new Date(year, month, day, hour, minute, second).getTime();
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractBlockId(card: any): string {
  if (typeof card === 'string') return card;
  return card?.BlockID ?? card?.blockID ?? card?.blockId ?? card?.id ?? card?.ID ?? '';
}

function extractDeckId(card: any, fallbackDeckId = ''): string {
  return card?.DeckID ?? card?.deckID ?? card?.deckId ?? fallbackDeckId;
}

function buildNativeProjection(deckId: string, blockId: string, block?: any, detail?: any): SRSCard {
  const now = Date.now();
  const content = (block?.markdown || block?.content || '').trim();
  const reps = Number(detail?.Reviews ?? 0) || 0;
  const lapses = Number(detail?.Lapses ?? 0) || 0;
  const interval = Number(detail?.Interval ?? 0) || 0;
  const createdAt = parseNativeTime(detail?.Created ?? block?.created) ?? now;
  const updatedAt = parseNativeTime(detail?.Updated ?? block?.updated) ?? createdAt;
  return {
    id: makeCardId(deckId, blockId),
    blockId,
    rootId: block?.root_id || '',
    type: CardType.QA,
    deckId,
    front: content,
    back: content,
    stability: interval,
    difficulty: 0,
    lastReview: reps > 0 ? updatedAt : 0,
    nextReview: parseNativeTime(detail?.Due) ?? now,
    reps,
    lapses,
    state: normalizeState(detail?.State, reps),
    tags: [],
    createdAt,
    updatedAt,
  };
}

let cardCounter = 0;
function makeCard(overrides: Partial<SRSCard> = {}): SRSCard {
  const now = Date.now();
  const id = overrides.id || `test-card-${++cardCounter}`;
  return {
    id,
    blockId: `block-${id}`,
    rootId: `root-${id}`,
    type: CardType.QA,
    deckId: 'default',
    front: `Front ${id}`,
    back: `Back ${id}`,
    stability: 0,
    difficulty: 0,
    lastReview: 0,
    nextReview: now,
    reps: 0,
    lapses: 0,
    state: 'new',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeNewCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return makeCard({ state: 'new', nextReview: Date.now(), ...overrides });
}

function makeDueReviewCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return makeCard({
    state: 'review',
    nextReview: Date.now() - 3600_000,
    stability: 5,
    difficulty: 3,
    lastReview: Date.now() - 86400_000,
    reps: 3,
    lapses: 0,
    ...overrides,
  });
}

function makeFutureCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return makeCard({
    state: 'review',
    nextReview: Date.now() + 86400_000,
    stability: 10,
    difficulty: 3,
    lastReview: Date.now(),
    reps: 5,
    lapses: 0,
    ...overrides,
  });
}

// ===================== Part A: FSRS v6 调度 =====================

function partA() {
  console.log('\n\x1b[36mPart A: FSRS v6 调度基础\x1b[0m');

  const card = createEmptyCard(new Date());
  assertEq('新卡 state = New', card.state, State.New);
  assertEq('新卡 reps = 0', card.reps, 0);
  assertEq('新卡 lapses = 0', card.lapses, 0);

  const scheduler = fsrs(generatorParameters({
    w: DEFAULT_FSRS_PARAMS,
    enable_fuzz: false,
    enable_short_term: true,
    request_retention: 0.9,
    maximum_interval: 36500,
  }));
  assertTrue('调度器创建成功', typeof scheduler.repeat === 'function');

  const now = new Date();
  const result = scheduler.repeat(card, now);
  const again = result[Rating.Again];
  const hard = result[Rating.Hard];
  const good = result[Rating.Good];
  const easy = result[Rating.Easy];
  assertTrue('四种评分结果存在', !!again && !!hard && !!good && !!easy);

  const intervalAgain = new Date(again.card.due as any).getTime() - now.getTime();
  const intervalHard = new Date(hard.card.due as any).getTime() - now.getTime();
  const intervalGood = new Date(good.card.due as any).getTime() - now.getTime();
  const intervalEasy = new Date(easy.card.due as any).getTime() - now.getTime();
  assertGte('Hard 间隔 >= Again', intervalHard, intervalAgain);
  assertGte('Good 间隔 >= Hard', intervalGood, intervalHard);
  assertGte('Easy 间隔 >= Good', intervalEasy, intervalGood);
  assertEq('Good 后 reps = 1', good.card.reps, 1);
  assertTrue('Good 后 stability > 0', good.card.stability > 0);
  assertTrue('Good 后 difficulty > 0', good.card.difficulty > 0);

  assertEq('formatInterval <1m', formatInterval(0), '<1m');
  assertEq('formatInterval 10m', formatInterval(10 / 1440), '10m');
  assertEq('formatInterval 12h', formatInterval(0.5), '12h');
  assertEq('formatInterval 7d', formatInterval(7), '7d');
  assertEq('formatInterval 6mo', formatInterval(180), '6mo');
  assertEq('formatInterval 1y', formatInterval(365), '1.0y');
}

// ===================== Part B: 卡片解析器边界 =====================

function partB() {
  console.log('\n\x1b[36mPart B: 内部卡片解析器边界\x1b[0m');

  assertEqLen('挖空：空输入', extractClozes(''), 0);
  assertEqLen('挖空：无标记', extractClozes('这是一段普通文本'), 0);
  const cloze1 = extractClozes('地球半径 ==6371== 公里');
  assertEqLen('挖空：单 == 标记', cloze1, 1);
  assertEq('挖空：答案正确', cloze1[0]?.back, '6371');
  assertIncludes('挖空：正面含空', cloze1[0]?.front ?? '', '____');
  const cloze2 = extractClozes('==北京==是首都，@@上海@@是经济中心');
  assertEqLen('挖空：混合标记', cloze2, 2);
  assertTrue('挖空：含北京', cloze2.some(c => c.back === '北京'));
  assertTrue('挖空：含上海', cloze2.some(c => c.back === '上海'));
  assertEqLen('挖空：未闭合不提取', extractClozes('==未闭合'), 0);
  assertEqLen('挖空：IAL 不干扰', extractClozes('地球半径 ==6371== 公里\n{: id="x" updated="y"}'), 1);
  assertEqLen('挖空：自定义标记', extractClozes('!!重要!! 内容', ['!!']), 1);
  assertEqLen('挖空：正则特殊字符标记', extractClozes('a*b*c', ['*']), 1);

  assertEq('IAL：剥离行', stripIAL('第一行\n{: id="x"}\n第二行'), '第一行\n第二行');
  assertEq('IAL：仅 IAL 变空', stripIAL('{: id="x" updated="y"}'), '');

  assertEqLen('公式：空输入', extractFormulas(''), 0);
  assertEqLen('公式：块级', extractFormulas('$$E = mc^2$$'), 1);
  assertEq('公式：块级内容', extractFormulas('$$E = mc^2$$')[0], 'E = mc^2');
  assertEqLen('公式：行内多个', extractFormulas('质量 $m$ 与能量 $E$ 的关系'), 2);
  assertEqLen('公式：块级优先', extractFormulas('$$E=mc^2$$ 其中 $c$ 是光速'), 1);
  assertEqLen('公式：未闭合不提取', extractFormulas('$$未闭合'), 0);
  assertEqLen('公式：价格符号不误匹配', extractFormulas('$100 和 $200'), 0);
  assertEqLen('公式：多行块级', extractFormulas('$$\na+b\n=c\n$$'), 1);

  assertEqLen('有序列表：空输入', parseOrderedList(''), 0);
  assertEqLen('有序列表：三项', parseOrderedList('1. 苹果\n2. 香蕉\n3. 橙子'), 3);
  assertEq('有序列表：格式剥离', parseOrderedList('1. **加粗**文本')[0], '加粗文本');
  assertEqLen('有序列表：IAL 不干扰', parseOrderedList('1. 项目\n{: id="x"}\n2. 第二项'), 2);
  assertEqLen('有序列表：缩进子列表不算顶层', parseOrderedList('1. 父项\n  1. 子项'), 1);

  assertEqLen('无序列表：三项', parseUnorderedList('- 苹果\n* 香蕉\n+ 橙子'), 3);
  assertEq('无序列表：格式剥离', parseUnorderedList('- **重要**内容')[0], '重要内容');
  assertEqLen('无序列表：非列表星号不匹配', parseUnorderedList('2 * 3 = 6'), 0);
  assertEqLen('无序列表：缩进子列表不算顶层', parseUnorderedList('- 父项\n  - 子项'), 1);

  assertEqLen('CDF：空输入', parseCDF(''), 0);
  assertEqLen('CDF：单个', parseCDF('FSRS::Free Spaced Repetition Scheduler'), 1);
  assertEq('CDF：概念', parseCDF('FSRS::算法')[0]?.concept, 'FSRS');
  assertEq('CDF：定义', parseCDF('FSRS::算法')[0]?.definition, '算法');
  assertEqLen('CDF：多行', parseCDF('FSRS::算法\nSM-2::旧算法'), 2);
  assertEq('CDF：格式剥离', parseCDF('**FSRS**::**Free** Spaced Repetition')[0]?.concept, 'FSRS');
  assertEqLen('CDF：空概念不匹配', parseCDF('::只有定义'), 0);
  assertEq('CDF：多重分隔符保留定义侧', parseCDF('a::b::c')[0]?.definition, 'b::c');
  assertEqLen('CDF：自定义分隔符', parseCDF('FSRS|算法', '|'), 1);
  assertEqLen('CDF：IAL 不干扰', parseCDF('FSRS::算法\n{: id="a::b"}\nSM-2::旧算法'), 2);
}

// ===================== Part C: 队列与卡包任务筛选 =====================

function partC() {
  console.log('\n\x1b[36mPart C: 提取练习队列与卡包任务筛选\x1b[0m');

  assertEq('提取队列：空卡组', buildRetrievalQueue([], DEFAULT_SRS_SETTINGS).length, 0);

  const allDue = Array.from({ length: 10 }, (_, i) => makeDueReviewCard({ id: `due-${i}`, nextReview: Date.now() - (i + 1) * 1000 }));
  const allDueQueue = buildRetrievalQueue(allDue, DEFAULT_SRS_SETTINGS);
  assertEq('提取队列：10 张到期 review', allDueQueue.length, 10);
  assertEq('提取队列：最早到期排第一', allDueQueue[0], 'due-9');

  const allFuture = Array.from({ length: 5 }, (_, i) => makeFutureCard({ id: `future-${i}` }));
  assertEq('提取队列：全未到期返回空', buildRetrievalQueue(allFuture, DEFAULT_SRS_SETTINGS).length, 0);

  const manyNew = Array.from({ length: 50 }, (_, i) => makeNewCard({ id: `new-${i}` }));
  assertEq('提取队列：newPerDay=20 生效', buildRetrievalQueue(manyNew, DEFAULT_SRS_SETTINGS).length, 20);

  const settingsReviewLimit = { ...DEFAULT_SRS_SETTINGS, reviewsPerDay: 5, newPerDay: 100 };
  const manyReviews = Array.from({ length: 20 }, (_, i) => makeDueReviewCard({ id: `review-${i}`, nextReview: Date.now() - (i + 1) * 1000 }));
  const reviewLimited = buildRetrievalQueue(manyReviews, settingsReviewLimit);
  assertEq('提取队列：reviewsPerDay=5 生效', reviewLimited.length, 5);
  assertEq('提取队列：review 上限保留最早到期', reviewLimited[0], 'review-19');

  const mixed: SRSCard[] = [
    makeNewCard({ id: 'new-a', deckId: 'deck-a', tags: ['geo'], type: CardType.Cloze }),
    makeNewCard({ id: 'new-b', deckId: 'deck-a', tags: ['math'], type: CardType.Formula }),
    makeDueReviewCard({ id: 'due-a', deckId: 'deck-b', tags: ['geo'], type: CardType.QA, nextReview: Date.now() - 2000 }),
    makeDueReviewCard({ id: 'due-b', deckId: 'deck-b', tags: ['risk'], type: CardType.Cloze, lapses: 3, nextReview: Date.now() - 1000 }),
    makeCard({ id: 'learning-a', state: 'learning', deckId: 'deck-a', tags: ['math'], nextReview: Date.now() + 86400_000 }),
    makeCard({ id: 'relearning-a', state: 'relearning', deckId: 'deck-b', tags: ['risk'], lapses: 2, nextReview: Date.now() + 86400_000 }),
    makeFutureCard({ id: 'future-a', deckId: 'deck-a', tags: ['geo'] }),
  ];
  assertArrayEq('提取队列：review 在前，新卡在后', buildRetrievalQueue(mixed, DEFAULT_SRS_SETTINGS), ['due-a', 'due-b', 'new-a', 'new-b']);
  assertEq('任务筛选：全部', filterCardsForBrowser(mixed, { task: 'all' }).length, mixed.length);
  assertEq('任务筛选：到期', filterCardsForBrowser(mixed, { task: 'due' }).length, 4);
  assertEq('任务筛选：新卡', filterCardsForBrowser(mixed, { task: 'new' }).length, 2);
  assertEq('任务筛选：学习中', filterCardsForBrowser(mixed, { task: 'learning' }).length, 2);
  assertEq('任务筛选：遗忘风险', filterCardsForBrowser(mixed, { task: 'lapseRisk' }).length, 2);
  assertEq('组合筛选：deck-a + cloze', filterCardsForBrowser(mixed, { deckId: 'deck-a', cardType: CardType.Cloze }).length, 1);
  assertEq('组合筛选：tag geo + dueOnly', filterCardsForBrowser(mixed, { tag: 'geo', dueOnly: true }).length, 2);
  assertEq('搜索筛选：front 命中', filterCardsForBrowser(mixed, { search: 'new-a' }).length, 1);

  assertTrue('到期判定：新卡到期', isCardDue(makeNewCard()));
  assertTrue('到期判定：过期 review 到期', isCardDue(makeDueReviewCard()));
  assertFalse('到期判定：未来 review 不到期', isCardDue(makeFutureCard()));
  assertEq('可检索性：新卡为 0', getRetrievability({ state: 'new', stability: 0, lastReview: 0 }), 0);
  assertTrue('可检索性：刚复习接近 1', getRetrievability({ state: 'review', stability: 10, lastReview: Date.now() }) > 0.99);
}

// ===================== Part D: 原生 riffcard 投影模型 =====================

function partD() {
  console.log('\n\x1b[36mPart D: 原生 riffcard 投影模型\x1b[0m');

  const block = {
    id: '20260101120000-abcdefg',
    root_id: '20260101115900-rootdoc',
    markdown: '什么是 FSRS？',
    created: '20260101120000',
    updated: '20260102120000',
  };
  const detail = {
    BlockID: block.id,
    DeckID: 'deck-001',
    Reviews: 3,
    Lapses: 1,
    Interval: 7,
    State: 2,
    Due: '20260103120000',
  };
  const card = buildNativeProjection('deck-001', block.id, block, detail);
  assertEq('投影 ID 使用 deckId::blockId', card.id, `deck-001::${block.id}`);
  assertFalse('投影 ID 不再使用 native- 前缀', card.id.startsWith('native-'));
  assertEq('投影 blockId 一致', card.blockId, block.id);
  assertEq('投影 rootId 一致', card.rootId, block.root_id);
  assertEq('投影 deckId 一致', card.deckId, 'deck-001');
  assertEq('投影 type 默认 qa', card.type, CardType.QA);
  assertEq('投影 front 来自块内容', card.front, '什么是 FSRS？');
  assertEq('投影 reps 来自原生详情', card.reps, 3);
  assertEq('投影 lapses 来自原生详情', card.lapses, 1);
  assertEq('投影 stability 来自 Interval', card.stability, 7);
  assertEq('投影 state 归一化为 review', card.state, 'review');

  assertEq('状态归一化：new 字符串', normalizeState('New', 0), 'new');
  assertEq('状态归一化：learning 字符串', normalizeState('Learning', 1), 'learning');
  assertEq('状态归一化：review 字符串', normalizeState('Review', 2), 'review');
  assertEq('状态归一化：relearning 字符串', normalizeState('Relearning', 3), 'relearning');
  assertEq('状态归一化：数字 0', normalizeState(0, 0), 'new');
  assertEq('状态归一化：数字 2', normalizeState(2, 5), 'review');
  assertTrue('原生时间解析：14 位时间戳', (parseNativeTime('20260101120000') ?? 0) > 0);
  assertEq('blockId 提取：字符串', extractBlockId('block-x'), 'block-x');
  assertEq('blockId 提取：BlockID', extractBlockId({ BlockID: 'block-y' }), 'block-y');
  assertEq('deckId 提取：fallback', extractDeckId({}, 'deck-z'), 'deck-z');
}

// ===================== Part E: 安全文件 API 探针 =====================

async function partE() {
  console.log('\n\x1b[36mPart E: SiYuan 文件 API 安全探针\x1b[0m');

  const probePath = `${PLUGIN_STORAGE}/srs-e2e-probe-${Date.now()}.json`;
  const payload = { probe: true, source: 'test-srs-e2e', timestamp: Date.now() };
  try {
    await siyuanPutFile(probePath, JSON.stringify(payload));
    const loadedRaw = await siyuanGetFile(probePath);
    assertTrue('临时探针文件可读回', loadedRaw !== null);
    if (loadedRaw) {
      const loaded = JSON.parse(loadedRaw);
      assertEq('临时探针字段一致', loaded.source, payload.source);
      assertTrue('临时探针不在 srs-cards.json', !probePath.endsWith('srs-cards.json'));
      assertTrue('临时探针不在 srs-settings.json', !probePath.endsWith('srs-settings.json'));
    }
  } finally {
    await siyuanDeleteFile(probePath);
    const afterDelete = await siyuanGetFile(probePath);
    assertEq('临时探针已清理', afterDelete, null);
  }
}

// ===================== Part F: 插件部署产物探针 =====================

async function partF() {
  console.log('\n\x1b[36mPart F: 插件部署产物探针\x1b[0m');

  const petals = await siyuanPost('/api/petal/loadPetals', { frontend: 'desktop' });
  const plugin = Array.isArray(petals) ? petals.find((p: any) => p.name === PLUGIN_NAME) : null;
  assertTrue('插件已安装', plugin !== null);
  if (plugin) assertTrue('插件已启用', plugin.enabled === true || plugin.enabled === 'true');

  const indexJs = await siyuanGetFile(`${REMOTE_BASE}/index.js`);
  assertTrue('index.js 可读取', !!indexJs && indexJs.length > 100);
  if (indexJs && indexJs.length > 100) {
    const patterns = [
      'srs-queues',
      'srs-settings',
      'srs-review-log',
      'stability',
      'difficulty',
      'retrieval',
      '提取练习',
      '卡包管理',
      '闪卡地图',
    ];
    const found = patterns.filter(p => indexJs.includes(p));
    console.log(`    SRS 模式: ${found.length}/${patterns.length} 找到`);
    assertGte('统一 SRS 模式找到 >= 6/9', found.length, 6);
    assertFalse('部署产物不应再包含神经漫游入口', indexJs.includes('神经漫游'));
    assertFalse('部署产物不应再包含渐进阅读入口', indexJs.includes('渐进阅读'));
  }

  const indexCss = await siyuanGetFile(`${REMOTE_BASE}/index.css`);
  assertTrue('index.css 可读取', !!indexCss && indexCss.length > 100);
  if (indexCss) {
    assertTrue('CSS 含 SRS 样式', indexCss.includes('srs') || indexCss.includes('review') || indexCss.includes('card'));
  }
}

// ===================== Part G: SiYuan 块 API 与解析器集成 =====================

async function partG() {
  console.log('\n\x1b[36mPart G: SiYuan 块 API 与解析器集成\x1b[0m');

  const suffix = Date.now().toString(36);
  const notebookName = `SRS-E2E-${suffix}`;
  const docPath = `/SRS-E2E-${suffix}`;
  let notebookId = '';

  try {
    const nb = await siyuanPost('/api/notebook/createNotebook', { name: notebookName });
    notebookId = String(nb?.notebook?.id || nb?.id || nb || '');
    assertTrue('临时笔记本创建成功', !!notebookId);

    const doc = await siyuanPost('/api/filetree/createDocWithMd', {
      notebook: notebookId,
      path: docPath,
      markdown: '# SRS E2E\n',
    });
    const docId = String(doc?.id || doc?.data || doc || '');
    assertTrue('临时文档创建成功', !!docId);

    const blocks = [
      { name: '挖空块', markdown: '地球半径 ==6371== 公里', validate: (k: string) => assertEq('块解析：挖空答案', extractClozes(k)[0]?.back, '6371') },
      { name: '多挖空块', markdown: '==北京==是首都，==上海==是经济中心', validate: (k: string) => assertEqLen('块解析：多挖空数量', extractClozes(k), 2) },
      { name: '公式块', markdown: '$$E = mc^2$$', validate: (k: string) => assertEq('块解析：公式内容', extractFormulas(k)[0], 'E = mc^2') },
      { name: '有序列表块', markdown: '1. 第一项\n2. 第二项\n3. 第三项', validate: (k: string) => assertEqLen('块解析：有序列表数量', parseOrderedList(k), 3) },
      { name: '无序列表块', markdown: '- 苹果\n- 香蕉\n- 橙子', validate: (k: string) => assertEqLen('块解析：无序列表数量', parseUnorderedList(k), 3) },
      { name: 'CDF 块', markdown: 'FSRS::Free Spaced Repetition Scheduler', validate: (k: string) => assertEq('块解析：CDF 概念', parseCDF(k)[0]?.concept, 'FSRS') },
      { name: '普通文本块', markdown: '这是一段普通文本', validate: (k: string) => assertEqLen('块解析：普通文本无挖空', extractClozes(k), 0) },
    ];

    for (const block of blocks) {
      const insert = await siyuanPost('/api/block/insertBlock', {
        dataType: 'markdown',
        data: block.markdown,
        parentID: docId,
      });
      const blockId = insert?.[0]?.doOperations?.[0]?.id || insert?.[0]?.id;
      assertTrue(`${block.name}: 插入成功`, !!blockId);
      const kramdownResult = await siyuanPost('/api/block/getBlockKramdown', { id: blockId });
      const kramdown = kramdownResult?.kramdown || '';
      assertTrue(`${block.name}: kramdown 非空`, kramdown.length > 0);
      block.validate(kramdown);
    }

    await siyuanPost('/api/filetree/removeDoc', { notebook: notebookId, path: docPath });
  } finally {
    if (notebookId) {
      try { await siyuanPost('/api/notebook/removeNotebook', { notebook: notebookId }); } catch { /* ignore */ }
    }
  }
}

// ===================== Part H: 原生 riffcard 只读集成 =====================

async function partH() {
  console.log('\n\x1b[36mPart H: 原生 riffcard 只读集成\x1b[0m');

  const decks = await getRiffDecks();
  assertTrue('riffcard 卡包查询返回数组', Array.isArray(decks));
  if (decks.length === 0) {
    skip('原生 riffcard 投影', '当前工作空间没有 riffcard 卡包');
    return;
  }

  let selectedDeck: { id: string; name: string } | null = null;
  let rawCards: any[] = [];
  for (const deck of decks) {
    const id = String(deck.id ?? deck.ID ?? deck.deckID ?? '');
    const name = String(deck.name ?? deck.Name ?? id);
    if (!id) continue;
    const cards = await getRiffCards(id);
    if (cards.length > 0) {
      selectedDeck = { id, name };
      rawCards = cards;
      break;
    }
  }

  if (!selectedDeck) {
    skip('原生 riffcard 投影', '存在卡包但没有卡片');
    return;
  }

  console.log(`    使用卡包: ${selectedDeck.name} (${selectedDeck.id}), 原生卡片: ${rawCards.length}`);
  const blockIds = [...new Set(rawCards.map(extractBlockId).filter(Boolean))].slice(0, 20);
  assertTrue('原生卡片可提取 blockId', blockIds.length > 0);

  const blockRows = await sql(`SELECT id, content, markdown, root_id, updated, created FROM blocks WHERE id IN (${blockIds.map(sqlString).join(',')}) LIMIT ${blockIds.length}`);
  const blocks = new Map(blockRows.map(row => [row.id, row]));
  const details = await getRiffCardsByBlockIDs(blockIds);
  const detailsByBlock = new Map<string, any>();
  for (const detail of details) {
    const blockId = extractBlockId(detail);
    if (blockId) detailsByBlock.set(blockId, detail);
  }

  const projected = blockIds.map(blockId => {
    const detail = detailsByBlock.get(blockId) ?? rawCards.find(c => extractBlockId(c) === blockId);
    const deckId = extractDeckId(detail, selectedDeck!.id);
    return buildNativeProjection(deckId, blockId, blocks.get(blockId), detail);
  });

  assertEq('投影卡片数 = blockId 数', projected.length, blockIds.length);
  const first = projected[0];
  assertTrue('投影 ID 含 deckId::blockId', first.id.includes('::'));
  assertFalse('投影 ID 不使用 native- 前缀', first.id.startsWith('native-'));
  assertTrue('投影 blockId 非空', !!first.blockId);
  assertTrue('投影 deckId 非空', !!first.deckId);
  assertTrue('投影状态有效', ['new', 'learning', 'review', 'relearning'].includes(first.state));

  const retrieval = buildRetrievalQueue(projected, DEFAULT_SRS_SETTINGS);
  assertLte('原生投影提取队列不超过投影卡片数', retrieval.length, projected.length);
  const due = filterCardsForBrowser(projected, { task: 'due' });
  const risk = filterCardsForBrowser(projected, { task: 'lapseRisk' });
  assertLte('原生投影到期任务不超过投影卡片数', due.length, projected.length);
  assertLte('原生投影风险任务不超过投影卡片数', risk.length, projected.length);
}

// ===================== 主入口 =====================

async function main() {
  console.log('\x1b[1m════════════ SRS 统一插件 E2E 测试 ════════════\x1b[0m');
  console.log(`  Plugin: ${PLUGIN_NAME}`);
  console.log(`  SiYuan: ${SIYUAN}`);

  partA();
  partB();
  partC();
  partD();

  await runRemotePart('Part E: SiYuan 文件 API 安全探针', partE);
  await runRemotePart('Part F: 插件部署产物探针', partF);
  await runRemotePart('Part G: SiYuan 块 API 与解析器集成', partG);
  await runRemotePart('Part H: 原生 riffcard 只读集成', partH);

  console.log('\n\x1b[1m════════════ 测试汇总 ════════════\x1b[0m');
  console.log(`  \x1b[32m${pass} 通过\x1b[0m, \x1b[31m${fail} 失败\x1b[0m, \x1b[33m${skipCount} 跳过\x1b[0m`);
  if (failures.length > 0) {
    console.log('\n  \x1b[31m失败详情:\x1b[0m');
    for (const f of failures) console.log(`    \x1b[31m✗ ${f}\x1b[0m`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\x1b[31m测试运行失败:\x1b[0m', err);
  process.exit(1);
});
