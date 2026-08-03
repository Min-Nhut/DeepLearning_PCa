function bucket(v: number) {
  if (v >= 85) return { tone: 'var(--green-600)', word: 'High' };
  if (v >= 65) return { tone: 'var(--amber-600)', word: 'Moderate' };
  return { tone: 'var(--red-600)', word: 'Low' };
}

export interface ConfidenceMeterProps {
  value?: number;
  showLabel?: boolean;
  width?: string | number;
}

export function ConfidenceMeter({ value = 0, showLabel = true, width }: ConfidenceMeterProps) {
  const v = Math.max(0, Math.min(100, value));
  const b = bucket(v);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: width || '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {showLabel && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>AI confidence</span>}
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', fontWeight: 500, color: b.tone }}>{v}%</span>
          {showLabel && <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: b.tone }}>{b.word}</span>}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 'var(--radius-pill)', background: 'var(--gray-100)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${v}%`, background: b.tone, borderRadius: 'var(--radius-pill)', transition: 'width var(--dur-slow) var(--ease-out)' }} />
      </div>
    </div>
  );
}
