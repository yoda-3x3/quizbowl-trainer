/**
 * Generates the synthetic parser fixtures next to this script.
 *
 *   node src/import/__fixtures__/make-fixtures.mjs
 *
 * WHY SYNTHETIC. quizbowlpackets.com disallows automated agents in robots.txt
 * on both the site host and the file host, and releases packets for study and
 * practice use only, so no real packet is fetched by the toolchain or
 * committed to this repository (`.gitignore` excludes *.pdf and *.docx here).
 * These fixtures are written from scratch to reproduce the STRUCTURE of each
 * grammar, including every documented trap, so the parsers have reproducible
 * tests that ship with the source.
 *
 * The OAC fixture deliberately reproduces:
 *   - centred section headers, which carry leading whitespace
 *   - answers indented 32 columns
 *   - `20\d\d OAC \d+ Page \d+ of \d+` page footers, interleaved
 *   - prompts and answers wrapped across lines by PDF column width
 *   - a 20-second calculation question that declares its own clock
 *   - `[or ...]` alternates rather than `[accept ...]`
 *   - a `(TWO WORD ANSWER)` flag
 *   - alphabet answers on a separate page from the prompts
 *   - right-aligned HSAPQ provenance ids after each final-round tossup
 *   - THE ALPHABET WORKSHEET REPEATED SEVEN TIMES IN TOTAL, which is the
 *     dedupe regression the importer has to survive
 *
 * To validate against a real file instead, drop it in this directory as
 * `real-oac.txt` or `real-standard.docx`; `realFile.test.ts` picks it up and
 * stays skipped when it is absent.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const ANSWER_COLUMN = 32;
const HSAPQ_COLUMN = 70;

function answerLine(body) {
  return ' '.repeat(ANSWER_COLUMN) + 'ANSWER: ' + body;
}

function centred(text) {
  const pad = Math.max(0, Math.floor((78 - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function rightAligned(text) {
  return ' '.repeat(Math.max(0, HSAPQ_COLUMN - text.length)) + text;
}

// ---------------------------------------------------------------------------
// OAC fixture
// ---------------------------------------------------------------------------

const LETTER = 'M';

/** Ten blocks, in the fixed OAC category order. */
const BLOCKS = [
  {
    category: 'American Literature',
    theme: 'Novels of the 1920s',
    teamFirst: 'A',
    directed: [
      {
        prompt: [
          'This novelist wrote about Jay Gatsby and the green light across the',
          'bay in a 1925 novel set on Long Island.',
        ],
        answer: 'F. Scott Fitzgerald [or Francis Scott Key Fitzgerald]',
      },
      {
        prompt: ['This 1926 novel follows Jake Barnes to the running of the bulls.'],
        answer: 'The Sun Also Rises',
      },
    ],
    tossup: {
      prompt: [
        'This author of "Babbitt" became the first American to win the Nobel',
        'Prize in Literature.',
      ],
      answer: 'Sinclair Lewis [or Harry Sinclair Lewis]',
    },
  },
  {
    category: 'Mathematics',
    theme: 'Order of Operations',
    teamFirst: 'B',
    directed: [
      {
        // Declares its own clock. The parser must read 20, not the default 10.
        prompt: [
          'This is a 20-second calculation question. Evaluate the expression',
          'three plus four times five minus two.',
        ],
        answer: '21 [or twenty-one]',
      },
      {
        prompt: ['What is the value of two raised to the fifth power?'],
        answer: '32 [or thirty-two]',
      },
    ],
    tossup: {
      prompt: ['Name the number that is both a perfect square and a perfect cube between 50 and 100.'],
      answer: '64 [or sixty-four]',
    },
  },
  {
    category: 'World History',
    theme: 'Treaties',
    teamFirst: 'A',
    directed: [
      {
        prompt: ['This 1919 treaty formally ended the First World War.'],
        answer: 'Treaty of Versailles [or Versailles]',
      },
      {
        prompt: ['This 1648 settlement ended the Thirty Years War.'],
        answer: 'Peace of Westphalia [or Treaty of Westphalia or Westphalia]',
      },
    ],
    tossup: {
      prompt: ['This 1494 treaty divided the New World between Spain and Portugal.'],
      answer: 'Treaty of Tordesillas',
    },
  },
  {
    category: 'Fine Arts',
    theme: 'American Landmarks',
    teamFirst: 'B',
    directed: [
      {
        prompt: [
          'Gutzon Borglum carved four presidents into this South Dakota',
          'mountain.',
        ],
        answer: 'Mount Rushmore [or Rushmore]',
      },
      {
        prompt: ['Maya Lin designed this black granite memorial in Washington.'],
        answer: 'Vietnam Veterans Memorial [or Vietnam Memorial]',
      },
    ],
    tossup: {
      prompt: ['Frank Lloyd Wright designed this spiral museum on Fifth Avenue.'],
      answer: 'Guggenheim Museum [or Solomon R. Guggenheim Museum]',
    },
  },
  {
    category: 'Life Science',
    theme: 'Cells',
    teamFirst: 'A',
    directed: [
      {
        prompt: ['This organelle is called the powerhouse of the cell.'],
        answer: 'mitochondria [or mitochondrion]',
      },
      {
        prompt: ['This process splits glucose into two pyruvate molecules.'],
        answer: 'glycolysis',
      },
    ],
    tossup: {
      prompt: ['Name the phase of mitosis in which chromosomes align at the cell equator.'],
      answer: 'metaphase',
    },
  },
  {
    category: 'English/World Literature',
    theme: 'Shakespeare',
    teamFirst: 'B',
    directed: [
      {
        prompt: ['This Danish prince delivers the "To be or not to be" soliloquy.'],
        answer: 'Hamlet [or Prince Hamlet]',
      },
      {
        prompt: ['This play features the warring Montague and Capulet families.'],
        answer: 'Romeo and Juliet',
      },
    ],
    tossup: {
      prompt: ['This Scottish thane murders King Duncan after meeting three witches.'],
      answer: 'Macbeth',
    },
  },
  {
    category: 'U.S. Government/Economics',
    theme: 'The Constitution',
    teamFirst: 'A',
    directed: [
      {
        prompt: ['This amendment guarantees freedom of speech and religion.'],
        answer: 'First Amendment [or Amendment One]',
      },
      {
        prompt: ['This power allows the Supreme Court to strike down laws.'],
        answer: 'judicial review',
      },
    ],
    tossup: {
      prompt: ['Name the number of amendments that make up the Bill of Rights.'],
      answer: '10 [or ten]',
    },
  },
  {
    category: 'Physical Science',
    theme: 'Motion',
    teamFirst: 'B',
    directed: [
      {
        prompt: ['This law states that force equals mass times acceleration.'],
        answer: 'Newton’s Second Law [or Second Law of Motion]',
      },
      {
        prompt: ['This quantity is the rate of change of velocity.'],
        answer: 'acceleration',
      },
    ],
    tossup: {
      prompt: ['Give the SI unit of force, named for an English physicist.'],
      answer: 'newton [or N]',
    },
  },
  {
    category: 'World Geography',
    theme: 'Rivers',
    teamFirst: 'A',
    directed: [
      {
        prompt: ['This river flows through Cairo and empties into the Mediterranean.'],
        answer: 'Nile [or Nile River]',
      },
      {
        prompt: ['This South American river carries the greatest volume of water.'],
        answer: 'Amazon [or Amazon River]',
      },
    ],
    tossup: {
      prompt: ['Name the longest river entirely within the United States.'],
      answer: 'Missouri River [or Missouri]',
    },
  },
  {
    category: 'U.S. History',
    theme: 'Presidents',
    teamFirst: 'B',
    directed: [
      {
        prompt: ['This president authorized the atomic bombing of Japan.'],
        answer: 'Harry S. Truman [or Truman]',
      },
      {
        prompt: ['This president delivered the Gettysburg Address.'],
        answer: 'Abraham Lincoln [or Lincoln]',
      },
    ],
    tossup: {
      prompt: ['This president resigned in 1974 following the Watergate scandal.'],
      answer: 'Richard Nixon [or Nixon or Richard Milhous Nixon]',
    },
  },
];

