// ადმინ-გვერდი: პაროლი, ბრაუზერების სია, საუბრები პერსონაჟებად, ლიმიტის განულება.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, openFromMenu, send, e2eStore, SHOTS } from './helpers.js';

test('/admin: არასწორი პაროლი → შეცდომა; სწორი → სტატისტიკა, კლიენტი, საუბრები პერსონაჟებად', async ({ page }) => {
  // ჯერ რამე საუბარი ამ ბრაუზერიდან
  await openWall(page);
  await openFrame(page, 'otari');
  await send(page, 'ოთარ დავიდოვიჩ, მოთხრობა წაიკითხეთ?');
  await page.keyboard.press('Escape');
  await openFromMenu(page, 'kopaleishvili');
  await send(page, 'კოპალეიშვილი სად არის?');
  const cid = await page.evaluate(() => JSON.parse(localStorage.getItem('tianshani.client_id')));
  // Round 7 §4: ადრე ამ ბრაუზერიდან სხვა სახელით დაწერილი შეტყობინება (სახელი შეიცვალა) — პროფილში „ადრე: …“
  e2eStore().logMessage({ client_id: cid, character_id: 'otari', role: 'user', content: 'ძველი სახელით', user_name: 'ანა' });

  await page.goto('/admin');
  await expect(page.locator('#login')).toBeVisible();
  // Round 7 §3: ავტორიზაციამდე გვერდზე მხოლოდ შესვლის ფორმაა — არქივის არც მარკაპი, არც სკრიპტი
  await expect(page.locator('#app, #budget-card, #client-list, script')).toHaveCount(0);
  for (const w of ['ბიუჯეტი', 'ექსპორტი', 'ბრაუზერები']) expect(await page.content()).not.toContain(w);
  await page.screenshot({ path: `${SHOTS}/R7-03-admin-login-only.png`, fullPage: true });
  await page.locator('#pw').fill('wrong');
  await page.locator('#login-form button').click();
  await expect(page.locator('#login-error')).toContainText('პაროლი არასწორია');

  await page.locator('#pw').fill('e2e-admin-pass');
  await page.locator('#login-form button').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#stats .stat-card')).toHaveCount(6); // + Round 4 §9 „ზედმეტად გრძელი პასუხები“
  await expect(page.locator('#long-replies')).toContainText('ზედმეტად გრძელი პასუხები');
  await expect(page.locator('#mode-line')).toContainText('MOCK');

  const item = page.locator(`#client-list button[data-id="${cid}"]`);
  await expect(item).toBeVisible();
  await expect(item).toContainText('შეტყობინება: 3');
  // Round 7 §4: რიგში ჯერ სახელი, მერე ბრაუზერის მოკლე ID; უსახელო ბრაუზერი — „— უსახელო“
  await expect(item.locator('.who .uname')).toHaveText('ნინო');
  await expect(item.locator('.who .cid')).toHaveText(cid.slice(0, 8));
  expect(await item.locator('.who').evaluate((el) => el.firstElementChild.classList.contains('uname'))).toBe(true);
  const unnamed = page.locator('#client-list .uname.none');
  if (await unnamed.count()) await expect(unnamed.first()).toHaveText('— უსახელო');
  await page.locator('aside.clients').screenshot({ path: `${SHOTS}/R7-04-admin-clients-names.png` });
  await item.click();
  await expect(page.locator('#detail-title')).toHaveText(`ნინო — ${cid}`); // Round 3 §1: სახელი კლიენტის გვერდით
  await expect(page.locator('#detail-meta')).toContainText('პირველად:');
  await expect(page.locator('#detail-names')).toBeVisible();
  await expect(page.locator('#detail-names')).toHaveText(/^ადრე: ანა \(\S+\)$/);
  await page.locator('#detail').screenshot({ path: `${SHOTS}/R7-04-admin-profile.png` });
  await expect(page.locator('#conversation .cmsg.user strong').first()).toHaveText('მომხმარებელი (ნინო)');
  const tabs = page.locator('#char-tabs button');
  await expect(tabs).toHaveCount(2);
  const names = await tabs.allTextContents();
  expect(names.some((n) => n.startsWith('ოთარი'))).toBe(true);
  expect(names.some((n) => n.startsWith('კოპალეიშვილი'))).toBe(true);
  await page.locator('#char-tabs button', { hasText: 'კოპალეიშვილი' }).click();
  await expect(page.locator('#conversation .cmsg')).toHaveCount(2);
  await expect(page.locator('#conversation .cmsg.assistant s.struck')).toHaveText('კოპალეიშვილი');
  await expect(page.locator('#conversation .cmsg.user .text')).toHaveText('კოპალეიშვილი სად არის?');
  // Round 3 §2: მეორე შეტყობინება ოთართან საუბრის დახურვის (+45 დღე) შემდეგ გაიგზავნა → ისევ შემოდგომა; სერვერი სეზონს დღიდან ითვლის
  await expect(page.locator('#conversation .badge').first()).toContainText('შემოდგომა · შენობა №1');
  // Round 2 §3: კლიენტის ხარჯი USD-ში
  await expect(item.locator('.cmeta.cost')).toContainText('$');
  await page.screenshot({ path: `${SHOTS}/10-admin.png`, fullPage: true });

  // ძებნა
  await page.locator('#search').fill('ოთარ დავიდოვიჩ');
  await expect(page.locator('#client-list button')).toHaveCount(1);

  // ლიმიტის განულება
  await page.locator('#reset-limit').click();
  await expect(page.locator('#reset-limit')).toHaveText('განულებულია ✓');
  const st = await (await page.request.get('/api/state', { headers: { 'X-Client-Id': cid } })).json();
  expect(st.used.input).toBe(0);

  // გასვლა → ისევ მხოლოდ ფორმა
  await page.locator('#logout').click();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#app')).toHaveCount(0);
});
