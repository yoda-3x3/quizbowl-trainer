/**
 * Parser 2 — the Ohio Academic Competition grammar.
 *
 * OAC packets are not pyramidal packets with different headings; they are a
 * different document. There are no power marks, no bonuses, no "for 10 points"
 * giveaway, and the round structure is fixed:
 *
 *   CATEGORY ROUND                    (centred, so it carries leading spaces)
 *   Fine Arts: American Landmarks     (category header, column 0)
 *   Team A: ...prompt...
 *                                   ANSWER: Mount Rushmore [or Rushmore]
 *   Team B: ...prompt...
 *                                   ANSWER: ...
 *   Tossup: ...prompt...
 *                                   ANSWER: ...
 *   ... ten such blocks ...
 *   Alphabet Round - Letter M
 *   1. ...prompt... (TWO WORD ANSWER)
 *   ... twenty items, answers on a LATER page ...
 *   Alphabet Round - Letter M ANSWERS
 *   1. Mount Rushmore [or Rushmore]
 *   FINAL ROUND
 *   1. ...pyramidal tossup...
 *   ANSWER: ...
 *                                                        019-14-103-01101
 *
 * THREE TRAPS, each of which this parser is built around:
 *
 *  1. Section headers are CENTRED, so they begin with a run of spaces. Nothing
 *     here anchors on column 0 except the two things that genuinely sit there,
 *     the category header and the final-round answer lines.
 *  2. The alphabet worksheet is repeated SIX MORE TIMES at the end of the PDF
 *     as printable team copies. Deduping by item index is what keeps the
 *     import at 20 items rather than 140.
 *  3. Alphabet answers are on a separate page from the prompts, so the two
 *     halves have to be joined by index rather than by proximity.
 *
 * Input is plain text. OAC is PDF-only in the archive (set 1591 is the only
 * OAC set there), so the caller supplies a text extraction — see
 * `src/screens/Import.tsx`, which accepts pasted text for PDF sources.
 */

import {
  OAC_CATEGORY_ORDER,
  OAC_SCORING,
  type OacAlphabetItem,
  type OacCategoryBlock,
  type OacDirected,
  type OacPacket,
  type OacTeam,
  type OacTossupQ,
} from '../types';

export interface OacMeta {
  setName: string;
  /** Round number within the set, used for the packet id. */
  packetNumber?: number;
  /** Overrides the derived id. */
  id?: string;
}

