// Round 10 §2: „გაჟონილი“ შიდა ჩანაწერის (Rules check: …) გამეორება და გაზომვა რეალურ Gemini-ზე.
// იგივე გზა, რაც სერვერზე: buildPrompt (+ finalInstruction, თუ არსებობს) → geminiStream; ნედლი სტრიმი (ნაწილები thought ალმით,
// finishReason, usageMetadata ყოველ ნაწილზე) იწერება SDK-ის კლიენტის „მილით“ (_setClientForTests). გასაღები არ იბეჭდება.
// არ შედის test:all-ში. გამოყენება:
//   node scripts/probe-leak.mjs --set repro    [--runs 30] [--budgets 0,64,128,256] [--cap 256] [--label x]
//   node scripts/probe-leak.mjs --set adaptive [--runs 10] [--budgets 0,64,128]
//   node scripts/probe-leak.mjs --set contaminated [--runs 15]
//   … --ab — OUTPUT ხაზით / მის გარეშე მონაცვლეობით (სცენარი „repro+output“ / „repro-output“)
// --cap: ხილული ზღვარი (maxOutputTokens = cap + budget, როცა budget > 0); --cap 180 --budgets 0 = დღევანდელი წარმოება.
// შედეგი: test-results/probe-leak-<label>.json + ცხრილი კონსოლში.
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { loadConfig, ROOT } from '../src/config.js';
import { byId } from '../src/characters.js';
import * as P from '../src/prompt.js';
import { pacingState } from '../src/pacing.js';
import { geminiStream, _setClientForTests } from '../src/gemini.js';
import { guessLang } from '../src/lang.js';
import { isMetaLeak } from '../src/leak.js';
import { initialCopies, summaryForServer, actionText } from '../public/js/manuscript.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const set = opt('--set', 'repro');
const runs = Number(opt('--runs', set === 'adaptive' ? 10 : set === 'contaminated' ? 15 : 30));
const budgets = opt('--budgets', set === 'adaptive' ? '0,64,128' : '0').split(',').map(Number);
const cap = Number(opt('--cap', 256));
const label = opt('--label', `${set}-cap${cap}-b${budgets.join('_')}`);

const cfg = loadConfig();
if (cfg.gemini.mock) { console.log('გასაღები არ არის — გამოტოვებულია'); process.exit(0); }

// --- ნედლი სტრიმის ჩაწერა: რეალური კლიენტი + „მილი“ ---
const real = new GoogleGenAI({ apiKey: cfg.gemini.api_key });
let record = null;
_setClientForTests({
  models: {
    list: (...a) => real.models.list(...a),
    generateContent: (...a) => real.models.generateContent(...a),
    generateContentStream: async (req) => {
      const s = await real.models.generateContentStream(req);
      return (async function* tee() { for await (const ch of s) { record?.(ch); yield ch; } }());
    },
  },
});

const finalize = typeof P.finalInstruction === 'function' ? P.finalInstruction : (si) => si;
// --ab: OUTPUT ხაზით და მის გარეშე მონაცვლეობით (ერთსა და იმავე დროს — API-ს დატვირთვის ხმაურის გარეშე შესადარებლად)
const ab = args.includes('--ab');
const GS = { day: 30, season: 'autumn', crackStage: 0, cycle: 1, paintingFallen: false };
const USER = 'სანდრო';
const LAST_REPRO = 'სამწუხაროდ ეგზემპლარები აღარ დამრჩა, მაგრამ გავითვალისწინებ.';
// §1-ის ტექსტი — „დაბინძურებული“ ისტორიისთვის
const PROD_LEAK = 'Context: User says they have no copies left of their manuscript, but will keep it in mind for the future.\nSpeaker: მარკშეიდერი (ბატონი ევგენი).\nRules check:\n- Language: Georgian.\n- User: სანდრო (use „ბატონო სანდრო“ / „თქვენ“).\n- Manuscript message count: this is turn 2 about manuscript. Gate: engage, no redirects yet (REDIRECT GATE: < 3).';

/** ეგზემპლარები: ყველა გაცემულია (ავტორს აღარ დარჩა — როგორც წარმოებაში). */
function allGivenOut() {
  const s = initialCopies(cfg.game, 1);
  ['vaso', 'director', 'bela'].forEach((h, i) => Object.assign(s.copies[i], { status: 'held', holder: h, givenDay: 10 + i }));
  const r = P.sanitizeManuscript(s, cfg);
  return r.ok ? r.summary : summaryForServer(initialCopies(cfg.game, 1));
}

