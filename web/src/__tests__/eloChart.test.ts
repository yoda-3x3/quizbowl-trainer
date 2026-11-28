/**
 * ELO chart: domain, tier bands, dot-dodge layout, and that the rendered
 * chart shows every player with God and "you" called out.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { dodge, eloDomain, tierBands } from '../eloLayout';
import EloChart from '../EloChart';
import type { LeaderboardEntry } from '../rank';

function entry(id: number, elo: number, opts: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    user_id: id,
    username: `p${id}`,
    elo,
    wins: 0,
    losses: 0,
    position: id,
    rated: true,
    rank: { tier: 'Serf', subrank: 3, label: 'Serf 3', is_god: false },
    ...opts,
  };
}

describe('eloDomain', () => {
  it('starts at the ELO floor and is at least two tiers wide', () => {
    expect(eloDomain([])).toEqual({ min: 100, max: 1100 });
    expect(eloDomain([400])).toEqual({ min: 100, max: 1100 });
  });

  it('extends to the band edge past the top player', () => {
    expect(eloDomain([3800]).max).toBe(4100);
    expect(eloDomain([1750, 300]).max).toBe(2100);
  });
});

describe('tierBands', () => {
  it('covers the domain in 500-ELO tier bands, Serf first', () => {
    const bands = tierBands({ min: 100, max: 2100 });
    expect(bands.map((b) => b.tier)).toEqual(['Serf', 'Peasant', 'Squire', 'Knight']);
    expect(bands[0]).toEqual({ tier: 'Serf', from: 100, to: 600 });
    expect(bands[3]).toEqual({ tier: 'Knight', from: 1600, to: 2100 });
  });

  it('King is open-ended and stretches to the domain edge', () => {
    const bands = tierBands({ min: 100, max: 4600 });
    expect(bands.at(-1)).toEqual({ tier: 'King', from: 3100, to: 4600 });
  });
});

describe('dodge', () => {
  const domain = { min: 100, max: 1100 };

  it('keeps every player and their true x', () => {
    const { dots } = dodge(
      [
        { id: 1, elo: 100 },
        { id: 2, elo: 1100 },
      ],
      domain,
      500,
      12,
    );
    expect(dots).toHaveLength(2);
    expect(dots.find((d) => d.id === 1)?.x).toBe(0);
    expect(dots.find((d) => d.id === 2)?.x).toBe(500);
  });

  it('stacks players who share an ELO instead of overlapping them', () => {
    const same = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, elo: 400 }));
    const { dots, rows } = dodge(same, domain, 500, 12);
    expect(rows).toBe(4);
    expect(new Set(dots.map((d) => d.row)).size).toBe(4);
    expect(new Set(dots.map((d) => d.x)).size).toBe(1);
  });

  it('far-apart players share the baseline row', () => {
    const { rows } = dodge(
      [
        { id: 1, elo: 200 },
        { id: 2, elo: 900 },
      ],
      domain,
      500,
      12,
    );
    expect(rows).toBe(1);
  });
});

describe('EloChart', () => {
  it('draws one dot per player, calls out God and you, marks unrated', () => {
    const entries = [
      entry(1, 3800, { rank: { tier: 'King', subrank: null, label: 'God', is_god: true } }),
      entry(2, 1750),
      entry(3, 400, { rated: false }),
      entry(4, 400, { rated: false }),
    ];
    const html = renderToString(createElement(EloChart, { entries, meId: 2 }));
    expect(html.match(/class="elo-chart__hit"/g)).toHaveLength(4);
    expect(html).toContain('elo-chart__dot--god');
    expect(html).toContain('✡ p1');
    expect(html).toContain('elo-chart__dot--me');
    expect(html.match(/elo-chart__dot--unrated/g)).toHaveLength(2);
    expect(html).toContain('ELO of all 4 players');
    // Tier band labels sit behind the dots.
    expect(html).toContain('>Serf<');
    expect(html).toContain('>King<');
  });
});
