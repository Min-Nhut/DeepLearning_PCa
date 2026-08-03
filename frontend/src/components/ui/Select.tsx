import { useId, useState, type SelectHTMLAttributes } from 'react';

export type SelectOption = string | { value: string; label: string };

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  options?: SelectOption[];
  size?: 'sm' | 'md' | 'lg';
}

export function Select({ label, hint, options = [], size = 'md', disabled = false, id, style, ...rest }: SelectProps) {
  const [focus, setFocus] = useState(false);
  const autoId = useId();
  const rid = id || autoId;
  const h = { sm: 34, md: 40, lg: 46 }[size];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && <label htmlFor={rid} style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <select
          id={rid}
          disabled={disabled}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            width: '100%', height: h, padding: '0 36px 0 12px', appearance: 'none', WebkitAppearance: 'none',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--text-strong)',
            background: disabled ? 'var(--gray-100)' : 'var(--white)',
            border: `1px solid ${focus ? 'var(--border-focus)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-md)', cursor: disabled ? 'not-allowed' : 'pointer',
            boxShadow: focus ? 'var(--shadow-focus)' : 'none', outline: 'none',
            transition: 'box-shadow var(--dur-fast), border-color var(--dur-fast)',
          }}
          {...rest}
        >
          {options.map((o) => {
            const value = typeof o === 'string' ? o : o.value;
            const lbl = typeof o === 'string' ? o : o.label;
            return <option key={value} value={value}>{lbl}</option>;
          })}
        </select>
        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: 12 }}>▾</span>
      </div>
      {hint && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
}
