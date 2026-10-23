// characters.js: კონტენტის ქულა, კედლის შერჩევა, წარმომადგენელთა რუკა, საჯარო სია.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  characters, byId, wallCharacters, proxyMap, pickProxy, publicList, contentScore, shortName, nameStems,
} from '../../src/characters.js';

const RAW = JSON.parse(fs.readFileSync(new URL('../../characters.json', import.meta.url), 'utf8'));
const INVISIBLE = ['givi', 'kuparadze', 'murmanidze', 'gamkrelidze', 'zina', 'kopaleishvili', 'tsverava', 'khaburdzania', 'shota'];

test('characters.json იტვირთება სრულად (29 პერსონაჟი) და არ იცვლება', () => {
  assert.equal(characters.length, 29);
  assert.equal(RAW.characters.length, 29);
  assert.deepEqual(new Set(characters.map((c) => c.id)), new Set(RAW.characters.map((c) => c.id)));
});

test('კონტენტის ქულა: მთავარი/ეკრანზე მყოფი > უხილავი; დალაგება კლებადია', () => {
  assert.ok(contentScore(byId.director) > contentScore(byId.givi));
  const visible = characters.filter((c) => c.reachable);
  for (let i = 1; i < visible.length; i++) assert.ok(visible[i - 1].content_score >= visible[i].content_score);
  // ყველა უხილავი სიის ბოლოშია
  const firstInvisible = characters.findIndex((c) => !c.reachable);
  assert.ok(characters.slice(firstInvisible).every((c) => !c.reachable));
});

test('კედელზე ტოპ 12 ხილული პერსონაჟი ქულით (სპეცის მოსალოდნელი შედგენილობა)', () => {
  const wall = wallCharacters(12).map((c) => c.id);
  assert.equal(wall.length, 12);
  assert.ok(wall.every((id) => byId[id].reachable));
  for (const id of ['soso', 'director', 'vaso', 'marksheideri', 'irodioni', 'tamari', 'grisha', 'mikho', 'bela', 'tina', 'otari', 'shukri']) {
    assert.ok(wall.includes(id), `${id} კედელზე უნდა იყოს`);
  }
  assert.equal(wallCharacters(10).length, 10);
});

test('9 უხილავი პერსონაჟი unreachable-ია და ყველას აქვს ≥2 ხილული წარმომადგენელი', () => {
  const inv = characters.filter((c) => !c.reachable).map((c) => c.id).sort();
  assert.deepEqual(inv, [...INVISIBLE].sort());
  for (const id of INVISIBLE) {
    const list = proxyMap[id];
    assert.ok(Array.isArray(list) && list.length >= 2, `${id}: ${list}`);
    for (const p of list) {
      assert.ok(byId[p], `${id} → ${p} არსებობს`);
      assert.ok(byId[p].reachable, `${id} → ${p} ხილულია`);
      assert.notEqual(p, 'leri');
    }
  }
  // მონაცემებიდან აშკარა კავშირები
  assert.ok(proxyMap.givi.includes('two_big_men'));
  assert.ok(proxyMap.kopaleishvili.includes('otari'));
  assert.ok(proxyMap.zina.includes('tamari'));
  assert.ok(proxyMap.tsverava.includes('irodioni'));
  assert.ok(proxyMap.murmanidze.includes('director'));
  assert.ok(proxyMap.kuparadze.includes('marksheideri'));
});

test('pickProxy: preferred ~70%-ით ჭარბობს, დანარჩენი შემთხვევით სიიდან', () => {
  let seq = 0;
  const rnd = () => { seq = (seq * 9301 + 49297) % 233280; return seq / 233280; };
  const pref = proxyMap.givi[1];
  const counts = {};
  for (let i = 0; i < 2000; i++) { const p = pickProxy('givi', pref, rnd); counts[p] = (counts[p] || 0) + 1; }
  assert.ok(counts[pref] / 2000 > 0.65, JSON.stringify(counts));
  assert.ok(Object.keys(counts).every((p) => proxyMap.givi.includes(p)));
  assert.ok(Object.keys(counts).length > 1, 'ვარიაცია');
});

test('publicList: არ შეიცავს პრომპტებს; on_wall/reachable/order ველები', () => {
  const list = publicList(12);
  const json = JSON.stringify(list);
  assert.ok(!json.includes('system_prompt_en'));
  assert.ok(!json.includes('You are'));
  assert.equal(list.filter((c) => c.on_wall).length, 12);
  for (const c of list) {
    for (const k of ['id', 'name_ka', 'short_name_ka', 'role_ka', 'image', 'on_wall', 'content_score', 'order', 'reachable']) assert.ok(k in c, `${c.id}.${k}`);
  }
});

test('shortName / nameStems', () => {
  assert.equal(shortName('ვაჟა ზაზაევიჩი (ბატონი ვაჟა) — დირექტორი'), 'ვაჟა ზაზაევიჩი');
  assert.equal(shortName('თინა — დირექტორის მდივანი'), 'თინა');
  // სახელი ≠ თანამდებობა ფირფიტაზე
  assert.equal(byId.tamari.short_name_ka, 'ქალბატონი თამარი');
  assert.equal(byId.tamari.role_short_ka, 'ბუღალტერი');
  assert.equal(byId.mikho.short_name_ka, 'მიხო');
  assert.equal(byId.director.short_name_ka, 'ვაჟა ზაზაევიჩი');
  for (const c of characters) assert.notEqual(c.short_name_ka, c.role_short_ka, c.id);
  assert.ok(nameStems(byId.otari).includes('ოთარ'));
  assert.ok(nameStems(byId.kopaleishvili).some((s) => 'კოპალეიშვილს'.includes(s)));
});
