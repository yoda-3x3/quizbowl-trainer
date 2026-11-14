import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'buzz';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Fills the row. The buzzer wants this on a phone. */
  block?: boolean;
  small?: boolean;
  /** Keyboard shortcut shown as a small inline cap, e.g. "space". */
  hint?: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: '',
  primary: 'btn--primary',
  ghost: 'btn--ghost',
  danger: 'btn--danger',
  buzz: 'btn--buzz',
};

export default function Button({
  variant = 'default',
  block = false,
  small = false,
  hint,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    VARIANT_CLASS[variant],
    block ? 'btn--block' : '',
    small ? 'btn--sm' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
      {hint ? <span className="btn__key">{hint}</span> : null}
    </button>
  );
}
