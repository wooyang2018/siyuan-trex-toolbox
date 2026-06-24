#!/usr/bin/env node
/**
 * 聚合运行 scripts/tests/ 下所有测试文件 (命名约定: test-*.ts)
 *
 * 每个测试文件用 Node 原生 type stripping (--experimental-strip-types) 在独立
 * 子进程中执行，任一文件失败则最终退出码为 1。
 *
 * 用法: pnpm test   或   node scripts/tests/run-all.mjs
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const files = readdirSync(__dirname)
  .filter(f => f.startsWith('test-') && f.endsWith('.ts'))
  .sort();

if (!files.length) {
  console.log('\x1b[33m未发现测试文件 (约定 scripts/tests/test-*.ts)\x1b[0m');
  process.exit(0);
}

let failed = 0;
const results = [];

for (const f of files) {
  console.log(`\n\x1b[1m━━━━━━━━━━ ${f} ━━━━━━━━━━\x1b[0m`);
  const res = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '--disable-warning=ExperimentalWarning',
    join(__dirname, f),
  ], { stdio: 'inherit' });
  const ok = res.status === 0;
  results.push({ f, ok });
  if (!ok) failed++;
}

console.log('\n\x1b[1m════════════ 测试汇总 ════════════\x1b[0m');
for (const { f, ok } of results) {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${f}`);
}
const passed = files.length - failed;
console.log(`\n  共 ${files.length} 个文件, \x1b[32m${passed} 通过\x1b[0m, \x1b[31m${failed} 失败\x1b[0m`);
process.exit(failed > 0 ? 1 : 0);
