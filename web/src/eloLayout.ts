/**
 * Pure layout for the ELO chart (EloChart.tsx): the x-domain, the tier
 * bands behind the dots, and a greedy dot-dodge so every player gets their
 * own visible dot even when many share an ELO.
 *
 * Kept free of React and the DOM so it can be unit-tested directly.
 */

import { VISUAL_TIERS } from './rankVisuals';

/** Mirrors workers/room/ratings.ts (ELO_FLOOR, TIER_WIDTH). Cosmetic only:
 *  it places the band edges, never decides anyone's rank. */
export const CHART_ELO_FLOOR = 100;
export const CHART_TIER_WIDTH = 500;
/** Serf..King; God is positional, not a band. */
const BAND_TIERS = VISUAL_TIERS.slice(0, 7);

export interface Domain {
  min: number;
  max: number;
}

/** Floor to the top player's band edge, at least two tiers wide so a
 *  brand-new app still reads as a ladder. */
export function eloDomain(elos: readonly number[]): Domain {
  const top = elos.length ? Math.max(...elos) : CHART_ELO_FLOOR;
  const bandsNeeded = Math.max(
    2,
    Math.ceil((Math.max(top, CHART_ELO_FLOOR) + 60 - CHART_ELO_FLOOR) / CHART_TIER_WIDTH),
  );
  return { min: CHART_ELO_FLOOR, max: CHART_ELO_FLOOR + bandsNeeded * CHART_TIER_WIDTH };
}

export interface Band {
  tier: string;
  from: number;
  to: number;
}

/** Tier bands that fall inside the domain. King is open-ended, so it
 *  stretches to the domain's right edge. */
export function tierBands(domain: Domain): Band[] {
  const bands: Band[] = [];
  BAND_TIERS.forEach((tier, i) => {
    const from = CHART_ELO_FLOOR + i * CHART_TIER_WIDTH;
    if (from >= domain.max) return;
    const isLast = i === BAND_TIERS.length - 1;
    const to = isLast ? domain.max : Math.min(domain.max, from + CHART_TIER_WIDTH);
    bands.push({ tier, from, to });
  });
  return bands;
}

export interface DotIn {
  id: number;
  elo: number;
}

export interface DotOut extends DotIn {
  /** Centre x in px. */
  x: number;
  /** 0 = the baseline row; each row stacks one dot diameter upward. */
  row: number;
}

/**
 * Greedy dodge: walk players from lowest ELO up and drop each dot into the
 * lowest row where it doesn't overlap a dot already placed there. Every
 * player keeps a dot at their true x; collisions only stack upward.
 */
export function dodge(
  dots: readonly DotIn[],
  domain: Domain,
  width: number,
  diameter: number,
): { dots: DotOut[]; rows: number } {
  const span = domain.max - domain.min || 1;
  const xOf = (elo: number) =>
    ((Math.min(domain.max, Math.max(domain.min, elo)) - domain.min) / span) * width;
  const lastXInRow: number[] = [];
  const out: DotOut[] = [];
  const sorted = [...dots].sort((a, b) => a.elo - b.elo || a.id - b.id);
  for (const d of sorted) {
    const x = xOf(d.elo);
    let row = 0;
    while (lastXInRow[row] !== undefined && x - (lastXInRow[row] as number) < diameter) row++;
    lastXInRow[row] = x;
    out.push({ ...d, x, row });
  }
  return { dots: out, rows: Math.max(1, lastXInRow.length) };
}
