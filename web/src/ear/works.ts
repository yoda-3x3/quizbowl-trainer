/**
 * The ear training corpus: 20 works, 32 parts.
 *
 * Copied verbatim from ../../../ear_training.json, the legacy app's data file,
 * and inlined as a module rather than fetched. It is 13 KB, every part is
 * needed the moment the screen opens, and inlining means ear training works on
 * a cold offline start with no cache warming. The prose in `name` and `hint` is
 * the original author's and is reproduced unedited.
 *
 * 27 of the 32 parts have a local clip, keyed by `id`: the file stem is the id,
 * so id "moldau" resolves to /audio/moldau.opus. The remaining 5 (Swan Lake's
 * Waltz, the three Peter and the Wolf themes, and O Fortuna) have no `id` and
 * no clip; they fall back to a YouTube search built from `search`.
 */

export interface EarPart {
  /** Present only when a local clip exists. Doubles as the audio file stem. */
  id?: string;
  /** Movement label. A spoiler: reveal only after the player has answered. */
  name: string;
  /**
   * Teaching note, shown only after submitting and never requestable. Several
   * hints say what the clip is NOT yet ("this comes well before the famous
   * Ode to Joy tune arrives"), which only works if the player has already
   * committed to an answer.
   */
  hint: string;
  /**
   * The opening pitches, often followed by a parenthetical aside, and
   * occasionally nothing but prose. See `notesMatch` for how that is graded.
   */
  notes: string;
  /** YouTube search query, used when there is no local clip. */
  search: string;
}

export interface EarWork {
  composer: string;
  piece: string;
  /** Alternate titles the player may answer with, e.g. "Beethoven's Fifth". */
  accept: string[];
  parts: EarPart[];
}

/** A part together with the work it belongs to, and a stable key. */
export interface EarItem {
  work: EarWork;
  part: EarPart;
  /** Unique within the corpus, even for the parts that have no clip id. */
  key: string;
}

