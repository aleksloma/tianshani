// FIXES_ROUND8 API (mock LLM): ეგზემპლარის გადაცემა / გამორთმევა — შედეგს სერვერი წყვეტს, done.action_result, ლოგი.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, cookieJar, chat, userMsg, GS } from '../helpers.mjs';
import { initialCopies, applyHandOver, applyStep, summaryForServer, actionText } from '../../public/js/manuscript.js';
import { withDefaults } from '../../public/js/calendar.js';
import { byId, manuscriptBehaviour as BEH } from '../../src/characters.js';

let S;
before(async () => { S = await startTestServer(); });
after(async () => { await S.close(); });

const G = withDefaults({});
const fresh = () => initialCopies(G, 1);
const ALWAYS = () => () => 0;
const step = (store, override, chain = null) => applyStep(store, { ...G, manuscript: { probability_scale: 1000, stray_page_probability: 0, event_override: override, chain_override: chain } }, BEH, 20, ALWAYS, byId).store;

/** მოქმედების მოთხოვნა: ბოლო მომხმარებლის შეტყობინება — რემარკა, როგორც კლიენტი აგზავნის. */
function act(characterId, type, store, { copyId = 1, jar = null, extra = {} } = {}) {
  const short = byId[characterId].short_name_ka;
  return chat(S.base, {
    characterId,
    messages: userMsg(actionText(type, 'ნინო', short)),
    gameState: { ...GS, day: 40 },
    userName: 'ნინო',
    action: { type, copyId, integrity: 'full' },
    manuscript: summaryForServer(store),
    ...extra,
  }, { jar });
}

test('§3.3 hand_over ვასოს → accepted; done.action_result; ორივე ლოგის რიგში action + manuscript', async () => {
  const jar = cookieJar();
  const r = await act('vaso', 'hand_over', fresh(), { jar });
  assert.equal(r.status, 200);
  assert.deepEqual(r.done.action_result, { type: 'hand_over', copyId: 1, outcome: 'accepted', integrity: 'full' });
  assert.ok(r.reply.includes('კარგი, დამიტოვე, ამაღამვე დავიწყებ.'), r.reply);
  const rows = S.store.db.prepare('SELECT role, content, action, manuscript FROM messages WHERE client_id = ? ORDER BY id').all(jar.get('tianshani_cid'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].content, '*ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.*');
  for (const row of rows) {
    assert.equal(row.action, 'hand_over:accepted');
    const m = JSON.parse(row.manuscript);
    assert.deepEqual([m.inHand, m.lost, m.total, m.copies.length], [3, 0, 3, 3]);
  }
});

test('§3.3 hand_over შუქრის და თამარს → refused, reason_ka = refuse_ka; პასუხში თესლი', async () => {
  for (const id of ['shukri', 'tamari']) {
    const r = await act(id, 'hand_over', fresh());
    assert.equal(r.status, 200, id);
    assert.deepEqual(r.done.action_result, { type: 'hand_over', copyId: 1, outcome: 'refused', integrity: 'full', reason_ka: BEH[id].refuse_ka }, id);
    assert.ok(r.reply.includes(BEH[id].refuse_ka.split(/[.!]/)[0]), r.reply); // mock ყოველ წინადადებას ახალ ხაზზე წერს
  }
});

test('§3.3 hand_over მფლობელს → 409 already_holds; უხილავს → 400 not_reachable; არასწორი action / manuscript → 400', async () => {
  const holds = applyHandOver(fresh(), 1, 'vaso', 0);
  let r = await act('vaso', 'hand_over', holds, { copyId: 2 });
  assert.deepEqual([r.status, r.json.error], [409, 'already_holds']);
  r = await act('givi', 'hand_over', fresh());
  assert.deepEqual([r.status, r.json.error], [400, 'not_reachable']);
  r = await act('vaso', 'hand_over', fresh(), { extra: { action: { type: 'burn', copyId: 1 } } });
  assert.equal(r.status, 400);
  r = await act('vaso', 'hand_over', fresh(), { extra: { action: { type: 'hand_over', copyId: 9 } } });
  assert.equal(r.status, 400);
  const bad = summaryForServer(fresh());
  bad.copies[0].holder = 'givi'; bad.copies[0].status = 'held';
  r = await act('vaso', 'hand_over', fresh(), { extra: { manuscript: bad } });
  assert.equal(r.status, 400);
  // არასწორი manuscript მოქმედების გარეშეც
  r = await chat(S.base, { characterId: 'vaso', messages: userMsg('გამარჯობა'), gameState: GS, manuscript: { copies: [] } });
  assert.equal(r.status, 400);
});

