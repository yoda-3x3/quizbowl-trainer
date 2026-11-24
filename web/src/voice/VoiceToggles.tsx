import { Chip, ChipRow, useSettings } from '../ui';
import { canListen, canSpeak } from './speech';

/** The two voice-mode switches, shared by Settings and the practice sidebar. */
export default function VoiceToggles({ explain = false }: { explain?: boolean }) {
  const [settings, set] = useSettings();
  const speakOk = canSpeak();
  const listenOk = canListen();
  return (
    <>
      <ChipRow>
        <Chip
          label="Read questions aloud"
          pressed={settings.voiceRead && speakOk}
          onToggle={() => speakOk && set({ voiceRead: !settings.voiceRead })}
        />
        <Chip
          label="Answer by voice"
          pressed={settings.voiceAnswer && listenOk}
          onToggle={() => listenOk && set({ voiceAnswer: !settings.voiceAnswer })}
        />
      </ChipRow>
      {!speakOk || !listenOk ? (
        <p className="tiny muted">
          {!speakOk && !listenOk
            ? "This browser can't read aloud or listen."
            : !speakOk
              ? "This browser can't read aloud."
              : "This browser can't listen for answers — Chrome, Edge and Safari can."}
        </p>
      ) : null}
      {explain ? (
        <p className="tiny muted">
          Questions are read to you like a moderator would, with the text
          following along. After you buzz, just say your answer; typing still
          works. Applies to tossups, bonuses, starred, lessons, tournaments, OAC
          matches, and the ear and vision trainers.
        </p>
      ) : null}
    </>
  );
}
