import type { HTMLAttributes } from 'react';
import type { GleasonPattern } from '../../types';

const grades: Record<string, { color: string; label: string }> = {
  benign: { color: 'var(--gleason-benign)', label: 'Benign' },
  '3': { color: 'var(--gleason-3)', label: 'Pattern 3' },
  '4': { color: 'var(--gleason-4)', label: 'Pattern 4' },
  '5': { color: 'var(--gleason-5)', label: 'Pattern 5' },
};

export interface GleasonChipProps extends HTMLAttributes<HTMLSpanElement> {
  pattern?: GleasonPattern | string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function GleasonChip({ pattern = '3', size = 'md', showLabel = true, style, ...rest }: GleasonChipProps) {
  const g = grades[String(pattern)] || grades['3'];
  const sm = size === 'sm';
  const box = sm ? 20 : 26;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', ...style }} {...rest}>
      <span style={{ width: box, height: box, borderRadius: 'var(--radius-sm)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: g.color, color: 'var(--white)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: sm ? 11 : 13 }}>
        {pattern === 'benign' ? 'B' : pattern}
      </span>
      {showLabel && <span style={{ fontSize: sm ? 'var(--text-xs)' : 'var(--text-sm)', fontWeight: 500, color: 'var(--text-strong)' }}>{g.label}</span>}
    </span>
  );
}
