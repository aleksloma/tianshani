# ტიან-შანი — „ცისფერი მთები“ პერსონაჟების პლატფორმა

პროექტის საწყისი დოკუმენტაცია. შედგენილია 2026-10-23.

## ფაილები

| ფაილი | რა არის | ვისთვის |
|---|---|---|
| `characters.json` | 29 პერსონაჟი LLM-ზე მორგებულ ფორმატში: ინგლისური `system_prompt_en`, ქართული სტილი, ცნობილი ფრაზები, საბაბების რეპერტუარი, `redirects_to`, სანიმუშო დიალოგები; საერთო `world` ბლოკი (სამყარო, საერთო ენა, 14 ტიპის საბაბი, თამაშის მექანიკა) | დეველოპერი / LLM backend |
| `cisperi_mtebi_personajebi.md` | პერსონაჟების „ბიბლია“ ადამიანისთვის წასაკითხად: ფილმის შესახებ, აბსურდის მექანიკა, სამყარო, თითო პერსონაჟი, უხილავი პერსონაჟები, რჩევები თამაშისთვის, წყაროები | პროდუქტი / სცენარისტი |
| `analysis/01_personajebis_katalogi_wignidan.md` | ჭეიშვილის ტექსტის სრული პერსონაჟთა კატალოგი (ყველა, ვინც ჩანს ან იხსენიება; ნაწილების ნომრებით) | კვლევითი მასალა |
| `analysis/02_siuzheti_da_absurdis_mekanika.md` | სიუჟეტი 14 ნაწილად, საბაბების ცხრილი, მოტივები, დროის ხაზი, ფინალი, ენობრივი კოდი | კვლევითი მასალა |
| `analysis/03_metyvelebis_stili_voice_bible.md` | თითო პერსონაჟის ხმის პროფილი, განმეორებადი ფორმულები, DO/DON'T, სანიმუშო პასუხები | პრომპტ-ინჟინერი |

## მნიშვნელოვანი შენიშვნა

aura.ge-ზე გამოქვეყნებული ჭეიშვილის ტექსტი 1983 წლის ფილმის სცენარი არ არის — გვიანდელი, პოსტსაბჭოთა რედაქციაა (ბანკები, პოლიცია, პრივატიზაცია). პლატფორმისთვის **ფილმია კანონიკური**; `characters.json`-ში თითო პერსონაჟს აქვს `source` ველი (`film_and_book` / `film_only` / `book_mainly`). ლალისა და თენგიზის ზუსტი „საქმიანობა“ ვარაუდადაა მონიშნული (`confidence_note`).

## როგორ გამოვიყენოთ JSON LLM-თან

1. `world.setting_en` + `world.core_rules_en` + `world.shared_idiom_ka` — საერთო system context.
2. არჩეული პერსონაჟის `system_prompt_en`, `persona_ka`, `catchphrases_ka`, `excuse_repertoire_ka`.
3. 2–3 `sample_dialogues` few-shot მაგალითებად.
4. პასუხი ყოველთვის ქართულად, 1–3 წინადადება; ერთი ცნობილი ფრაზა მაქსიმუმ თითო პასუხში.
5. `redirects_to` — შემდეგი „კარი“, რომელსაც მოთამაშე უნდა მიაკაკუნოს.

## რაც აკლია

ფილმის ვიდეო/ტრანსკრიპტი ამ სესიიდან მიუწვდომელი იყო. სუბტიტრების დამატებით პერსონაჟთა ფრაზები და სცენები კიდევ დაზუსტდება.

## გაშვება და დეპლოი

ვებ-საიტი „დაბეჭდე ტიანშანი“ (Node.js + Express, ვანილა JS, Google Gemini, SQLite). დეტალები: `SETUP.md`, გადაწყვეტილებები: `DECISIONS.md`, ტესტები: `TEST_REPORT.md`.

### ლოკალურად

```bash
npm install
npm start
```

- საიტი: http://localhost:3000 · ადმინი: http://localhost:3000/admin
- პირველ გაშვებაზე იქმნება `settings.json` (`settings.example.json`-დან, შემთხვევითი ადმინის პაროლით — კონსოლში დაიბეჭდება). **Gemini-ს გასაღები** ჩაწერეთ `settings.json → gemini.api_key`-ში და გადატვირთეთ სერვერი. გასაღების გარეშე საიტი mock რეჟიმში მუშაობს (პასუხები მონაცემებიდან, LLM-ის გარეშე).
- `npm run dev` — nodemon-ით; `npm run test:all` — ყველა ტესტი (unit + API + Playwright E2E).

### ჰოსტინგზე (Render / Railway / Fly.io და სხვ.)

`settings.json` რეპოში არ არის — ჰოსტინგზე ყველაფერი გარემოს ცვლადებით:

| ცვლადი | სავალდებულო | რა არის |
|---|---|---|
| `GEMINI_API_KEY` | დიახ | Google AI Studio-ს გასაღები (გარეშე — mock რეჟიმი) |
| `ADMIN_PASSWORD` | დიახ | `/admin`-ის პაროლი (გარეშე ადმინი დაკეტილია) |
| `PORT` | ჰოსტინგი თავად აყენებს | პორტი; როცა `PORT` არსებობს, host ავტომატურად `0.0.0.0`-ა |
| `HOST` | არა | host-ის ხელით მითითება |
| `DB_PATH` | რეკომენდებული | SQLite ფაილის გზა persistent disk-ზე, მაგ. `/var/data/tianshani.db` |

- **Build:** `npm ci` · **Start:** `npm start` · Node ≥ 20 (`package.json → engines`).
- სხვა პარამეტრები (ლიმიტები, მოდელი, სეზონის სიგრძე) აიღება `settings.example.json`-იდან; შესაცვლელად ჰოსტინგზე შეგიძლიათ `settings.json` ფაილიც შექმნათ, ან `SETTINGS_PATH`-ით სხვა ფაილზე მიუთითოთ.
- **SQLite და ეფემერული დისკი:** Render/Railway/Fly-ის სტანდარტულ ინსტანსებზე ფაილური სისტემა ყოველ deploy-ზე/გადატვირთვაზე იშლება — `data/tianshani.db` (ლოგები, ტოკენების აღრიცხვა, ადმინის სესიები) დაიკარგება. ამიტომ მიაბით persistent disk/volume და `DB_PATH` მასზე მიუთითეთ (Render: Disk → `/var/data`, Railway: Volume, Fly: `fly volumes create` + mount).
- მაგალითი (Render Web Service): Runtime Node, Build `npm ci`, Start `npm start`, Environment: `GEMINI_API_KEY`, `ADMIN_PASSWORD`, `DB_PATH=/var/data/tianshani.db`, Disk mount path `/var/data`.
- `better-sqlite3` Linux-ზე prebuilt binary-ს იყენებს; build tools საჭირო არ არის.
