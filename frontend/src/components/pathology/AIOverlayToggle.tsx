export interface OverlayLayer { key: string; label: string }

export interface AIOverlayToggleProps {
  layers?: (string | OverlayLayer)[];
  value?: string;
  onChange?: (key: string) => void;
}

export function AIOverlayToggle({ layers = [], value, onChange }: AIOverlayToggleProps) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 4, borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)' }}>
      {layers.map((l) => {
        const key = typeof l === 'string' ? l : l.key;
        const label = typeof l === 'string' ? l : l.label;
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange && onChange(key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none',
              borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
              cursor: 'pointer', background: active ? 'var(--blue-500)' : 'transparent', color: active ? 'var(--white)' : 'var(--text-body)',
              transition: 'background var(--dur-fast) var(--ease-standard)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
