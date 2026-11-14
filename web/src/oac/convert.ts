/**
 * Pyramidal tossup -> Ohio Academic Competition question.
 *
 * The conversion is sanctioned, not invented: HSAPQ built their OAC rounds out
 * of their own pyramidal bank by mechanically stripping the `For 10 points,`
 * clause, verified by the same Truman question appearing in both their VHSL set
 * and their OAC set differing only in that clause.
 *
 * The phrasing transform itself lives in `engine/power.ts` as `toOacPhrasing`
 * and is already tested, including the re-capitalisation of a word left
 * stranded at a sentence start. This module only wraps it: it picks the clause
 * to keep, pulls the answerline apart into a primary answer plus acceptable
 * alternates, and reads the clock a calculation question declares in its own
 * prompt text. There is no power scoring on the far side of the conversion,
 * because OAC has no power.
 */

import type {
  Category,
  OacCategoryBlock,
  OacDirected,
  OacPacket,
  OacTeam,
  OacTossupQ,
  Tossup,
} from '../types';
import { OAC_CATEGORY_ORDER, OAC_SCORING } from '../types';
import { stripTags, toOacPhrasing } from '../engine/power';

// ---------------------------------------------------------------------------
// Answerlines
// ---------------------------------------------------------------------------

/** Bracketed clauses that are instructions, not acceptable answers. */
const NON_ACCEPT_CLAUSE =
  /^\s*(prompt|promt|anti-?prompt|reject|do not accept|don't accept|do not reveal|read|note|moderator)/i;

/** Leading words that introduce an alternate inside a bracketed clause. */
const ACCEPT_LEAD =
  /^\s*(or|accept|also accept|accept either|either|accept any of)\b[:,]?\s*/i;

function clean(value: string): string {
  return stripTags(value)
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The span a player is required to say.
 *
 * QB Reader marks it as `<b><u>…</u></b>`; some sets only underline it. When
 * there is no markup at all we fall back to the text before the first
 * bracketed or parenthesised aside.
 */
export function primaryAnswer(answerline: string): string {
  const bold = /<b>\s*<u>([\s\S]*?)<\/u>/i.exec(answerline);
  if (bold?.[1]) return clean(bold[1]);

  const underlined = /<u>([\s\S]*?)<\/u>/i.exec(answerline);
  if (underlined?.[1]) return clean(underlined[1]);

  const plain = stripTags(answerline).split(/[[(]/)[0] ?? '';
  return clean(plain);
}

/**
 * Accept-level alternates for an answerline, primary answer excluded.
 *
 * Prompt and reject clauses are dropped on purpose: in this model `acceptable`
 * means "scores", and a prompt neither scores nor costs an attempt.
 */
export function acceptableAnswers(answerline: string): string[] {
  const primary = primaryAnswer(answerline).toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>([primary]);

  const push = (raw: string): void => {
    const value = clean(raw);
    if (value.length === 0) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };

  for (const match of answerline.matchAll(/\[([^\]]*)\]/g)) {
    const inner = match[1] ?? '';
    if (NON_ACCEPT_CLAUSE.test(stripTags(inner))) continue;
    const body = stripTags(inner).replace(ACCEPT_LEAD, '');
    for (const part of body.split(/\s+or\s+|;/i)) push(part);
  }

  // Extra underlined spans outside the required one are alternates too.
  const spans = [...answerline.matchAll(/<u>([\s\S]*?)<\/u>/gi)];
  for (const span of spans.slice(1)) {
    const inner = span[1] ?? '';
    const before = answerline.slice(0, span.index ?? 0);
    const lastOpen = before.lastIndexOf('[');
    const lastClose = before.lastIndexOf(']');
    // Inside a bracketed clause? Then the clause scan above already ruled on
    // it, and re-adding would resurrect prompt-only alternates.
    if (lastOpen > lastClose) continue;
    push(inner);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Clause selection
// ---------------------------------------------------------------------------

/**
 * The giveaway clause of a pyramidal tossup, in OAC phrasing.
 *
 * OAC directed questions and alphabet-round items are one clue long, so the
 * last sentence (the easiest clue, the one that names the thing) is the clause
 * worth keeping. Abbreviations are not sentence ends, which is why the split
 * requires whitespace and a following capital.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["'(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function giveawayClause(questionSanitized: string): string {
  const oac = toOacPhrasing(questionSanitized);
  const sentences = splitSentences(oac);

  const last = sentences[sentences.length - 1];
  if (last === undefined) return oac;
  // A stub like "Name this." carries no clue; fall back to the pair.
  if (last.length < 24 && sentences.length > 1) {
    return `${sentences[sentences.length - 2] ?? ''} ${last}`.trim();
  }
  return last;
}

/**
 * The clock a question declares in its own text.
 *
 * Mathematics questions say "This is a 20-second calculation question" and the
 * rules honour that over the standard ten seconds.
 */
export function declaredSeconds(
  text: string,
  fallback: number = OAC_SCORING.directedSeconds,
): number {
  const match = /(\d+)\s*[-– ]?\s*second/i.exec(text);
  const raw = match?.[1];
  if (raw === undefined) return fallback;
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  // A packet typo must not hand a team a five-minute clock.
  return Math.min(120, seconds);
}

/** The sentence that declares a clock, which the moderator has to read out. */
export function clockDeclaration(text: string): string | null {
  for (const sentence of splitSentences(text)) {
    if (/\d+\s*[-– ]?\s*second/i.test(sentence)) return sentence;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/** A pyramidal tossup as an OAC tossup: same words, no power, flat value. */
export function toOacTossup(t: Tossup): OacTossupQ {
  return {
    kind: 'tossup',
    prompt: toOacPhrasing(t.questionSanitized),
    answer: primaryAnswer(t.answer || t.answerSanitized),
    acceptable: acceptableAnswers(t.answer || t.answerSanitized),
  };
}

/**
 * A pyramidal tossup as an OAC directed question.
 *
 * `team` is which side of the room it is read to. Only the giveaway clause
 * survives, because a directed question is not buzzable and a pyramidal ladder
 * of clues read to one team under a ten-second clock is not the same question.
 *
 * A declared clock is read out of the WHOLE question, not out of the clause we
 * keep: "This is a 20-second calculation question" opens the question, so
 * trimming to the giveaway would otherwise throw the longer clock away. That
 * sentence is kept in the prompt too, since it is an instruction to read aloud.
 */
export function toOacDirected(t: Tossup, team: OacTeam): OacDirected {
  const full = toOacPhrasing(t.questionSanitized);
  const giveaway = giveawayClause(t.questionSanitized);
  const declaration = clockDeclaration(full);
  const prompt =
    declaration !== null && !giveaway.includes(declaration)
      ? `${declaration} ${giveaway}`
      : giveaway;

  return {
    kind: 'directed',
    team,
    prompt,
    answer: primaryAnswer(t.answer || t.answerSanitized),
    acceptable: acceptableAnswers(t.answer || t.answerSanitized),
    seconds: declaredSeconds(full),
  };
}

// ---------------------------------------------------------------------------
// Category-round assembly
// ---------------------------------------------------------------------------

/**
 * Which side takes the directed question in a given slot.
 *
 * Team A takes the first directed question in category 1, Team B in category 2,
 * and so on. This is computed from the match position rather than read from
 * `OacDirected.team`, because that field records which side of the moderator a
 * printed packet addressed, and the same packet has to alternate correctly
 * whichever team sits on the left today.
 */
export function directedTeamFor(categoryIndex: number, slot: 0 | 1): OacTeam {
  const first: OacTeam = categoryIndex % 2 === 0 ? 'A' : 'B';
  if (slot === 0) return first;
  return first === 'A' ? 'B' : 'A';
}

/**
 * OAC category names mapped onto the app's question taxonomy, so a bank can be
 * filtered for a block and so OAC attempts land in the Learn tab next to
 * everything else. Mathematics has no home category upstream; it falls to
 * Other Academic rather than being dropped.
 */
export const OAC_CATEGORY_TO_QB: Record<
  string,
  { category: Category; subcategory: string }
> = {
  'American Literature': {
    category: 'Literature',
    subcategory: 'American Literature',
  },
  Mathematics: { category: 'Other Academic', subcategory: 'Other Academic' },
  'World History': { category: 'History', subcategory: 'World History' },
  'Fine Arts': { category: 'Fine Arts', subcategory: 'Other Fine Arts' },
  'Life Science': { category: 'Science', subcategory: 'Biology' },
  'English/World Literature': {
    category: 'Literature',
    subcategory: 'World Literature',
  },
  'U.S. Government/Economics': {
    category: 'Social Science',
    subcategory: 'Social Science',
  },
  'Physical Science': { category: 'Science', subcategory: 'Physics' },
  'World Geography': { category: 'Geography', subcategory: 'Geography' },
  'U.S. History': { category: 'History', subcategory: 'American History' },
};

export function qbTaxonomyFor(oacCategory: string): {
  category: Category;
  subcategory: string;
} {
  return (
    OAC_CATEGORY_TO_QB[oacCategory] ?? {
      category: 'Other Academic',
      subcategory: 'Other Academic',
    }
  );
}

function pickForCategory(
  bank: Tossup[],
  oacCategory: string,
  used: Set<string>,
  n: number,
): Tossup[] {
  const want = qbTaxonomyFor(oacCategory);
  const score = (t: Tossup): number => {
    if (t.subcategory === want.subcategory) return 0;
    if (t.category === want.category) return 1;
    return 2;
  };
  return bank
    .filter((t) => !used.has(t.id))
    .sort((a, b) => score(a) - score(b))
    .slice(0, n);
}

/**
 * Build a playable category round out of a pyramidal bank.
 *
 * Each block is directed, directed, tossup, in that order, with the directed
 * sides alternating by category. Blocks are emitted only while there is
 * material for them, so a thin bank yields a short round rather than a round
 * with holes in it.
 */
export function buildCategoryRound(bank: Tossup[]): OacCategoryBlock[] {
  return selectCategoryRound(bank).blocks;
}

function selectCategoryRound(bank: Tossup[]): {
  blocks: OacCategoryBlock[];
  used: Set<string>;
} {
  const used = new Set<string>();
  const blocks: OacCategoryBlock[] = [];

  OAC_CATEGORY_ORDER.forEach((category, index) => {
    const picks = pickForCategory(bank, category, used, 3);
    if (picks.length < 3) return;
    for (const p of picks) used.add(p.id);
    const [first, second, third] = picks as [Tossup, Tossup, Tossup];
    blocks.push({
      category,
      theme: category,
      questions: [
        toOacDirected(first, directedTeamFor(index, 0)),
        toOacDirected(second, directedTeamFor(index, 1)),
        toOacTossup(third),
      ],
    });
  });

  return { blocks, used };
}

/**
 * Assemble a whole packet from a bank.
 *
 * The alphabet round is passed in rather than generated here: `alphabet.ts`
 * needs this module's answerline helpers, so generating it here would make the
 * two modules import each other.
 */
export function buildPacket(opts: {
  id: string;
  setName: string;
  bank: Tossup[];
  alphabet: OacPacket['alphabet'];
}): OacPacket {
  const { blocks, used } = selectCategoryRound(opts.bank);
  const finalRound = opts.bank
    .filter((t) => !used.has(t.id))
    .slice(0, OAC_SCORING.finalTossupCount)
    .map(toOacTossup);

  return {
    id: opts.id,
    setName: opts.setName,
    categoryRound: blocks,
    alphabet: opts.alphabet,
    finalRound,
  };
}
