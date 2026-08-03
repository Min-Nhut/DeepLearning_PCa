import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  iconLeft?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Input({ label, hint, error, iconLeft, size = 'md', disabled = false, id, style, ...rest }: InputProps) {
  const [focus, setFocus] = useState(false);
  const autoId = useId();
  const rid = id || autoId;
  const h = { sm: 34, md: 40, lg: 46 }[size];
  const borderColor = error ? 'var(--red-600)' : focus ? 'var(--border-focus)' : 'var(--border-default)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && <label htmlFor={rid} style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{label}</label>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, height: h, padding: '0 12px',
        borderRadius: 'var(--radius-md)', background: disabled ? 'var(--gray-100)' : 'var(--white)',
        border: `1px solid ${borderColor}`, boxShadow: focus ? 'var(--shadow-focus)' : 'none',
        transition: 'box-shadow var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
      }}>
        {iconLeft && <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>{iconLeft}</span>}
        <input
          id={rid}
          disabled={disabled}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--text-strong)', minWidth: 0 }}
          {...rest}
        />
      </div>
      {(hint || error) && <span style={{ fontSize: 'var(--text-xs)', color: error ? 'var(--red-600)' : 'var(--text-muted)' }}>{error || hint}</span>}
    </div>
  );
}
