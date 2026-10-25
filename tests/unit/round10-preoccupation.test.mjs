// Round 10 §5 (FIXES_ROUND10.md): მარკშეიდერის საკუთარი თემა — შენობა (ბზარი მთავარია), ~2–3 პასუხი ათიდან.
import test from 'node:test';
import assert from 'node:assert/strict';
import { characters, byId, publicList } from '../../src/characters.js';
import { pacingState, preoccupationLine, touchPool, catchphraseAllowed } from '../../src/pacing.js';

const M = byId.marksheideri;
const PRE = M.preoccupation;
const PREFIX = 'YOUR OWN SUBJECT for beat 2 in THIS reply (your own words; not a catchphrase, not limited by the catchphrase rule): ';

/** რომელი ვარიანტი აირჩია ხაზმა („This time: …“). */
const variantOf = (line) => PRE.variants.findIndex((v) => line.endsWith(`This time: ${v.en}.`));

/** თითო ვარიანტზე ბუნებრივი პასუხი, რომელიც მხოლოდ მის ძირებს შეიცავს. */
const TOPIC_REPLY = [
  'ეს ბზარი ადრეც იყო აქ თუ ახლა გაჩნდა?',
  'ეს კედელი ცოტა დახრილი ხომ არ გეჩვენებათ?',
  'იატაკი ოდნავ ირიბადაა, ხომ ხედავთ?',
  'აი, კიდევ შემაქანა — ქვემოდან, მგონი.',
  'ჭერიდან ბათქაში ისევ ცვივა.',
  'კარი ისევ ვეღარ იხურება — ჩარჩო ალბათ კედელმა დაწია.',
];
const PLAIN_REPLY = ['დიახ, გასაგებია.', 'ჩაი გნებავთ?', 'ხვალ ვნახოთ, ბატონო.', 'ეგ ჩემი საქმე არ არის.'];

/** 40-პასუხიანი ჩატი: სადაც ხაზი pool-შია, პასუხი მის ვარიანტს ეხება; სხვაგან — თემის გარეშე. */
function simulate(speaker, replies = 40) {
  const history = [];
  const forced = [];
  for (let n = 0; n < replies; n++) {
    history.push({ role: 'user', content: `შეკითხვა ${n + 1}` });
    const p = pacingState(history, speaker);
    const line = preoccupationLine(speaker, p);
    const pool = touchPool(speaker, p);
    if (line) {
      assert.equal(pool[0], line, 'ხაზი pool-ის პირველია');
      const v = variantOf(line);
      forced.push({ n, v });
      history.push({ role: 'assistant', content: TOPIC_REPLY[v] });
    } else {
      assert.ok(!pool.some((x) => x.startsWith('YOUR OWN SUBJECT')), 'სხვა პასუხებში თემა pool-ში არ არის');
      history.push({ role: 'assistant', content: PLAIN_REPLY[n % PLAIN_REPLY.length] });
    }
  }
  return forced;
}

test('§5 preoccupations.json: მხოლოდ მარკშეიდერს; ექვსი ვარიანტი keywords_ka-თი; კლიენტს არ ეგზავნება', () => {
  assert.ok(PRE, 'marksheideri.preoccupation');
  assert.equal(PRE.every_n_replies, 4);
  assert.equal(PRE.variants.length, 6);
  assert.equal(PRE.variants[0].weight, 3);
  assert.ok(PRE.variants[0].en.startsWith('the crack in the wall'));
  for (const v of PRE.variants) assert.ok(v.keywords_ka.length >= 1, v.en);
  for (const c of characters) if (c.id !== 'marksheideri') assert.equal(c.preoccupation, null, c.id);
  for (const c of publicList()) assert.ok(!('preoccupation' in c), c.id);
});

