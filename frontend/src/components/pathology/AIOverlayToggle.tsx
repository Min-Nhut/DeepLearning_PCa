export interface OverlayLayer { key: string; label: string }

export interface AIOverlayToggleProps {
  layers?: (string | OverlayLayer)[];
  value?: string[];
  onChange?: (keys: string[]) => void;
}

/** Multi-select toggle group — each layer can be on/off independently (e.g. AI
 * mask and manual mask shown together), not a single-select radio group. */
export function AIOverlayToggle({ layers = [], value = [], onChange }: AIOverlayToggleProps) {
  function toggle(key: string) {
    if (!onChange) return;
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  }
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 4, borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)' }}>
      {layers.map((l) => {
        const key = typeof l === 'string' ? l : l.key;
        const label = typeof l === 'string' ? l : l.label;
        const active = value.includes(key);
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
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