export const EAR_WORKS: EarWork[] = [
  {
    composer: "Ludwig van Beethoven",
    piece: "Symphony No. 5 in C minor",
    accept: ["Beethoven's Fifth", "Symphony No. 5", "Fifth Symphony"],
    parts: [
      {
        id: "beethoven5_mvt1",
        name: "I. Allegro con brio — opening",
        hint: "Four-note motto: three short repeated notes then one longer note down a third, unison strings and clarinets, fortissimo, then silence.",
        notes: "G G G Eb",
        search: "Beethoven Symphony No 5 first movement opening",
      },
      {
        id: "beethoven5_mvt3",
        name: "III. Scherzo — opening",
        hint: "A soft rising arpeggio creeps up in the low strings, then horns answer with a bold three-note fanfare in the major.",
        notes: "G Bb D G",
        search: "Beethoven Symphony No 5 third movement scherzo opening",
      },
    ],
  },
  {
    composer: "Ludwig van Beethoven",
    piece: "Symphony No. 9 in D minor (\"Choral\")",
    accept: ["Beethoven's Ninth", "Symphony No. 9", "Ninth Symphony", "Ode to Joy"],
    parts: [
      {
        id: "beethoven9_mvt1",
        name: "I. Allegro ma non troppo — opening",
        hint: "Bare open fifths shimmer in tremolo strings out of near-silence, then the full orchestra crashes in on a stark minor-key theme.",
        notes: "A E D B",
        search: "Beethoven Symphony No 9 first movement opening",
      },
      {
        id: "beethoven9_mvt4",
        name: "IV. Finale — opening",
        hint: "A jarring, dissonant orchestral outburst opens the movement, then low strings alone play an urgent, searching recitative-like passage — this comes well before the famous \"Ode to Joy\" tune arrives.",
        notes: "D C B Bb (dissonant chord)",
        search: "Beethoven Symphony No 9 fourth movement opening presto",
      },
    ],
  },
  {
    composer: "Ludwig van Beethoven",
    piece: "Piano Sonata No. 14 in C-sharp minor (\"Moonlight\")",
    accept: ["Moonlight Sonata", "Piano Sonata No. 14"],
    parts: [
      {
        id: "moonlight_mvt1",
        name: "I. Adagio sostenuto — opening",
        hint: "Slow, hushed triplet arpeggios in the right hand float over a somber dotted-rhythm bass line.",
        notes: "G# C# E (repeating triplet)",
        search: "Beethoven Moonlight Sonata first movement opening",
      },
      {
        id: "moonlight_mvt3",
        name: "III. Presto agitato — opening",
        hint: "Sudden fast rising broken chords burst in loud and stormy, same key as the first movement but at breakneck speed.",
        notes: "G# C# E G# (rising, fast)",
        search: "Beethoven Moonlight Sonata third movement presto agitato opening",
      },
    ],
  },
  {
    composer: "Pyotr Ilyich Tchaikovsky",
    piece: "The Nutcracker",
    accept: ["Nutcracker", "Nutcracker Suite"],
    parts: [
      {
        id: "nutcracker_overture",
        name: "Miniature Overture",
        hint: "Light, fast strings and woodwinds skip along in a bright major key — notably, no low strings or brass are used at all.",
        notes: "D F# A D (light, skipping)",
        search: "Tchaikovsky Nutcracker Miniature Overture opening",
      },
      {
        id: "nutcracker_sugarplum",
        name: "Dance of the Sugar Plum Fairy",
        hint: "A delicate, glassy, descending line played on celesta, music-box-like and slightly eerie.",
        notes: "E D C B (descending, celesta)",
        search: "Tchaikovsky Dance of the Sugar Plum Fairy opening",
      },
    ],
  },
  {
    composer: "Pyotr Ilyich Tchaikovsky",
    piece: "Swan Lake",
    accept: ["Swan Lake"],
    parts: [
      {
        id: "swanlake_scene",
        name: "Scene (Swan Theme), Act II",
        hint: "A solo oboe sings a plaintive, undulating minor-key melody over rippling harp arpeggios.",
        notes: "B D C B (oboe, minor)",
        search: "Tchaikovsky Swan Lake Scene oboe theme opening",
      },
      {
        name: "Waltz, Act I",
        hint: "A bright, swinging triple-meter dance tune played by the full orchestra.",
        notes: "A A A D (swinging waltz)",
        search: "Tchaikovsky Swan Lake Act 1 Waltz opening",
      },
    ],
  },
  {
    composer: "Modest Mussorgsky",
    piece: "Pictures at an Exhibition",
    accept: ["Pictures at an Exhibition"],
    parts: [
      {
        id: "pictures_promenade",
        name: "Promenade — opening",
        hint: "A bold, striding brass-and-woodwind fanfare in an irregular, shifting meter, like someone walking with an uneven gait.",
        notes: "Bb Eb F Eb (striding fanfare)",
        search: "Mussorgsky Pictures at an Exhibition Promenade opening orchestral",
      },
      {
        id: "pictures_greatgate",
        name: "The Great Gate of Kiev",
        hint: "A massive, slow, hymn-like brass chorale, triumphant and grand, implying pealing bells.",
        notes: "Eb Eb Bb Eb (broad chorale)",
        search: "Mussorgsky Pictures at an Exhibition Great Gate of Kiev opening",
      },
    ],
  },
  {
    composer: "Modest Mussorgsky",
    piece: "Night on Bald Mountain",
    accept: ["Night on Bald Mountain", "St. John's Eve on Bald Mountain"],
    parts: [
      {
        id: "bald_mountain",
        name: "Opening",
        hint: "A sudden churning string tremolo is answered by a snarling, frantic brass theme — dark and chaotic.",
        notes: "C Eb F# (churning tremolo)",
        search: "Mussorgsky Night on Bald Mountain opening",
      },
    ],
  },
  {
    composer: "Gustav Holst",
    piece: "The Planets",
    accept: ["The Planets", "Planets Suite"],
    parts: [
      {
        id: "planets_mars",
        name: "Mars, the Bringer of War — opening",
        hint: "A relentless, mechanical rhythmic pattern in 5/4 time, played col legno (with the wood of the bow), builds menace before the brass enters.",
        notes: "G G G (repeated, col legno)",
        search: "Holst The Planets Mars opening ostinato",
      },
      {
        id: "planets_jupiter",
        name: "IV. Jupiter, the Bringer of Jollity — opening",
        hint: "A bouncy, syncopated dance rhythm launches the movement in horns and strings, playful and energetic — this comes well before the broad, hymn-like \"big tune\" (also known as \"I Vow to Thee, My Country\") that arrives partway through.",
        notes: "C E G (bouncy, syncopated)",
        search: "Holst The Planets Jupiter opening",
      },
    ],
  },
  {
    composer: "Richard Wagner",
    piece: "Die Walküre — \"Ride of the Valkyries\"",
    accept: ["Ride of the Valkyries", "Die Walkure"],
    parts: [
      {
        id: "valkyries",
        name: "Opening",
        hint: "A galloping dotted rhythm in the brass leaps up through wide intervals, building to the famous swooping horn-call theme.",
        notes: "Bb F Bb D (leaping, dotted rhythm)",
        search: "Wagner Ride of the Valkyries opening",
      },
    ],
  },
  {
    composer: "Paul Dukas",
    piece: "The Sorcerer's Apprentice",
    accept: ["The Sorcerer's Apprentice", "L'Apprenti sorcier"],
    parts: [
      {
        id: "sorcerers_apprentice",
        name: "Opening",
        hint: "A hushed, mysterious woodwind figure creeps in, atmospheric and tentative — the famous bouncy bassoon \"broom\" theme arrives a little later, once the sorcery gets going.",
        notes: "(soft, mysterious woodwinds)",
        search: "Dukas Sorcerer's Apprentice opening",
      },
    ],
  },
  {
    composer: "Sergei Prokofiev",
    piece: "Peter and the Wolf",
    accept: ["Peter and the Wolf"],
    parts: [
      {
        name: "Peter's theme (strings)",
        hint: "A bright, confident, skipping melody in a major key played by the full string section.",
        notes: "C D E C (bright, skipping)",
        search: "Prokofiev Peter and the Wolf Peter's theme strings",
      },
      {
        name: "The Bird (flute)",
        hint: "A quick, high, trilling flute figure — chirpy and restless.",
        notes: "(high trilling flute)",
        search: "Prokofiev Peter and the Wolf bird theme flute",
      },
      {
        name: "The Wolf (horns)",
        hint: "A low, ominous, chromatically creeping theme in the horns, menacing and minor.",
        notes: "(low chromatic horns)",
        search: "Prokofiev Peter and the Wolf wolf theme horns",
      },
    ],
  },
  {
    composer: "Wolfgang Amadeus Mozart",
    piece: "Eine kleine Nachtmusik",
    accept: ["Eine kleine Nachtmusik", "A Little Night Music"],
    parts: [
      {
        id: "nachtmusik",
        name: "I. Allegro — opening",
        hint: "A bright, rising unison-string fanfare arpeggio is immediately answered by a light, skipping phrase.",
        notes: "G D G B D (rising fanfare)",
        search: "Mozart Eine kleine Nachtmusik first movement opening",
      },
    ],
  },
  {
    composer: "Wolfgang Amadeus Mozart",
    piece: "The Magic Flute — \"Der Hölle Rache\" (Queen of the Night's aria)",
    accept: ["Queen of the Night aria", "Der Holle Rache", "The Magic Flute"],
    parts: [
      {
        id: "magicflute_aria",
        name: "Aria opening",
        hint: "A sudden furious orchestral outburst opens the aria, then the soprano enters with a fierce, declamatory line — the famous stratospheric coloratura runs arrive a little later in the aria.",
        notes: "(furious orchestral outburst, then voice)",
        search: "Mozart Queen of the Night aria Der Holle Rache opening",
      },
    ],
  },
  {
    composer: "Antonio Vivaldi",
    piece: "The Four Seasons",
    accept: ["The Four Seasons", "Four Seasons"],
    parts: [
      {
        id: "spring_mvt1",
        name: "\"Spring,\" I. Allegro — opening",
        hint: "A cheerful, repeated-note ritornello in the violins, bright and major, soon followed by birdsong-like trills.",
        notes: "E E E B (bright, repeated)",
        search: "Vivaldi Four Seasons Spring first movement opening",
      },
      {
        id: "winter_mvt1",
        name: "\"Winter,\" I. Allegro non molto — opening",
        hint: "A shivering, repeated tremolo in the strings, cold and biting, in a minor key.",
        notes: "F F F F (shivering tremolo)",
        search: "Vivaldi Four Seasons Winter first movement opening",
      },
    ],
  },
  {
    composer: "Edward Elgar",
    piece: "Pomp and Circumstance March No. 1",
    accept: ["Pomp and Circumstance", "Land of Hope and Glory"],
    parts: [
      {
        id: "pomp_circumstance",
        name: "March No. 1 — opening (main march)",
        hint: "A bold, striding march tune opens the piece, brass and drums to the fore — this comes before the famous broad \"Land of Hope and Glory\" melody, which arrives roughly two minutes in as the middle trio section.",
        notes: "(bold march, brass and drums)",
        search: "Elgar Pomp and Circumstance March No 1 opening",
      },
    ],
  },
  {
    composer: "Hector Berlioz",
    piece: "Symphonie fantastique",
    accept: ["Symphonie fantastique"],
    parts: [
      {
        id: "berlioz_mvt1",
        name: "I. Rêveries – Passions — opening",
        hint: "A slow, wandering, melancholy introduction for strings alone opens the movement, quiet and searching — the famous \"idée fixe\" theme representing the artist's beloved doesn't arrive until a few minutes in.",
        notes: "(slow, wandering strings)",
        search: "Berlioz Symphonie fantastique first movement opening",
      },
      {
        id: "berlioz_mvt5",
        name: "V. Songe d'une nuit du sabbat — opening",
        hint: "A hushed, eerie murmur of tremolo strings and low grumbling opens the movement, unsettling and mysterious — this comes before the sardonic dance and the famous \"Dies irae\" chant quoted later in low brass.",
        notes: "(eerie tremolo, low grumbling)",
        search: "Berlioz Symphonie fantastique fifth movement opening",
      },
    ],
  },
  {
    composer: "Edvard Grieg",
    piece: "Peer Gynt Suite",
    accept: ["Peer Gynt"],
    parts: [
      {
        id: "peer_gynt_morning",
        name: "\"Morning Mood\"",
        hint: "A gentle, rising flute melody floats over soft strings, calm and pastoral.",
        notes: "E F# G# B (rising flute)",
        search: "Grieg Peer Gynt Morning Mood opening",
      },
      {
        id: "peer_gynt_mountainking",
        name: "\"In the Hall of the Mountain King\"",
        hint: "A creeping, stealthy theme in low pizzicato strings and bassoon, minor key, repeating faster and louder each time.",
        notes: "D F G Ab (creeping, low)",
        search: "Grieg Peer Gynt In the Hall of the Mountain King opening",
      },
    ],
  },
  {
    composer: "Franz Schubert",
    piece: "Symphony No. 8 in B minor (\"Unfinished\")",
    accept: ["Unfinished Symphony", "Symphony No. 8"],
    parts: [
      {
        id: "schubert_unfinished",
        name: "I. Allegro moderato — opening",
        hint: "A dark, murmuring theme is played low in the cellos and basses completely alone before the rest of the orchestra enters.",
        notes: "B D C# B (low, murmuring)",
        search: "Schubert Unfinished Symphony first movement opening",
      },
    ],
  },
  {
    composer: "Carl Orff",
    piece: "Carmina Burana — \"O Fortuna\"",
    accept: ["O Fortuna", "Carmina Burana"],
    parts: [
      {
        name: "Opening",
        hint: "Pounding, fortissimo choral and orchestral hits in a driving minor key — dramatic and percussive.",
        notes: "(pounding choral chords)",
        search: "Orff Carmina Burana O Fortuna opening",
      },
    ],
  },
  {
    composer: "Bedřich Smetana",
    piece: "Má vlast — \"Vltava\" (\"The Moldau\")",
    accept: ["The Moldau", "Vltava", "Ma vlast"],
    parts: [
      {
        id: "moldau",
        name: "Opening",
        hint: "Rippling flute and clarinet figures represent two small springs, which merge into the famous flowing string melody of the river theme.",
        notes: "(rippling flute and clarinet)",
        search: "Smetana The Moldau Vltava opening flute",
      },
    ],
  },
];

