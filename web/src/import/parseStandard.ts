/**
 * Parser 1 — the standard pyramidal packet grammar.
 *
 * This is the shape essentially every modern quizbowl set uses:
 *
 *   Tossups
 *   1. This author of a work that ... For 10 points, name this (*) writer of
 *   "Howl".
 *   ANSWER: Allen Ginsberg [accept Irwin Allen Ginsberg; prompt on Howl]
 *   <Ravi Lin, Literature - American Literature>
 *
 *   Bonuses
 *   1. This bonus concerns a painter. For 10 points each:
 *   [10] Name this painter of "The Persistence of Memory".
 *   ANSWER: Salvador Dali
 *   ...
 *   <Fine Arts - Visual Fine Arts>
 *
 * Output ids are DETERMINISTIC functions of the set, packet and question
 * number. Re-importing the same round therefore produces the same ids, which
 * matters because `AttemptEvent.questionId` is the only link between the event
 * log and the question that produced it; a random id would orphan the history
 * every time a packet was re-imported.
 */

import {
  CATEGORIES,
  SUBCATEGORIES,
  type Bonus,
  type Category,
  type Tossup,
} from '../types';
import { escapeHtml, type SourceParagraph } from './docx';

export interface PacketMeta {
  setName: string;
  setYear: number;
  packetNumber: number;
  /** QB Reader 0-10 scale. `toQbDifficulty` in catalogue.ts derives it. */
  difficulty: number;
}

export interface ParseStandardOptions {
  /**
   * Repair the spacing damage `pdftotext` does to answer lines. Only set this
   * for text extracted from a PDF; running it over docx text would corrupt
   * legitimate single-letter words.
   */
  repairPdfSpacing?: boolean;
}

export interface StandardPacket {
  tossups: Tossup[];
  bonuses: Bonus[];
}

// ---------------------------------------------------------------------------
// Category tags
// ---------------------------------------------------------------------------

const CATEGORY_ALIASES: Record<string, Category> = {
  lit: 'Literature',
  literature: 'Literature',
  hist: 'History',
  history: 'History',
  sci: 'Science',
  science: 'Science',
  fa: 'Fine Arts',
  'fine art': 'Fine Arts',
  'fine arts': 'Fine Arts',
  arts: 'Fine Arts',
  rel: 'Religion',
  religion: 'Religion',
  myth: 'Mythology',
  mythology: 'Mythology',
  phil: 'Philosophy',
  philosophy: 'Philosophy',
  ss: 'Social Science',
  'social science': 'Social Science',
  'social studies': 'Social Science',
  ce: 'Current Events',
  'current events': 'Current Events',
  geo: 'Geography',
  geography: 'Geography',
  'other academic': 'Other Academic',
  academic: 'Other Academic',
  trash: 'Pop Culture',
  pop: 'Pop Culture',
  'pop culture': 'Pop Culture',
  'popular culture': 'Pop Culture',
};

/** Reverse index from a canonical subcategory to the category that owns it. */
const SUBCATEGORY_OWNER = new Map<string, { category: Category; name: string }>();
for (const category of CATEGORIES) {
  for (const name of SUBCATEGORIES[category]) {
    SUBCATEGORY_OWNER.set(name.toLowerCase(), { category, name });
  }
}

export interface CategoryTag {
  author: string | null;
  category: Category;
  subcategory: string;
}

/**
 * Resolves a tag's category and subcategory onto our fixed vocabulary.
 *
 * Capitalization is load-bearing downstream (the QB Reader filter silently
 * ignores a mis-cased category), so everything is normalized to the canonical
 * spelling rather than passed through.
 */
export function resolveCategory(
  categoryRaw: string,
  subcategoryRaw: string,
): { category: Category; subcategory: string } {
  const cat = categoryRaw.trim().toLowerCase();
  const sub = subcategoryRaw.trim();

  const known = SUBCATEGORY_OWNER.get(sub.toLowerCase());
  const direct =
    CATEGORIES.find((c) => c.toLowerCase() === cat) ?? CATEGORY_ALIASES[cat];

  if (direct) {
    // Trust the explicit category; keep the canonical subcategory spelling
    // when we recognize it, and fall back to the category otherwise.
    if (known && known.category === direct) {
      return { category: direct, subcategory: known.name };
    }
    const fallback = SUBCATEGORIES[direct][0] ?? direct;
    return { category: direct, subcategory: sub || fallback };
  }

  // No usable category word; infer it from the subcategory.
  if (known) return { category: known.category, subcategory: known.name };

  return {
    category: 'Other Academic',
    subcategory: sub || categoryRaw.trim() || 'Other Academic',
  };
}

