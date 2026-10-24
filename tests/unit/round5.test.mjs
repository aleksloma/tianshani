// Round 5 (FIXES_ROUND5.md): §1 სკრიპტული ხაზის მიგრაცია, §2 ახალი შენობა განულებისას, §3 SSE-ის პარსინგი და რემარკა წინადადების შუაში.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripScripted, migrateChats, getChats, getJSON, setJSON, KEYS } from '../../public/js/storage.js';

// ---------- §1 მიგრაცია ----------

const OLD = {
  director: [
    { role: 'assistant', content: '*(ყურმილს არ უშვებს)* დიახ, დიახ…', ts: 1, scripted: true },
    { role: 'user', content: 'გამარჯობათ', ts: 2 },
    { role: 'assistant', content: 'ძალიან კარგი!', ts: 3, spoken_by: 'director', redirect: 'otari' },
  ],
  givi: [{ role: 'assistant', content: 'გივი ოთახში არ არის.', ts: 4, scripted: true, spoken_by: 'two_big_men' }],
  vaso: [{ role: 'user', content: 'როგორ ხართ?', ts: 5 }, { role: 'assistant', content: 'ვზივარ.', ts: 6, spoken_by: 'vaso' }],
};

test('§1 stripScripted: scripted: true ქრება, დანარჩენი უცვლელია (თანმიმდევრობა, ველები); ცარიელი ჩატი ქრება', () => {
  const out = stripScripted(OLD);
  assert.deepEqual(Object.keys(out).sort(), ['director', 'vaso'], 'გივის მხოლოდ სკრიპტული ხაზი ჰქონდა → გასაღები ქრება');
  assert.deepEqual(out.director, OLD.director.slice(1));
  assert.deepEqual(out.vaso, OLD.vaso);
  assert.equal(OLD.director.length, 3, 'შემავალი ობიექტი არ იცვლება');
  // scripted: false / სხვა მნიშვნელობა — რჩება (მხოლოდ ზუსტად true იშლება)
  assert.equal(stripScripted({ a: [{ role: 'user', content: 'x', scripted: false }] }).a.length, 1);
});

test('§1 stripScripted: ნაგავზე არ ვარდება', () => {
  for (const bad of [null, undefined, 42, 'str', [], [1, 2]]) assert.deepEqual(stripScripted(bad), {});
  assert.deepEqual(stripScripted({ a: 'not-an-array', b: null, c: [null, 7, 'x', { role: 'user', content: 'ok' }] }), { c: [{ role: 'user', content: 'ok' }] });
});

test('§1 migrateChats: tianshani.chats ფიზიკურად იწმინდება, ერთხელ; სუფთა ისტორიას არ ეხება', () => {
  // Node-ში localStorage არ არის → storage.js მეხსიერებაში მუშაობს (იგივე getJSON/setJSON)
  setJSON(KEYS.chats, OLD);
  assert.equal(migrateChats(), true);
  const stored = getJSON(KEYS.chats, null);
  assert.ok(!JSON.stringify(stored).includes('"scripted":true'));
  assert.deepEqual(stored, stripScripted(OLD));
  assert.equal(migrateChats(), false, 'მეორედ შესაცვლელი აღარაფერია');
  // getChats ყოველთვის სუფთაა, თუნდაც ვინმემ მიგრაციის შემდეგ ძველი ჩაწეროს
  setJSON(KEYS.chats, { tina: [{ role: 'assistant', content: 'დაბრძანდით', scripted: true }] });
  assert.deepEqual(getChats(), {});
  // ისტორია არ არსებობს → არაფერი იწერება
  setJSON(KEYS.chats, null);
  assert.equal(migrateChats(), false);
});
