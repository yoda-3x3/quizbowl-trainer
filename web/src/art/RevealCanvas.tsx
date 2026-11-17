/**
 * The progressive reveal surface.
 *
 * The painting is drawn once and masked. Each revealed element adds a white
 * rectangle to the mask, so more of the real image shows through, and nothing
 * that has not been described is ever visible. The mask is blurred so regions
 * bloom in rather than popping as hard rectangles, which would read as a
 * jigsaw rather than a painting emerging.
 *
 * Using a mask rather than stacking cropped copies means the image decodes
 * once and every new reveal is a cheap DOM node, which matters because this
 * updates in step with a word-by-word reader.
 */

import { useId } from 'react';
import type { Artwork, Reveal } from './types';

export interface RevealCanvasProps {
  artwork: Artwork;
  reveals: Reveal[];
  /** Hide everything and show the finished work. Used after an answer. */
  showAll?: boolean;
  /** Caption under the frame. Defaults to the most recent reveal's label. */
  caption?: string | null;
  className?: string;
}

export default function RevealCanvas({
  artwork,
  reveals,
  showAll = false,
  caption,
  className,
}: RevealCanvasProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const maskId = `reveal-${uid}`;
  const blurId = `soften-${uid}`;

  const { width: w, height: h } = artwork;
  const latest = reveals.length > 0 ? reveals[reveals.length - 1] : null;
  const shownCaption =
    caption !== undefined ? caption : (latest?.element.label ?? null);

  return (
    <figure className={`reveal${className ? ` ${className}` : ''}`}>
      <svg
        className="reveal__svg"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={
          showAll
            ? `${artwork.title} by ${artwork.artist}`
            : reveals.length === 0
              ? 'Nothing described yet'
              : `Showing ${reveals.length} described detail${reveals.length === 1 ? '' : 's'}`
        }
      >
        <defs>
          <filter id={blurId}>
            <feGaussianBlur stdDeviation={Math.round(Math.min(w, h) * 0.018)} />
          </filter>
          <mask id={maskId}>
            {/* Black hides, white shows. */}
            <rect x={0} y={0} width={w} height={h} fill="#000" />
            <g filter={`url(#${blurId})`}>
              {showAll ? (
                <rect x={0} y={0} width={w} height={h} fill="#fff" />
              ) : (
                reveals.map((r) => {
                  const b = r.element.box;
                  return (
                    <rect
                      key={r.element.id}
                      className="reveal__patch"
                      x={b.x * w}
                      y={b.y * h}
                      width={b.w * w}
                      height={b.h * h}
                      rx={Math.min(b.w * w, b.h * h) * 0.12}
                      fill="#fff"
                    />
                  );
                })
              )}
            </g>
          </mask>
        </defs>

        {/* The unrevealed ground. Not pure black: a faint wash reads as a
            canvas waiting to be filled rather than a broken image. */}
        <rect x={0} y={0} width={w} height={h} className="reveal__ground" />

        <image
          href={artwork.image}
          x={0}
          y={0}
          width={w}
          height={h}
          preserveAspectRatio="xMidYMid slice"
          mask={`url(#${maskId})`}
        />
      </svg>

      <figcaption className="reveal__caption">
        {showAll ? (
          <span className="reveal__title">
            {artwork.title}
            <span className="muted">
              {' '}
              · {artwork.artist}, {artwork.year}
            </span>
          </span>
        ) : shownCaption ? (
          <span className="reveal__latest">{shownCaption}</span>
        ) : (
          <span className="muted">
            Nothing described yet. Details appear as the clues name them.
          </span>
        )}
        {!showAll ? (
          <span className="reveal__count nums">
            {reveals.length}/{artwork.elements.length}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
