import { describe, expect, it } from 'vitest';
import {
  findArtwork,
  remainingElements,
  revealedArea,
  revealsFor,
  studyOrder,
} from '../match';
import { ARTWORK_BY_ID, ARTWORKS } from '../works';

const melencolia = ARTWORK_BY_ID.get('melencolia_i');
const starry = ARTWORK_BY_ID.get('starry_night');

describe('findArtwork', () => {
  it('matches a work from its answer line', () => {
    expect(findArtwork('<b><u>Melencolia I</u></b>')?.id).toBe('melencolia_i');
    expect(findArtwork('The Starry Night')?.id).toBe('starry_night');
  });

  it('ignores case, markup and punctuation', () => {
    expect(findArtwork('the   STARRY-NIGHT!!')?.id).toBe('starry_night');
  });

  it('folds diacritics in the answer line', () => {
    expect(findArtwork('La nascita di Venere')?.id).toBe('birth_of_venus');
  });

  it('stays silent when nothing in the set fits', () => {
    // Most questions are about works we do not ship, and guessing would show
    // the wrong painting, which is worse than showing none.
    expect(findArtwork('Guernica')).toBeNull();
    expect(findArtwork('')).toBeNull();
  });

  it('prefers the longest matching phrase', () => {
    const hit = findArtwork('The Oxbow, or the Connecticut River near Northampton');
    expect(hit?.id).toBe('the_oxbow');
  });
});

describe('revealsFor', () => {
  it('reveals nothing before any clue mentions anything', () => {
    expect(revealsFor(melencolia!, 'This engraving by a German'.split(' '))).toEqual(
      [],
    );
  });

  it('reveals only what the clue named', () => {
    const words = 'A four by four magic square sits in the corner'.split(' ');
    const out = revealsFor(melencolia!, words);
    expect(out).toHaveLength(1);
    expect(out[0]?.element.id).toBe('magic_square');
  });

  it('accumulates as more clues arrive', () => {
    const one = revealsFor(melencolia!, 'the magic square'.split(' '));
    const two = revealsFor(
      melencolia!,
      'the magic square and a sleeping dog'.split(' '),
    );
    expect(one).toHaveLength(1);
    expect(two).toHaveLength(2);
    expect(two.map((r) => r.element.id)).toContain('dog');
  });

  it('orders reveals by when the question triggered them', () => {
    const words =
      'a sleeping dog lies below while a magic square hangs above'.split(' ');
    const out = revealsFor(melencolia!, words);
    expect(out.map((r) => r.element.id)).toEqual(['dog', 'magic_square']);
  });

  it('reports the word index that triggered each reveal', () => {
    const words = 'the sleeping dog'.split(' ');
    const out = revealsFor(melencolia!, words);
    expect(out[0]?.wordIndex).toBe(2);
  });

  it('matches multi-word keywords on their last word', () => {
    const words = 'a truncated polyhedron stands here'.split(' ');
    const out = revealsFor(melencolia!, words);
    expect(out[0]?.element.id).toBe('polyhedron');
    // "truncated" at 1, "polyhedron" at 2: the earliest single keyword wins.
    expect(out[0]?.wordIndex).toBeLessThanOrEqual(2);
  });

  it('works on a realistic clue stack', () => {
    const clue =
      'This work depicts a cypress tree at its left edge. A village sleeps ' +
      'beneath a church spire, and a crescent moon hangs at the upper right.';
    const out = revealsFor(starry!, clue.split(/\s+/));
    const ids = out.map((r) => r.element.id);
    expect(ids).toContain('cypress');
    expect(ids).toContain('village');
    expect(ids).toContain('spire');
    expect(ids).toContain('moon');
    // Order follows the prose, which is the whole point.
    expect(ids.indexOf('cypress')).toBeLessThan(ids.indexOf('moon'));
  });

  it('does not reveal an element the clues never mention', () => {
    const out = revealsFor(starry!, 'A cypress tree stands alone'.split(' '));
    expect(out.map((r) => r.element.id)).not.toContain('moon');
  });
});

describe('remainingElements and studyOrder', () => {
  it('lists what has not been described yet', () => {
    const reveals = revealsFor(starry!, 'the cypress'.split(' '));
    const left = remainingElements(starry!, reveals);
    expect(left.map((e) => e.id)).not.toContain('cypress');
    expect(left.length).toBe(starry!.elements.length - 1);
  });

  it('puts giveaway elements last so the drill stays honest', () => {
    const order = studyOrder(starry!);
    const giveaways = order.filter((e) => e.giveaway);
    if (giveaways.length > 0) {
      const firstGiveaway = order.findIndex((e) => e.giveaway);
      expect(order.slice(firstGiveaway).every((e) => e.giveaway)).toBe(true);
    }
  });

  it('keeps every element exactly once', () => {
    for (const art of ARTWORKS) {
      const order = studyOrder(art);
      expect(order).toHaveLength(art.elements.length);
      expect(new Set(order.map((e) => e.id)).size).toBe(art.elements.length);
    }
  });
});

describe('revealedArea', () => {
  it('is zero with nothing revealed and grows as boxes land', () => {
    expect(revealedArea([])).toBe(0);
    const some = revealsFor(starry!, 'the cypress and the village'.split(' '));
    expect(revealedArea(some)).toBeGreaterThan(0);
  });

  it('never exceeds one even when boxes overlap', () => {
    const all = starry!.elements.map((element, i) => ({
      element,
      wordIndex: i,
      matched: '',
    }));
    expect(revealedArea(all)).toBeLessThanOrEqual(1);
  });
});

describe('the curated set itself', () => {
  it('has unique ids', () => {
    expect(new Set(ARTWORKS.map((a) => a.id)).size).toBe(ARTWORKS.length);
  });

  it('keeps every box inside the image', () => {
    for (const art of ARTWORKS) {
      for (const el of art.elements) {
        const { x, y, w, h } = el.box;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(1.001);
        expect(y + h).toBeLessThanOrEqual(1.001);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
      }
    }
  });

  it('gives every element at least one keyword', () => {
    for (const art of ARTWORKS) {
      for (const el of art.elements) {
        expect(el.keywords.length).toBeGreaterThan(0);
        expect(el.keywords.every((k) => k === k.toLowerCase())).toBe(true);
      }
    }
  });

  it('gives every work at least four elements, or the drill is trivial', () => {
    for (const art of ARTWORKS) {
      expect(art.elements.length).toBeGreaterThanOrEqual(4);
    }
  });
});
