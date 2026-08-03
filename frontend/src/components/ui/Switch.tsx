import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export function Switch({ checked = false, disabled = false, onChange, label, id, style, ...rest }: SwitchProps) {
  const autoId = useId();
  const rid = id || autoId;
  return (
    <label htmlFor={rid} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--text-body)', ...style }}>
      <span style={{ position: 'relative', width: 38, height: 22, borderRadius: 'var(--radius-pill)', flexShrink: 0, background: checked ? 'var(--blue-500)' : 'var(--gray-300)', transition: 'background var(--dur-normal) var(--ease-standard)' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: 'var(--white)', boxShadow: 'var(--shadow-sm)', transition: 'left var(--dur-normal) var(--ease-out)' }} />
      </span>
      <input id={rid} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} {...rest} />
      {label}
    </label>
  );
}
