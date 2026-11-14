/**
 * Converts the legacy Python app's questions.json into the app's Tossup/Bonus
 * shape and writes src/data/bundled.ts.
 *
 * Run from web/:  node scripts/gen-bundled.mjs
 *
 * The legacy format carries a bare `answer` plus an `accept` array. We rebuild a
 * proper quizbowl answerline from them so the same judge used for QB Reader
 * questions works unchanged: the required span goes in <b><u>…</u></b> and the
 * alternates become an [accept …] clause.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SRC = resolve('../questions.json');
const OUT = resolve('src/data/bundled.ts');

// Legacy categories are fine-arts subject labels, not QB Reader categories.
const CATEGORY_MAP = {
  Painting: { category: 'Fine Arts', subcategory: 'Visual Fine Arts' },
  Sculpture: { category: 'Fine Arts', subcategory: 'Visual Fine Arts' },
  Architecture: {
    category: 'Fine Arts',
    subcategory: 'Other Fine Arts',
    alternateSubcategory: 'Architecture',
  },
  Music: { category: 'Fine Arts', subcategory: 'Auditory Fine Arts' },
  'Sculpture/Architecture': {
    category: 'Fine Arts',
    subcategory: 'Visual Fine Arts',
    alternateSubcategory: 'Architecture',
  },
};

function mapCategory(legacy) {
  const hit = CATEGORY_MAP[legacy];
  if (!hit) throw new Error(`unmapped legacy category: ${legacy}`);
  return hit;
}

/** Build an HTML answerline with the required span marked up. */
function buildAnswerline(answer, accept) {
  // Parenthesised tails such as "Rembrandt (van Rijn)" mark an optional part:
  // only the head is required to say.
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(answer);
  const required = (match ? match[1] : answer).trim();
  const optional = match ? match[2].trim() : null;

  const alternates = (accept ?? [])
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    // Drop alternates that add nothing over the required span.
    .filter((a) => a.toLowerCase() !== required.toLowerCase())
    .filter((a) => a.toLowerCase() !== answer.toLowerCase());

  let line = `<b><u>${required}</u></b>`;
  if (optional) line += ` (${optional})`;
  if (alternates.length > 0) {
    line += ` [accept ${alternates.join(' or ')}]`;
  }
  return line;
}

function sanitize(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const raw = JSON.parse(readFileSync(SRC, 'utf8'));

const tossups = raw.tossups.map((t, i) => {
  const cat = mapCategory(t.category);
  const answerline = buildAnswerline(t.answer, t.accept);
  return {
    id: `bundled-t-${String(i + 1).padStart(3, '0')}`,
    question: t.text,
    questionSanitized: t.text,
    answer: answerline,
    answerSanitized: sanitize(answerline),
    category: cat.category,
    subcategory: cat.subcategory,
    ...(cat.alternateSubcategory
      ? { alternateSubcategory: cat.alternateSubcategory }
      : {}),
    difficulty: 3,
    setName: 'Bundled Fine Arts Pack',
    setYear: 2025,
    packetNumber: 1,
    questionNumber: i + 1,
    source: 'bundled',
  };
});

const bonuses = raw.bonuses.map((b, i) => {
  const cat = mapCategory(b.category);
  const answerlines = b.parts.map((p) => buildAnswerline(p.answer, p.accept));
  return {
    id: `bundled-b-${String(i + 1).padStart(3, '0')}`,
    leadin: b.leadin,
    leadinSanitized: sanitize(b.leadin),
    parts: b.parts.map((p) => p.clue),
    partsSanitized: b.parts.map((p) => sanitize(p.clue)),
    answers: answerlines,
    answersSanitized: answerlines.map(sanitize),
    category: cat.category,
    subcategory: cat.subcategory,
    difficulty: 3,
    setName: 'Bundled Fine Arts Pack',
    source: 'bundled',
  };
});

const banner = `/**
 * GENERATED FILE — do not edit by hand.
 * Produced by scripts/gen-bundled.mjs from the legacy app's questions.json.
 *
 * This is the offline pack: it ships inside the app so practice works with no
 * network at all. ${tossups.length} tossups, ${bonuses.length} bonuses, all Fine Arts.
 */

import type { Bonus, Tossup } from '../types';

export const BUNDLED_TOSSUPS: Tossup[] = ${JSON.stringify(tossups, null, 2)};

export const BUNDLED_BONUSES: Bonus[] = ${JSON.stringify(bonuses, null, 2)};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner, 'utf8');

const withPower = tossups.filter((t) => t.questionSanitized.includes('(*)')).length;
console.log(
  `wrote ${OUT}\n  ${tossups.length} tossups (${withPower} with power marks), ${bonuses.length} bonuses`,
);
console.log('  sample answerline:', tossups[0].answer);
console.log('  sample answerline:', tossups[2].answer);
