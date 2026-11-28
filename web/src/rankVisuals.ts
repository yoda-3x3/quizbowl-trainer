/**
 * Tier -> visual mapping for the rank system: badge colour + glyph, the
 * animated aura's strength, the app backdrop each tier unlocks, and the
 * loading-screen motif.
 *
 * The tier itself is never decided here. The server computes it with
 * `tierForElo` / `toRankInfo` (workers/room/ratings.ts) and ships it as
 * `rating.rank`; this module only turns that tier name into pixels, so the
 * client can never disagree with the server about someone's rank. The tier
 * order below mirrors RANK_TIERS there, and a worker-side test
 * (workers/room/__tests__/rankVisuals.test.ts) fails if the two drift.
 *
 * Intensity rises with the tier on purpose: Serf to Squire stay quiet
 * (a faint CSS wash, a barely-there glow), Knight to King unlock a real
 * public-domain painting or a Hubble plate behind the app, and God — the one
 * player at #1 — gets Michelangelo's Creation of Adam and the loudest aura.
 */

/** The slice of the server's RankPublic this module needs. Declared here
 *  rather than imported from rank.ts so this module stays React-free and
 *  the worker test suite can import it too. */
export interface RankLike {
  tier: string;
  is_god: boolean;
}

/** Lowest to highest, God last. Index is the tier's visual level. */
export const VISUAL_TIERS = [
  'Serf',
  'Peasant',
  'Squire',
  'Knight',
  'Baron',
  'Duke',
  'King',
  'God',
] as const;
export type VisualTier = (typeof VISUAL_TIERS)[number];

export type LoaderMotif =
  | 'ember'
  | 'sprout'
  | 'banner'
  | 'lance'
  | 'fog'
  | 'stars'
  | 'nebula'
  | 'creation';

export interface TierBackdrop {
  /** Self-hosted image under /public/ranks, or null for a CSS-only wash. */
  image: string | null;
  /** CSS background layers painted above the image (pattern / tint). */
  wash: string;
  /** background-position for the image, chosen per painting's focal point. */
  position: string;
  /** How much of the theme's --bg colour the scrim lets through at its
   *  thinnest point (0-100). Higher = image shows less. */
  scrimMin: number;
  /** Human credit line, shown in Settings next to the backdrop toggle. */
  credit: string | null;
}

export interface TierVisual {
  tier: VisualTier;
  /** 0 (Serf) .. 7 (God). */
  level: number;
  color: string;
  glyph: string;
  /** 0-1: opacity/size multiplier of the glowing aura. */
  auraStrength: number;
  /** Seconds for one aura breath; lower tiers breathe slower. */
  auraSpeed: number;
  /** Whether the aura adds a rotating conic halo (Duke and up). */
  auraHalo: boolean;
  backdrop: TierBackdrop;
  loader: { motif: LoaderMotif; tagline: string };
}

