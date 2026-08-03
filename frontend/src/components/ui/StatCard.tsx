import type { HTMLAttributes, ReactNode } from 'react';

const deltaColors = { up: 'var(--green-600)', down: 'var(--red-600)', flat: 'var(--text-muted)' } as const;

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: string;
  deltaDir?: keyof typeof deltaColors;
  icon?: ReactNode;
}

export function StatCard({ label, value, unit, delta, deltaDir = 'flat', icon, style, ...rest }: StatCardProps) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
        {icon && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--blue-50)', color: 'var(--blue-600)' }}>{icon}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 500, color: 'var(--brand)', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>{unit}</span>}
      </div>
      {delta != null && (
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: deltaColors[deltaDir] }}>
          {deltaDir === 'up' ? '▲' : deltaDir === 'down' ? '▼' : '•'} {delta}
        </span>
      )}
    </div>
  );
}
