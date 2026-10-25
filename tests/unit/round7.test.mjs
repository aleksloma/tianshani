// FIXES_ROUND7: §1 გადამისამართების ღილაკი სახელით ნახსენები პერსონაჟიდან.
import test from 'node:test';
import assert from 'node:assert/strict';
import { characters, byId } from '../../src/characters.js';
import { NAME_FORMS, NAME_STOPWORDS, findMentions, mentions } from '../../src/names.js';
import { detectRedirect } from '../../src/redirect.js';
import { composeMockReply, sendTo } from '../../src/mock.js';
import { toward } from '../../public/js/names.js';

const GS0 = { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1, day: 0 };

// ---------- §1 ----------

test('§1 toward: „-სთან“ სწორი ბრუნვით (ხმოვანზე / თანხმოვანზე / მრავალსიტყვიანი)', () => {
  const cases = {
    გრიშა: 'გრიშასთან', კოტე: 'კოტესთან', სოსო: 'სოსოსთან', ვასო: 'ვასოსთან', თინა: 'თინასთან',
    ოთარი: 'ოთართან', იროდიონი: 'იროდიონთან', კოპალეიშვილი: 'კოპალეიშვილთან',
    გივი: 'გივისთან', ლალი: 'ლალისთან', შუქრი: 'შუქრისთან',
    'ქალბატონი თამარი': 'ქალბატონ თამართან', 'ვაჟა ზაზაევიჩი': 'ვაჟა ზაზაევიჩთან',
    'ორი დიდი კაცი': 'ორ დიდ კაცთან', 'ბელას ქმარი': 'ბელას ქმართან', მურმანიძე: 'მურმანიძესთან',
  };
  for (const [n, want] of Object.entries(cases)) assert.equal(toward(n), want, n);
  // ყველა პერსონაჟის ღილაკი „-თან“-ით მთავრდება და სახელს შეიცავს
  for (const c of characters) assert.match(toward(c.short_name_ka), /თან$/, c.id);
});

test('§1 სახელის ფორმები მონაცემებიდან: თანამდებობა/აღწერა არ ითვლება; ყველას აქვს სახელი, გარდა „ორი დიდი კაცისა“', () => {
  for (const c of characters) {
    const f = NAME_FORMS[c.id];
    const all = [...f.cons, ...f.vow];
    if (c.id === 'two_big_men') { assert.deepEqual(all, [], 'მხოლოდ აღწერაა, სახელი არა'); continue; }
    assert.ok(all.length >= 1, c.id);
    for (const r of all) assert.ok(!NAME_STOPWORDS.has(r) && !NAME_STOPWORDS.has(`${r}ი`), `${c.id}: ${r}`);
  }
  assert.deepEqual(NAME_FORMS.leri, { cons: ['ლერ'], vow: ['ლერი'] }, '„ბელას“ ბელას ეკუთვნის');
  assert.ok(!NAME_FORMS.grisha.vow.includes('მნე') && !NAME_FORMS.director.cons.includes('დირექტორ'));
});

test('§1 მატჩერი: ბრუნვის ფორმები, სიტყვის საზღვარი, სხვა სიტყვის ნაწილი არა', () => {
  const ids = (t) => findMentions(t).map((m) => m.id);
  for (const t of ['გრიშა', 'გრიშას', 'გრიშასთან ჩაიარე ქვევით', 'გრიშამ თქვა', 'გრიშაც აქაა', 'გრიშასთანაც']) assert.deepEqual(ids(t), ['grisha'], t);
  for (const t of ['ოთარი', 'ოთარს', 'ოთართან', 'ოთარმა', 'ოთარო!', 'კოპალეიშვილს ჰკითხეთ']) assert.ok(ids(t).length === 1, t);
  assert.deepEqual([...new Set(ids('ოთარ დავიდოვიჩს მიმართეთ'))], ['otari']);
  assert.deepEqual(ids('კოტეს ჰკითხე'), ['kote']);
  assert.deepEqual(ids('ვასოსთან შეიარე'), ['vaso']);
  assert.deepEqual(ids('გივი ოთახში არ არის, გივის ეძებენ'), ['givi', 'givi']);
  // სხვა სიტყვის ნაწილი / მსგავსი სიტყვა — არა
  for (const t of ['მოგივა', 'ბელადი', 'თინათინი', 'ლალისფერი ცა', 'დირექტორთან ჩაიარე', 'მნე მოვიდა']) assert.deepEqual(ids(t), [], t);
  assert.equal(mentions('ჩემმა ქმარმა წაიღო', 'leri', 'bela'), true);
  assert.equal(mentions('ჩემმა ქმარმა წაიღო', 'leri', 'tina'), false);
});