/** Flatten the corpus to drillable items, in corpus order. */
export function earParts(works: EarWork[] = EAR_WORKS): EarItem[] {
  const out: EarItem[] = [];
  works.forEach((work, wi) => {
    work.parts.forEach((part, pi) => {
      out.push({ work, part, key: part.id ?? `${wi}:${pi}` });
    });
  });
  return out;
}

/** True when this part ships with a bundled clip. */
export function hasLocalClip(part: Pick<EarPart, 'id'>): boolean {
  return typeof part.id === 'string' && part.id.length > 0;
}

/**
 * URL of the bundled Opus clip, or null when the part has none.
 *
 * The app is served from the site root, so a plain absolute path is correct
 * and works identically from the service worker cache.
 */
export function clipUrl(part: Pick<EarPart, 'id'>): string | null {
  return hasLocalClip(part) ? `/audio/${part.id}.opus` : null;
}

/** YouTube search URL for the parts with no bundled clip. */
export function searchUrl(part: Pick<EarPart, 'search'>): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(part.search)}`;
}

/**
 * Everything the player may answer with for a work: the title, its alternates
 * and the composer. Naming either the piece or the composer counts.
 */
export function acceptableAnswers(work: EarWork): string[] {
  return [work.piece, ...work.accept, work.composer];
}