/** Is this line a bare `<...>` category tag? */
function categoryTagOf(text: string): CategoryTag | null {
  const m = /^\s*<\s*(.+?)\s*>\s*$/.exec(text);
  if (!m) return null;
  const body = m[1];
  if (!body) return null;

  // `Author, Category - Subcategory`. Author names can themselves contain a
  // comma, so take the LAST comma-separated segment that carries a dash or
  // names a category we know, rather than assuming exactly two segments.
  const segments = body.split(',').map((s) => s.trim());
  let author: string | null = null;
  let spec = segments[segments.length - 1] ?? body;

  if (segments.length > 1) {
    const idx = segments.findIndex(
      (s, i) =>
        i > 0 &&
        (/\s[-–]\s/.test(s) ||
          CATEGORIES.some((c) => c.toLowerCase() === s.toLowerCase()) ||
          CATEGORY_ALIASES[s.toLowerCase()] !== undefined),
    );
    if (idx > 0) {
      spec = segments.slice(idx).join(', ');
      author = segments.slice(0, idx).join(', ') || null;
    } else {
      author = segments.slice(0, -1).join(', ') || null;
    }
  }

  const dash = spec.split(/\s[-–]\s/);
  const categoryRaw = dash[0] ?? spec;
  const subcategoryRaw = dash.slice(1).join(' - ');

  return { author, ...resolveCategory(categoryRaw, subcategoryRaw) };
}

// ---------------------------------------------------------------------------
// Line grammar
// ---------------------------------------------------------------------------

const RE_TOSSUP_START = /^\s*(\d+)\.\s+/;
const RE_ANSWER = /^\s*ANSWER\s*:/i;
const RE_BONUS_PART = /^\s*\[\s*(\d+)\s*[a-z]*\s*\]\s*/i;
const RE_BONUS_PART_LETTER = /^\s*\[\s*([EMH])\s*\]\s*/;
const RE_SECTION = /^\s*[-–]?\s*(tossups?|bonus(?:es)?)\s*[-–]?\s*:?\s*$/i;

/**
 * Undoes the space `pdftotext` inserts after the first underlined character of
 * an answer line, which turns `Aristotle` into `A ristotle`.
 *
 * Only a capital followed by a lowercase run is joined, so `A Modest Proposal`
 * survives: its second token begins with a capital.
 */
export function repairPdfAnswerSpacing(answer: string): string {
  return answer.replace(
    /(^|accept\s|or\s|prompt on\s|reject\s)([A-Za-z]) ([a-z]{2,})/g,
    (_m, lead: string, first: string, rest: string) => `${lead}${first}${rest}`,
  );
}

function stripLeading(
  para: SourceParagraph,
  textPattern: RegExp,
): SourceParagraph {
  // Strip from the text directly, and from the html while stepping over any
  // tags that open before the marker.
  const htmlPattern = new RegExp(
    `^(\\s*(?:<[^>]+>\\s*)*)${textPattern.source.replace(/^\^\\s\*/, '')}`,
    textPattern.flags.replace('g', ''),
  );
  return {
    text: para.text.replace(textPattern, ''),
    html: para.html.replace(htmlPattern, '$1'),
  };
}

function joinParagraphs(parts: readonly SourceParagraph[]): SourceParagraph {
  return {
    html: parts
      .map((p) => p.html.trim())
      .filter((s) => s.length > 0)
      .join(' '),
    text: parts
      .map((p) => p.text.trim())
      .filter((s) => s.length > 0)
      .join(' '),
  };
}

function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'set'
  );
}

// ---------------------------------------------------------------------------
// Accumulators
// ---------------------------------------------------------------------------

interface DraftTossup {
  number: number;
  question: SourceParagraph[];
  answer: SourceParagraph[];
  tag: CategoryTag | null;
}

