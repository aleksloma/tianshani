// FIXES_ROUND9 API (mock LLM): მოქმედებას მომხმარებლის სიტყვები მოჰყვება — კონტრაქტი იგივეა, პასუხში ორივე ნაწილი.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, cookieJar, chat, GS } from '../helpers.mjs';
import { initialCopies, summaryForServer, actionText, actionMessage } from '../../public/js/manuscript.js';
import { withDefaults } from '../../public/js/calendar.js';
import { byId } from '../../src/characters.js';
import { composeMockReply } from '../../src/mock.js';

let S;
before(async () => { S = await startTestServer(); });
after(async () => { await S.close(); });

const G = withDefaults({});
const stage = actionText('hand_over', 'ნინო', byId.vaso.short_name_ka);
const body = (content) => ({
  characterId: 'vaso',
  messages: [{ role: 'user', content }],
  gameState: { ...GS, day: 40 },
  userName: 'ნინო',
  action: { type: 'hand_over', copyId: 1, integrity: 'full' },
  manuscript: summaryForServer(initialCopies(G, 1)),
});

test('§1 მოქმედება + სიტყვები: ერთი მოთხოვნა, accepted, პასუხში თესლიც და სიტყვებზე პასუხიც; ლოგში ერთი მომხმარებლის რიგი ორივე ნაწილით', async () => {
  const jar = cookieJar();
  const content = actionMessage(stage, 'როგორ ხარ?');
  const r = await chat(S.base, body(content), { jar });
  assert.equal(r.status, 200);
  assert.deepEqual(r.done.action_result, { type: 'hand_over', copyId: 1, outcome: 'accepted', integrity: 'full' });
  assert.ok(r.reply.includes('კარგი, დამიტოვე, ამაღამვე დავიწყებ.'), r.reply);
  const normal = composeMockReply({ speaker: byId.vaso, invisible: null, historyLen: 0, gameState: { ...GS, day: 40 }, userText: 'როგორ ხარ?' }).split('\n')[1];
  assert.ok(r.reply.includes(normal), `${r.reply}\n— ${normal}`);
  const rows = S.store.db.prepare('SELECT role, content, action FROM messages WHERE client_id = ? ORDER BY id').all(jar.get('tianshani_cid'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].content, '*ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.*\nროგორ ხარ?');
  assert.deepEqual(rows.map((x) => x.action), ['hand_over:accepted', 'hand_over:accepted']);
});

test('§1 მოქმედება სიტყვების გარეშე — Round 8-ის პასუხი უცვლელია (იგივე ტექსტი, რაც mock-ს ადრე ჰქონდა)', async () => {
  const r = await chat(S.base, body(stage));
  assert.equal(r.status, 200);
  assert.equal(r.done.action_result.outcome, 'accepted');
  const expected = composeMockReply({
    speaker: byId.vaso, invisible: null, historyLen: 0, gameState: { ...GS, day: 40 }, userText: stage, userName: 'ნინო',
    manuscript: summaryForServer(initialCopies(G, 1)), actionResult: { outcome: 'accepted' },
  });
  assert.equal(r.reply.trim(), expected);
  assert.equal(expected.split('\n').length, 3, 'რემარკა + თესლი + შტრიხი, დამატებითი ხაზის გარეშე');
});
