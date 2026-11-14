import type { ReactNode } from 'react';

export type PillTone = 'neutral' | 'good' | 'bad' | 'gold' | 'accent';

export interface StatPillProps {
  label: ReactNode;
  value: ReactNode;
  tone?: PillTone;
  /** Shown as the native tooltip, for the stats whose meaning is not obvious. */
  title?: string;
}

const TONE_CLASS: Record<PillTone, string> = {
  neutral: '',
  good: 'pill--good',
  bad: 'pill--bad',
  gold: 'pill--gold',
  accent: 'pill--accent',
};

/** One compact label/value readout. Rows of these carry the header stats. */
export default function StatPill({
  label,
  value,
  tone = 'neutral',
  title,
}: StatPillProps) {
  return (
    <span
      className={['pill', TONE_CLASS[tone]].filter(Boolean).join(' ')}
      title={title}
    >
      <span className="pill__label">{label}</span>
      <span className="pill__value">{value}</span>
    </span>
  );
}

export function PillRow({ children }: { children: ReactNode }) {
  return <div className="pills">{children}</div>;
}

/** Shared formatter so every percentage in the app rounds the same way. */
export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
