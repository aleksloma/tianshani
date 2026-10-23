// prompt.js: system prompt-ის ბლოკები, უხილავის ხმა არასდროს, few-shot, gameState-ის ნორმალიზაცია.
import test from 'node:test';
import assert from 'node:assert/strict';
import { byId, world } from '../../src/characters.js';
import { buildPrompt, sanitizeGameState, GENERAL_RULES_EN, fewShot } from '../../src/prompt.js';

const cfg = {
  game: { seasons: ['autumn', 'winter', 'spring', 'summer'], crack_stages: 5, copies: 3, exchanges_per_season: 8 },
};
const GS = { season: 'winter', crackStage: 2, lostCopies: 2, cycle: 1 };

test('ზოგადი ინსტრუქცია: 15–25 წესი, ენის/სიგრძის/ხელნაწერის/AI წესები', () => {
  assert.ok(GENERAL_RULES_EN.length >= 15 && GENERAL_RULES_EN.length <= 25, String(GENERAL_RULES_EN.length));
  const all = GENERAL_RULES_EN.join('\n');
  for (const needle of ['LANGUAGE', 'LENGTH', 'NEVER read the manuscript', 'Shukri', 'Mikho', 'Soso', 'AI', 'calm', 'ONE famous catchphrase', 'Time loops', 'season']) {
    assert.ok(all.includes(needle), needle);
  }
});

test('ხილული პერსონაჟი: სამყარო + წესები + პერსონაჟი + სეზონი, წარმომადგენლის ბლოკის გარეშე', () => {
  const { systemInstruction: s, fewShot: fs } = buildPrompt({ speaker: byId.director, gameState: GS, cfg });
  assert.ok(s.includes(world.setting_en));
  assert.ok(s.includes(world.setting_ka));
  assert.ok(s.includes(world.core_rules_en[0]));
  assert.ok(s.includes('ძალიან კარგი!'));                     // shared idiom / catchphrase
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

test('უხილავი: წარმომადგენლის პრომპტი + „არ არის ადგილზე“; უხილავის system_prompt_en ხმად არ გამოიყენება', () => {
  const { systemInstruction: s, fewShot: fs } = buildPrompt({ speaker: byId.soso, invisible: byId.givi, gameState: GS, cfg });
  assert.ok(s.includes(byId.soso.system_prompt_en), 'proxy-ს ხმა');
  assert.ok(!s.includes(byId.givi.system_prompt_en), 'გივის system prompt არ უნდა იყოს');
  assert.ok(s.includes('The user has come looking for გივი'));
  assert.ok(s.includes('You are NOT that person'));
  assert.ok(s.includes('Never speak as გივი'));
  assert.ok(s.includes('მივლინებაშია'), 'ფაქტები');
  assert.deepEqual(fs, fewShot(byId.soso), 'few-shot — წარმომადგენლისა');
});

test('ახალი შენობა (ციკლი > 1) ჩნდება პრომპტში', () => {
  const { systemInstruction: s } = buildPrompt({ speaker: byId.tina, gameState: { ...GS, cycle: 3 }, cfg });
  assert.ok(s.includes('ახალ შენობაში ვართ, ყველაფერი თავიდან'));
  assert.ok(s.includes('building №3'));
});

test('sanitizeGameState: არასწორი მნიშვნელობები ნორმალიზდება', () => {
  assert.deepEqual(sanitizeGameState({ season: 'monsoon', crackStage: 99, lostCopies: -4, cycle: 'x' }, cfg),
    { season: 'autumn', crackStage: 4, lostCopies: 0, cycle: 1, paintingFallen: false });
  assert.deepEqual(sanitizeGameState(null, cfg), { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1, paintingFallen: false });
  assert.deepEqual(sanitizeGameState({ season: 'summer', crackStage: '3', lostCopies: 3, cycle: 2, paintingFallen: true }, cfg),
    { season: 'summer', crackStage: 3, lostCopies: 3, cycle: 2, paintingFallen: true });
  assert.equal(sanitizeGameState({ paintingFallen: 'yes' }, cfg).paintingFallen, false);
});

test('ჩამოვარდნილი სურათი პრომპტში ჩნდება', () => {
  const on = buildPrompt({ speaker: byId.vaso, gameState: { ...GS, paintingFallen: true }, cfg }).systemInstruction;
  const off = buildPrompt({ speaker: byId.vaso, gameState: { ...GS, paintingFallen: false }, cfg }).systemInstruction;
  assert.ok(on.includes('has just fallen off the wall'));
  assert.ok(!off.includes('has just fallen off the wall'));
});
