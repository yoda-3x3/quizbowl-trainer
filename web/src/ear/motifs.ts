/**
 * Motifs: the ear trainer's equivalent of the vision trainer's regions.
 *
 * A clue names a motif, and that motif's fragment of the recording becomes
 * part of what you have heard, while its notes appear on the staff. By the end
 * of a clue stack you have heard the passage assembled out of the pieces the
 * question described, and nothing it did not.
 *
 * On "layering": these clips are single mixed recordings, so instruments
 * cannot be separated out. A motif is therefore a TIME SEGMENT, and revealed
 * motifs play in sequence. That is an honest reading of the idea rather than
 * a pretend multitrack, and it maps cleanly onto how the clues actually work.
 *
 * TIMINGS ARE MEASURED, NOT GUESSED. Each clip's amplitude envelope was
 * computed at 0.25s resolution and the boundaries below sit on real changes in
 * that envelope. They are still approximate at the edges: a listening pass
 * would tighten them, and nothing here depends on sample accuracy.
 */

export interface Motif {
  id: string;
  /** Shown as the caption when this motif is revealed. */
  label: string;
  /** Lowercase phrases in a clue that mean this motif was just described. */
  keywords: string[];
  /** Seconds into the clip. */
  start: number;
  end: number;
  /** Pitch tokens for the staff. Omit when the motif is textural. */
  notes?: string;
  /** Held back in self-paced ordering, as with giveaway art elements. */
  giveaway?: boolean;
}

export interface MotifWork {
  /** Matches the audio stem in public/audio and the part id in ear_training. */
  id: string;
  title: string;
  composer: string;
  clip: string;
  /** Seconds. Every shipped clip is the same length. */
  duration: number;
  /** Lowercased phrases that identify this work in an answer line. */
  answerKeywords: string[];
  motifs: Motif[];
}

