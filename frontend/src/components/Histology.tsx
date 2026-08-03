import type { CSSProperties } from 'react';
import type { Region } from '../types';
import { Icon } from '../lib/icon';

export type HistologyLayer = 'none' | 'seg' | 'gleason' | 'heat';

const gleasonColor: Record<string, string> = {
  '3': 'var(--gleason-3)', '4': 'var(--gleason-4)', '5': 'var(--gleason-5)', benign: 'var(--gleason-benign)',
};

/**
 * H&E histology field placeholder — there is no real slide image yet, so this
 * renders a generated pink/purple tissue-like background with clickable AI
 * overlay regions, matching the mockup's `histology()` helper.
 */
export function Histology({
  layer, regions, activeRegion, onRegion, style,
}: {
  layer: HistologyLayer;
  regions: Region[];
  activeRegion?: string | null;
  onRegion?: (id: string) => void;
  style?: CSSProperties;
}) {
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'var(--radius-lg)',
      background: '#c98fb0',
      backgroundImage: `radial-gradient(circle at 20% 30%, #d9a6c4 0 8%, transparent 9%),radial-gradient(circle at 62% 22%, #b56b98 0 6%, transparent 7%),radial-gradient(circle at 40% 62%, #e0b3d0 0 10%, transparent 11%),radial-gradient(circle at 78% 68%, #a85d8c 0 7%, transparent 8%),radial-gradient(circle at 88% 30%, #d49bbe 0 6%, transparent 7%),radial-gradient(circle at 12% 78%, #c07fa6 0 9%, transparent 10%),radial-gradient(circle at 50% 40%, #7e3d63 0 4%, transparent 5%),linear-gradient(135deg, #cf95b6, #b06f96)`,
      ...style,
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: 'radial-gradient(#5a2b47 0.7px, transparent 1.4px)', backgroundSize: '9px 9px' }} />
      {layer !== 'none' && regions.map((r) => {
        const isSeg = layer === 'seg';
        const isHeat = layer === 'heat';
        const col = gleasonColor[r.pattern];
        const active = activeRegion === r.id;
        return (
          <div
            key={r.id}
            onClick={() => onRegion && onRegion(r.id)}
            style={{
              position: 'absolute', left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%',
              borderRadius: isHeat ? '50%' : 'var(--radius-md)', cursor: 'pointer',
              border: isHeat ? 'none' : `2px solid ${col}`,
              background: isHeat ? `radial-gradient(circle, ${col} 0%, transparent 70%)` : isSeg ? 'transparent' : `${col}33`,
              boxShadow: active ? `0 0 0 3px ${col}, 0 0 0 6px rgba(255,255,255,.5)` : 'none',
              opacity: isHeat ? 0.6 : 1, transition: 'box-shadow 120ms',
            }}
          >
            {!isHeat && (
              <span style={{ position: 'absolute', top: -1, left: -1, background: col, color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, padding: '1px 5px', borderRadius: '4px 0 6px 0' }}>
                {r.pattern === 'benign' ? 'B' : r.pattern}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, margin: compact ? 0 : '18px 0 0', textAlign: compact ? 'center' : 'left', display: 'flex', gap: 6, alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start' }}>
      <Icon name="info" size={13} style={{ flexShrink: 0 }} />
      ProstaAI là công cụ hỗ trợ nghiên cứu (prototype), không phải thiết bị y tế đã kiểm định. Quyết định chẩn đoán cuối cùng thuộc về bác sĩ.
    </p>
  );
}
