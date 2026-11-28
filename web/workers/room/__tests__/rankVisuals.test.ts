/**
 * The client's tier -> visual table (src/rankVisuals.ts) must cover exactly
 * the tiers the server can hand out: every RANK_TIERS entry in order, then
 * God. If a tier is ever added or renamed server-side, this fails instead of
 * that tier silently falling back to Serf visuals.
 */

import { describe, expect, it } from 'vitest';
import { RANK_TIERS, tierForElo, toRankInfo } from '../ratings';
import { VISUAL_TIERS, tierVisual, visualForRank } from '../../../src/rankVisuals';

describe('rank visuals stay in step with server tiers', () => {
  it('lists every server tier in order, then God', () => {
    expect(VISUAL_TIERS).toEqual([...RANK_TIERS, 'God']);
  });

  it('maps a tierForElo result at each band floor to its own visual', () => {
    RANK_TIERS.forEach((tier, i) => {
      const elo = 100 + i * 500;
      expect(tierForElo(elo).tier).toBe(tier);
      expect(tierVisual(tierForElo(elo).tier).tier).toBe(tier);
    });
  });

  it('gives the #1 player God visuals whatever their ELO', () => {
    const info = toRankInfo(250, true);
    expect(visualForRank({ tier: info.tier, is_god: info.isGod }).tier).toBe('God');
  });
});