export interface OacParseResult {
  packet: OacPacket;
  /** Structural surprises worth showing the user before they import. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Line grammar
// ---------------------------------------------------------------------------

/** Page footer, e.g. `2014 OAC 1 Page 3 of 12`. Must be dropped everywhere. */
const RE_FOOTER = /^\s*20\d\d\s+OAC\s+\d+\s+Page\s+\d+\s+of\s+\d+\s*$/i;

/** Centred, hence the tolerant leading whitespace on every header. */
const RE_CATEGORY_ROUND = /^\s*CATEGORY\s+ROUND\s*$/i;
const RE_FINAL_ROUND = /^\s*FINAL\s+ROUND\s*$/i;
const RE_ALPHABET = /^\s*ALPHABET\s+ROUND\s*[-–]\s*LETTER\s*(.+?)\s*$/i;

const RE_TEAM = /^\s*TEAM\s+([AB])\s*:\s*/i;
const RE_TOSSUP_MARK = /^\s*TOSSUP\s*:\s*/i;
const RE_ANSWER = /^\s*ANSWER\s*:\s*/i;
const RE_NUMBERED = /^\s*(\d+)\.\s+/;

/** HSAPQ provenance id trailing each final-round question. */
const RE_HSAPQ = /^\s*\d{3}-\d{2}-\d{3}-\d{4,6}\s*$/;

/** Calculation questions declare their own clock in the prompt text. */
const RE_SECONDS = /(\d+)\s*-\s*second/i;

const RE_TWO_WORD = /\(\s*TWO\s+WORD\s+ANSWER\s*\)/i;

const OAC_CATEGORY_LOOKUP = new Map<string, string>(
  OAC_CATEGORY_ORDER.map((c) => [c.toLowerCase(), c]),
);

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Splits an answer into its required form and its alternates.
 *
 * OAC uses `[or ...]`, not the `[accept ...]` of pyramidal packets. Both are
 * handled because tolerating the other spelling costs nothing.
 */
export function splitOacAnswer(raw: string): {
  answer: string;
  acceptable: string[];
} {
  const acceptable: string[] = [];

  const stripped = raw.replace(/\[([^\]]*)\]/g, (_m, inner: string) => {
    const body = inner.trim();
    const m = /^(?:or|accept)\s+(.*)$/i.exec(body);
    const list = m?.[1] ?? (/^(?:do not|don't|prompt)/i.test(body) ? '' : body);
    for (const alt of list.split(/\s+or\s+/i)) {
      const t = tidy(alt);
      if (t.length > 0) acceptable.push(t);
    }
    return ' ';
  });

  return { answer: tidy(stripped).replace(/[;,]$/, ''), acceptable };
}

function secondsFor(prompt: string): number {
  const m = RE_SECONDS.exec(prompt);
  if (!m) return OAC_SCORING.directedSeconds;
  const n = Number.parseInt(m[1] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : OAC_SCORING.directedSeconds;
}

function letterOf(raw: string): string {
  // `Letter M`, `Letter "M"`, `Letter M ANSWERS` all reduce to `M`.
  const cleaned = raw
    .replace(/\bANSWERS?\b/i, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return cleaned.slice(0, 1);
}

/**
 * Matches a category header such as `Fine Arts: American Landmarks`.
 *
 * Anchored at column 0 and checked against the fixed OAC category list, so a
 * prompt sentence that happens to contain a colon cannot be mistaken for one.
 */
function categoryHeaderOf(
  line: string,
): { category: string; theme: string } | null {
  if (/^\s/.test(line)) return null;
  const m = /^([^:]{3,48}):\s*(.*)$/.exec(line);
  if (!m) return null;
  const left = tidy(m[1] ?? '');
  const known = OAC_CATEGORY_LOOKUP.get(left.toLowerCase());
  if (!known) return null;
  return { category: known, theme: tidy(m[2] ?? '') };
}

// ---------------------------------------------------------------------------
// Accumulators
// ---------------------------------------------------------------------------

type Section = 'preamble' | 'category' | 'alphabet' | 'alphabet-answers' | 'final';

interface DraftQuestion {
  kind: 'directed' | 'tossup';
  team: OacTeam | null;
  prompt: string[];
  answer: string[];
}

interface DraftBlock {
  category: string;
  theme: string;
  questions: DraftQuestion[];
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'oac'
  );
}

/** Parses one OAC round. */
export function parseOacPacket(text: string, meta: OacMeta): OacParseResult {
  const warnings: string[] = [];

  const blocks: DraftBlock[] = [];
  /** Alphabet prompts and answers, keyed by index so repeats collapse. */
  const alphabetPrompts = new Map<number, string[]>();
  const alphabetAnswers = new Map<number, string[]>();
  const finals: DraftQuestion[] = [];

  let section: Section = 'preamble';
  let letter = '';
  let block: DraftBlock | null = null;
  let question: DraftQuestion | null = null;
  let sink: 'prompt' | 'answer' | 'none' = 'none';
  let alphabetIndex: number | null = null;
  let alphabetAnswerIndex: number | null = null;

  const closeQuestion = (): void => {
    if (question && question.prompt.length > 0) block?.questions.push(question);
    question = null;
    sink = 'none';
  };
  const closeFinal = (): void => {
    if (question && question.prompt.length > 0) finals.push(question);
    question = null;
    sink = 'none';
  };
  const closeBlock = (): void => {
    if (section === 'final') closeFinal();
    else closeQuestion();
    if (block) blocks.push(block);
    block = null;
  };

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/ /g, ' ').replace(/\s+$/, '');

    if (RE_FOOTER.test(line)) continue;
    if (tidy(line).length === 0) {
      // A blank line ends an alphabet item but not a wrapped prompt, which is
      // broken by the PDF's line width rather than by intent.
      alphabetIndex = null;
      alphabetAnswerIndex = null;
      continue;
    }

    // ---- Section headers -------------------------------------------------
    if (RE_CATEGORY_ROUND.test(line)) {
      closeBlock();
      section = 'category';
      continue;
    }
    if (RE_FINAL_ROUND.test(line)) {
      closeBlock();
      section = 'final';
      continue;
    }
    const alpha = RE_ALPHABET.exec(line);
    if (alpha) {
      closeBlock();
      const tail = alpha[1] ?? '';
      const next = letterOf(tail);
      if (next) {
        if (letter && next !== letter) {
          warnings.push(
            `Alphabet round letter changed from ${letter} to ${next}.`,
          );
        }
        letter = next;
      }
      section = /\bANSWERS?\b/i.test(tail) ? 'alphabet-answers' : 'alphabet';
      alphabetIndex = null;
      alphabetAnswerIndex = null;
      continue;
    }

    // The provenance id closes a final-round question.
    if (RE_HSAPQ.test(line)) {
      if (section === 'final') closeFinal();
      continue;
    }

    // ---- Alphabet round --------------------------------------------------
    if (section === 'alphabet' || section === 'alphabet-answers') {
      const numbered = RE_NUMBERED.exec(line);
      const body = numbered ? line.replace(RE_NUMBERED, '') : line;

      if (section === 'alphabet') {
        if (numbered) {
          alphabetIndex = Number.parseInt(numbered[1] ?? '', 10);
          // First copy wins. The worksheet is reprinted six more times at the
          // end of the PDF as team copies; without this the round imports
          // 140 items instead of 20.
          if (!alphabetPrompts.has(alphabetIndex)) {
            alphabetPrompts.set(alphabetIndex, [body]);
          } else {
            alphabetIndex = null;
          }
        } else if (alphabetIndex !== null) {
          alphabetPrompts.get(alphabetIndex)?.push(body);
        }
      } else {
        if (numbered) {
          alphabetAnswerIndex = Number.parseInt(numbered[1] ?? '', 10);
          if (!alphabetAnswers.has(alphabetAnswerIndex)) {
            alphabetAnswers.set(alphabetAnswerIndex, [body]);
          } else {
            alphabetAnswerIndex = null;
          }
        } else if (alphabetAnswerIndex !== null) {
          alphabetAnswers.get(alphabetAnswerIndex)?.push(body);
        }
      }
      continue;
    }

    // ---- Answer lines ----------------------------------------------------
    // Indented ~32 spaces in the category round, column 0 in the final round.
    if (RE_ANSWER.test(line)) {
      const body = line.replace(RE_ANSWER, '');
      if (question) {
        question.answer.push(body);
        sink = 'answer';
      }
      continue;
    }

    // ---- Category round --------------------------------------------------
    if (section === 'category') {
      const header = categoryHeaderOf(line);
      if (header && sink !== 'prompt') {
        closeQuestion();
        if (block) blocks.push(block);
        block = { category: header.category, theme: header.theme, questions: [] };
        continue;
      }

      const team = RE_TEAM.exec(line);
      if (team) {
        closeQuestion();
        question = {
          kind: 'directed',
          team: (team[1] ?? 'A').toUpperCase() as OacTeam,
          prompt: [line.replace(RE_TEAM, '')],
          answer: [],
        };
        sink = 'prompt';
        continue;
      }

      if (RE_TOSSUP_MARK.test(line)) {
        closeQuestion();
        question = {
          kind: 'tossup',
          team: null,
          prompt: [line.replace(RE_TOSSUP_MARK, '')],
          answer: [],
        };
        sink = 'prompt';
        continue;
      }

      if (sink === 'prompt') question?.prompt.push(line);
      else if (sink === 'answer') question?.answer.push(line);
      continue;
    }

    // ---- Final round -----------------------------------------------------
    if (section === 'final') {
      const numbered = RE_NUMBERED.exec(line);
      if (numbered) {
        closeFinal();
        question = {
          kind: 'tossup',
          team: null,
          prompt: [line.replace(RE_NUMBERED, '')],
          answer: [],
        };
        sink = 'prompt';
        continue;
      }
      if (sink === 'prompt') question?.prompt.push(line);
      else if (sink === 'answer') question?.answer.push(line);
      continue;
    }
  }

  closeBlock();

  // -------------------------------------------------------------------------
  // Emit
  // -------------------------------------------------------------------------

  const categoryRound: OacCategoryBlock[] = [];
  const seenBlocks = new Set<string>();

  for (const draft of blocks) {
    const key = `${draft.category}|${draft.theme}`.toLowerCase();
    if (seenBlocks.has(key)) continue;

    const directed: OacDirected[] = [];
    let tossup: OacTossupQ | null = null;

    for (const q of draft.questions) {
      const prompt = tidy(q.prompt.join(' '));
      const { answer, acceptable } = splitOacAnswer(q.answer.join(' '));
      if (prompt.length === 0) continue;

      if (q.kind === 'directed') {
        directed.push({
          kind: 'directed',
          team: q.team ?? 'A',
          prompt,
          answer,
          acceptable,
          seconds: secondsFor(prompt),
        });
      } else if (!tossup) {
        tossup = { kind: 'tossup', prompt, answer, acceptable };
      }
    }

    const first = directed[0];
    const second = directed[1];
    if (!first || !second || !tossup) {
      warnings.push(
        `Skipped "${draft.category}: ${draft.theme}": expected two directed questions and a tossup, found ${directed.length} directed and ${tossup ? 1 : 0} tossup.`,
      );
      continue;
    }
    if (directed.length > 2) {
      warnings.push(
        `"${draft.category}" had ${directed.length} directed questions; kept the first two.`,
      );
    }

    seenBlocks.add(key);
    categoryRound.push({
      category: draft.category,
      theme: draft.theme,
      questions: [first, second, tossup],
    });
  }

  const items: OacAlphabetItem[] = [...alphabetPrompts.keys()]
    .sort((a, b) => a - b)
    .map((index) => {
      const promptRaw = tidy(alphabetPrompts.get(index)?.join(' ') ?? '');
      const twoWord = RE_TWO_WORD.test(promptRaw);
      const prompt = tidy(promptRaw.replace(RE_TWO_WORD, ' '));
      const { answer, acceptable } = splitOacAnswer(
        alphabetAnswers.get(index)?.join(' ') ?? '',
      );
      return { index, prompt, answer, acceptable, twoWord };
    });

  const finalRound: OacTossupQ[] = [];
  const seenFinals = new Set<string>();
  for (const q of finals) {
    const prompt = tidy(q.prompt.join(' '));
    if (prompt.length === 0) continue;
    const key = prompt.toLowerCase();
    if (seenFinals.has(key)) continue;
    seenFinals.add(key);
    const { answer, acceptable } = splitOacAnswer(q.answer.join(' '));
    finalRound.push({ kind: 'tossup', prompt, answer, acceptable });
  }

  // -------------------------------------------------------------------------
  // Shape warnings. An OAC round is a fixed 140-point format, so a count that
  // is off means the extraction lost something.
  // -------------------------------------------------------------------------

  if (categoryRound.length !== OAC_CATEGORY_ORDER.length) {
    warnings.push(
      `Expected ${OAC_CATEGORY_ORDER.length} category blocks, parsed ${categoryRound.length}.`,
    );
  }
  if (items.length !== OAC_SCORING.alphabetItemCount) {
    warnings.push(
      `Expected ${OAC_SCORING.alphabetItemCount} alphabet items, parsed ${items.length}.`,
    );
  }
  const unanswered = items.filter((i) => i.answer.length === 0).length;
  if (unanswered > 0) {
    warnings.push(
      `${unanswered} alphabet items have no answer; the answer page may be missing from the text.`,
    );
  }
  if (finalRound.length !== OAC_SCORING.finalTossupCount) {
    warnings.push(
      `Expected ${OAC_SCORING.finalTossupCount} final-round tossups, parsed ${finalRound.length}.`,
    );
  }

  const packet: OacPacket = {
    id:
      meta.id ??
      `oac-${slug(meta.setName)}-r${meta.packetNumber ?? 1}`,
    setName: meta.setName,
    categoryRound,
    alphabet: { letter, items },
    finalRound,
  };

  return { packet, warnings };
}