const ALPHABET_ITEMS = [
  { prompt: ['This planet is closest to the Sun.'], answer: 'Mercury' },
  { prompt: ['This Shakespeare play features three witches.'], answer: 'Macbeth' },
  { prompt: ['This is the capital of Wisconsin.'], answer: 'Madison' },
  { prompt: ['This organelle produces most of a cell’s ATP.'], answer: 'mitochondria [or mitochondrion]' },
  { prompt: ['This Italian explorer wrote of his travels to Yuan China.'], answer: 'Marco Polo' },
  { prompt: ['This is the chemical symbol for manganese.'], answer: 'Mn' },
  {
    // Carries the two-word flag, and wraps across two lines.
    prompt: [
      'This South Dakota memorial depicts four presidents and was carved by',
      'Gutzon Borglum. (TWO WORD ANSWER)',
    ],
    answer: 'Mount Rushmore [or Rushmore]',
  },
  { prompt: ['This Greek muse governs memory.'], answer: 'Mnemosyne' },
  { prompt: ['This metal is liquid at room temperature.'], answer: 'mercury' },
  { prompt: ['This is the largest moon of Uranus.'], answer: 'Miranda' },
  { prompt: ['This Russian capital sits on the Moskva River.'], answer: 'Moscow' },
  { prompt: ['This painter created "Water Lilies".'], answer: 'Claude Monet [or Monet]' },
  { prompt: ['This is the study of fungi.'], answer: 'mycology' },
  { prompt: ['This mountain range runs through Colorado.'], answer: 'Rocky Mountains [or Montana Rockies]' },
  { prompt: ['This author wrote "Beloved".'], answer: 'Toni Morrison [or Morrison]' },
  { prompt: ['This is the SI prefix for one millionth.'], answer: 'micro' },
  { prompt: ['This composer wrote "The Magic Flute".'], answer: 'Wolfgang Amadeus Mozart [or Mozart]' },
  { prompt: ['This Central American country borders Guatemala to the north.'], answer: 'Mexico' },
  { prompt: ['This is the plural of medium in a statistical context.'], answer: 'medians' },
  { prompt: ['This Indian city was formerly called Bombay.'], answer: 'Mumbai' },
];