/** სცენარი → { speaker, invisible, history, manuscript, actionResult, stageMode } */
function scenario(name) {
  const m = byId.marksheideri;
  const repro = [
    { role: 'user', content: 'გამარჯობა, ბატონო ევგენი. ჩემი მოთხრობის ხელნაწერი მოგიტანეთ — ხომ ვერ წაიკითხავთ?' },
    { role: 'assistant', content: 'ხელნაწერი? ჯერ ეს ბიძგი გავარკვიოთ, ბატონო სანდრო.\nთუ ეგზემპლარი გაქვთ, დამიტოვეთ, მერე ვნახავ.' },
    { role: 'user', content: LAST_REPRO },
  ];
  switch (name) {
    case 'repro': return { speaker: m, history: repro, manuscript: allGivenOut(), stageMode: 'none' };
    case 'contaminated': return {
      speaker: m, manuscript: allGivenOut(), stageMode: 'none',
      history: [...repro, { role: 'assistant', content: PROD_LEAK }, { role: 'user', content: 'კარგით, ბზარზე რას მეტყვით?' }],
    };
    case 'smalltalk': return { speaker: m, history: [{ role: 'user', content: 'გამარჯობა, ბატონო ევგენი! როგორ ბრძანდებით?' }], stageMode: 'none' };
    case 'long': return {
      speaker: m, stageMode: 'none',
      history: [
        { role: 'user', content: 'გამარჯობა, ბატონო ევგენი!' }, { role: 'assistant', content: 'გაგიმარჯოთ, ბატონო სანდრო.\nიატაკი ცოტა დახრილი ხომ არ გეჩვენებათ?' },
        { role: 'user', content: 'არა მგონია. ამინდი როგორ მოგწონთ?' }, { role: 'assistant', content: 'შემოდგომაა, წვიმს.\nსინესტე კედლებისთვის ცუდია, ხომ იცით.' },
        { role: 'user', content: 'ხელნაწერი მოგიტანეთ, წაიკითხავთ?' }, { role: 'assistant', content: 'ჯერ ეს ბიძგი გავარკვიოთ.\nმერე, თუ დრო დარჩა, ვნახოთ.' },
        { role: 'user', content: 'ჭადრაკს თამაშობთ?' }, { role: 'assistant', content: 'ვთამაშობდი, ახლა ბზარებს ვაკვირდები.\nთქვენ თამაშობთ?' },
        { role: 'user', content: 'ჰოდა, ხელნაწერზე რას იტყვით, ბოლოს და ბოლოს?' },
      ],
    };
    case 'action': {
      const manuscript = summaryForServer(initialCopies(cfg.game, 1));
      const d = P.decideAction({ type: 'hand_over', copyId: 1, integrity: 'full' }, manuscript, byId.vaso);
      return {
        speaker: byId.vaso, manuscript, actionResult: d.result, stageMode: 'none',
        history: [{ role: 'user', content: `${actionText('hand_over', USER, byId.vaso.short_name_ka, 'full')}\nმალე წაიკითხავთ?` }],
      };
    }
    case 'proxy': {
      const inv = byId.kuparadze;
      return {
        speaker: m, invisible: inv, stageMode: 'scene',
        history: [{ role: 'user', content: P.annotateForProxy('ბატონო ყუფარაძე, ხელნაწერი მოგიტანეთ, როდის მიმიღებთ?', inv, m) }],
        original: 'ბატონო ყუფარაძე, ხელნაწერი მოგიტანეთ, როდის მიმიღებთ?',
      };
    }
    default: throw new Error(`უცნობი სცენარი: ${name}`);
  }
}

