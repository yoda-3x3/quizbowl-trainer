/**
 * The curated artwork set.
 *
 * Every work is public domain. That is a hard constraint, not a preference,
 * and it is why this list skews older than QB Reader's most-asked ranking,
 * where the top four visual artists (Dali, Warhol, Brancusi, Duchamp) all died
 * recently enough to still be in copyright. Choices below are taken from the
 * most-asked list filtered to what can actually ship.
 *
 * Boxes are normalized 0..1 against the shipped image. They are deliberately
 * generous: the point is to show the thing a clue just named, not to crop it
 * to the pixel.
 */

import type { Artwork } from './types';

export const ARTWORKS: Artwork[] = [
  {
    id: 'melencolia_i',
    title: 'Melencolia I',
    artist: 'Albrecht Dürer',
    year: '1514',
    image: '/art/melencolia_i.jpg',
    width: 1000,
    height: 1263,
    answerKeywords: ['melencolia', 'melancholia i', 'melencolia i'],
    // The ideal case for this drill: the engraving is literally an inventory
    // of objects, and tossups on it enumerate them one at a time.
    elements: [
      {
        id: 'magic_square',
        label: 'the magic square',
        keywords: ['magic square', 'four by four square', 'numbers'],
        box: { x: 0.68, y: 0.12, w: 0.2, h: 0.14 },
      },
      {
        id: 'polyhedron',
        label: 'the truncated polyhedron',
        keywords: ['polyhedron', 'truncated', 'rhombohedron', 'solid'],
        box: { x: 0.24, y: 0.36, w: 0.26, h: 0.24 },
      },
      {
        id: 'bat',
        label: 'the bat bearing the title banner',
        keywords: ['bat', 'banner', 'title', 'creature'],
        box: { x: 0.04, y: 0.02, w: 0.38, h: 0.18 },
      },
      {
        id: 'dog',
        label: 'the sleeping dog',
        keywords: ['dog', 'hound', 'sleeping animal', 'emaciated'],
        box: { x: 0.26, y: 0.7, w: 0.26, h: 0.14 },
      },
      {
        id: 'hourglass',
        label: 'the hourglass',
        keywords: ['hourglass', 'scales', 'balance', 'sundial'],
        box: { x: 0.7, y: 0.26, w: 0.15, h: 0.18 },
      },
      {
        id: 'bell',
        label: 'the bell',
        keywords: ['bell'],
        box: { x: 0.85, y: 0.07, w: 0.14, h: 0.22 },
      },
      {
        id: 'ladder',
        label: 'the ladder',
        keywords: ['ladder', 'rungs'],
        box: { x: 0.55, y: 0.0, w: 0.24, h: 0.44 },
      },
      {
        id: 'compass',
        label: 'the compass in her hand',
        keywords: ['compass', 'dividers', 'calipers'],
        box: { x: 0.3, y: 0.5, w: 0.22, h: 0.16 },
      },
      {
        id: 'sphere',
        label: 'the sphere',
        keywords: ['sphere', 'ball', 'orb'],
        box: { x: 0.05, y: 0.72, w: 0.2, h: 0.16 },
      },
      {
        id: 'figure',
        label: 'the winged figure, head on fist',
        keywords: [
          'winged figure',
          'wings',
          'head on',
          'fist',
          'chin',
          'personification',
        ],
        box: { x: 0.16, y: 0.26, w: 0.44, h: 0.52 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'starry_night',
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    year: '1889',
    image: '/art/starry_night.jpg',
    width: 1000,
    height: 792,
    answerKeywords: ['starry night'],
    elements: [
      {
        id: 'cypress',
        label: 'the cypress tree',
        keywords: ['cypress', 'tree', 'flame-like'],
        box: { x: 0.01, y: 0.04, w: 0.26, h: 0.94 },
      },
      {
        id: 'village',
        label: 'the sleeping village',
        keywords: ['village', 'town', 'houses', 'hamlet'],
        box: { x: 0.28, y: 0.66, w: 0.58, h: 0.26 },
      },
      {
        id: 'spire',
        label: 'the church spire',
        keywords: ['church', 'spire', 'steeple'],
        box: { x: 0.42, y: 0.5, w: 0.16, h: 0.3 },
      },
      {
        id: 'moon',
        label: 'the crescent moon',
        keywords: ['moon', 'crescent'],
        box: { x: 0.78, y: 0.06, w: 0.18, h: 0.22 },
      },
      {
        id: 'swirls',
        label: 'the swirling sky',
        keywords: ['swirl', 'spiral', 'eddy', 'turbulent', 'sky'],
        box: { x: 0.26, y: 0.12, w: 0.46, h: 0.4 },
      },
      {
        id: 'hills',
        label: 'the hills',
        keywords: ['hills', 'mountains', 'ridge', 'alpilles'],
        box: { x: 0.0, y: 0.56, w: 1.0, h: 0.18 },
      },
    ],
  },

  {
    id: 'the_scream',
    title: 'The Scream',
    artist: 'Edvard Munch',
    year: '1893',
    image: '/art/the_scream.jpg',
    width: 1000,
    height: 1241,
    answerKeywords: ['the scream', 'skrik'],
    elements: [
      {
        id: 'railing',
        label: 'the bridge railing',
        keywords: ['bridge', 'railing', 'walkway', 'diagonal'],
        box: { x: 0.0, y: 0.1, w: 0.92, h: 0.66 },
      },
      {
        id: 'sky',
        label: 'the blood-red sky',
        keywords: ['sky', 'red', 'orange', 'clouds', 'blood'],
        box: { x: 0.0, y: 0.0, w: 1.0, h: 0.3 },
      },
      {
        id: 'two_figures',
        label: 'the two distant figures',
        keywords: ['two figures', 'companions', 'distant figures', 'behind'],
        box: { x: 0.6, y: 0.08, w: 0.3, h: 0.32 },
      },
      {
        id: 'fjord',
        label: 'the fjord and boats',
        keywords: ['fjord', 'water', 'boats', 'harbor', 'harbour'],
        box: { x: 0.0, y: 0.3, w: 0.38, h: 0.26 },
      },
      {
        id: 'figure',
        label: 'the screaming figure',
        keywords: ['figure', 'hands', 'face', 'skull', 'mouth', 'ears'],
        box: { x: 0.2, y: 0.2, w: 0.44, h: 0.78 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'birth_of_venus',
    title: 'The Birth of Venus',
    artist: 'Sandro Botticelli',
    year: 'c. 1485',
    image: '/art/birth_of_venus.jpg',
    width: 1000,
    height: 628,
    answerKeywords: ['birth of venus', 'nascita di venere'],
    elements: [
      {
        id: 'shell',
        label: 'the scallop shell',
        keywords: ['shell', 'scallop', 'cockle'],
        box: { x: 0.28, y: 0.6, w: 0.36, h: 0.36 },
      },
      {
        id: 'zephyr',
        label: 'Zephyr and Aura, blowing',
        keywords: ['zephyr', 'wind', 'blowing', 'aura', 'west wind'],
        box: { x: 0.0, y: 0.06, w: 0.3, h: 0.52 },
      },
      {
        id: 'hora',
        label: 'the Hora holding out a cloak',
        keywords: ['hora', 'cloak', 'robe', 'mantle', 'attendant', 'nymph'],
        box: { x: 0.64, y: 0.12, w: 0.36, h: 0.76 },
      },
      {
        id: 'roses',
        label: 'the falling roses',
        keywords: ['roses', 'flowers', 'blossoms'],
        box: { x: 0.16, y: 0.22, w: 0.24, h: 0.3 },
      },
      {
        id: 'trees',
        label: 'the orange trees',
        keywords: ['orange tree', 'trees', 'grove', 'laurel'],
        box: { x: 0.72, y: 0.0, w: 0.28, h: 0.46 },
      },
      {
        id: 'venus',
        label: 'Venus, covering herself with her hair',
        keywords: ['venus', 'hair', 'contrapposto', 'goddess'],
        box: { x: 0.32, y: 0.14, w: 0.26, h: 0.66 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'oath_of_the_horatii',
    title: 'Oath of the Horatii',
    artist: 'Jacques-Louis David',
    year: '1784',
    image: '/art/oath_of_the_horatii.jpg',
    width: 1000,
    height: 770,
    answerKeywords: ['oath of the horatii', 'serment des horaces', 'horatii'],
    elements: [
      {
        id: 'brothers',
        label: 'the three brothers saluting',
        keywords: ['three brothers', 'brothers', 'salute', 'arms outstretched'],
        box: { x: 0.12, y: 0.2, w: 0.34, h: 0.66 },
      },
      {
        id: 'swords',
        label: 'the three swords',
        keywords: ['swords', 'sword', 'blades'],
        box: { x: 0.42, y: 0.26, w: 0.18, h: 0.2 },
      },
      {
        id: 'father',
        label: 'the father holding the swords',
        keywords: ['father', 'elder', 'patriarch', 'horatius'],
        box: { x: 0.4, y: 0.2, w: 0.24, h: 0.66 },
      },
      {
        id: 'women',
        label: 'the grieving women',
        keywords: ['women', 'sisters', 'camilla', 'grieving', 'swooning'],
        box: { x: 0.6, y: 0.42, w: 0.3, h: 0.48 },
      },
      {
        id: 'arches',
        label: 'the three arches',
        keywords: ['arch', 'arches', 'arcade', 'columns'],
        box: { x: 0.06, y: 0.0, w: 0.88, h: 0.34 },
      },
    ],
  },

  {
    id: 'last_supper',
    title: 'The Last Supper',
    artist: 'Leonardo da Vinci',
    year: '1495–1498',
    image: '/art/last_supper.jpg',
    width: 1000,
    height: 521,
    answerKeywords: ['last supper', 'ultima cena', 'cenacolo'],
    elements: [
      {
        id: 'windows',
        label: 'the three windows behind',
        keywords: ['window', 'windows'],
        box: { x: 0.34, y: 0.1, w: 0.32, h: 0.42 },
      },
      {
        id: 'table',
        label: 'the long table',
        keywords: ['table', 'tablecloth', 'bread', 'wine'],
        box: { x: 0.06, y: 0.6, w: 0.88, h: 0.28 },
      },
      {
        id: 'judas',
        label: 'Judas recoiling, clutching the purse',
        keywords: ['judas', 'purse', 'salt', 'recoil', 'elbow'],
        box: { x: 0.28, y: 0.32, w: 0.14, h: 0.4 },
      },
      {
        id: 'left_group',
        label: 'the apostles to the left',
        keywords: ['bartholomew', 'andrew', 'left', 'groups of three'],
        box: { x: 0.04, y: 0.26, w: 0.26, h: 0.48 },
      },
      {
        id: 'right_group',
        label: 'the apostles to the right',
        keywords: ['thomas', 'philip', 'matthew', 'right'],
        box: { x: 0.62, y: 0.26, w: 0.34, h: 0.48 },
      },
      {
        id: 'christ',
        label: 'Christ at the vanishing point',
        keywords: ['christ', 'jesus', 'vanishing point', 'perspective', 'center'],
        box: { x: 0.42, y: 0.22, w: 0.16, h: 0.52 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'the_oxbow',
    title: 'The Oxbow',
    artist: 'Thomas Cole',
    year: '1836',
    image: '/art/the_oxbow.jpg',
    width: 1000,
    height: 680,
    answerKeywords: ['the oxbow', 'oxbow', 'connecticut river near northampton'],
    elements: [
      {
        id: 'bend',
        label: 'the oxbow bend of the river',
        keywords: ['oxbow', 'river', 'bend', 'connecticut'],
        box: { x: 0.44, y: 0.42, w: 0.52, h: 0.4 },
      },
      {
        id: 'storm',
        label: 'the storm clouds',
        keywords: ['storm', 'clouds', 'thunderstorm', 'tempest', 'rain'],
        box: { x: 0.0, y: 0.0, w: 0.56, h: 0.4 },
      },
      {
        id: 'blasted_tree',
        label: 'the blasted tree',
        keywords: ['blasted tree', 'tree', 'withered', 'twisted trunk'],
        box: { x: 0.08, y: 0.04, w: 0.32, h: 0.54 },
      },
      {
        id: 'painter',
        label: 'the painter with his umbrella',
        keywords: ['painter', 'umbrella', 'easel', 'self-portrait', 'artist'],
        box: { x: 0.28, y: 0.6, w: 0.18, h: 0.22 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'venus_of_urbino',
    title: 'Venus of Urbino',
    artist: 'Titian',
    year: '1534',
    image: '/art/venus_of_urbino.jpg',
    width: 1000,
    height: 703,
    answerKeywords: ['venus of urbino', 'venere di urbino'],
    elements: [
      {
        id: 'dog',
        label: 'the sleeping dog',
        keywords: ['dog', 'spaniel', 'lapdog'],
        box: { x: 0.54, y: 0.5, w: 0.2, h: 0.26 },
      },
      {
        id: 'maids',
        label: 'the maidservants at the chest',
        keywords: ['maid', 'maidservant', 'servants', 'cassone', 'chest'],
        box: { x: 0.6, y: 0.22, w: 0.36, h: 0.56 },
      },
      {
        id: 'roses',
        label: 'the roses in her hand',
        keywords: ['roses', 'flowers', 'posy'],
        box: { x: 0.24, y: 0.48, w: 0.18, h: 0.16 },
      },
      {
        id: 'myrtle',
        label: 'the myrtle on the windowsill',
        keywords: ['myrtle', 'window', 'plant', 'windowsill'],
        box: { x: 0.78, y: 0.16, w: 0.2, h: 0.28 },
      },
      {
        id: 'venus',
        label: 'the reclining Venus',
        keywords: ['reclining', 'venus', 'nude', 'gaze', 'bed'],
        box: { x: 0.04, y: 0.24, w: 0.6, h: 0.6 },
        giveaway: true,
      },
    ],
  },
  {
    id: 'school_of_athens',
    title: 'The School of Athens',
    artist: 'Raphael',
    year: '1509–1511',
    image: '/art/school_of_athens.jpg',
    width: 1000,
    height: 776,
    answerKeywords: ['school of athens', 'scuola di atene'],
    elements: [
      {
        id: 'arches',
        label: 'the receding barrel vaults',
        keywords: ['vault', 'arches', 'barrel', 'coffered', 'perspective'],
        box: { x: 0.18, y: 0.0, w: 0.64, h: 0.32 },
      },
      {
        id: 'euclid',
        label: 'Euclid bent over a compass',
        keywords: ['euclid', 'compass', 'dividers', 'geometry', 'bramante'],
        box: { x: 0.6, y: 0.6, w: 0.22, h: 0.3 },
      },
      {
        id: 'diogenes',
        label: 'Diogenes sprawled on the steps',
        keywords: ['diogenes', 'steps', 'sprawled', 'reclining', 'bowl'],
        box: { x: 0.38, y: 0.56, w: 0.2, h: 0.24 },
      },
      {
        id: 'heraclitus',
        label: 'Heraclitus brooding on a block',
        keywords: ['heraclitus', 'brooding', 'michelangelo', 'block', 'elbow'],
        box: { x: 0.24, y: 0.54, w: 0.2, h: 0.32 },
      },
      {
        id: 'pythagoras',
        label: 'Pythagoras writing in a book',
        keywords: ['pythagoras', 'writing', 'book', 'tablet', 'slate'],
        box: { x: 0.08, y: 0.56, w: 0.22, h: 0.3 },
      },
      {
        id: 'statues',
        label: 'the statue in its niche',
        keywords: ['statue', 'niche', 'apollo', 'athena', 'minerva'],
        box: { x: 0.15, y: 0.2, w: 0.13, h: 0.28 },
      },
      {
        id: 'plato_aristotle',
        label: 'Plato pointing up, Aristotle gesturing out',
        keywords: ['plato', 'aristotle', 'pointing', 'upward', 'two figures'],
        box: { x: 0.4, y: 0.28, w: 0.2, h: 0.48 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'arnolfini_portrait',
    title: 'The Arnolfini Portrait',
    artist: 'Jan van Eyck',
    year: '1434',
    image: '/art/arnolfini_portrait.jpg',
    width: 1000,
    height: 1368,
    answerKeywords: ['arnolfini', 'arnolfini portrait', 'arnolfini wedding'],
    elements: [
      {
        id: 'mirror',
        label: 'the convex mirror',
        keywords: ['mirror', 'convex', 'roundel', 'reflection'],
        box: { x: 0.41, y: 0.35, w: 0.18, h: 0.12 },
      },
      {
        id: 'dog',
        label: 'the small dog',
        keywords: ['dog', 'terrier', 'griffon'],
        box: { x: 0.32, y: 0.77, w: 0.22, h: 0.14 },
      },
      {
        id: 'shoes',
        label: 'the discarded shoes',
        keywords: ['shoes', 'pattens', 'clogs', 'sandals', 'removed'],
        box: { x: 0.05, y: 0.83, w: 0.22, h: 0.13 },
      },
      {
        id: 'candle',
        label: 'the single lit candle',
        keywords: ['candle', 'chandelier', 'candelabrum'],
        box: { x: 0.42, y: 0.09, w: 0.22, h: 0.18 },
      },
      {
        id: 'oranges',
        label: 'the oranges by the window',
        keywords: ['orange', 'oranges', 'fruit', 'windowsill'],
        box: { x: 0.05, y: 0.32, w: 0.22, h: 0.13 },
      },
      {
        id: 'signature',
        label: 'the signature on the wall',
        keywords: ['signature', 'inscription', 'fuit hic', 'latin', 'signed'],
        box: { x: 0.34, y: 0.28, w: 0.38, h: 0.09 },
      },
      {
        id: 'hands',
        label: 'their joined hands',
        keywords: ['hands', 'joined', 'clasped', 'raised hand'],
        box: { x: 0.34, y: 0.5, w: 0.26, h: 0.14 },
      },
      {
        id: 'dress',
        label: 'the heavy green dress',
        keywords: ['green', 'dress', 'gown', 'pregnant', 'fur'],
        box: { x: 0.5, y: 0.36, w: 0.4, h: 0.56 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'las_meninas',
    title: 'Las Meninas',
    artist: 'Diego Velázquez',
    year: '1656',
    image: '/art/las_meninas.jpg',
    width: 1000,
    height: 1151,
    answerKeywords: ['las meninas', 'the maids of honour', 'maids of honor'],
    elements: [
      {
        id: 'canvas_back',
        label: 'the back of a huge canvas',
        keywords: ['canvas', 'easel', 'stretcher', 'back of'],
        box: { x: 0.0, y: 0.05, w: 0.2, h: 0.66 },
      },
      {
        id: 'mirror',
        label: 'the mirror holding the king and queen',
        keywords: ['mirror', 'king', 'queen', 'reflection', 'royal couple'],
        box: { x: 0.58, y: 0.27, w: 0.15, h: 0.16 },
      },
      {
        id: 'doorway',
        label: 'the man in the lit doorway',
        keywords: ['doorway', 'stair', 'lit door', 'curtain', 'back of the room'],
        box: { x: 0.74, y: 0.2, w: 0.18, h: 0.34 },
      },
      {
        id: 'dog',
        label: 'the dog being prodded',
        keywords: ['dog', 'mastiff', 'hound'],
        box: { x: 0.56, y: 0.69, w: 0.26, h: 0.2 },
      },
      {
        id: 'dwarfs',
        label: 'the two dwarfs',
        keywords: ['dwarf', 'dwarfs', 'maribarbola', 'nicolasito'],
        box: { x: 0.58, y: 0.53, w: 0.26, h: 0.3 },
      },
      {
        id: 'meninas',
        label: 'the maids of honour flanking her',
        keywords: ['maids', 'menina', 'attendants', 'kneeling', 'curtsy'],
        box: { x: 0.22, y: 0.4, w: 0.48, h: 0.44 },
      },
      {
        id: 'infanta',
        label: 'the Infanta Margarita at the centre',
        keywords: ['infanta', 'margarita', 'princess', 'blonde', 'centre', 'center'],
        box: { x: 0.34, y: 0.42, w: 0.22, h: 0.4 },
      },
      {
        id: 'painter',
        label: 'the painter himself, brush in hand',
        keywords: ['painter', 'velazquez', 'self-portrait', 'brush', 'palette'],
        box: { x: 0.02, y: 0.2, w: 0.3, h: 0.6 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'third_of_may',
    title: 'The Third of May 1808',
    artist: 'Francisco Goya',
    year: '1814',
    image: '/art/third_of_may.jpg',
    width: 1000,
    height: 773,
    answerKeywords: [
      'third of may',
      'tres de mayo',
      'el tres de mayo',
      '3rd of may',
    ],
    elements: [
      {
        id: 'lantern',
        label: 'the boxy lantern on the ground',
        keywords: ['lantern', 'lamp', 'light source', 'box'],
        box: { x: 0.44, y: 0.54, w: 0.16, h: 0.2 },
      },
      {
        id: 'squad',
        label: 'the faceless firing squad',
        keywords: ['firing squad', 'soldiers', 'rifles', 'muskets', 'faceless', 'backs'],
        box: { x: 0.56, y: 0.28, w: 0.38, h: 0.6 },
      },
      {
        id: 'monk',
        label: 'the kneeling friar',
        keywords: ['monk', 'friar', 'tonsure', 'praying', 'kneeling'],
        box: { x: 0.18, y: 0.48, w: 0.18, h: 0.3 },
      },
      {
        id: 'corpses',
        label: 'the bodies already fallen',
        keywords: ['corpse', 'bodies', 'dead', 'blood', 'fallen'],
        box: { x: 0.04, y: 0.68, w: 0.32, h: 0.28 },
      },
      {
        id: 'town',
        label: 'the dark town behind',
        keywords: ['town', 'church', 'hill', 'buildings', 'night sky'],
        box: { x: 0.28, y: 0.04, w: 0.44, h: 0.32 },
      },
      {
        id: 'white_shirt',
        label: 'the man in white with his arms thrown up',
        keywords: ['white shirt', 'arms raised', 'arms thrown', 'outstretched', 'yellow trousers'],
        box: { x: 0.28, y: 0.28, w: 0.22, h: 0.54 },
        giveaway: true,
      },
    ],
  },

  {
    id: 'great_wave',
    title: 'The Great Wave off Kanagawa',
    artist: 'Katsushika Hokusai',
    year: 'c. 1831',
    image: '/art/great_wave.jpg',
    width: 1000,
    height: 672,
    answerKeywords: [
      'great wave',
      'kanagawa',
      'under the wave',
      'thirty-six views of mount fuji',
    ],
    elements: [
      {
        id: 'boats',
        label: 'the three long boats',
        keywords: ['boat', 'boats', 'oarsmen', 'rowers', 'vessels'],
        box: { x: 0.2, y: 0.54, w: 0.58, h: 0.3 },
      },
      {
        id: 'fuji',
        label: 'Mount Fuji, small behind',
        keywords: ['fuji', 'mountain', 'snow-capped', 'volcano'],
        box: { x: 0.36, y: 0.44, w: 0.26, h: 0.28 },
      },
      {
        id: 'wave',
        label: 'the wave with its clawing foam',
        keywords: ['wave', 'claw', 'foam', 'crest', 'breaking'],
        box: { x: 0.0, y: 0.04, w: 0.62, h: 0.7 },
      },
      {
        id: 'trough',
        label: 'the smaller swell in front',
        keywords: ['trough', 'swell', 'smaller wave', 'foreground'],
        box: { x: 0.24, y: 0.68, w: 0.46, h: 0.28 },
      },
    ],
  },

  {
    id: 'fall_of_icarus',
    title: 'Landscape with the Fall of Icarus',
    artist: 'Pieter Bruegel the Elder',
    year: 'c. 1560',
    image: '/art/fall_of_icarus.jpg',
    width: 1000,
    height: 639,
    answerKeywords: ['fall of icarus', 'icarus', 'val van icarus'],
    elements: [
      {
        id: 'plowman',
        label: 'the ploughman, head down',
        keywords: ['plowman', 'ploughman', 'plough', 'plow', 'horse', 'furrow'],
        box: { x: 0.06, y: 0.16, w: 0.3, h: 0.48 },
      },
      {
        id: 'shepherd',
        label: 'the shepherd gazing up',
        keywords: ['shepherd', 'sheep', 'flock', 'looking up', 'crook'],
        box: { x: 0.26, y: 0.28, w: 0.2, h: 0.36 },
      },
      {
        id: 'ship',
        label: 'the ship sailing on',
        keywords: ['ship', 'sail', 'galleon', 'vessel', 'rigging'],
        box: { x: 0.5, y: 0.28, w: 0.3, h: 0.36 },
      },
      {
        id: 'legs',
        label: 'two legs vanishing into the water',
        keywords: ['legs', 'splash', 'drowning', 'kicking', 'vanishing'],
        box: { x: 0.72, y: 0.6, w: 0.18, h: 0.22 },
      },
      {
        id: 'sun',
        label: 'the sun low on the horizon',
        keywords: ['sun', 'horizon', 'setting', 'glare'],
        box: { x: 0.72, y: 0.26, w: 0.24, h: 0.22 },
      },
    ],
  },

  {
    id: 'grande_jatte',
    title: 'A Sunday Afternoon on the Island of La Grande Jatte',
    artist: 'Georges Seurat',
    year: '1884–1886',
    image: '/art/grande_jatte.jpg',
    width: 1000,
    height: 666,
    answerKeywords: ['grande jatte', 'la grande jatte', 'sunday afternoon'],
    elements: [
      {
        id: 'monkey',
        label: 'the monkey on a leash',
        keywords: ['monkey', 'leash', 'primate'],
        box: { x: 0.72, y: 0.62, w: 0.2, h: 0.24 },
      },
      {
        id: 'parasol_woman',
        label: 'the woman with the parasol',
        keywords: ['parasol', 'umbrella', 'bustle', 'woman in profile'],
        box: { x: 0.6, y: 0.2, w: 0.24, h: 0.62 },
      },
      {
        id: 'reclining_man',
        label: 'the man reclining in the grass',
        keywords: ['reclining', 'lounging', 'pipe', 'grass', 'foreground man'],
        box: { x: 0.0, y: 0.54, w: 0.28, h: 0.3 },
      },
      {
        id: 'girl_white',
        label: 'the girl in white at the centre',
        keywords: ['girl', 'white dress', 'child', 'facing out'],
        box: { x: 0.42, y: 0.4, w: 0.16, h: 0.32 },
      },
      {
        id: 'fisher',
        label: 'the woman fishing at the bank',
        keywords: ['fishing', 'rod', 'angler', 'bank', 'riverside'],
        box: { x: 0.12, y: 0.16, w: 0.18, h: 0.38 },
      },
      {
        id: 'boats',
        label: 'the boats on the water',
        keywords: ['boat', 'sailboat', 'river', 'seine', 'water'],
        box: { x: 0.24, y: 0.08, w: 0.3, h: 0.26 },
      },
    ],
  },

  {
    id: 'olympia',
    title: 'Olympia',
    artist: 'Édouard Manet',
    year: '1863',
    image: '/art/olympia.jpg',
    width: 1000,
    height: 681,
    answerKeywords: ['olympia'],
    elements: [
      {
        id: 'cat',
        label: 'the black cat with its back up',
        keywords: ['cat', 'black cat', 'arched', 'tail'],
        box: { x: 0.78, y: 0.5, w: 0.2, h: 0.3 },
      },
      {
        id: 'servant',
        label: 'the servant bringing a bouquet',
        keywords: ['servant', 'maid', 'bouquet', 'flowers', 'wrapped'],
        box: { x: 0.5, y: 0.16, w: 0.34, h: 0.6 },
      },
      {
        id: 'orchid',
        label: 'the orchid in her hair',
        keywords: ['orchid', 'flower in her hair', 'blossom'],
        box: { x: 0.19, y: 0.2, w: 0.14, h: 0.15 },
      },
      {
        id: 'ribbon',
        label: 'the black ribbon at her throat',
        keywords: ['ribbon', 'choker', 'throat', 'neck'],
        box: { x: 0.2, y: 0.31, w: 0.14, h: 0.12 },
      },
      {
        id: 'slipper',
        label: 'the slipper on one foot',
        keywords: ['slipper', 'mule', 'shoe', 'foot'],
        box: { x: 0.04, y: 0.58, w: 0.18, h: 0.18 },
      },
      {
        id: 'hand',
        label: 'the hand placed across her thigh',
        keywords: ['hand', 'thigh', 'covering', 'splayed'],
        box: { x: 0.24, y: 0.46, w: 0.2, h: 0.16 },
      },
      {
        id: 'olympia',
        label: 'Olympia, staring straight out',
        keywords: ['reclining', 'nude', 'gaze', 'stare', 'confrontational'],
        box: { x: 0.02, y: 0.2, w: 0.5, h: 0.6 },
        giveaway: true,
      },
    ],
  },
];

export const ARTWORK_BY_ID = new Map(ARTWORKS.map((a) => [a.id, a]));

export function totalElements(): number {
  return ARTWORKS.reduce((n, a) => n + a.elements.length, 0);
}