test('§1 detectRedirect: ბოლოს ნახსენები; არასდროს მოსაუბრე / მიმდინარე უხილავი; უხილავიც შეიძლება; მომხმარებლის სახელი არ ითვლება', () => {
  // ოთარის სცენა (FIXES_ROUND7 §1): „გრიშასთან ჩაიარე ქვევით“
  assert.equal(detectRedirect({ speaker: byId.otari, reply: 'ოთხი თვე? კოპალეიშვილს გადავეცი.\nგრიშასთან ჩაიარე ქვევით.', currentId: 'otari' }), 'grisha');
  assert.equal(detectRedirect({ speaker: byId.otari, reply: 'გრიშასთან იყავი? აბა, კოპალეიშვილს გადავეცი.', currentId: 'otari' }), 'kopaleishvili');
  // უხილავის ჩატი: წარმომადგენელი უხილავს ასახელებს — ეს ღილაკი არ არის; სხვა კარი — არის
  assert.equal(detectRedirect({ speaker: byId.soso, reply: 'გივი ოთახში არ არის.', currentId: 'givi' }), null);
  assert.equal(detectRedirect({ speaker: byId.soso, reply: 'გივი ოთახში არ არის.\nთინასთან დატოვეთ.', currentId: 'givi' }), 'tina');
  assert.equal(detectRedirect({ speaker: byId.tina, reply: '*(ტელეფონი რეკავს)* სოსო, შენ არა… გივი ისევ არ ჩანს.', currentId: 'tina' }), 'givi');
  // მომხმარებელს სოსო ჰქვია → „სოსო, ...“ მიმართვაა, არა სოსო-პერსონაჟის ხსენება
  assert.equal(detectRedirect({ speaker: byId.tina, reply: 'სოსო, დაბრძანდით.', currentId: 'tina', userName: 'სოსო' }), null);
  assert.equal(detectRedirect({ speaker: byId.tina, reply: 'სოსო, დაბრძანდით.', currentId: 'tina', userName: 'ნინო' }), 'soso');
});

test('§1 mock: მომხმარებელი სხვას ასახელებს → „<სახელი>-სთან ჩაიარეთ.“ (დეტერმინისტული, ტესტებისთვის)', () => {
  assert.equal(sendTo({ speaker: byId.otari, invisible: null, userText: 'გრიშა სად არის?' }), 'grisha');
  assert.equal(sendTo({ speaker: byId.otari, invisible: null, userText: 'ოთარ დავიდოვიჩ, წაიკითხეთ?' }), null, 'საკუთარი სახელი');
  assert.equal(sendTo({ speaker: byId.soso, invisible: byId.givi, userText: 'გივი აქ არის?' }), null, 'მიმდინარე უხილავი');
  const r = composeMockReply({ speaker: byId.otari, invisible: null, userText: 'გრიშა სად არის?', historyLen: 0, gameState: GS0 });
  assert.ok(r.endsWith('გრიშასთან ჩაიარეთ.'), r);
  assert.equal(detectRedirect({ speaker: byId.otari, reply: r, currentId: 'otari' }), 'grisha');
  const g = composeMockReply({ speaker: byId.tina, invisible: null, userText: 'გივი სად არის?', historyLen: 0, gameState: GS0 });
  assert.ok(g.endsWith('გივისთან ჩაიარეთ.'), g);
});
