// npm run test:all — unit → API → E2E (Playwright) თანმიმდევრობით. ნებისმიერი ჩავარდნა → exit code 1.
// შედეგები: test-results/summary.json (TEST_REPORT.md-სთვის).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results');
fs.mkdirSync(OUT, { recursive: true });
const node = process.execPath;
const env = { ...process.env, FORCE_COLOR: undefined, NO_COLOR: '1' };
delete env.FORCE_COLOR;

function nodeTest(name, glob, extra = []) {
  const tap = path.join(OUT, `${name}.tap`);
  const started = Date.now();
  const r = spawnSync(node, ['--test', ...extra,
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=tap', `--test-reporter-destination=${tap}`, glob], { cwd: ROOT, stdio: 'inherit', env });
  const text = fs.existsSync(tap) ? fs.readFileSync(tap, 'utf8') : '';
  const num = (k) => Number((text.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] || 0);
  return { suite: name, ok: r.status === 0, tests: num('tests'), pass: num('pass'), fail: num('fail'), ms: Date.now() - started };
}

function e2e() {
  const started = Date.now();
  const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  const r = spawnSync(node, [cli, 'test'], { cwd: ROOT, stdio: 'inherit', env });
  let s = {};
  try { s = JSON.parse(fs.readFileSync(path.join(OUT, 'e2e-results.json'), 'utf8')).stats || {}; } catch { /* არ შეიქმნა */ }
  const pass = (s.expected || 0) + (s.flaky || 0);
  const fail = s.unexpected || 0;
  return { suite: 'e2e', ok: r.status === 0, tests: pass + fail + (s.skipped || 0), pass, fail, flaky: s.flaky || 0, ms: Date.now() - started };
}

const results = [];
console.log('\n=== 1/3 unit ===');
results.push(nodeTest('unit', 'tests/unit/**/*.test.mjs'));
console.log('\n=== 2/3 api ===');
results.push(nodeTest('api', 'tests/api/**/*.test.mjs', ['--test-concurrency=1']));
console.log('\n=== 3/3 e2e (playwright) ===');
results.push(e2e());

const summary = { finished_at: new Date().toISOString(), node: process.version, ok: results.every((r) => r.ok), results };
fs.writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log('\n=== შედეგი ===');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.suite.padEnd(5)}  ${String(r.pass).padStart(3)}/${String(r.tests).padEnd(3)} passed  ${r.fail} failed  ${(r.ms / 1000).toFixed(1)}s`);
}
console.log(summary.ok ? '\nყველაფერი მწვანეა.' : '\nზოგი ტესტი ჩავარდა.');
process.exit(summary.ok ? 0 : 1);
