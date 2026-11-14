/**
 * Shared contracts for the whole app. OWNED FILE — see SAVVY_FLOW_PROMPT.md.
 *
 * Everything downstream (UI, importer, OAC mode, Learn tab) codes against these
 * shapes. Changing a field here is a breaking change for delegated work, so
 * add rather than rename.
 */

// ---------------------------------------------------------------------------
// Categories. Capitalization is load-bearing: the QB Reader API silently
// ignores a mis-cased `categories` filter and returns unfiltered results.
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  'Literature',
  'History',
  'Science',
  'Fine Arts',
  'Religion',
  'Mythology',
  'Philosophy',
  'Social Science',
  'Current Events',
  'Geography',
  'Other Academic',
  'Pop Culture',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SUBCATEGORIES: Record<Category, readonly string[]> = {
  Literature: [
    'American Literature',
    'British Literature',
    'Classical Literature',
    'European Literature',
    'World Literature',
    'Other Literature',
  ],
  History: [
    'American History',
    'Ancient History',
    'European History',
    'World History',
    'Other History',
  ],
  Science: ['Biology', 'Chemistry', 'Physics', 'Other Science'],
  'Fine Arts': ['Visual Fine Arts', 'Auditory Fine Arts', 'Other Fine Arts'],
  Religion: ['Religion'],
  Mythology: ['Mythology'],
  Philosophy: ['Philosophy'],
  'Social Science': ['Social Science'],
  'Current Events': ['Current Events'],
  Geography: ['Geography'],
  'Other Academic': ['Other Academic'],
  'Pop Culture': [
    'Movies',
    'Music',
    'Sports',
    'Television',
    'Video Games',
    'Other Pop Culture',
  ],
};

/** Difficulty 0-10 as QB Reader defines it. High school play is 3-5. */
export const DIFFICULTY_LABELS: Record<number, string> = {
  0: 'Pop Culture',
  1: 'Middle School',
  2: 'Easy High School',
  3: 'Regular High School',
  4: 'Hard High School',
  5: 'National High School',
  6: 'Easy College',
  7: 'Medium College',
  8: 'Regionals College',
  9: 'Nationals College',
  10: 'Open',
};

export const DEFAULT_DIFFICULTIES = [3, 4, 5];

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type QuestionSource = 'qbreader' | 'bundled' | 'import';

export interface Tossup {
  id: string;
  /** HTML. May contain <b> and <u>; <b> is overloaded with reader instructions. */
  question: string;
  /** Plain text. RETAINS the literal "(*)" power marker. */
  questionSanitized: string;
  /** HTML answerline, e.g. `<b><u>Diana</u></b> [prompt on <u>Artemis</u>]`. */
  answer: string;
  answerSanitized: string;
  category: Category;
  subcategory: string;
  alternateSubcategory?: string;
  difficulty: number;
  setName: string;
  setYear: number;
  packetNumber: number;
  questionNumber: number;
  source: QuestionSource;
}

export interface Bonus {
  id: string;
  leadin: string;
  leadinSanitized: string;
  parts: string[];
  partsSanitized: string[];
  /** MAY differ in length from `parts` — a few sets have authoring errors. */
  answers: string[];
  answersSanitized: string[];
  /** Often absent upstream. Default to 10 per part. */
  values?: number[];
  category: Category;
  subcategory: string;
  difficulty: number;
  setName: string;
  source: QuestionSource;
}

