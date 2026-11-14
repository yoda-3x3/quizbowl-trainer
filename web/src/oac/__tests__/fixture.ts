/**
 * A hand-written OAC packet.
 *
 * Card C owns the real parser; this is deliberately independent of it so the
 * match engine can be driven to a hand-computed final score without waiting on
 * packet parsing. Answers are single distinct proper nouns, and every test
 * submits either the exact answer or WRONG, so no assertion depends on the
 * answer checker's typo tolerance. `fixture.test.ts` proves that property
 * instead of assuming it.
 */

import type {
  OacAlphabetItem,
  OacCategoryBlock,
  OacDirected,
  OacPacket,
  OacTossupQ,
} from '../../types';
import { OAC_CATEGORY_ORDER, OAC_SCORING } from '../../types';
import { directedTeamFor } from '../convert';

/** Submitted whenever a test wants a rejection. Resembles nothing. */
export const WRONG = 'gibberish nonsense placeholder';

/** Two answers per category, directed slots. 20 distinct words. */
export const DIRECTED_ANSWERS = [
  'Alpha',
  'Bravo',
  'Charlie',
  'Delta',
  'Echo',
  'Foxtrot',
  'Golf',
  'Hotel',
  'Juliett',
  'Kilo',
  'Oscar',
  'Papa',
  'Quebec',
  'Romeo',
  'Tango',
  'Uniform',
  'Victor',
  'Whiskey',
  'Yankee',
  'Zulu',
] as const;

/** One per category tossup. */
export const CATEGORY_TOSSUP_ANSWERS = [
  'Argon',
  'Boron',
  'Carbon',
  'Helium',
  'Lithium',
  'Neon',
  'Nickel',
  'Radon',
  'Thorium',
  'Xenon',
] as const;

/** Twenty final-round tossups. */
export const FINAL_ANSWERS = [
  'Alabama',
  'Arizona',
  'Colorado',
  'Florida',
  'Georgia',
  'Idaho',
  'Kansas',
  'Kentucky',
  'Maine',
  'Michigan',
  'Montana',
  'Nebraska',
  'Nevada',
  'Oklahoma',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Wisconsin',
  'Wyoming',
] as const;

/** Twenty answers that all file under S, as an alphabet round requires. */
export const ALPHABET_ANSWERS = [
  'Sahara',
  'Saturn',
  'Senegal',
  'Seattle',
  'Shanghai',
  'Sicily',
  'Singapore',
  'Slovakia',
  'Somalia',
  'Sparta',
  'Sudan',
  'Sumatra',
  'Sweden',
  'Switzerland',
  'Syracuse',
  'Syria',
  'Sydney',
  'Salzburg',
  'Santiago',
  'Seville',
] as const;

function directed(
  answer: string,
  team: 'A' | 'B',
  opts: { seconds?: number; prompt?: string } = {},
): OacDirected {
  return {
    kind: 'directed',
    team,
    prompt: opts.prompt ?? `Name the code word that this question points to, ${answer}.`,
    answer,
    acceptable: [],
    seconds: opts.seconds ?? OAC_SCORING.directedSeconds,
  };
}

function tossup(answer: string): OacTossupQ {
  return {
    kind: 'tossup',
    prompt:
      `This entity appears in one of the harder clues of this question and then ` +
      `again in a middle clue before the giveaway finally names it. Name this ${answer}.`,
    answer,
    acceptable: [],
  };
}

function alphabetItem(answer: string, index: number): OacAlphabetItem {
  return {
    index,
    prompt: `Worksheet item ${index}: name the place clued here.`,
    answer,
    acceptable: [],
    twoWord: false,
  };
}

/**
 * The Mathematics block declares a longer clock in its own prompt text. Its
 * second directed question leaves `seconds` at zero on purpose, so the engine
 * has to read the clock out of the prompt the way the rules require.
 */
const MATH_PROMPT =
  'This is a 20-second calculation question. Name the code word Foxtrot.';

export function makePacket(): OacPacket {
  const categoryRound: OacCategoryBlock[] = OAC_CATEGORY_ORDER.map(
    (category, index) => {
      const firstAnswer = DIRECTED_ANSWERS[index * 2] ?? 'Alpha';
      const secondAnswer = DIRECTED_ANSWERS[index * 2 + 1] ?? 'Bravo';
      const isMath = category === 'Mathematics';
      return {
        category,
        theme: category,
        questions: [
          directed(
            firstAnswer,
            directedTeamFor(index, 0),
            isMath
              ? {
                  seconds: 20,
                  prompt: `This is a 20-second calculation question. Name the code word ${firstAnswer}.`,
                }
              : {},
          ),
          directed(
            secondAnswer,
            directedTeamFor(index, 1),
            isMath
              ? { seconds: 0, prompt: MATH_PROMPT.replace('Foxtrot', secondAnswer) }
              : {},
          ),
          tossup(CATEGORY_TOSSUP_ANSWERS[index] ?? 'Argon'),
        ],
      };
    },
  );

  return {
    id: 'fixture-oac-1',
    setName: 'Fixture OAC Set',
    categoryRound,
    alphabet: {
      letter: 'S',
      items: ALPHABET_ANSWERS.map((a, i) => alphabetItem(a, i + 1)),
    },
    finalRound: FINAL_ANSWERS.map(tossup),
  };
}

/** Every answer the fixture expects, for the sanity test. */
export function allFixtureAnswers(): string[] {
  return [
    ...DIRECTED_ANSWERS,
    ...CATEGORY_TOSSUP_ANSWERS,
    ...FINAL_ANSWERS,
    ...ALPHABET_ANSWERS,
  ];
}
