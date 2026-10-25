# SETUP — როგორ გავუშვა „დაბეჭდე ტიანშანი“

## 1. რა დაყენდა ამ კომპიუტერზე (2026-10-23, Windows 11, სუფთა მანქანა)

| რა | როგორ | ვერსია |
|---|---|---|
| Node.js LTS (+ npm) | `winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent` | Node 24.22.1, npm 11.19.1 |
| Git | `winget install Git.Git --accept-package-agreements --accept-source-agreements --silent` | 2.55.0 (Git Credential Manager-ით) |
| GitHub CLI | `winget install GitHub.cli --accept-package-agreements --accept-source-agreements --silent` | 2.103.0 |
| npm პაკეტები | `npm install` | express 5.3, @google/genai 1.52, better-sqlite3 12.11 (prebuilt binary — C++ build tools არ დასჭირდა), cookie-parser 1.4, dev: @playwright/test 1.64, nodemon 3.1 |
| Playwright Chromium (ტესტებისთვის) | `npx playwright install chromium` | Chromium Playwright 1.64-ისთვის |

დაყენების შემდეგ ახალ PowerShell-ში PATH თავისით ჩაიტვირთება. იმავე ფანჯარაში:

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

## 2. პირველი გაშვება

```bash
npm install
npm start
```

გახსენით http://localhost:3000 — კედელი, ჩარჩოები, ჩატი. ადმინი: http://localhost:3000/admin

> **Windows PowerShell:** თუ `npm start` წერს „running scripts is disabled on this system“, გამოიყენეთ `npm.cmd start` (ან `node src/server.js`). Execution Policy-ის შეცვლა საჭირო არ არის.

პირველ გაშვებაზე, თუ `settings.json` არ არსებობს, სერვერი თავად ქმნის მას `settings.example.json`-დან და **შემთხვევით ადმინის პაროლს** აგენერირებს (კონსოლში დაიბეჭდება). `settings.json` git-ში არ მიდის.

### Gemini-ს გასაღები

1. აიღეთ გასაღები: https://aistudio.google.com/apikey
2. ჩაწერეთ `settings.json`-ში:
   ```json
   "gemini": { "api_key": "AIza...თქვენი_გასაღები", "model": "gemini-3.8-flash", ... }
   ```
3. გადატვირთეთ სერვერი (`npm start`; ან `npm run dev` — nodemon `settings.json`-ის ცვლილებაზე თავად გადატვირთავს).

გასაღების გარეშე სერვერი **mock რეჟიმში** მუშაობს: პასუხებს `characters.json`-ის ნიმუშებიდან აწყობს, სტრიმინგითვე, ლიმიტებით და ლოგებით — ოღონდ LLM-ის გარეშე. ზედა ზოლში ჩანს: „გამომცემლობას გასაღები დაეკარგა (settings.json → gemini.api_key)“.

სტარტზე სერვერი `ListModels`-ით ამოწმებს `gemini.model`-ს. თუ ასეთი მოდელი არ არსებობს, კონსოლში დაწერს „მოდელი X ვერ მოიძებნა, გამოიყენება Y“ და უახლოეს Flash მოდელს აიღებს.

### დრო თამაშში (Round 1)

`settings.json → game`: `start_date` (1983-09-01), `days_per_season` (90), `days_per_character_switch` (20 — დრო მიდის, როცა სხვა პერსონაჟთან გადადიხართ), `days_per_exchange` (0 — შეტყობინებები დროს არ ამოძრავებს). 360-ე დღეს შენობა ინგრევა. სეზონი ზედა ზოლის ხეზე ჩანს; დეტალები — ხეზე მიტანით (მობილურზე — შეხებით).

### ხელნაწერის ეგზემპლარები (Round 8)

`settings.json → game.manuscript` (ნაგულისხმევები `settings.example.json`-შია): `probability_scale` (1 — ალბათობები როგორც `src/data/manuscript_behaviour.json`-შია; 0 — ეგზემპლარებს არაფერი ემართება; 1000 — მოვლენა ყოველ დახურვაზე), `stray_page_probability` (0.4), `chain_floor` (0.15), `chain_ceiling` (0.9), `chain_override` (`null` / `"arrive"` / `"lose"`), `event_override` (`null` / `"stalled"`, `"fragment"`, `"passed_on"`, `"misplaced"`, `"damaged"`). ბოლო ორი მხოლოდ ტესტებისთვისაა. `game.seasons_per_lost_copy` აღარ გამოიყენება.

### ადმინის პაროლი

`settings.json → admin.password`. სანამ მნიშვნელობა `CHANGE_ME`-ა, `/admin` დაკეტილია (403).

## 3. ბრძანებები

| ბრძანება | რას აკეთებს |
|---|---|
| `npm start` | სერვერი (`node src/server.js`) |
| `npm run dev` | სერვერი nodemon-ით (src/ და settings.json-ის ცვლილებაზე გადატვირთვა) |
| `npm test` | unit ტესტები (`node --test`) |
| `npm run test:api` | API ინტეგრაციული ტესტები (სერვერი mock რეჟიმში, დროებითი ბაზით) |
| `npm run test:e2e` | Playwright E2E (Chromium, საკუთარი სერვერი პორტზე 3999) |
| `npm run test:real` | რეალური Gemini-ს smoke ტესტი (მხოლოდ გასაღებით; პასუხები → `test-results/real-smoke.json`) |
| `npm run test:all` | unit + API + E2E (+ real smoke, თუ გასაღები არსებობს) ზედიზედ + `test-results/summary.json` |
| `npm run voice:extract` | `analysis/03_...voice_bible.md` → `src/data/voice_extras.json` თავიდან აწყობა |
| `node scripts/prepare-image.mjs in.jpg public/assets/characters/<id>.jpg` | სურათის crop + ≤150KB JPEG ჩარჩოსთვის |

## 4. ფაილები, რომლებიც git-ში არ მიდის

`node_modules/`, `data/` (SQLite ბაზა), `settings.json` (გასაღები + პაროლი), `test-results/`, `Claude outputs/` (წყარო ფაილების ლოკალური ასლი).

## 5. ჰოსტინგი

იხ. `README.md` → „გაშვება და დეპლოი“.
