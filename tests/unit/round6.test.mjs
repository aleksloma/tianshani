// Round 6 (FIXES_ROUND6.md): §2 თანამდებობის სიტყვა ეკრანზე, §3 ორი ტაქტის კავშირი + ფრაზების „როდის“, §4 კონტექსტი (კლიენტის ფანჯარა, mock-ის „მეხსიერება“).
import test from 'node:test';
import assert from 'node:assert/strict';
import { characters, byId, publicList, ROLE_DISPLAY_KA } from '../../src/characters.js';
import { buildPrompt } from '../../src/prompt.js';

const CFG = { game: {} };
const GS = { day: 0, season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1 };

// ---------- §2 ----------

test('§2 გრიშა: ეკრანზე „სამეურნეო ნაწილის გამგე“ (ფირფიტა, მენიუ, ჩატის სათაური); მონაცემი და პრომპტი — „მნე“', () => {
  const list = Object.fromEntries(publicList(12).map((c) => [c.id, c]));
  assert.equal(list.grisha.role_ka, 'სამეურნეო ნაწილის გამგე');
  assert.equal(list.grisha.role_short_ka, 'სამეურნეო ნაწილის გამგე');
  // მონაცემი უცვლელია; სიტყვა მონაცემიდანაა (name_ka-ს ფრჩხილებში)
  assert.equal(byId.grisha.role_ka, 'მნე');
  assert.ok(byId.grisha.name_ka.includes('(სამეურნეო ნაწილის გამგე)'));
  // სხვა არავის — მხოლოდ გრიშა (Round 6 §2: „ერთადერთი გაუგებარი სიტყვა“)
  assert.deepEqual(Object.keys(ROLE_DISPLAY_KA), ['grisha']);
  for (const c of characters) {
    if (c.id === 'grisha') continue;
    assert.equal(list[c.id].role_ka, c.role_ka, c.id);
    assert.equal(list[c.id].role_short_ka, c.role_short_ka, c.id);
  }
  // LLM-ის პრომპტში გრიშა ისევ „მნე“-ა (საკუთარ ბლოკშიც და სხვის გადამისამართებაშიც)
  assert.ok(buildPrompt({ speaker: byId.grisha, gameState: GS, cfg: CFG }).systemInstruction.includes('გრიშა — მნე'));
  const who = characters.find((c) => (c.redirects_to || []).includes('grisha'));
  if (who) assert.ok(buildPrompt({ speaker: who, gameState: GS, cfg: CFG }).systemInstruction.includes(`${byId.grisha.short_name_ka} (მნე)`));
});