const FINAL_TOSSUPS = [
  { prompt: ['This element has atomic number 79 and is prized for jewellery.'], answer: 'gold [or Au]' },
  { prompt: ['This author wrote "The Old Man and the Sea".'], answer: 'Ernest Hemingway' },
  { prompt: ['This war ended with the Treaty of Paris in 1783.'], answer: 'American Revolution [or Revolutionary War]' },
  { prompt: ['This scientist formulated the general theory of relativity.'], answer: 'Albert Einstein' },
  { prompt: ['This is the longest bone in the human body.'], answer: 'femur' },
  { prompt: ['This city hosted the 1960 Summer Olympics.'], answer: 'Rome' },
  { prompt: ['This playwright wrote "A Streetcar Named Desire".'], answer: 'Tennessee Williams' },
  { prompt: ['This mountain is the highest peak in Africa.'], answer: 'Mount Kilimanjaro [or Kilimanjaro]' },
  { prompt: ['This document begins "When in the course of human events".'], answer: 'Declaration of Independence' },
  { prompt: ['This gas makes up about 78 percent of the atmosphere.'], answer: 'nitrogen [or N2]' },
  { prompt: ['This composer went deaf yet completed a ninth symphony.'], answer: 'Ludwig van Beethoven [or Beethoven]' },
  { prompt: ['This river forms part of the border between Texas and Mexico.'], answer: 'Rio Grande' },
  { prompt: ['This 1954 case desegregated American public schools.'], answer: 'Brown v. Board of Education' },
  { prompt: ['This is the square root of one hundred forty-four.'], answer: '12 [or twelve]' },
  { prompt: ['This Greek god ruled the underworld.'], answer: 'Hades' },
  { prompt: ['This painter cut off part of his own ear in Arles.'], answer: 'Vincent van Gogh [or van Gogh]' },
  { prompt: ['This ocean is the deepest on Earth.'], answer: 'Pacific Ocean [or Pacific]' },
  { prompt: ['This president doubled the size of the nation with a purchase from France.'], answer: 'Thomas Jefferson' },
  { prompt: ['This organ filters blood and produces urine.'], answer: 'kidney [or kidneys]' },
  { prompt: ['This novel features the character Atticus Finch.'], answer: 'To Kill a Mockingbird' },
];