export const MOTIF_WORKS: MotifWork[] = [
  {
    id: 'beethoven5_mvt1',
    title: 'Symphony No. 5 in C minor, first movement',
    composer: 'Ludwig van Beethoven',
    clip: '/audio/beethoven5_mvt1.opus',
    duration: 16.0,
    answerKeywords: [
      'symphony no 5',
      'fifth symphony',
      "beethoven's fifth",
      'symphony no. 5',
    ],
    motifs: [
      {
        id: 'motto',
        label: 'the four-note motto',
        keywords: ['four note', 'motto', 'short short short long', 'fate'],
        start: 0.0,
        end: 2.25,
        notes: 'G G G Eb',
      },
      {
        id: 'motto_lower',
        label: 'the motto restated a step lower',
        keywords: ['restated', 'repeated', 'sequence', 'step lower', 'again'],
        start: 2.5,
        end: 5.25,
        notes: 'F F F D',
      },
      {
        id: 'development',
        label: 'the quiet strings that follow',
        keywords: ['strings', 'quiet', 'piano', 'development', 'hushed'],
        start: 5.5,
        end: 13.5,
      },
      {
        id: 'tutti',
        label: 'the full orchestra returning',
        keywords: ['tutti', 'full orchestra', 'climax', 'fortissimo', 'horns'],
        start: 13.75,
        end: 16.0,
        giveaway: true,
      },
    ],
  },

  {
    id: 'beethoven9_mvt4',
    title: 'Symphony No. 9, finale',
    composer: 'Ludwig van Beethoven',
    clip: '/audio/beethoven9_mvt4.opus',
    duration: 16.0,
    answerKeywords: [
      'symphony no 9',
      'ninth symphony',
      'ode to joy',
      'choral symphony',
      'symphony no. 9',
    ],
    motifs: [
      {
        id: 'theme_low',
        label: 'the theme alone in the low strings',
        keywords: ['low strings', 'cellos', 'basses', 'unaccompanied', 'bare'],
        start: 1.0,
        end: 8.5,
        notes: 'E E F G G F E D C C D E E D D',
      },
      {
        id: 'break',
        label: 'the pause before it returns',
        keywords: ['pause', 'silence', 'break', 'rest'],
        start: 8.5,
        end: 9.75,
      },
      {
        id: 'theme_full',
        label: 'the theme taken up by more of the orchestra',
        keywords: ['taken up', 'joined', 'fuller', 'harmonized', 'counter'],
        start: 9.75,
        end: 16.0,
        giveaway: true,
      },
    ],
  },

  {
    id: 'peer_gynt_mountainking',
    title: 'In the Hall of the Mountain King',
    composer: 'Edvard Grieg',
    clip: '/audio/peer_gynt_mountainking.opus',
    duration: 16.0,
    // No bare 'peer gynt': it is ambiguous with Morning Mood below.
    answerKeywords: ['hall of the mountain king', 'mountain king'],
    motifs: [
      {
        id: 'creep',
        label: 'the creeping theme, low and plucked',
        keywords: ['pizzicato', 'plucked', 'bassoon', 'creeping', 'low', 'stealthy'],
        start: 0.0,
        end: 4.0,
        notes: 'B D E F# D F#',
      },
      {
        id: 'repeat',
        label: 'the same theme, a little louder',
        keywords: ['repeats', 'again', 'louder', 'restated'],
        start: 4.0,
        end: 8.0,
      },
      {
        id: 'accel',
        label: 'the accelerating repetitions',
        keywords: ['accelerando', 'faster', 'speeds up', 'frantic', 'quicker'],
        start: 8.0,
        end: 13.0,
      },
      {
        id: 'climax',
        label: 'the final crash',
        keywords: ['climax', 'crash', 'cymbals', 'fortissimo', 'end'],
        start: 13.0,
        end: 16.0,
        giveaway: true,
      },
    ],
  },

  {
    id: 'valkyries',
    title: 'Ride of the Valkyries',
    composer: 'Richard Wagner',
    clip: '/audio/valkyries.opus',
    duration: 16.0,
    answerKeywords: [
      'ride of the valkyries',
      'walkurenritt',
      'die walkure',
      'valkyries',
    ],
    motifs: [
      {
        id: 'tremolo',
        label: 'the rising string tremolo',
        keywords: ['tremolo', 'rising', 'strings', 'swirling', 'storm'],
        start: 0.0,
        end: 1.75,
      },
      {
        id: 'call',
        label: 'the dotted brass call',
        keywords: ['dotted', 'horn', 'brass', 'trombone', 'call', 'leaping'],
        start: 1.75,
        end: 4.5,
        notes: 'B D F#',
      },
      {
        id: 'ride',
        label: 'the full ride',
        keywords: ['ride', 'full orchestra', 'tutti', 'gallop'],
        start: 4.5,
        end: 16.0,
        giveaway: true,
      },
    ],
  },

  {
    id: 'nutcracker_sugarplum',
    title: 'Dance of the Sugar Plum Fairy',
    composer: 'Pyotr Ilyich Tchaikovsky',
    clip: '/audio/nutcracker_sugarplum.opus',
    duration: 16.0,
    answerKeywords: [
      'sugar plum',
      'sugarplum',
      'nutcracker',
      'dance of the sugar plum fairy',
    ],
    motifs: [
      {
        id: 'pizz',
        label: 'the plucked accompaniment',
        keywords: ['pizzicato', 'plucked', 'staccato', 'accompaniment'],
        start: 0.0,
        end: 2.0,
      },
      {
        id: 'celesta',
        label: 'the descending celesta figure',
        keywords: ['celesta', 'celeste', 'descending', 'keyboard', 'bell-like'],
        start: 2.0,
        end: 8.0,
        notes: 'E D C B',
      },
      {
        id: 'answer',
        label: 'the phrase answered and extended',
        keywords: ['answered', 'extended', 'continues', 'sequence'],
        start: 8.0,
        end: 16.0,
        giveaway: true,
      },
    ],
  },
  {
    id: 'nachtmusik',
    title: 'Eine kleine Nachtmusik',
    composer: 'Wolfgang Amadeus Mozart',
    clip: '/audio/nachtmusik.opus',
    duration: 16.0,
    answerKeywords: [
      'eine kleine nachtmusik',
      'nachtmusik',
      'a little night music',
      'serenade no 13',
    ],
    motifs: [
      {
        id: 'rocket',
        label: 'the rising unison opening',
        keywords: ['unison', 'rocket', 'rising', 'arpeggio', 'fanfare', 'opening'],
        start: 0.5,
        end: 2.5,
        notes: 'G D G D G B D',
      },
      {
        id: 'answer',
        label: 'the answering phrase',
        keywords: ['answer', 'answering', 'reply', 'second phrase', 'tutti'],
        start: 2.5,
        end: 4.25,
      },
      {
        id: 'quiet',
        label: 'the lighter continuation',
        keywords: ['lighter', 'quieter', 'piano', 'scurrying', 'running'],
        start: 4.5,
        end: 8.0,
      },
      {
        id: 'close',
        label: 'the cadence that closes the section',
        keywords: ['cadence', 'close', 'closing', 'final'],
        start: 8.0,
        end: 16.0,
        giveaway: true,
      },
    ],
  },

  {
    id: 'peer_gynt_morning',
    title: 'Morning Mood',
    composer: 'Edvard Grieg',
    clip: '/audio/peer_gynt_morning.opus',
    duration: 16.0,
    answerKeywords: ['morning mood', 'morgenstemning'],
    motifs: [
      {
        id: 'flute',
        label: 'the flute states the theme',
        keywords: ['flute', 'theme', 'pastoral', 'opening', 'pentatonic'],
        start: 0.0,
        end: 1.75,
        notes: 'E C# B G# B C#',
      },
      {
        id: 'oboe',
        label: 'the oboe answers',
        keywords: ['oboe', 'answers', 'echo', 'reply', 'woodwind'],
        start: 1.75,
        end: 3.25,
      },
      {
        id: 'exchange',
        label: 'the two trade the phrase back and forth',
        keywords: ['trade', 'alternate', 'back and forth', 'exchange', 'passed'],
        start: 3.25,
        end: 5.25,
      },
      {
        id: 'strings',
        label: 'the strings take it up and swell',
        keywords: ['strings', 'swell', 'crescendo', 'sunrise', 'full'],
        start: 5.25,
        end: 16.0,
        giveaway: true,
      },
    ],
  },

  {
    id: 'moldau',
    title: 'The Moldau',
    composer: 'Bedřich Smetana',
    clip: '/audio/moldau.opus',
    duration: 16.0,
    answerKeywords: ['moldau', 'vltava', 'ma vlast', 'my country'],
    motifs: [
      {
        id: 'springs',
        label: 'two flutes as the trickling sources',
        keywords: ['flute', 'flutes', 'spring', 'source', 'trickle', 'ripple'],
        start: 0.0,
        end: 3.75,
      },
      {
        id: 'clarinets',
        label: 'clarinets joining the stream',
        keywords: ['clarinet', 'joins', 'second stream', 'widens'],
        start: 3.75,
        end: 7.75,
      },
      {
        id: 'river_theme',
        label: 'the river theme in the strings',
        keywords: ['river theme', 'melody', 'broad', 'strings', 'flows', 'e minor'],
        start: 7.75,
        end: 13.0,
        notes: 'E G A B B A',
      },
      {
        id: 'full',
        label: 'the full current',
        keywords: ['full', 'tutti', 'swells', 'majestic'],
        start: 13.0,
        end: 16.0,
        giveaway: true,
      },
    ],
  },

  {
    id: 'sorcerers_apprentice',
    title: "The Sorcerer's Apprentice",
    composer: 'Paul Dukas',
    clip: '/audio/sorcerers_apprentice.opus',
    duration: 16.0,
    answerKeywords: [
      "sorcerer's apprentice",
      'sorcerers apprentice',
      "l'apprenti sorcier",
      'apprenti sorcier',
    ],
    motifs: [
      // No pitches authored here: the opening is deliberately textural, and
      // the bassoon theme everyone knows arrives after this excerpt ends.
      {
        id: 'shimmer',
        label: 'the hushed shimmering opening',
        keywords: ['shimmer', 'hushed', 'quiet', 'mysterious', 'divided strings', 'tremolo'],
        start: 0.0,
        end: 3.0,
      },
      {
        id: 'figure',
        label: 'a small rising figure in the woodwinds',
        keywords: ['woodwind', 'rising', 'figure', 'fragment', 'hint'],
        start: 3.0,
        end: 7.0,
      },
      {
        id: 'swell',
        label: 'the first real swell',
        keywords: ['swell', 'crescendo', 'builds', 'gathers'],
        start: 7.0,
        end: 12.0,
      },
      {
        id: 'brass',
        label: 'brass entering as the spell takes',
        keywords: ['brass', 'horn', 'trumpet', 'spell', 'animates'],
        start: 12.0,
        end: 16.0,
        giveaway: true,
      },
    ],
  },

  {
    id: 'spring_mvt1',
    title: 'Spring, first movement',
    composer: 'Antonio Vivaldi',
    clip: '/audio/spring_mvt1.opus',
    duration: 16.0,
    // Deliberately no bare 'spring': it would match The Rite of Spring,
    // Appalachian Spring and Schumann's Spring Symphony. Showing the wrong
    // piece is worse than showing none.
    answerKeywords: [
      'la primavera',
      'four seasons',
      'le quattro stagioni',
      'vivaldi spring',
    ],
    motifs: [
      {
        id: 'ritornello',
        label: 'the ritornello announcing the season',
        keywords: ['ritornello', 'opening', 'tutti', 'announces', 'refrain'],
        start: 0.5,
        end: 3.0,
      },
      {
        id: 'echo',
        label: 'the same idea echoed softly',
        keywords: ['echo', 'softly', 'piano', 'repeated quietly', 'answer'],
        start: 3.0,
        end: 4.25,
      },
      {
        id: 'continuation',
        label: 'the ritornello carried on',
        keywords: ['carried', 'continues', 'extended', 'sequence'],
        start: 4.25,
        end: 8.5,
      },
      {
        id: 'birdsong',
        label: 'solo violins as birdsong',
        keywords: ['bird', 'birds', 'birdsong', 'solo violin', 'trill', 'chirping'],
        start: 8.5,
        end: 16.0,
        giveaway: true,
      },
    ],
  },
];

export const MOTIF_WORK_BY_ID = new Map(MOTIF_WORKS.map((w) => [w.id, w]));