async function one(scName, budget, withOutput = true) {
  const sc = scenario(scName);
  const { speaker, invisible = null, history, manuscript = null, actionResult = null, stageMode } = sc;
  const pacing = pacingState(history, speaker);
  const { systemInstruction, fewShot } = P.buildPrompt({ speaker, invisible, gameState: GS, cfg, stageMode, pacing, userName: USER, manuscript, actionResult });
  const si = withOutput ? finalize(systemInstruction, speaker) : systemInstruction;
  const maxOut = budget > 0 ? cap + budget : cap;
  const runCfg = { ...cfg, gemini: { ...cfg.gemini, thinking_budget: budget, max_output_tokens: maxOut } };
  const chunks = [];
  const t0 = performance.now();
  record = (ch) => {
    const c = ch.candidates?.[0];
    chunks.push({
      t: Math.round(performance.now() - t0),
      parts: (c?.content?.parts || []).map((p) => ({ thought: p.thought === true, text: typeof p.text === 'string' ? p.text : null, keys: Object.keys(p) })),
      finishReason: c?.finishReason || null,
      usage: ch.usageMetadata ? { ...ch.usageMetadata } : null,
    });
  };
  let text = '';
  let tFirst = null;
  let tHold = null;
  let error = null;
  try {
    for await (const ev of geminiStream({ cfg: runCfg, systemInstruction: si, contents: [...fewShot, ...history], thinkingBudget: budget, maxOutputTokens: maxOut })) {
      if (ev.delta) {
        if (tFirst === null) tFirst = performance.now() - t0;
        text += ev.delta;
        if (tHold === null && (text.includes('\n') || text.length >= 120)) tHold = performance.now() - t0;
      }
    }
  } catch (e) { error = String(e?.message || e).slice(0, 200); }
  record = null;
  const tEnd = performance.now() - t0;
  if (tHold === null && tFirst !== null) tHold = tEnd;
  const last = [...chunks].reverse().find((c) => c.usage)?.usage || {};
  const lang = guessLang(sc.original || history.at(-1).content);
  const verdict = isMetaLeak(text, { expectLang: lang });
  return {
    scenario: ab ? `${scName}${withOutput ? '+output' : '-output'}` : scName, budget, maxOutputTokens: maxOut, error, text,
    leak: verdict.leak, reason: verdict.reason,
    thoughtParts: chunks.reduce((n, c) => n + c.parts.filter((p) => p.thought).length, 0),
    thoughtText: chunks.flatMap((c) => c.parts.filter((p) => p.thought && p.text).map((p) => p.text)).join('').slice(0, 2000),
    finishReason: [...chunks].reverse().find((c) => c.finishReason)?.finishReason || null,
    usageOnChunks: chunks.map((c) => (c.usage ? { prompt: c.usage.promptTokenCount ?? null, cand: c.usage.candidatesTokenCount ?? null, thoughts: c.usage.thoughtsTokenCount ?? null } : null)),
    promptTokens: last.promptTokenCount ?? 0, cachedTokens: last.cachedContentTokenCount ?? 0, outputTokens: last.candidatesTokenCount ?? 0, thoughtsTokens: last.thoughtsTokenCount ?? 0,
    tFirst: tFirst === null ? null : Math.round(tFirst), tHold: tHold === null ? null : Math.round(tHold), tEnd: Math.round(tEnd),
    chunks: chunks.length,
  };
}

const median = (a) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const mean = (a) => { const s = a.filter((x) => x !== null); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
const r1 = (x) => (x === null ? '—' : (Math.round(x * 10) / 10).toString());

const base = set === 'adaptive' ? ['smalltalk', 'long', 'action', 'proxy'] : [set];
const scenarios = ab ? base.flatMap((s) => [`${s}+output`, `${s}-output`]) : base;
const rows = [];
for (const sc of base) {
  for (const b of budgets) {
    for (let i = 0; i < runs; i++) {
      for (const withOutput of ab ? [i % 2 === 0, i % 2 !== 0] : [true]) {
        const r = await one(sc, b, withOutput);
        rows.push(r);
        process.stdout.write(`${r.scenario} b${b} #${i + 1}: ${r.error ? `ERROR ${r.error}` : `${r.leak ? 'LEAK' : 'ok'} ${r.finishReason} first ${r.tFirst} ms`}\n`);
      }
    }
  }
}

const table = [];
for (const sc of scenarios) {
  for (const b of budgets) {
    const g = rows.filter((r) => r.scenario === sc && r.budget === b && !r.error);
    table.push({
      scenario: sc, budget: b, maxOut: b > 0 ? cap + b : cap, n: g.length, errors: rows.filter((r) => r.scenario === sc && r.budget === b && r.error).length,
      leaks: g.filter((r) => r.leak).length, leakMaxTokens: g.filter((r) => r.leak && r.finishReason === 'MAX_TOKENS').length,
      maxTokens: g.filter((r) => r.finishReason === 'MAX_TOKENS').length, thoughtPartsRuns: g.filter((r) => r.thoughtParts > 0).length,
      medFirstMs: median(g.map((r) => r.tFirst)), meanFirstMs: r1(mean(g.map((r) => r.tFirst))),
      medHoldMs: median(g.map((r) => (r.tHold === null || r.tFirst === null ? null : r.tHold - r.tFirst))),
      medEndMs: median(g.map((r) => r.tEnd)),
      avgOut: r1(mean(g.map((r) => r.outputTokens))), avgCached: r1(mean(g.map((r) => r.cachedTokens))), avgThoughts: r1(mean(g.map((r) => r.thoughtsTokens))), avgPrompt: r1(mean(g.map((r) => r.promptTokens))),
      usageBeforeEnd: g.filter((r) => r.usageOnChunks.slice(0, -1).some(Boolean)).length,
    });
  }
}
const out = path.join(ROOT, 'test-results', `probe-leak-${label}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ label, set, cap, budgets, runs, outputLine: typeof P.finalInstruction === 'function', at: new Date().toISOString(), table, rows }, null, 1)}\n`);
console.table(table);
console.log(`saved ${path.relative(ROOT, out)}`);
