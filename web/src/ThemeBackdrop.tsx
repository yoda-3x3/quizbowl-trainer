/**
 * Fixed-position backdrop painting behind the app shell.
 *
 * The painting is the character of the skin, not decoration — every themed
 * surface sits on top of it, so the backdrop stretches across the viewport
 * rather than cropping into a hero band. A dark scrim gradient over the
 * image keeps every panel's 4.5:1 ink ratio intact, with a stronger scrim
 * on the top where the topbar wordmark lives.
 *
 * The `classic` theme is the no-theme fallback and renders nothing, so
 * existing users see no change.
 *
 * The component also owns the Google Fonts `<link>` for the active theme:
 * fonts load only when the theme is picked, and unload when it changes.
 * Appending a managed `<link>` to the document head is the lightest route
 * that still lets Vite SSR tests mount this component.
 */

import { useEffect } from 'react';
import type { ThemeId } from './ui/useSettings';
import type { RankPublic } from './rank';
import { backdropBackground, visualForRank } from './rankVisuals';

interface ThemeVisual {
  /** Relative to /public: resolves to /themes/<name>.jpg at runtime. */
  image: string;
  /** Scrim colour so the painting's warm or cool key is preserved. */
  scrim: string;
  /** Google Fonts stylesheet URL for this theme's display face. */
  fontHref: string;
}

/**
 * Visuals per theme. The Google Fonts URLs ask for the smallest subset the
 * display stack needs; a wider weight range would pull a kilobyte-costly
 * second file for no visible gain on a quizbowl reading surface.
 */
export const THEME_VISUALS: Record<Exclude<ThemeId, 'classic'>, ThemeVisual> = {
  art: {
    image: '/themes/art.jpg',
    scrim:
      'linear-gradient(180deg, rgba(16,10,4,0.80) 0%, rgba(16,10,4,0.45) 40%, rgba(16,10,4,0.65) 100%)',
    fontHref:
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&display=swap',
  },
  science: {
    image: '/themes/science.jpg',
    scrim:
      'linear-gradient(180deg, rgba(5,7,16,0.82) 0%, rgba(5,7,16,0.52) 40%, rgba(5,7,16,0.70) 100%)',
    fontHref:
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&display=swap',
  },
  literature: {
    image: '/themes/literature.jpg',
    scrim:
      'linear-gradient(180deg, rgba(30,15,20,0.78) 0%, rgba(30,15,20,0.42) 40%, rgba(30,15,20,0.68) 100%)',
    fontHref:
      'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&display=swap',
  },
  mythology: {
    image: '/themes/mythology.jpg',
    scrim:
      'linear-gradient(180deg, rgba(8,20,16,0.78) 0%, rgba(8,20,16,0.45) 40%, rgba(8,20,16,0.68) 100%)',
    fontHref:
      'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Cormorant+Garamond:wght@400;600&display=swap',
  },
  math: {
    // Byrne's Euclid title page is a vector on Commons that rasterises to
    // PNG; keep the PNG extension so the browser gets a lossless source.
    image: '/themes/math.png',
    scrim:
      'linear-gradient(180deg, rgba(240,230,205,0.82) 0%, rgba(240,230,205,0.55) 40%, rgba(240,230,205,0.78) 100%)',
    fontHref:
      'https://fonts.googleapis.com/css2?family=Spectral:wght@400;600&display=swap',
  },
};

export interface ThemeBackdropProps {
  theme: ThemeId;
  /** The signed-in player's rank. When set, the backdrop their tier has
   *  unlocked replaces the theme painting; the theme's palette, fonts and
   *  --bg-keyed scrim still apply, so every colour theme keeps working. */
  rank?: Pick<RankPublic, 'tier' | 'is_god'> | null;
}

/**
 * The backdrop is fixed to the viewport and pointer-event-transparent, so it
 * never blocks a click and stays behind the entire app shell. It also owns
 * a managed Google Fonts `<link>` for the active theme: adding one to the
 * document head on mount and removing it on unmount keeps the UI font load
 * off the critical path for `classic` users and off every theme they did
 * not pick.
 */
export default function ThemeBackdrop({ theme, rank = null }: ThemeBackdropProps) {
  const visual = theme === 'classic' ? null : THEME_VISUALS[theme];

  useEffect(() => {
    if (!visual || typeof document === 'undefined') return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = visual.fontHref;
    link.setAttribute('data-theme-font', theme);
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [visual, theme]);

  if (rank) return <RankBackdrop rank={rank} />;

  if (!visual) return null;

  return (
    <div
      className="theme-backdrop"
      aria-hidden="true"
      data-theme-backdrop={theme}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        backgroundImage: `${visual.scrim}, url(${visual.image})`,
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center, center',
        backgroundRepeat: 'no-repeat, no-repeat',
      }}
    />
  );
}

/**
 * The backdrop a tier unlocks. Serf..Squire are CSS-only washes over the
 * theme's own --bg; Knight and up lay a public-domain painting (or a Hubble
 * plate for King) under a scrim mixed from --bg. Duke and up drift slowly;
 * God adds a pulsing glow between the two hands. Motion is CSS-only and
 * switched off under prefers-reduced-motion (see rank.css).
 */
function RankBackdrop({ rank }: { rank: Pick<RankPublic, 'tier' | 'is_god'> }) {
  const v = visualForRank(rank);
  return (
    <div
      className="theme-backdrop rank-backdrop"
      aria-hidden="true"
      data-rank-backdrop={v.tier}
      data-drift={v.level >= 5 ? '' : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        background: 'var(--bg)',
      }}
    >
      <div
        className="rank-backdrop__layer"
        style={{
          backgroundImage: backdropBackground(v),
          backgroundSize: v.backdrop.image ? 'cover, cover, cover' : 'cover, cover',
          backgroundPosition: v.backdrop.image
            ? `center, center, ${v.backdrop.position}`
            : 'center, center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {v.tier === 'God' ? <div className="rank-backdrop__spark" /> : null}
    </div>
  );
}
