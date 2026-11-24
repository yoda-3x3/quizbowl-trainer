/**
 * Self-paced vision trainer.
 *
 * Pick a work, reveal its details one at a time, and name it as early as you
 * can. Same reveal surface as the live tossup mode, but you control the pace,
 * which makes it useful for learning a canon rather than drilling reflexes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { speak, stopSpeaking } from '../voice/speech';
import {
  VoiceAnswerStatus,
  useReadAloud,
  useVoiceAnswer,
  useVoiceSettings,
} from '../voice/useVoice';
import RevealCanvas from './RevealCanvas';
import { studyOrder } from './match';
import { ARTWORKS } from './works';
import type { Artwork, Reveal } from './types';
import { judge } from '../engine/judge';
import { append } from '../engine/log';
import { Button, Sheet } from '../ui';
import type { AttemptEvent } from '../types';
import './art.css';

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

type Phase = 'revealing' | 'answered';

export default function StudyMode() {
  const [deck, setDeck] = useState<Artwork[]>(() => shuffled(ARTWORKS));
  const [cursor, setCursor] = useState(0);
  const [shown, setShown] = useState(1);
  const [given, setGiven] = useState('');
  const [phase, setPhase] = useState<Phase>('revealing');
  const [correct, setCorrect] = useState<boolean | null>(null);

  const artwork = deck[cursor] ?? ARTWORKS[0]!;
  const order = useMemo(() => studyOrder(artwork), [artwork]);

  const reveals: Reveal[] = useMemo(
    () =>
      order.slice(0, shown).map((element, i) => ({
        element,
        wordIndex: i,
        matched: '',
      })),
    [order, shown],
  );

  const atEnd = shown >= order.length;

  const answerLine = useMemo(
    () => `<b><u>${artwork.title}</u></b>`,
    [artwork.title],
  );

  const submit = useCallback((giveUp = false, spoken?: string) => {
    if (phase === 'answered') return;
    const answer = spoken ?? given;
    const verdict = giveUp
      ? { directive: 'reject' as const }
      : judge(answerLine, answer);
    const ok = verdict.directive === 'accept';
    setCorrect(ok);
    setPhase('answered');

    const event: AttemptEvent = {
      id: `art-${artwork.id}-${Date.now()}`,
      at: Date.now(),
      mode: 'ear', // visual drills share the non-tossup bucket in the log
      questionId: artwork.id,
      category: 'Fine Arts',
      subcategory: 'Visual Fine Arts',
      difficulty: 3,
      // "Buzzing" here is how few details you needed.
      buzzWordIndex: shown - 1,
      totalWords: order.length,
      powerWordIndex: null,
      givenAnswer: giveUp ? '' : answer,
      directive: verdict.directive,
      points: ok ? 10 : 0,
      msToAnswer: null,
      questionSnapshot: {
        questionSanitized: `${artwork.title} by ${artwork.artist}`,
        answerSanitized: artwork.title,
        setName: 'Vision trainer',
      },
    };
    void append(event);
  }, [answerLine, artwork, given, order.length, phase, shown]);

  const next = useCallback(() => {
    const atDeckEnd = cursor + 1 >= deck.length;
    if (atDeckEnd) {
      setDeck(shuffled(ARTWORKS));
      setCursor(0);
    } else {
      setCursor((c) => c + 1);
    }
    setShown(1);
    setGiven('');
    setPhase('revealing');
    setCorrect(null);
  }, [cursor, deck.length]);

  // Voice: read each new detail out, listen for the title in between, and
  // announce the work once answered.
  const voice = useVoiceSettings();
  const clue = phase === 'revealing' ? reveals[reveals.length - 1]?.element.label : undefined;
  const clueRead = useReadAloud(voice.read, clue ? `${artwork.id}#${shown}` : null, clue ?? '');
  useEffect(() => {
    if (!voice.read || phase !== 'answered') return;
    speak(`${correct ? 'Correct.' : 'Not this one.'} ${artwork.title}, by ${artwork.artist}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.read, phase, artwork.id]);
  useEffect(() => stopSpeaking, []);
  const voiceAnswer = useVoiceAnswer(
    voice.answer && phase === 'revealing' && clueRead,
    (text) => {
      setGiven(text);
      if (text.trim()) submit(false, text);
    },
    artwork.id,
  );
  useEffect(() => {
    if (voiceAnswer.state === 'listening' && voiceAnswer.heard) setGiven(voiceAnswer.heard);
  }, [voiceAnswer.state, voiceAnswer.heard]);

  return (
    <div className="stack">
      <RevealCanvas
        artwork={artwork}
        reveals={reveals}
        showAll={phase === 'answered'}
      />

      {phase === 'revealing' ? (
        <Sheet title={`Detail ${shown} of ${order.length}`}>
          <p className="study__clue">{reveals[reveals.length - 1]?.element.label}</p>

          <ul className="study__list">
            {order.map((el, i) => (
              <li
                key={el.id}
                className={`study__item${i < shown ? ' study__item--shown' : ''}`}
              >
                {i < shown ? el.label : '•••'}
              </li>
            ))}
          </ul>

          <div className="row">
            <Button onClick={() => setShown((n) => Math.min(order.length, n + 1))} disabled={atEnd}>
              {atEnd ? 'No details left' : 'Another detail'}
            </Button>
          </div>

          <div className="row">
            <input
              className="field__input"
              value={given}
              placeholder="name the work, then Enter"
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
            <Button variant="primary" onClick={() => submit(false)} disabled={given.trim() === ''}>
              Answer
            </Button>
            <Button variant="ghost" onClick={() => submit(true)}>
              I don't know
            </Button>
          </div>
          <VoiceAnswerStatus voice={voiceAnswer} />

          <p className="study__left">
            Fewer details used is a better result. Giving-away details are kept
            for last.
          </p>
        </Sheet>
      ) : (
        <Sheet title={correct ? 'Correct' : 'Not this one'}>
          <p className="study__clue">
            {artwork.title}
            <span className="muted">
              {' '}
              · {artwork.artist}, {artwork.year}
            </span>
          </p>
          <p className="tiny muted">
            {correct
              ? `Named it after ${shown} of ${order.length} details.`
              : `You answered "${given}".`}
          </p>
          <div className="row">
            <Button variant="primary" onClick={next}>
              Next work
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