test('§5 მთვლელი: ახალი ჩატი — Infinity; ნახსენების შემდეგ ითვლის მის პასუხებს; ვარიანტი ძირებით', () => {
  const fresh = pacingState([{ role: 'user', content: 'გამარჯობა' }], M);
  assert.equal(fresh.repliesSinceTopic, Infinity);
  assert.equal(fresh.lastTopicVariant, null);
  assert.equal(pacingState([], M).repliesSinceTopic, Infinity);

  const h = (replies) => replies.flatMap((r) => [{ role: 'user', content: 'კითხვა' }, { role: 'assistant', content: r }])
    .concat({ role: 'user', content: 'კითხვა' });
  assert.equal(pacingState(h(['ა.', 'ბ.']), M).repliesSinceTopic, Infinity);
  const last = pacingState(h(['ა.', TOPIC_REPLY[0]]), M);
  assert.equal(last.repliesSinceTopic, 0);
  assert.equal(last.lastTopicVariant, 0);
  const two = pacingState(h([TOPIC_REPLY[4], 'ა.', 'ბ.']), M);
  assert.equal(two.repliesSinceTopic, 2);
  assert.equal(two.lastTopicVariant, 4);
  // ბოლო ნახსენები ითვლება, არა პირველი
  assert.equal(pacingState(h([TOPIC_REPLY[0], 'ა.', TOPIC_REPLY[3]]), M).lastTopicVariant, 3);
  // მომხმარებლის სიტყვები არ ითვლება
  assert.equal(pacingState([{ role: 'user', content: 'ეს ბზარი იყო აქ?' }], M).repliesSinceTopic, Infinity);
  // ბზარი თანაბარზე იგებს; ზოგადი „შენობ“ — ნახსენებია, ვარიანტი უცნობია
  assert.equal(pacingState(h(['ბზარი ჭერამდე ავიდა.']), M).lastTopicVariant, 0);
  const generic = pacingState(h(['შენობა ძველია.']), M);
  assert.equal(generic.repliesSinceTopic, 0);
  assert.equal(generic.lastTopicVariant, null);
  // კარი + კედელი: მთვლელი ნულდება ზედა ძირით (კედელ), ვარიანტი კი კარისაა (2 დამთხვევა 1-ის წინააღმდეგ)
  const door = pacingState(h([TOPIC_REPLY[5]]), M);
  assert.equal(door.repliesSinceTopic, 0);
  assert.equal(door.lastTopicVariant, 5);
  // მთვლელს ზედა და ვარიანტების ძირები ანულებს (კარი/ჩარჩო — კი); „ჩემო კარგო“ და „ფანჯრის მიღმა“ — არა
  const doorOnly = pacingState(h(['ეს კარი ვეღარ იხურება, ჩარჩო გაიბერა.']), M);
  assert.equal(doorOnly.repliesSinceTopic, 0);
  assert.equal(doorOnly.lastTopicVariant, 5);
  assert.equal(pacingState(h(['კარგი, ბატონო.']), M).repliesSinceTopic, Infinity);
  assert.equal(pacingState(h(['ჩემო კარგო, ხვალ მობრძანდით.']), M).repliesSinceTopic, Infinity);
  assert.equal(pacingState(h(['ფანჯრის მიღმა ისევ მოტობურთს თამაშობენ.']), M).repliesSinceTopic, Infinity);
  const afterCrack = pacingState(h([TOPIC_REPLY[0], 'ჩემო კარგო, დიახ.', 'ფანჯრის მიღმა მტვერია.']), M);
  assert.equal(afterCrack.repliesSinceTopic, 2);
  assert.equal(afterCrack.lastTopicVariant, 0);
  // საკუთარი თემის გარეშე — Infinity, null
  const tina = pacingState(h([TOPIC_REPLY[0]]), byId.tina);
  assert.equal(tina.repliesSinceTopic, Infinity);
  assert.equal(tina.lastTopicVariant, null);
});

test('§5 ზღვარი: ხაზი მხოლოდ repliesSinceTopic ≥ every_n_replies − 1; ზუსტი ფორმატი', () => {
  const p = (since, last = null, messageCount = 7) => ({ messageCount, repliesSinceTopic: since, lastTopicVariant: last });
  assert.equal(preoccupationLine(M, p(0)), null);
  assert.equal(preoccupationLine(M, p(1)), null);
  assert.equal(preoccupationLine(M, p(2)), null);
  for (const since of [3, 4, 10, Infinity]) {
    const line = preoccupationLine(M, p(since));
    assert.ok(line, `since=${since}`);
    assert.ok(line.startsWith(`${PREFIX}${PRE.intro_en} This time: `), line);
    assert.ok(variantOf(line) >= 0, line);
  }
  // დეტერმინისტული: იგივე messageCount → იგივე ვარიანტი
  assert.equal(preoccupationLine(M, p(3, null, 12)), preoccupationLine(M, p(Infinity, null, 12)));
  assert.equal(preoccupationLine(M, null), null);
});

test('§5 სიხშირე: 40-პასუხიან ჩატში 8–12 იძულებითი ნახსენები, ზედიზედ იგივე ვარიანტი არასდროს', () => {
  const forced = simulate(M);
  assert.ok(forced.length >= 8 && forced.length <= 12, `forced=${forced.length}`);
  assert.equal(forced[0].n, 0, 'ახალ ჩატში პირველივე პასუხი');
  for (let i = 1; i < forced.length; i++) {
    assert.notEqual(forced[i].v, forced[i - 1].v, `ზედიზედ ${forced[i].v}`);
    assert.ok(forced[i].n - forced[i - 1].n >= 3, 'ნახსენებებს შორის მინიმუმ 3 პასუხი');
  }
});

