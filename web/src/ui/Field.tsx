import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface FieldProps {
  label: ReactNode;
  /** Right-aligned live value, e.g. the current slider reading. */
  value?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  /** Pass through when the control inside owns its own id. */
  htmlFor?: string;
  /**
   * True when `hint` is reporting a problem (e.g. live validation) rather
   * than just explaining the field. Colors the hint text instead of leaving
   * every hint the same neutral gray regardless of whether it's advice or
   * an error.
   */
  error?: boolean;
  /** True when `hint` is positive confirmation (e.g. "Passwords match."). */
  success?: boolean;
}

/** Label, optional live value readout, control, optional hint. */
export default function Field({
  label,
  value,
  hint,
  children,
  htmlFor,
  error,
  success,
}: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        <span>{label}</span>
        {value !== undefined ? (
          <span className="field__value">{value}</span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <span
          className={[
            'field__hint',
            error ? 'field__hint--error' : '',
            success ? 'field__hint--success' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * A plain text input carrying the shared field styling. Forwards its ref so a
 * screen can focus it the instant a buzz opens the answer field.
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="text"
        className={['field__input', className ?? ''].filter(Boolean).join(' ')}
        {...rest}
      />
    );
  },
);

export interface SliderFieldProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: ReactNode;
  /** Formats the readout; defaults to the raw number. */
  format?(n: number): string;
  onChange(n: number): void;
}

/** Labeled range input with a live readout. */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  hint,
  format,
  onChange,
}: SliderFieldProps) {
  const id = useId();
  return (
    <Field
      label={label}
      value={format ? format(value) : String(value)}
      hint={hint}
      htmlFor={id}
    >
      <input
        id={id}
        className="field__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

export interface ChipProps {
  label: ReactNode;
  pressed: boolean;
  onToggle(): void;
}

/** Multi-select toggle. Used for categories and subcategories. */
export function Chip({ label, pressed, onToggle }: ChipProps) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="chips">{children}</div>;
}