function oacFixture() {
  const lines = [];
  let page = 1;
  let sincePage = 0;

  const push = (line) => {
    lines.push(line);
    sincePage += 1;
    // Interleave page footers the way a text extraction of the PDF does.
    if (sincePage >= 14) {
      lines.push('');
      lines.push(`2014 OAC 1 Page ${page} of 24`);
      lines.push('');
      page += 1;
      sincePage = 0;
    }
  };

  push(centred('OHIO ACADEMIC COMPETITION'));
  push(centred('2014 Round 1'));
  push('');
  push(centred('CATEGORY ROUND'));
  push('');

  for (const block of BLOCKS) {
    push(`${block.category}: ${block.theme}`);
    // The A/B assignment is baked into the file and alternates by category.
    const teams = block.teamFirst === 'A' ? ['A', 'B'] : ['B', 'A'];
    block.directed.forEach((q, i) => {
      q.prompt.forEach((p, j) => {
        push(j === 0 ? `Team ${teams[i]}: ${p}` : p);
      });
      push(answerLine(q.answer));
    });
    block.tossup.prompt.forEach((p, j) => {
      push(j === 0 ? `Tossup: ${p}` : p);
    });
    push(answerLine(block.tossup.answer));
    push('');
  }

  const worksheet = () => {
    push(centred(`Alphabet Round - Letter ${LETTER}`));
    push('');
    push(centred('You have four minutes. Every answer begins with the letter M.'));
    push('');
    ALPHABET_ITEMS.forEach((item, i) => {
      item.prompt.forEach((p, j) => {
        push(j === 0 ? `${i + 1}. ${p}` : p);
      });
    });
    push('');
  };

  worksheet();

  push(centred(`Alphabet Round - Letter ${LETTER} ANSWERS`));
  push('');
  ALPHABET_ITEMS.forEach((item, i) => {
    push(`${i + 1}. ${item.answer}`);
  });
  push('');

  push(centred('FINAL ROUND'));
  push('');
  FINAL_TOSSUPS.forEach((q, i) => {
    q.prompt.forEach((p, j) => {
      push(j === 0 ? `${i + 1}. ${p}` : p);
    });
    // Final-round answers sit at column 0, unlike the category round.
    push(`ANSWER: ${q.answer}`);
    push(rightAligned(`019-14-103-${String(1101 + i).padStart(5, '0')}`));
    push('');
  });

  // The printable team copies. Six more, seven worksheets in total.
  for (let copy = 0; copy < 6; copy += 1) {
    push(centred(`TEAM COPY ${copy + 1}`));
    worksheet();
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Standard pyramidal fixture, as `pdftotext` would emit it
// ---------------------------------------------------------------------------

function standardFixture() {
  return [
    'Synthetic Invitational 2019',
    'Packet 3',
    '',
    'Tossups',
    '',
    '1. This author wrote that he saw the best minds of his generation',
    'destroyed by madness. A 1957 obscenity trial concerned this author’s',
    'most famous poem. For 10 points, name this (*) Beat poet who wrote',
    '"Howl".',
    // The leading letter is split off by pdftotext because it is underlined.
    'ANSWER: A llen Ginsberg [accept Irwin Allen Ginsberg; prompt on Howl]',
    '<Ravi Lin, Literature - American Literature>',
    '',
    '2. This philosopher tutored Alexander the Great and founded the Lyceum.',
    'His "Nicomachean Ethics" describes virtue as a mean between extremes.',
    'For 10 points, name this (*) student of Plato.',
    'ANSWER: A ristotle',
    '<Science - Philosophy>',
    '',
    '3. This satirical essay suggests eating the children of the poor.',
    'For 10 points, name this work by Jonathan Swift.',
    // Must survive the PDF repair untouched: the second token is capitalised.
    'ANSWER: A Modest Proposal',
    '<Dana Choi, Literature - British Literature>',
    '',
    'Bonuses',
    '',
    '1. This painter spent much of his career in Spain. For 10 points each:',
    '[10] Name this Surrealist painter of "The Persistence of Memory".',
    'ANSWER: Salvador Dali',
    '[10] Dali collaborated with this director on "Un Chien Andalou".',
    'ANSWER: Luis Bunuel',
    '[10] "The Persistence of Memory" hangs in this New York museum.',
    'ANSWER: Museum of Modern Art [or MoMA]',
    '<Fine Arts - Visual Fine Arts>',
    '',
    '2. Answer the following about cell division. For 10 points each:',
    '[10] Chromosomes align at the cell equator during this phase of mitosis.',
    'ANSWER: metaphase',
    '[10] This structure pulls chromatids apart during anaphase.',
    'ANSWER: spindle [or spindle apparatus]',
    '[10] This protein complex holds sister chromatids together.',
    'ANSWER: cohesin',
    '<Science - Biology>',
    '',
  ].join('\n') + '\n';
}

writeFileSync(join(here, 'oac-synthetic.txt'), oacFixture(), 'utf8');
writeFileSync(join(here, 'standard-synthetic.txt'), standardFixture(), 'utf8');
console.log('wrote oac-synthetic.txt and standard-synthetic.txt');