test('§5 წონები: ბზარი ყველაზე ხშირია; წინა ვარიანტი გამორიცხულია და დანარჩენი გადაწონილია', () => {
  const N = 4000;
  const count = (last) => {
    const c = Array(PRE.variants.length).fill(0);
    for (let m = 1; m <= N; m++) c[variantOf(preoccupationLine(M, { messageCount: m, repliesSinceTopic: Infinity, lastTopicVariant: last }))]++;
    return c;
  };
  const free = count(null);
  const crackShare = free[0] / N; // მოსალოდნელი 3/8
  assert.ok(crackShare > 0.32 && crackShare < 0.43, `crack=${crackShare}`);
  for (let i = 1; i < free.length; i++) {
    assert.ok(free[0] > free[i], `ბზარი > ${i}`);
    assert.ok(free[i] / N > 0.09 && free[i] / N < 0.16, `variant ${i}=${free[i] / N}`); // მოსალოდნელი 1/8
  }
  const noCrack = count(0);
  assert.equal(noCrack[0], 0);
  for (let i = 1; i < noCrack.length; i++) assert.ok(noCrack[i] / N > 0.15 && noCrack[i] / N < 0.25, `variant ${i}`); // 1/5
  const noWall = count(1);
  assert.equal(noWall[1], 0);
  assert.ok(noWall[0] / N > 0.37 && noWall[0] / N < 0.48, `crack after wall=${noWall[0] / N}`); // 3/7
});

test('§5 ფრაზების ჩამკეტი უცვლელია: თემა ფრაზად არ ითვლება, ფრაზა კი თემად ითვლება, ჩამკეტი არ იცვლება', () => {
  const h = (replies) => replies.flatMap((r) => [{ role: 'user', content: 'კითხვა' }, { role: 'assistant', content: r }])
    .concat({ role: 'user', content: 'კითხვა' });
  const bare = { ...M, preoccupation: null };
  for (const replies of [['ა.'], [TOPIC_REPLY[0]], [TOPIC_REPLY[3], 'ბ.'], ['ეს ბზარი იყო აქ?'], ['ეს ბზარი იყო აქ?', 'ა.', 'ბ.']]) {
    const p = pacingState(h(replies), M);
    const q = pacingState(h(replies), bare);
    assert.equal(p.repliesSinceCatchphrase, q.repliesSinceCatchphrase, replies.join('|'));
    assert.deepEqual(p.usedCatchphrases, q.usedCatchphrases);
    assert.deepEqual(p.usedExcuses, q.usedExcuses);
    assert.equal(catchphraseAllowed(p), catchphraseAllowed(q));
  }
  // ბზარზე თავისი სიტყვებით — ფრაზად არ ითვლება
  assert.equal(pacingState(h([TOPIC_REPLY[0]]), M).repliesSinceCatchphrase, Infinity);
  // ფრაზა „ეს ბზარი იყო აქ?“ ჩამკეტს ხურავს, თემის ხაზი კი შემდეგ რამდენიმე პასუხში არ ჩნდება
  const after = pacingState(h(['ეს ბზარი იყო აქ?']), M);
  assert.equal(catchphraseAllowed(after), false);
  assert.equal(after.repliesSinceTopic, 0);
  assert.equal(preoccupationLine(M, after), null);
  assert.ok(!touchPool(M, after).some((x) => x.startsWith('„')), 'ფრაზები pool-ში აღარ არის');
});

test('§5 touchPool: ხაზი მხოლოდ პირველად ემატება, დანარჩენი ჩანაწერები იგივე და იმავე რიგით', () => {
  const p = pacingState([{ role: 'user', content: 'გამარჯობა' }], M);
  const pool = touchPool(M, p);
  const bare = touchPool({ ...M, preoccupation: null }, p);
  assert.equal(pool.length, bare.length + 1);
  assert.ok(pool[0].startsWith(PREFIX));
  assert.deepEqual(pool.slice(1), bare);
  assert.ok(bare.some((x) => x.startsWith('what you are busy with:')));
  // ხაზის გარეშე — pool ზუსტად ძველია
  const quiet = pacingState([{ role: 'user', content: 'ა' }, { role: 'assistant', content: TOPIC_REPLY[0] }, { role: 'user', content: 'ბ' }], M);
  assert.deepEqual(touchPool(M, quiet), touchPool({ ...M, preoccupation: null }, quiet));
});

test('§5 სხვა პერსონაჟი ხაზს არასდროს იღებს', () => {
  for (const c of characters) {
    if (c.id === 'marksheideri') continue;
    for (const since of [0, 3, Infinity]) {
      const p = { messageCount: 5, manuscriptCount: 0, usedCatchphrases: [], usedExcuses: [], repliesSinceCatchphrase: Infinity, repliesSinceTopic: since, lastTopicVariant: null };
      assert.equal(preoccupationLine(c, p), null, c.id);
      assert.ok(!touchPool(c, p).some((x) => x.startsWith('YOUR OWN SUBJECT')), c.id);
    }
    assert.equal(simulate(c, 12).length, 0, c.id);
  }
});
