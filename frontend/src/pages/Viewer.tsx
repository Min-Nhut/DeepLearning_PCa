import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { Checkbox } from '../components/ui/Checkbox';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { ConfidenceMeter } from '../components/pathology/ConfidenceMeter';
import { AIOverlayToggle } from '../components/pathology/AIOverlayToggle';
import { Histology, Disclaimer, type HistologyLayer } from '../components/Histology';
import { Icon } from '../lib/icon';
import { REGIONS, grade } from '../data/mock';
import type { Case, ReviewFields } from '../types';

const LEGEND: [string, string][] = [['3', 'Pattern 3'], ['4', 'Pattern 4'], ['5', 'Pattern 5']];

export function Viewer({
  case: c, layer, region, sideBySide, zoom, locked, review,
  onLayerChange, onRegionChange, onToggleSideBySide, onZoomIn, onZoomOut,
  onReviewChange, onLock, onGoReport,
}: {
  case: Case;
  layer: HistologyLayer;
  region: string | null;
  sideBySide: boolean;
  zoom: number;
  locked: boolean;
  review: ReviewFields;
  onLayerChange: (layer: HistologyLayer) => void;
  onRegionChange: (id: string) => void;
  onToggleSideBySide: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReviewChange: (k: keyof ReviewFields, v: ReviewFields[keyof ReviewFields]) => void;
  onLock: () => void;
  onGoReport: () => void;
}) {
  const total = (c.primary || 0) + (c.secondary || 0);
  const regions = REGIONS;

  const viewerArea = (
    <div style={{ position: 'relative', height: '100%', minHeight: 440 }}>
      {sideBySide ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: '100%' }}>
          <div style={{ position: 'relative' }}>
            <Histology layer="none" regions={[]} />
            <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,.85)', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: 'var(--text-body)' }}>Ảnh gốc</div>
          </div>
          <div style={{ position: 'relative' }}>
            <Histology layer={layer} regions={regions} activeRegion={region} onRegion={onRegionChange} />
            <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(30,143,230,.9)', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#fff' }}>AI overlay</div>
          </div>
        </div>
      ) : (
        <Histology layer={layer} regions={regions} activeRegion={region} onRegion={onRegionChange} />
      )}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}>
        <AIOverlayToggle
          layers={[{ key: 'seg', label: 'Segmentation' }, { key: 'gleason', label: 'Gleason' }, { key: 'heat', label: 'Heatmap' }, { key: 'none', label: 'Gốc' }]}
          value={layer}
          onChange={(k) => onLayerChange(k as HistologyLayer)}
        />
      </div>
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', padding: 6, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}>
        <IconButton label="Phóng to" onClick={onZoomIn}><Icon name="plus" /></IconButton>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{zoom}%</div>
        <IconButton label="Thu nhỏ" onClick={onZoomOut}><Icon name="minus" /></IconButton>
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', padding: '8px 12px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-subtle)' }}>
          {LEGEND.map(([p, l]) => (
            <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-body)' }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: `var(--gleason-${p})` }} /> {l}
            </span>
          ))}
        </div>
        <button onClick={onToggleSideBySide} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: sideBySide ? 'var(--blue-600)' : 'rgba(255,255,255,.85)', color: sideBySide ? '#fff' : 'var(--text-body)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(8px)', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          <Icon name="columns-2" size={15} /> Side-by-side
        </button>
      </div>
    </div>
  );

  const panel = (
    <div style={{ borderLeft: '1px solid var(--border-subtle)', background: 'var(--white)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--brand-accent)' }}>Phân tích AI</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--blue-800)', marginTop: 4 }}>{c.id}</div>
        </div>
        {locked ? <Badge tone="success" dot>Đã khóa</Badge> : <Badge tone="brand" dot>Hoàn tất</Badge>}
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 10 }}>Điểm Gleason đề xuất</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--brand)' }}>{c.primary ? `${c.primary}+${c.secondary}=${total}` : 'Lành tính'}</span>
            {c.primary && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ISUP Grade Group {grade(c.primary, c.secondary)}</span>}
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Primary</div>
              <GleasonChip pattern={c.primary ? String(c.primary) : 'benign'} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Secondary</div>
              <GleasonChip pattern={c.secondary ? String(c.secondary) : 'benign'} />
            </div>
          </div>
          <ConfidenceMeter value={c.confidence || 90} />
        </div>
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Vùng phát hiện</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{regions.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {regions.map((r) => {
              const on = region === r.id;
              return (
                <button key={r.id} onClick={() => onRegionChange(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textAlign: 'left', border: `1px solid ${on ? 'var(--blue-300)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', background: on ? 'var(--blue-50)' : 'var(--white)', cursor: 'pointer' }}>
                  <GleasonChip pattern={r.pattern} size="sm" showLabel={false} />
                  <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500, flex: 1 }}>Vùng {r.id.slice(1)}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{r.conf}%</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 10 }}>Trường chẩn đoán (nhập tay)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Tỷ lệ vùng ung thư</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{c.regionsCount ? '18%' : '0%'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>Diện tích u</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{c.tumorArea}</span>
            </div>
            <Checkbox label="PNI (xâm lấn quanh thần kinh)" checked={!!review.pni} disabled={locked} onChange={(e) => onReviewChange('pni', e.target.checked)} />
            <Checkbox label="LVI (xâm lấn mạch bạch huyết)" checked={!!review.lvi} disabled={locked} onChange={(e) => onReviewChange('lvi', e.target.checked)} />
            <textarea
              placeholder="Ghi chú của bác sĩ…" disabled={locked} value={review.note || ''}
              onChange={(e) => onReviewChange('note', e.target.value)} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontFamily: 'var(--font-sans)', fontSize: 13, resize: 'vertical', marginTop: 4, background: locked ? 'var(--gray-50)' : '#fff' }}
            />
          </div>
        </div>
      </div>
      <div style={{ marginTop: 'auto', padding: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="accent" fullWidth iconLeft={<Icon name="check" />} disabled={locked}>Chấp nhận</Button>
          <Button variant="secondary" fullWidth iconLeft={<Icon name="pencil" />} disabled={locked}>Sửa nhãn</Button>
        </div>
        {locked
          ? <Button variant="ghost" fullWidth iconLeft={<Icon name="lock" />} disabled>Bản ghi đã khóa</Button>
          : <Button variant="primary" fullWidth iconLeft={<Icon name="lock" />} onClick={onLock}>Xác nhận & khóa</Button>}
        <Button variant="ghost" fullWidth iconLeft={<Icon name="file-text" />} onClick={onGoReport}>Xuất báo cáo</Button>
        <Disclaimer compact />
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100%' }}>
      <div style={{ padding: 20, minWidth: 0 }}>{viewerArea}</div>
      {panel}
    </div>
  );
}