interface DraftBonusPart {
  value: number;
  prompt: SourceParagraph[];
  answer: SourceParagraph[];
}

interface DraftBonus {
  number: number;
  leadin: SourceParagraph[];
  parts: DraftBonusPart[];
  tag: CategoryTag | null;
}

/**
 * Parses a standard pyramidal packet.
 *
 * Feed it `readDocx(bytes)` for a .docx, or
 * `paragraphsFromText(pdfText)` with `repairPdfSpacing: true` for a PDF
 * extraction.
 */
export function parseStandardPacket(
  paragraphs: readonly SourceParagraph[],
  meta: PacketMeta,
  options: ParseStandardOptions = {},
): StandardPacket {
  const tossups: Tossup[] = [];
  const bonuses: Bonus[] = [];

  const drafts: DraftTossup[] = [];
  const bonusDrafts: DraftBonus[] = [];

  let section: 'tossups' | 'bonuses' = 'tossups';
  let tossup: DraftTossup | null = null;
  let bonus: DraftBonus | null = null;
  /** Where free text currently lands. */
  let sink: 'question' | 'answer' | 'leadin' | 'part' | 'part-answer' | 'none' =
    'none';

  const flushTossup = (): void => {
    if (tossup && tossup.answer.length > 0) drafts.push(tossup);
    tossup = null;
  };
  const flushBonus = (): void => {
    if (bonus && bonus.parts.length > 0) bonusDrafts.push(bonus);
    bonus = null;
  };

  for (const para of paragraphs) {
    const text = para.text;
    if (tidy(text).length === 0) continue;

    // Section headers.
    const sectionMatch = RE_SECTION.exec(plain(para.html) || text);
    if (sectionMatch) {
      const word = (sectionMatch[1] ?? '').toLowerCase();
      flushTossup();
      flushBonus();
      section = word.startsWith('bonus') ? 'bonuses' : 'tossups';
      sink = 'none';
      continue;
    }

    // A category tag closes whatever question it follows.
    const tag = categoryTagOf(text);
    if (tag) {
      if (section === 'bonuses' && bonus) {
        bonus.tag = tag;
        flushBonus();
      } else if (tossup) {
        tossup.tag = tag;
        flushTossup();
      }
      sink = 'none';
      continue;
    }

    // A `[10]` part means we are in the bonus section whether or not a header
    // said so; some sets omit the headers entirely.
    const partMatch = RE_BONUS_PART.exec(text) ?? RE_BONUS_PART_LETTER.exec(text);
    if (partMatch) {
      if (section !== 'bonuses') {
        // Promote: the paragraphs we were treating as a tossup are really a
        // bonus leadin.
        section = 'bonuses';
        if (tossup) {
          bonus = {
            number: tossup.number,
            leadin: tossup.question,
            parts: [],
            tag: null,
          };
          tossup = null;
        }
      }
      if (!bonus) {
        bonus = {
          number: bonusDrafts.length + 1,
          leadin: [],
          parts: [],
          tag: null,
        };
      }
      const raw = partMatch[1] ?? '10';
      const value = Number.parseInt(raw, 10);
      bonus.parts.push({
        value: Number.isFinite(value) ? value : 10,
        prompt: [
          stripLeading(
            para,
            RE_BONUS_PART.test(text) ? RE_BONUS_PART : RE_BONUS_PART_LETTER,
          ),
        ],
        answer: [],
      });
      sink = 'part';
      continue;
    }

    // Answer lines.
    if (RE_ANSWER.test(text)) {
      const stripped = stripLeading(para, /^\s*ANSWER\s*:\s*/i);
      if (section === 'bonuses' && bonus) {
        const part = bonus.parts[bonus.parts.length - 1];
        if (part) {
          part.answer.push(stripped);
          sink = 'part-answer';
          continue;
        }
      }
      if (tossup) {
        tossup.answer.push(stripped);
        sink = 'answer';
        continue;
      }
      sink = 'none';
      continue;
    }

    // Numbered starts.
    const numbered = RE_TOSSUP_START.exec(text);
    if (numbered) {
      const number = Number.parseInt(numbered[1] ?? '0', 10);
      const body = stripLeading(para, RE_TOSSUP_START);
      if (section === 'bonuses') {
        flushBonus();
        bonus = { number, leadin: [body], parts: [], tag: null };
        sink = 'leadin';
      } else {
        flushTossup();
        tossup = { number, question: [body], answer: [], tag: null };
        sink = 'question';
      }
      continue;
    }

    // Continuation of whatever is open. Questions and answerlines both wrap
    // across paragraphs in docx exports.
    switch (sink) {
      case 'question':
        tossup?.question.push(para);
        break;
      case 'answer':
        tossup?.answer.push(para);
        break;
      case 'leadin':
        bonus?.leadin.push(para);
        break;
      case 'part': {
        const part = bonus?.parts[bonus.parts.length - 1];
        part?.prompt.push(para);
        break;
      }
      case 'part-answer': {
        const part = bonus?.parts[bonus.parts.length - 1];
        part?.answer.push(para);
        break;
      }
      case 'none':
        // Unattached prose before the first question: a packet title or an
        // editors' note. If a bonus section is open, treat it as a leadin.
        if (section === 'bonuses' && !bonus) {
          bonus = {
            number: bonusDrafts.length + 1,
            leadin: [para],
            parts: [],
            tag: null,
          };
          sink = 'leadin';
        }
        break;
    }
  }

  flushTossup();
  flushBonus();

  // -------------------------------------------------------------------------
  // Emit
  // -------------------------------------------------------------------------

  const setSlug = slug(meta.setName);
  const repair = options.repairPdfSpacing ?? false;

  drafts.forEach((draft, i) => {
    const q = joinParagraphs(draft.question);
    const a = joinParagraphs(draft.answer);
    const questionSanitized = tidy(q.text);
    let answerSanitized = tidy(a.text);
    let answerHtml = a.html;
    if (repair) {
      answerSanitized = repairPdfAnswerSpacing(answerSanitized);
      answerHtml = repairPdfAnswerSpacing(answerHtml);
    }
    if (questionSanitized.length === 0 || answerSanitized.length === 0) return;

    const number = draft.number || i + 1;
    const resolved = draft.tag ?? {
      author: null,
      ...resolveCategory('', ''),
    };

    tossups.push({
      id: `import-${setSlug}-p${meta.packetNumber}-t${number}`,
      question: q.html || escapeHtml(questionSanitized),
      questionSanitized,
      answer: answerHtml || escapeHtml(answerSanitized),
      answerSanitized,
      category: resolved.category,
      subcategory: resolved.subcategory,
      difficulty: meta.difficulty,
      setName: meta.setName,
      setYear: meta.setYear,
      packetNumber: meta.packetNumber,
      questionNumber: number,
      source: 'import',
    });
  });

  bonusDrafts.forEach((draft, i) => {
    const leadin = joinParagraphs(draft.leadin);
    const number = draft.number || i + 1;

    const parts = draft.parts.map((p) => joinParagraphs(p.prompt));
    const answers = draft.parts.map((p) => joinParagraphs(p.answer));
    const values = draft.parts.map((p) => p.value);

    const leadinSanitized = tidy(leadin.text);
    const partsSanitized = parts.map((p) => tidy(p.text));
    const answersSanitized = answers.map((a) =>
      repair ? repairPdfAnswerSpacing(tidy(a.text)) : tidy(a.text),
    );

    if (partsSanitized.every((p) => p.length === 0)) return;

    const resolved = draft.tag ?? { author: null, ...resolveCategory('', '') };

    bonuses.push({
      id: `import-${setSlug}-p${meta.packetNumber}-b${number}`,
      leadin: leadin.html || escapeHtml(leadinSanitized),
      leadinSanitized,
      parts: parts.map((p, j) => p.html || escapeHtml(partsSanitized[j] ?? '')),
      partsSanitized,
      answers: answers.map((a, j) =>
        repair
          ? repairPdfAnswerSpacing(a.html)
          : a.html || escapeHtml(answersSanitized[j] ?? ''),
      ),
      answersSanitized,
      values,
      category: resolved.category,
      subcategory: resolved.subcategory,
      difficulty: meta.difficulty,
      setName: meta.setName,
      source: 'import',
    });
  });

  return { tossups, bonuses };
}
