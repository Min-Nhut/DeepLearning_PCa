import { Button } from '../components/ui/Button';
import { Disclaimer } from '../components/Histology';
import { Icon } from '../lib/icon';
import { PIPELINE } from '../data/mock';

export function Pipeline({ pipeCaseId, step, onViewResults }: { pipeCaseId: string | null; step: number; onViewResults: () => void }) {
  const done = step >= 7;
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', background: done ? 'var(--success-soft)' : 'var(--blue-50)', color: done ? 'var(--success)' : 'var(--blue-600)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          {done ? <Icon name="check" size={28} /> : <span style={{ display: 'inline-flex', animation: 'pa-spin 1s linear infinite' }}><Icon name="loader-2" size={28} /></span>}
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 6px', color: 'var(--text-strong)' }}>{done ? 'Phân tích hoàn tất' : 'Đang chạy pipeline AI…'}</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Ca {pipeCaseId || ''} · 7 bước xử lý</p>
      </div>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 10, boxShadow: 'var(--shadow-sm)' }}>
        {PIPELINE.map((p, i) => {
          const st = i < step ? 'done' : i === step ? 'run' : 'wait';
          const col = st === 'done' ? 'var(--success)' : st === 'run' ? 'var(--blue-600)' : 'var(--gray-300)';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: st === 'run' ? 'var(--blue-50)' : 'transparent' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: st === 'wait' ? 'var(--gray-100)' : st === 'done' ? 'var(--success-soft)' : 'var(--blue-100)', color: col }}>
                {st === 'done' ? <Icon name="check" size={17} /> : st === 'run' ? <span style={{ display: 'inline-flex', animation: 'pa-spin 1s linear infinite' }}><Icon name="loader-2" size={17} /></span> : <Icon name={p[2]} size={16} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: st === 'wait' ? 'var(--text-muted)' : 'var(--text-strong)' }}>{i + 1}. {p[0]}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p[1]}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: col }}>{st === 'done' ? '✓' : st === 'run' ? '…' : ''}</span>
            </div>
          );
        })}
      </div>
      {done && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20, animation: 'pa-fade .3s ease-out' }}>
          <Button variant="accent" iconRight={<Icon name="arrow-right" />} onClick={onViewResults}>Xem kết quả overlay</Button>
        </div>
      )}
      <div style={{ marginTop: 18 }}><Disclaimer compact /></div>
    </div>
  );
}
