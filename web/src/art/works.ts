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
    height: 771,
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
    height: 679,
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
    height: 704,
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
];

export const ARTWORK_BY_ID = new Map(ARTWORKS.map((a) => [a.id, a]));

export function totalElements(): number {
  return ARTWORKS.reduce((n, a) => n + a.elements.length, 0);
}
