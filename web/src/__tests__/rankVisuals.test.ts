/**
 * Tier -> visual mapping (rankVisuals.ts) and the components that render it:
 * the aura on RankBadge, the rank backdrop in ThemeBackdrop and the rank
 * loading screen. Rendered with react-dom/server, so effects don't run and
 * nothing fetches.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  GOD_TITLE,
  VISUAL_TIERS,
  auraStyle,
  backdropBackground,
  tierVisual,
  visualForRank,
} from '../rankVisuals';
import RankBadge from '../RankBadge';
import { RankLoaderView } from '../RankLoader';
import ThemeBackdrop from '../ThemeBackdrop';
import type { RatingPublic } from '../rank';

function rating(tier: string, is_god = false, elo = 900): RatingPublic {
  return {
    user_id: 1,
    username: 'ada',
    elo,
    wins: 3,
    losses: 1,
    rank: { tier, subrank: is_god ? null : 3, label: is_god ? 'God' : `${tier} 3`, is_god },
  };
}

describe('tierVisual', () => {
  it('has a visual for every tier, levels in order', () => {
    VISUAL_TIERS.forEach((t, i) => {
      const v = tierVisual(t);
      expect(v.tier).toBe(t);
      expect(v.level).toBe(i);
    });
  });

  it('aura strength strictly rises with the tier and God is the maximum', () => {
    const strengths = VISUAL_TIERS.map((t) => tierVisual(t).auraStrength);
    for (let i = 1; i < strengths.length; i++) {
      expect(strengths[i]!).toBeGreaterThan(strengths[i - 1]!);
    }
    expect(tierVisual('God').auraStrength).toBe(1);
  });

  it('aura breathes faster as the tier rises', () => {
    const speeds = VISUAL_TIERS.map((t) => tierVisual(t).auraSpeed);
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]!).toBeLessThan(speeds[i - 1]!);
    }
  });

  it('only Duke and up get the rotating halo', () => {
    expect(VISUAL_TIERS.filter((t) => tierVisual(t).auraHalo)).toEqual(['Duke', 'King', 'God']);
  });

  it('lower tiers are CSS-only; Knight and up unlock a credited image', () => {
    for (const t of ['Serf', 'Peasant', 'Squire']) {
      expect(tierVisual(t).backdrop.image).toBeNull();
    }
    for (const t of ['Knight', 'Baron', 'Duke', 'King', 'God']) {
      const b = tierVisual(t).backdrop;
      expect(b.image).toMatch(/^\/ranks\/[a-z]+\.jpg$/);
      expect(b.credit).toBeTruthy();
    }
  });

  it('God keeps the Star of David crest and wears the promised-rank title', () => {
    expect(tierVisual('God').glyph).toBe('✡');
    expect(GOD_TITLE).toBe('The rank promised to you 3000 years ago');
    const card = renderToString(createElement(RankBadge, { rating: rating('King', true) }));
    expect(card).toContain('✡');
    expect(card).toContain(GOD_TITLE);
    const knight = renderToString(createElement(RankBadge, { rating: rating('Knight') }));
    expect(knight).not.toContain(GOD_TITLE);
  });

  it('God gets The Creation of Adam', () => {
    const b = tierVisual('God').backdrop;
    expect(b.image).toBe('/ranks/god.jpg');
    expect(b.credit).toMatch(/Michelangelo.*Creation of Adam/);
  });

  it('the scrim lets more of the art through as the tier rises', () => {
    const scrims = VISUAL_TIERS.map((t) => tierVisual(t).backdrop.scrimMin);
    for (let i = 1; i < scrims.length; i++) {
      expect(scrims[i]!).toBeLessThanOrEqual(scrims[i - 1]!);
    }
    expect(scrims[scrims.length - 1]!).toBeLessThan(scrims[0]!);
  });

  it('every tier has its own loading motif and tagline', () => {
    const motifs = new Set(VISUAL_TIERS.map((t) => tierVisual(t).loader.motif));
    const taglines = new Set(VISUAL_TIERS.map((t) => tierVisual(t).loader.tagline));
    expect(motifs.size).toBe(VISUAL_TIERS.length);
    expect(taglines.size).toBe(VISUAL_TIERS.length);
  });

  it('falls back to Serf for an unknown tier name', () => {
    expect(tierVisual('Emperor').tier).toBe('Serf');
  });

  it('is_god wins over the tier the server reports underneath', () => {
    expect(visualForRank({ tier: 'Serf', is_god: true }).tier).toBe('God');
    expect(visualForRank({ tier: 'Baron', is_god: false }).tier).toBe('Baron');
  });

  it('every backdrop image is self-hosted under public/', () => {
    for (const t of VISUAL_TIERS) {
      const img = tierVisual(t).backdrop.image;
      if (!img) continue;
      const path = fileURLToPath(new URL(`../../public${img}`, import.meta.url));
      expect(existsSync(path), img).toBe(true);
    }
  });
});

describe('auraStyle / backdropBackground', () => {
  it('exposes the tier colour, strength and speed as CSS vars', () => {
    const v = tierVisual('King');
    expect(auraStyle(v)).toEqual({
      '--rank-color': v.color,
      '--aura-strength': String(v.auraStrength),
      '--aura-speed': `${v.auraSpeed}s`,
    });
  });

  it('scrims with the theme --bg so light and dark themes both work', () => {
    expect(backdropBackground(tierVisual('Serf'))).toContain('var(--bg)');
    expect(backdropBackground(tierVisual('God'))).toContain('var(--bg)');
    expect(backdropBackground(tierVisual('God'))).toContain('url(/ranks/god.jpg)');
    expect(backdropBackground(tierVisual('Squire'))).not.toContain('url(');
  });
});

describe('RankBadge aura', () => {
  it('wraps every variant in a tier-tagged aura', () => {
    for (const variant of ['card', 'compact', 'topbar', 'mini'] as const) {
      const html = renderToString(createElement(RankBadge, { rating: rating('Knight'), variant }));
      expect(html).toContain('class="rank-aura');
      expect(html).toContain('data-tier="Knight"');
      expect(html).toContain('--aura-strength:0.5');
    }
  });

  it('only God gets light rays; Duke+ get the halo', () => {
    const god = renderToString(createElement(RankBadge, { rating: rating('King', true) }));
    expect(god).toContain('rank-aura__rays');
    expect(god).toContain('data-halo');
    const duke = renderToString(createElement(RankBadge, { rating: rating('Duke') }));
    expect(duke).not.toContain('rank-aura__rays');
    expect(duke).toContain('data-halo');
    const serf = renderToString(createElement(RankBadge, { rating: rating('Serf') }));
    expect(serf).not.toContain('data-halo');
  });

  it('the top-bar chip shows the ELO', () => {
    const html = renderToString(
      createElement(RankBadge, { rating: rating('Baron', false, 1777), variant: 'topbar' }),
    );
    expect(html).toContain('rank-badge__elo');
    expect(html).toContain('1777');
  });

  it('plain (admin) renders no aura and no tier colour', () => {
    const html = renderToString(
      createElement(RankBadge, { rating: rating('King', true), variant: 'compact', plain: true }),
    );
    expect(html).not.toContain('rank-aura');
    expect(html).not.toContain('--rank-color');
    expect(html).toContain('rank-badge--plain');
  });
});

describe('rank backdrop', () => {
  it('replaces the theme painting with the tier backdrop when a rank is given', () => {
    const html = renderToString(
      createElement(ThemeBackdrop, { theme: 'art', rank: { tier: 'Duke', is_god: false } }),
    );
    expect(html).toContain('data-rank-backdrop="Duke"');
    expect(html).toContain('/ranks/duke.jpg');
    expect(html).not.toContain('/themes/art.jpg');
    expect(html).toMatch(/pointer-events:\s*none/);
  });

  it('shows a backdrop even on the classic theme, and God gets the spark', () => {
    const html = renderToString(
      createElement(ThemeBackdrop, { theme: 'classic', rank: { tier: 'King', is_god: true } }),
    );
    expect(html).toContain('data-rank-backdrop="God"');
    expect(html).toContain('rank-backdrop__spark');
  });

  it('falls back to the theme painting with no rank', () => {
    const html = renderToString(createElement(ThemeBackdrop, { theme: 'art', rank: null }));
    expect(html).toContain('/themes/art.jpg');
    expect(html).not.toContain('data-rank-backdrop');
  });
});

describe('rank loading screen', () => {
  it('renders the tier crest, motes by level and tagline', () => {
    const v = tierVisual('Baron');
    const html = renderToString(createElement(RankLoaderView, { label: 'Loading questions', visual: v }));
    expect(html).toContain('role="status"');
    expect(html).toContain('data-tier="Baron"');
    expect(html).toContain(v.loader.tagline);
    expect(html.match(/rank-loader__mote/g)?.length).toBe(v.level);
    expect(html).toContain('/ranks/baron.jpg');
  });

  it('God gets the Creation of Adam vignette with a spark', () => {
    const html = renderToString(
      createElement(RankLoaderView, { label: 'Loading', visual: tierVisual('God') }),
    );
    expect(html).toContain('/ranks/god.jpg');
    expect(html).toContain('rank-loader__spark');
  });

  it('signed out: a neutral loader with no art', () => {
    const html = renderToString(createElement(RankLoaderView, { label: 'Loading', visual: null }));
    expect(html).toContain('data-tier="none"');
    expect(html).not.toContain('rank-loader__art');
  });
});
