/**
 * Self-paced ear trainer: build the passage from its motifs.
 *
 * The counterpart to the vision trainer's study mode. Reveal one motif at a
 * time, each adding its fragment to what you can play and its pitches to the
 * staff, and name the piece from as few as possible.
 *
 * Distinct from the clip drill next door, which plays a whole excerpt and asks
 * what it is. This one asks you to assemble the excerpt from descriptions,
 * which is the skill a tossup actually tests.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { speak, stopSpeaking } from '../voice/speech';
import {
  VoiceAnswerStatus,
  useReadAloud,
  useVoiceAnswer,
  useVoiceSettings,
} from '../voice/useVoice';
import MotifReveal from './MotifReveal';
import { motifStudyOrder, type MotifReveal as Rev } from './motifMatch';
import { MOTIF_WORKS, type MotifWork } from './motifs';
import { judge } from '../engine/judge';
import { append } from '../engine/log';
import { Button, Sheet } from '../ui';
import type { AttemptEvent } from '../types';

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/** Accepts the title or the composer, as the clip drill does. */
function answerlineFor(work: MotifWork): string {
  const alts = work.answerKeywords.filter(
    (k) => k.toLowerCase() !== work.title.toLowerCase(),
  );
  const accept = [...alts, work.composer].join(' or ');
  return `<b><u>${work.title}</u></b> [accept ${accept}]`;
}

export default function MotifStudy() {
  const [deck, setDeck] = useState<MotifWork[]>(() => shuffled(MOTIF_WORKS));
  const [cursor, setCursor] = useState(0);
  const [shown, setShown] = useState(1);
  const [given, setGiven] = useState('');
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);

  const work = deck[cursor] ?? MOTIF_WORKS[0]!;
  const order = useMemo(() => motifStudyOrder(work), [work]);

  const reveals: Rev[] = useMemo(
    () =>
      order.slice(0, shown).map((motif, i) => ({
        motif,
        wordIndex: i,
        matched: '',
      })),
    [order, shown],
  );

  const atEnd = shown >= order.length;

  const submit = useCallback((giveUp = false, spoken?: string) => {
    if (answered) return;
    const answer = spoken ?? given;
    const verdict = giveUp
      ? { directive: 'reject' as const }
      : judge(answerlineFor(work), answer);
    const ok = verdict.directive === 'accept';
    setCorrect(ok);
    setAnswered(true);

    const event: AttemptEvent = {
      id: `motif-${work.id}-${Date.now()}`,
      at: Date.now(),
      mode: 'ear',
      questionId: work.id,
      category: 'Fine Arts',
      subcategory: 'Auditory Fine Arts',
      difficulty: 3,
      // How few motifs you needed stands in for how early you buzzed.
      buzzWordIndex: shown - 1,
      totalWords: order.length,
      powerWordIndex: null,
      givenAnswer: giveUp ? '' : answer,
      directive: verdict.directive,
      points: ok ? 10 : 0,
      msToAnswer: null,
      questionSnapshot: {
        questionSanitized: `${work.title} by ${work.composer}`,
        answerSanitized: work.title,
        setName: 'Motif builder',
      },
    };
    void append(event);
  }, [answered, given, order.length, shown, work]);

  const next = useCallback(() => {
    if (cursor + 1 >= deck.length) {
      setDeck(shuffled(MOTIF_WORKS));
      setCursor(0);
    } else {
      setCursor((c) => c + 1);
    }
    setShown(1);
    setGiven('');
    setAnswered(false);
    setCorrect(false);
  }, [cursor, deck.length]);

  // Voice: read each new motif's description, listen in between, announce
  // the piece once answered.
  const voice = useVoiceSettings();
  const clue = answered ? undefined : reveals[reveals.length - 1]?.motif.label;
  const clueRead = useReadAloud(voice.read, clue ? `${work.id}#${shown}` : null, clue ?? '');
  useEffect(() => {
    if (!voice.read || !answered) return;
    speak(`${correct ? 'Correct.' : 'Not this one.'} ${work.title}, by ${work.composer}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.read, answered, work.id]);
  useEffect(() => stopSpeaking, []);
  const voiceAnswer = useVoiceAnswer(
    voice.answer && !answered && clueRead,
    (text) => {
      setGiven(text);
      if (text.trim()) submit(false, text);
    },
    work.id,
  );
  useEffect(() => {
    if (voiceAnswer.state === 'listening' && voiceAnswer.heard) setGiven(voiceAnswer.heard);
  }, [voiceAnswer.state, voiceAnswer.heard]);

  return (
    <div className="stack">
      <MotifReveal work={work} reveals={reveals} showAll={answered} />

      {answered ? (
        <Sheet title={correct ? 'Correct' : 'Not this one'}>
          <p className="study__clue">
            {work.title}
            <span className="muted"> · {work.composer}</span>
          </p>
          <p className="tiny muted">
            {correct
              ? `Named it from ${shown} of ${order.length} motifs.`
              : `You answered "${given}". The whole clip is playable now.`}
          </p>
          <div className="row">
            <Button variant="primary" onClick={next}>
              Next piece
            </Button>
          </div>
        </Sheet>
      ) : (
        <Sheet title={`Motif ${shown} of ${order.length}`}>
          <ul className="study__list">
            {order.map((m, i) => (
              <li
                key={m.id}
                className={`study__item${i < shown ? ' study__item--shown' : ''}`}
              >
                {i < shown ? m.label : '•••'}
              </li>
            ))}
          </ul>

          <div className="row">
            <Button
              onClick={() => setShown((n) => Math.min(order.length, n + 1))}
              disabled={atEnd}
            >
              {atEnd ? 'No motifs left' : 'Another motif'}
            </Button>
          </div>

          <div className="row">
            <input
              className="field__input"
              value={given}
              placeholder="name the piece, then Enter"
              onChange={(e) => setGiven(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  submit(true);
                  return;
                }
                if (e.key === 'Enter') submit(false);
              }}
            />
            <Button
              variant="primary"
              onClick={() => submit(false)}
              disabled={given.trim() === ''}
            >
              Answer
            </Button>
            <Button variant="ghost" onClick={() => submit(true)}>
              I don't know
            </Button>
          </div>
          <VoiceAnswerStatus voice={voiceAnswer} />

          <p className="study__left">
            Play button sounds only the stretches you have revealed. Fewer
            motifs is a better result.
          </p>
        </Sheet>
      )}
    </div>
  );
}