export interface QuestionFilters {
  difficulties: number[];
  categories: Category[];
  subcategories: string[];
  minYear?: number;
  maxYear?: number;
  standardOnly?: boolean;
  powermarkOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Judging
// ---------------------------------------------------------------------------

export type Directive = 'accept' | 'prompt' | 'reject';

export interface Judgement {
  directive: Directive;
  /** Present only for a directed prompt, e.g. `what theorem?`. */
  directedPrompt?: string;
}

// ---------------------------------------------------------------------------
// The event log. This is the ONLY stats substrate — every aggregate is derived
// from it. Never persist pre-computed counters.
// ---------------------------------------------------------------------------

export type PlayMode = 'tossup' | 'bonus' | 'oac' | 'ear';

export interface AttemptEvent {
  id: string;
  /** epoch ms */
  at: number;
  mode: PlayMode;
  questionId: string;
  category: Category;
  subcategory: string;
  difficulty: number;
  /** 0-based index of the last word revealed when buzzed. null = never buzzed. */
  buzzWordIndex: number | null;
  totalWords: number;
  /** 0-based index of the last in-power word. null = question has no power mark. */
  powerWordIndex: number | null;
  givenAnswer: string;
  directive: Directive | null;
  points: number;
  msToAnswer: number | null;
  /** Retained so the Learn tab can replay the question without a refetch. */
  questionSnapshot?: {
    questionSanitized: string;
    answerSanitized: string;
    setName: string;
  };
}

// ---------------------------------------------------------------------------
// Ohio Academic Competition. No power marks, no bonuses, no negative points.
// ---------------------------------------------------------------------------

export type OacTeam = 'A' | 'B';

export interface OacDirected {
  kind: 'directed';
  team: OacTeam;
  prompt: string;
  answer: string;
  /** Alternates from the `[or ...]` clause. */
  acceptable: string[];
  /** Usually 10; calculation questions declare 20 in their prompt text. */
  seconds: number;
}

export interface OacTossupQ {
  kind: 'tossup';
  prompt: string;
  answer: string;
  acceptable: string[];
}

export interface OacCategoryBlock {
  category: string;
  theme: string;
  /** Exactly three: directed, directed, tossup. */
  questions: [OacDirected, OacDirected, OacTossupQ];
}

export interface OacAlphabetItem {
  index: number;
  prompt: string;
  answer: string;
  acceptable: string[];
  twoWord: boolean;
}

export interface OacPacket {
  id: string;
  setName: string;
  /** Ten blocks in the fixed OAC category order. */
  categoryRound: OacCategoryBlock[];
  alphabet: { letter: string; items: OacAlphabetItem[] };
  /** Twenty pyramidal tossups. */
  finalRound: OacTossupQ[];
}

export const OAC_CATEGORY_ORDER = [
  'American Literature',
  'Mathematics',
  'World History',
  'Fine Arts',
  'Life Science',
  'English/World Literature',
  'U.S. Government/Economics',
  'Physical Science',
  'World Geography',
  'U.S. History',
] as const;

export const OAC_SCORING = {
  directedFirstAttempt: 2,
  directedSecondAttempt: 1,
  steal: 1,
  categoryTossup: 2,
  alphabetItem: 2,
  finalTossup: 2,
  directedSeconds: 10,
  alphabetSeconds: 240,
  alphabetItemCount: 20,
  finalTossupCount: 20,
  /** Some rulebooks award this; off by default because we could not verify it. */
  perfectAlphabetBonus: 0,
  maxScore: 140,
} as const;

// ---------------------------------------------------------------------------
// Learn tab derivations
// ---------------------------------------------------------------------------

export interface WeakSpot {
  subcategory: string;
  category: Category;
  attempts: number;
  correct: number;
  accuracy: number;
  /** Mean buzz point as a fraction of question length, buzzed attempts only. */
  meanBuzzFraction: number | null;
  /** Positive means improving. null when there is too little history. */
  trend: number | null;
}

export interface MissedQuestion {
  event: AttemptEvent;
  words: string[];
  /** Where they actually buzzed. null = never buzzed. */
  buzzWordIndex: number | null;
  /**
   * Earliest word index carrying a clue they have demonstrably answered
   * correctly elsewhere. null when no such clue exists in their history.
   */
  knowableWordIndex: number | null;
  /** Seconds between knowable and actual buzz at their configured pace. */
  secondsLate: number | null;
}

export interface BuzzBucket {
  /** Decile of the question, 0 = first 10%. */
  decile: number;
  count: number;
}

export interface ProgressPoint {
  weekStart: number;
  attempts: number;
  accuracy: number;
  powerRate: number;
  meanBuzzFraction: number | null;
}
