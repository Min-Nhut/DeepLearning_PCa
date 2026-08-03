import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: 'var(--gray-100)', fg: 'var(--gray-700)', bd: 'var(--gray-200)' },
  brand: { bg: 'var(--blue-100)', fg: 'var(--blue-800)', bd: 'var(--blue-200)' },
  success: { bg: 'var(--green-100)', fg: 'var(--green-600)', bd: 'transparent' },
  warning: { bg: 'var(--amber-100)', fg: 'var(--amber-600)', bd: 'transparent' },
  danger: { bg: 'var(--red-100)', fg: 'var(--red-600)', bd: 'transparent' },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
}

export function Badge({ children, tone = 'neutral', dot = false, style, ...rest }: BadgeProps) {
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
        borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
        fontWeight: 600, lineHeight: 1.4, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg }} />}
      {children}
    </span>
  );
}
