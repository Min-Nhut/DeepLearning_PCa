import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export function Checkbox({ label, checked = false, disabled = false, onChange, id, style, ...rest }: CheckboxProps) {
  const autoId = useId();
  const rid = id || autoId;
  return (
    <label htmlFor={rid} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--text-body)', ...style }}>
      <span style={{
        width: 18, height: 18, borderRadius: 'var(--radius-xs)', flexShrink: 0, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        background: checked ? 'var(--blue-500)' : 'var(--white)',
        border: `1.5px solid ${checked ? 'var(--blue-500)' : 'var(--border-strong)'}`,
        transition: 'background var(--dur-fast), border-color var(--dur-fast)',
      }}>
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2l2.2 2.2 4.8-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input id={rid} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} {...rest} />
      {label}
    </label>
  );
}
