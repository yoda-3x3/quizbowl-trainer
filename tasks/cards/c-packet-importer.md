## YOUR TASK — Card C: packet importer, two parsers

Suggested worker tier: **savvy-heavy**
This card is independent of the UI work and can run immediately.

### LEGAL CONSTRAINT — read before writing any fetch code

`quizbowlpackets.com/robots.txt` explicitly disallows `ClaudeBot`,
`anthropic-ai`, `Claude-Web`, `GPTBot`, `CCBot` and about twenty other agents
with `Disallow: /`, and asserts `Content-Signal: ai-train=no, use=reference`.
The site states packets are released "for study and practice use" and "may not
be used for tournaments or anything that involves the exchange of money".

So the importer must be:

- **user-initiated only** — the human taps a specific packet, their device fetches it
- **on demand** — nothing prefetched, crawled, or mirrored in bulk
- **cached locally only** — never redistributed, never committed

Do **not** write a crawler, a bulk downloader, or a scheduled sync. Do not
commit any downloaded packet file. Do not spoof a browser User-Agent; identify
the client honestly. If you think you need to bulk-fetch to test, use a single
file and cache it locally instead.

### Archive structure (verified, do not re-research)

- Four sibling archives, same app: `www.` (610 HS sets), `collegiate.` (1,174),
  `popculture.` (521), `ms.` (36). About 2,341 sets total.
- Set page: `https://www.quizbowlpackets.com/<integer_id>/`
- Files: `https://files.quizbowlpackets.com/<set_id>/<urlencoded filename>` —
  separate host, no auth, no referer check.
- **No JSON API**, but each archive homepage embeds its full catalogue in the
  Next.js RSC payload (`self.__next_f.push([1, "..."])`). Records look like:
  `{"set_id":1591,"set_name":"...","difficulty":2,"year":"2014-01-01T00:00:00.000Z","subjects":"All-Subject"}`
  with `difficulty` 1-4 = Novice / Regular / Regular-Plus / Nationals.
  One GET per archive enumerates everything — no crawling needed.
- Per-set file lists are plain server-rendered `<a href="https://files...">`.
  No JS execution required.
- Filenames follow no convention (`Round 01.pdf`, `oac-01.pdf`). Parse the page.
- **Prefer `.docx` over `.pdf`.** Modern sets have both. In docx the power span
  and required answer are explicit `<w:b>` / `<w:u>` runs. `pdftotext` loses
  them and inserts a spurious space after the first underlined letter, giving
  `ANSWER: A ristotle` and `ANSWER: i nvasion of Earth`. If you parse PDF you
  must repair `^(\w) (\w+)` in answer lines.
- A `.docx` is an ordinary zip: unzip and read `word/document.xml`.

### Create

```
web/src/import/catalogue.ts     enumerate sets from the RSC payload
web/src/import/fetchPacket.ts   user-initiated single-file fetch
web/src/import/parseStandard.ts
web/src/import/parseOac.ts
web/src/import/docx.ts          unzip + read word/document.xml
web/src/import/__tests__/
web/src/screens/Import.tsx
```

### Parser 1 — standard pyramidal grammar

- Tossup delimiter: `^\d+\. ` at paragraph start, within the `- Tossups` section.
- Answer line: literal `ANSWER:` at line start. Directives inside `[ ... ]`,
  semicolon separated: `accept`, `prompt on`, `do not accept or prompt on`.
- Power mark: literal `(*)` inline.
- Category tag on its own line after the answer: `<Author, Category - Subcategory>`.
- Bonuses are in a `- Bonuses` section: leadin, then three `[10]` parts each
  followed by its own `ANSWER:`, then one category tag.

Emit `Tossup[]` and `Bonus[]` with `source: 'import'`.

### Parser 2 — OAC grammar (genuinely different, needs its own code path)

Ohio Academic Competition packets have no power marks, no bonuses, and no
"For 10 points".

- Section headers are **centred**, so they carry leading whitespace. Do not
  anchor on column 0: `CATEGORY ROUND`, `Alphabet Round - Letter <X>`,
  `Alphabet Round - Letter <X> ANSWERS`, `FINAL ROUND`.
- Category header: `^<Category>: <Theme>`, e.g. `Fine Arts: American Landmarks`.
- Question markers: `^Team A:`, `^Team B:`, `^Tossup:`. The A/B assignment is
  baked into the file and alternates by category.
- Answers are indented roughly 32 spaces and start `ANSWER:`. Alternates use
  `[or ...]`, **not** `[accept ...]`.
- Calculation questions declare their own clock in the prompt text, e.g.
  "This is a 20-second calculation question."
- Alphabet round: 20 lines `^\d+\. `, an inline `(TWO WORD ANSWER)` flag where
  applicable, and **the answers are on a separate page later in the same PDF** —
  join them by index.
- Final round: 20 tossups with `ANSWER:` at column 0, each followed by a
  right-aligned HSAPQ id like `019-14-103-01101`.
- Strip page footers matching `20\d\d OAC \d+ Page \d+ of \d+`.
- **The alphabet worksheet is repeated six more times at the end of the PDF** as
  printable team copies. Dedupe, or you will import it seven times.

Emit the `OacPacket` type already exported from `src/types.ts` (it defines
`OacDirected`, `OacTossupQ`, `OacCategoryBlock`, `OacAlphabetItem`). Read that
file first and match it exactly.

### Test material

The only OAC set in the entire archive is
`https://www.quizbowlpackets.com/1591/`, files `oac-01.pdf` … `oac-18.pdf`.
A good modern pyramidal example is `https://www.quizbowlpackets.com/2316/`
(2019 PACE NSC), which has both `.docx` and `.pdf` per round.

Reference fixtures **by URL, not committed**. Cache one of each locally while
you work.

### Done when

Unit tests parse fixture files into the exact expected shapes. Assert that an
OAC packet yields **20 directed questions, 10 category tossups, 20 alphabet
items (not 140), and 20 final tossups** — the alphabet count is the dedupe
regression test. Assert the standard parser finds the power mark and the
category tag.