test('§3.3 retrieve მფლობელისგან → returned (მთლიანობით); არაფერი აქვს → 409 nothing_to_retrieve', async () => {
  let s = applyHandOver(fresh(), 2, 'vaso', 0);
  s = { ...s, copies: s.copies.map((c) => (c.id === 2 ? { ...c, integrity: 'half' } : c)) };
  const r = await act('vaso', 'retrieve', s, { copyId: 2 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.done.action_result, { type: 'retrieve', copyId: 2, outcome: 'returned', integrity: 'half' });
  assert.ok(r.reply.includes('ბოლომდე ვერ მოვასწარი'));
  const none = await act('kote', 'retrieve', fresh());
  assert.deepEqual([none.status, none.json.error], [409, 'nothing_to_retrieve']);
});

test('§3.3 retrieve დაკარგულის ბოლო მფლობელისგან → not_returned + მიზეზი; ხილული to → suggested_redirect', async () => {
  // claim-ის გარეშე: დირექტორი „ბანკში დამრჩა“
  const lost = step(applyHandOver(fresh(), 1, 'director', 0), 'misplaced');
  let r = await act('director', 'retrieve', lost);
  assert.equal(r.status, 200);
  assert.deepEqual(r.done.action_result, { type: 'retrieve', copyId: 1, outcome: 'not_returned', integrity: 'none', reason_ka: 'ბანკში დამრჩა. სესხბანკში თუ მშენბანკში — ვერ გეტყვი.' });
  // ჯაჭვი თინამდე ვერ მივიდა: დირექტორი „თინას მივეცი“ → → მივიდე თინასთან
  const chainLost = step(applyHandOver(fresh(), 1, 'director', 0), 'passed_on', 'lose');
  r = await act('director', 'retrieve', chainLost);
  assert.equal(r.done.action_result.outcome, 'not_returned');
  assert.equal(r.done.action_result.reason_ka, 'თინას მივეცი, უჯრაში ჩადო, როგორც წესია.');
  assert.equal(r.done.suggested_redirect, 'tina');
  assert.ok(r.reply.trimEnd().endsWith('თინასთან ჩაიარეთ.'), r.reply);
  // უხილავი to (ოთარი → კოპალეიშვილი): მიზეზი იგივე, „ჩაიარეთ“ არა
  const otari = step(applyHandOver(fresh(), 1, 'otari', 0), 'passed_on');
  r = await act('otari', 'retrieve', otari);
  assert.equal(r.done.action_result.outcome, 'not_returned');
  assert.ok(!r.reply.includes('ჩაიარეთ'));
});

test('§3.3 უკუთავსებადობა: action / manuscript-ის გარეშე ჩატი მუშაობს (ყველა ეგზემპლარი ხელშია); action_result არ არის', async () => {
  const jar = cookieJar();
  const r = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS }, { jar });
  assert.equal(r.status, 200);
  assert.ok(r.done);
  assert.equal('action_result' in r.done, false);
  const rows = S.store.db.prepare('SELECT action, manuscript FROM messages WHERE client_id = ?').all(jar.get('tianshani_cid'));
  assert.deepEqual(rows, [{ action: null, manuscript: null }, { action: null, manuscript: null }]);
});

test('§6 /api/characters: manuscript_behaviour ცხრილი და config.game.manuscript; seasons_per_lost_copy აღარ არის', async () => {
  const j = await (await fetch(`${S.base}/api/characters`)).json();
  assert.deepEqual(Object.keys(j.manuscript_behaviour).sort(), Object.keys(BEH).sort());
  assert.equal(j.manuscript_behaviour.vaso.p_event, 0.40);
  assert.deepEqual(
    Object.fromEntries(Object.entries(j.config.game.manuscript).filter(([k]) => !k.startsWith('_'))),
    { probability_scale: 1, stray_page_probability: 0.4, chain_floor: 0.15, chain_ceiling: 0.9, chain_override: null, event_override: null },
  );
  assert.equal('seasons_per_lost_copy' in j.config.game, false);
});

test('§7.5 მფლობელი ხელნაწერზე (მოქმედების გარეშე) → mock მის საბაბს იმეორებს; proxy-ში ღილაკის მოქმედება არ მიიღება', async () => {
  const s = applyHandOver(fresh(), 1, 'boria', 0);
  const r = await chat(S.base, { characterId: 'boria', messages: userMsg('ხელნაწერი როგორაა?'), gameState: { ...GS, day: 40 }, manuscript: summaryForServer(s) });
  assert.equal(r.status, 200);
  assert.ok(r.reply.includes('სახლში დამრჩა, ალიონზე მოგიტანთ.'), r.reply);
});
