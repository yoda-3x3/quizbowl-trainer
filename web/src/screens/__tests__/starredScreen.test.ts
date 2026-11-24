import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Starred, { snapshotSource } from '../Starred';
import Home from '../Home';
import { listStarred, star, unstar, __resetStarred } from '../../data/starred';
import type { Tossup } from '../../types';

function tossup(id: string): Tossup {
  return {
    id,
    question: `Question ${id}`,
    questionSanitized: `Question ${id}`,
    answer: 'Answer',
    answerSanitized: 'Answer',
    category: 'Science',
    subcategory: 'Biology',
    difficulty: 4,
    setName: 'Test Set',
    setYear: 2024,
    packetNumber: 1,
    questionNumber: 1,
    source: 'qbreader',
  };
}

beforeEach(() => {
  __resetStarred();
});

describe('snapshotSource', () => {
  it('serves the list in order, then null', async () => {
    const src = snapshotSource([tossup('a'), tossup('b')], () => {});
    expect((await src.next())?.id).toBe('a');
    expect((await src.next())?.id).toBe('b');
    expect(await src.next()).toBeNull();
  });

  it('is unaffected by unstarring mid-round', async () => {
    await star(tossup('a'));
    await star(tossup('b'));
    const src = snapshotSource(await listStarred(), () => {});
    const first = await src.next();
    await unstar(first?.id === 'a' ? 'b' : 'a');
    expect(await src.next()).not.toBeNull();
    expect(await src.next()).toBeNull();
  });

  it('does not mutate the list it was given', async () => {
    const list = [tossup('a')];
    const src = snapshotSource(list, () => {});
    await src.next();
    expect(list).toHaveLength(1);
  });

  it('passes onEnd through so Tossup can signal the round is over', () => {
    const onEnd = vi.fn();
    snapshotSource([], onEnd).onEnd?.();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});

describe('Starred screen', () => {
  it('renders its loading state before the store is read', () => {
    const html = renderToString(createElement(Starred, { onExit: () => {} }));
    expect(html).toContain('Starred');
    expect(html).toContain('Gathering your starred questions');
  });

  it('is offered on the practice home', () => {
    const html = renderToString(
      createElement(Home, { onStart: () => {}, onOpenSettings: () => {} }),
    );
    expect(html).toContain('Replay the tossups you starred with S');
  });
});
