// prompt.js: system prompt-ის ბლოკები, უხილავის ხმა არასდროს, few-shot, gameState-ის ნორმალიზაცია.
import test from 'node:test';
import assert from 'node:assert/strict';
import { byId, world } from '../../src/characters.js';
import { buildPrompt, sanitizeGameState, GENERAL_RULES_EN, fewShot } from '../../src/prompt.js';

const cfg = {
  game: { seasons: ['autumn', 'winter', 'spring', 'summer'], crack_stages: 5, copies: 3, exchanges_per_season: 8 },
};
const GS = { season: 'winter', crackStage: 2, lostCopies: 2, cycle: 1 };

test('ზოგადი ინსტრუქცია: 15–25 წესი, ენის/ტემპის/ხელნაწერის/AI წესები', () => {
  assert.ok(GENERAL_RULES_EN.length >= 15 && GENERAL_RULES_EN.length <= 25, String(GENERAL_RULES_EN.length));
  const all = GENERAL_RULES_EN.join('\n');
  // Round 2 §8: ხარისხი, PACING, REDIRECTS LATER, OFF-TOPIC, FORMAT (\n)
  for (const needle of ['LANGUAGE', 'Write standard literary Georgian', 'Never invent or distort words', 'PACING', 'ONE idea per reply', 'REDIRECTS AND "NO TIME" COME LATER',
    'OFF-TOPIC', 'FORMAT', 'NEW LINE (\\n)', 'NEVER read the manuscript', 'Shukri', 'Mikho', 'Soso', 'AI', 'calm', 'ONE famous catchphrase', 'Time loops', 'season']) {
    assert.ok(all.includes(needle), needle);
  }
});

test('ხილული პერსონაჟი: სამყარო + წესები + პერსონაჟი + სეზონი, წარმომადგენლის ბლოკის გარეშე', () => {
  const { systemInstruction: s, fewShot: fs } = buildPrompt({ speaker: byId.director, gameState: GS, cfg });
  assert.ok(s.includes(world.setting_en));
  assert.ok(s.includes(world.setting_ka));
  assert.ok(s.includes(world.core_rules_en[0]));
  assert.ok(s.includes('ძალიან კარგი!'));                     // დირექტორის catchphrase (shared-იდან Round 2-ში ამოღებულია)
  assert.ok(s.includes('wrong_title_praise'));               // evasion taxonomy
  assert.ok(s.includes(byId.director.system_prompt_en));
  assert.ok(s.includes(byId.director.persona_ka.speech_style));
  assert.ok(s.includes('თინა'));                             // redirects_to სახელით
  assert.ok(s.includes('Current season: winter. The crack in the wall has grown to stage 3 of 5. Copies of the manuscript lost so far: 2'));
  assert.ok(s.includes('DO:'), 'voice bible DO/DON\'T');
  assert.ok(!s.includes('SPECIAL SITUATION'));
  assert.equal(fs.length, byId.director.sample_dialogues.length * 2);
  assert.equal(fs[0].role, 'user');
  assert.equal(fs[1].role, 'assistant');
});

test('უხილავი: წარმომადგენლის ხმა; უხილავის system_prompt_en მხოლოდ ფაქტების სექციაში (Round 1 §3), არასდროს ხმად', () => {
  const { systemInstruction: s, fewShot: fs } = buildPrompt({ speaker: byId.soso, invisible: byId.givi, gameState: GS, cfg });
  assert.ok(s.includes(byId.soso.system_prompt_en), 'proxy-ს ხმა');
  const charBlock = s.slice(s.indexOf('# YOUR CHARACTER'), s.indexOf('# CURRENT STATE'));
  assert.ok(!charBlock.includes(byId.givi.system_prompt_en), 'გივის prompt პერსონაჟის ბლოკში არ არის');
  const facts = s.slice(s.indexOf('## Facts about გივი'));
  assert.ok(facts.includes(byId.givi.system_prompt_en), 'ფაქტად — ფაქტების სექციაში');
  assert.ok(facts.includes('background facts only, NOT your voice'));
  assert.ok(s.includes('is addressing გივი, not you'));
  assert.ok(s.includes('never speak as გივი'));
  assert.ok(s.includes('მივლინებაშია'), 'ფაქტები');
  // few-shot: წარმომადგენლის საკუთარი ნიმუშები + ბოლოს მესამე პირის მაგალითი
  const own = fewShot(byId.soso);
  assert.deepEqual(fs.slice(0, own.length), own, 'few-shot — წარმომადგენლისა');
  assert.equal(fs.length, own.length + 2);
  assert.ok(fs.at(-2).content.startsWith('[სიტუაცია: მომხმარებელი ელაპარაკება — გივი, არა შენ.'));
  assert.ok(fs.at(-1).content.startsWith('*(დერეფანში გამოდის, დაკეტილ კარს უყურებს)* გივი? აქ არ არის'));
  assert.ok(s.indexOf('# THIS CONVERSATION') < s.indexOf('# YOUR CHARACTER'), 'სცენა პერსონაჟის ბლოკამდე');
});

test('ახალი შენობა (ციკლი > 1) ჩნდება პრომპტში', () => {
  const { systemInstruction: s } = buildPrompt({ speaker: byId.tina, gameState: { ...GS, cycle: 3 }, cfg });
  assert.ok(s.includes('ახალ შენობაში ვართ, ყველაფერი თავიდან'));
  assert.ok(s.includes('building №3'));
});

test('sanitizeGameState: არასწორი მნიშვნელობები ნორმალიზდება', () => {
  // დღის გარეშე (ძველი კლიენტი): სეზონის პირველი დღე + კლიენტის ველები ნორმალიზებული
  assert.deepEqual(sanitizeGameState({ season: 'monsoon', crackStage: 99, lostCopies: -4, cycle: 'x' }, cfg),
    { day: 0, season: 'autumn', crackStage: 4, lostCopies: 0, cycle: 1, paintingFallen: false });
  assert.deepEqual(sanitizeGameState(null, cfg), { day: 0, season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1, paintingFallen: false });
  assert.deepEqual(sanitizeGameState({ season: 'summer', crackStage: '3', lostCopies: 3, cycle: 2, paintingFallen: true }, cfg),
    { day: 270, season: 'summer', crackStage: 3, lostCopies: 3, cycle: 2, paintingFallen: true });
  assert.equal(sanitizeGameState({ paintingFallen: 'yes' }, cfg).paintingFallen, false);
});

test('ჩამოვარდნილი სურათი პრომპტში ჩნდება', () => {
  const on = buildPrompt({ speaker: byId.vaso, gameState: { ...GS, paintingFallen: true }, cfg }).systemInstruction;
  const off = buildPrompt({ speaker: byId.vaso, gameState: { ...GS, paintingFallen: false }, cfg }).systemInstruction;
  assert.ok(on.includes('has just fallen off the wall'));
  assert.ok(!off.includes('has just fallen off the wall'));
});
