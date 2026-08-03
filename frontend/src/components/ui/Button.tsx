import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const sizes: Record<Size, CSSProperties & { height: number }> = {
  sm: { padding: '6px 12px', fontSize: 'var(--text-sm)', height: 32 },
  md: { padding: '9px 16px', fontSize: 'var(--text-base)', height: 40 },
  lg: { padding: '12px 22px', fontSize: 'var(--text-md)', height: 48 },
};

const variants: Record<Variant, { background: string; color: string; border: string; hoverBg: string }> = {
  primary: { background: 'var(--blue-900)', color: 'var(--white)', border: '1px solid var(--blue-900)', hoverBg: 'var(--blue-950)' },
  accent: { background: 'var(--blue-500)', color: 'var(--white)', border: '1px solid var(--blue-500)', hoverBg: 'var(--blue-600)' },
  secondary: { background: 'var(--white)', color: 'var(--blue-900)', border: '1px solid var(--border-default)', hoverBg: 'var(--blue-50)' },
  ghost: { background: 'transparent', color: 'var(--blue-800)', border: '1px solid transparent', hoverBg: 'var(--blue-50)' },
  danger: { background: 'var(--red-600)', color: 'var(--white)', border: '1px solid var(--red-600)', hoverBg: '#bb3030' },
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export function Button({ children, variant = 'primary', size = 'md', iconLeft, iconRight, disabled = false, fullWidth = false, style, ...rest }: ButtonProps) {
  const [hover, setHover] = useState(false);
  const v = variants[variant];
  const s = sizes[size];
  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-semibold)' as unknown as number, lineHeight: 1,
        borderRadius: 'var(--radius-md)', cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        width: fullWidth ? '100%' : 'auto',
        transition: 'background var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)',
        padding: s.padding, fontSize: s.fontSize, minHeight: s.height,
        background: disabled ? 'var(--gray-200)' : hover ? v.hoverBg : v.background,
        color: disabled ? 'var(--gray-500)' : v.color,
        border: disabled ? '1px solid var(--gray-200)' : v.border,
        opacity: disabled ? 0.9 : 1,
        ...style,
      }}
      {...rest}
    >
      {iconLeft}{children}{iconRight}
    </button>
  );
}