const VISUALS: Record<VisualTier, Omit<TierVisual, 'tier' | 'level'>> = {
  Serf: {
    color: '#8a8173',
    glyph: '♙',
    auraStrength: 0.18,
    auraSpeed: 6,
    auraHalo: false,
    backdrop: {
      image: null,
      wash:
        'radial-gradient(ellipse at 50% 120%, rgba(138,129,115,0.16) 0%, transparent 60%)',
      position: 'center',
      scrimMin: 100,
      credit: null,
    },
    loader: { motif: 'ember', tagline: 'Tending the hearth…' },
  },
  Peasant: {
    color: '#a68a62',
    glyph: '♘',
    auraStrength: 0.28,
    auraSpeed: 5.5,
    auraHalo: false,
    backdrop: {
      image: null,
      wash:
        'radial-gradient(ellipse at 50% 115%, rgba(196,160,92,0.20) 0%, transparent 55%), ' +
        'repeating-linear-gradient(170deg, rgba(166,138,98,0.05) 0 2px, transparent 2px 22px)',
      position: 'center',
      scrimMin: 100,
      credit: null,
    },
    loader: { motif: 'sprout', tagline: 'Sowing the field…' },
  },
  Squire: {
    color: '#aab2bb',
    glyph: '♝',
    auraStrength: 0.38,
    auraSpeed: 5,
    auraHalo: false,
    backdrop: {
      image: null,
      wash:
        'radial-gradient(ellipse at 50% 0%, rgba(170,178,187,0.16) 0%, transparent 55%), ' +
        'repeating-linear-gradient(45deg, rgba(170,178,187,0.05) 0 1px, transparent 1px 28px), ' +
        'repeating-linear-gradient(-45deg, rgba(170,178,187,0.05) 0 1px, transparent 1px 28px)',
      position: 'center',
      scrimMin: 100,
      credit: null,
    },
    loader: { motif: 'banner', tagline: 'Polishing the armour…' },
  },
  Knight: {
    color: '#5b8dd9',
    glyph: '♞',
    auraStrength: 0.5,
    auraSpeed: 4.2,
    auraHalo: false,
    backdrop: {
      image: '/ranks/knight.jpg',
      wash: 'radial-gradient(ellipse at 50% 0%, rgba(91,141,217,0.18) 0%, transparent 60%)',
      position: 'center 40%',
      scrimMin: 80,
      credit: 'Paolo Uccello, Saint George and the Dragon (c. 1470)',
    },
    loader: { motif: 'lance', tagline: 'Couching the lance…' },
  },
  Baron: {
    color: '#8c6ad1',
    glyph: '♜',
    auraStrength: 0.62,
    auraSpeed: 3.6,
    auraHalo: false,
    backdrop: {
      image: '/ranks/baron.jpg',
      wash: 'radial-gradient(ellipse at 50% 10%, rgba(140,106,209,0.20) 0%, transparent 60%)',
      position: 'center 30%',
      scrimMin: 72,
      credit: 'Caspar David Friedrich, Wanderer above the Sea of Fog (c. 1818)',
    },
    loader: { motif: 'fog', tagline: 'Surveying the estate…' },
  },
  Duke: {
    color: '#d6528e',
    glyph: '♛',
    auraStrength: 0.75,
    auraSpeed: 3,
    auraHalo: true,
    backdrop: {
      image: '/ranks/duke.jpg',
      wash: 'radial-gradient(ellipse at 70% 10%, rgba(214,82,142,0.16) 0%, transparent 60%)',
      position: 'center 20%',
      scrimMin: 64,
      credit: 'Vincent van Gogh, The Starry Night (1889)',
    },
    loader: { motif: 'stars', tagline: 'Reading the stars…' },
  },
  King: {
    color: '#e0b43c',
    glyph: '♚',
    auraStrength: 0.88,
    auraSpeed: 2.6,
    auraHalo: true,
    backdrop: {
      image: '/ranks/king.jpg',
      wash: 'radial-gradient(ellipse at 50% 0%, rgba(224,180,60,0.20) 0%, transparent 65%)',
      position: 'center 35%',
      scrimMin: 58,
      credit: 'NASA, ESA & Hubble Heritage Team, Pillars of Creation (2014)',
    },
    loader: { motif: 'nebula', tagline: 'Summoning the court…' },
  },
  God: {
    color: '#ffe9a8',
    glyph: '☀',
    auraStrength: 1,
    auraSpeed: 2.2,
    auraHalo: true,
    backdrop: {
      image: '/ranks/god.jpg',
      // The gap between the two fingers sits at ~(38%, 45%) of the cropped
      // fresco; anchoring the cover crop there keeps the hands on screen
      // even on a 390px-wide phone.
      wash: 'radial-gradient(ellipse at 38% 45%, rgba(255,233,168,0.22) 0%, transparent 45%)',
      position: '38% 45%',
      scrimMin: 50,
      credit: 'Michelangelo, The Creation of Adam (c. 1512)',
    },
    loader: { motif: 'creation', tagline: 'Let there be questions…' },
  },
};

function isVisualTier(value: string): value is VisualTier {
  return (VISUAL_TIERS as readonly string[]).includes(value);
}

/** Visual for a tier name; unknown names fall back to Serf, the floor. */
export function tierVisual(tier: string): TierVisual {
  const t: VisualTier = isVisualTier(tier) ? tier : 'Serf';
  return { tier: t, level: VISUAL_TIERS.indexOf(t), ...VISUALS[t] };
}

/** Visual for a server rank. God is positional (#1), so `is_god` wins over
 *  whatever tier the server reports underneath. */
export function visualForRank(rank: RankLike): TierVisual {
  return tierVisual(rank.is_god ? 'God' : rank.tier);
}

/** Inline CSS custom properties that drive the aura for one badge. */
export function auraStyle(v: TierVisual): Record<string, string> {
  return {
    '--rank-color': v.color,
    '--aura-strength': String(v.auraStrength),
    '--aura-speed': `${v.auraSpeed}s`,
  };
}

/** CSS `background` for a tier's full-viewport backdrop. The scrim mixes in
 *  the active theme's own --bg, so light themes (Math, classic in light
 *  mode) stay light and every theme keeps its ink contrast. */
export function backdropBackground(v: TierVisual): string {
  const b = v.backdrop;
  const min = b.scrimMin;
  const mid = Math.min(100, min + 8);
  const scrim =
    `linear-gradient(180deg, ` +
    `color-mix(in srgb, var(--bg) ${Math.min(100, min + 22)}%, transparent) 0%, ` +
    `color-mix(in srgb, var(--bg) ${min}%, transparent) 40%, ` +
    `color-mix(in srgb, var(--bg) ${mid}%, transparent) 100%)`;
  const layers = [b.wash, scrim];
  if (b.image) layers.push(`url(${b.image})`);
  return layers.join(', ');
}
