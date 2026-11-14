/**
 * Render smoke test for the match screen.
 *
 * There is no jsdom in this project, so this is server rendering: it proves the
 * screen mounts, reads the engine's state and renders the format's copy without
 * throwing. Effects, intervals and typing are not exercised here.
 */

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import OacMatch from '../../screens/OacMatch';
import { makePacket } from './fixture';

/** Server rendering splits adjacent text nodes with comment markers. */
function render(props: Parameters<typeof OacMatch>[0]): string {
  return renderToString(createElement(OacMatch, props)).replace(/<!-- -->/g, '');
}

describe('OacMatch screen', () => {
  it('renders an empty state with no packet', () => {
    const html = render({});
    expect(html).toContain('Ohio Academic Competition');
    expect(html).toContain('No packet loaded');
  });

  it('renders the pre-match summary of the three rounds', () => {
    const html = render({ packet: makePacket() });
    expect(html).toContain('Start match');
    expect(html).toContain('Fixture OAC Set');
    expect(html).toContain('10 categories');
    expect(html).toContain('20 items in 4 minutes');
    expect(html).toContain('20 tossups');
    // The scoreboard starts at nil all, and conferral is on offer from the
    // first frame because it is legal before a question as well as during one.
    expect(html).toContain('confer');
    expect(html).toContain('Team A');
    expect(html).toContain('Team B');
  });

  it('says plainly that there are no negative points and no bonuses', () => {
    const html = render({ packet: makePacket() });
    expect(html).toContain('No negative points');
    expect(html).toContain('no bonuses');
  });

  it('offers no category board, because OAC does not have one', () => {
    const html = render({ packet: makePacket() });
    expect(html.toLowerCase()).not.toContain('choose a category');
    expect(html.toLowerCase()).not.toContain('pick a category');
  });

  it('takes team names', () => {
    const html = render({
      packet: makePacket(),
      teamNames: { A: 'Brunswick', B: 'Medina' },
    });
    expect(html).toContain('Brunswick');
    expect(html).toContain('Medina');
  });
});
