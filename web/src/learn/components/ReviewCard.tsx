/**
 * One card in the review queue. The answer is hidden behind a toggle so the
 * player can try to remember it before confirming — the whole point of the
 * review is to recall, not to re-read.
 *
 * The teaser is the first ~80 characters of the question. That is long
 * enough to recognise the item but short enough that the card stays a card
 * rather than a replay rail; the full re-drill lives behind "Try again".
 */

import { useState } from 'react';
import { Button } from '../../ui';
import type { ReviewItem } from '../reviewQueue';
import { teaser } from '../reviewQueue';

export interface ReviewCardProps {
  item: ReviewItem;
  onRetry(item: ReviewItem): void;
}

export default function ReviewCard({ item, onRetry }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);
  const descId = `review-${item.questionId}-desc`;

  return (
    <article className="review-card" aria-describedby={descId}>
      <header className="review-card__head">
        <span className="review-card__chip">{item.category}</span>
        <span>
          missed {item.missCount}
          {item.missCount === 1 ? ' time' : ' times'}
        </span>
      </header>

      <p className="review-card__teaser" id={descId}>
        {teaser(item.questionSanitized)}
      </p>

      {revealed ? (
        <p className="review-card__answer" aria-live="polite">
          <span className="sr-only">Answer: </span>
          {item.answerSanitized}
        </p>
      ) : null}

      <div className="review-card__row">
        <Button
          variant="ghost"
          small
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
        >
          {revealed ? 'Hide answer' : 'Show answer'}
        </Button>
        <Button variant="primary" small onClick={() => onRetry(item)}>
          Try again
        </Button>
      </div>
    </article>
  );
}
