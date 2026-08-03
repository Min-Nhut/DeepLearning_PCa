import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'ghost' | 'solid' | 'outline';
type Size = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  active?: boolean;
  label?: string;
}

export function IconButton({ children, variant = 'ghost', size = 'md', active = false, disabled = false, label, style, ...rest }: IconButtonProps) {
  const [hover, setHover] = useState(false);
  const dim = { sm: 30, md: 36, lg: 42 }[size];
  const bg = active ? 'var(--blue-100)' : hover ? 'var(--blue-50)' : variant === 'solid' ? 'var(--blue-900)' : 'transparent';
  const color = variant === 'solid' ? 'var(--white)' : active ? 'var(--blue-700)' : 'var(--gray-600)';
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: dim, height: dim,
        borderRadius: 'var(--radius-md)',
        border: variant === 'outline' ? '1px solid var(--border-default)' : '1px solid transparent',
        background: disabled ? 'var(--gray-100)' : bg,
        color: disabled ? 'var(--gray-400)' : color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background var(--dur-fast) var(--ease-standard)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
