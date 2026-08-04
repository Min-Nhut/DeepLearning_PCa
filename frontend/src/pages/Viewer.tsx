import { useEffect, useState, type CSSProperties } from 'react';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { Checkbox } from '../components/ui/Checkbox';
import { Input } from '../components/ui/Input';
import { StateMessage } from '../components/ui/StateMessage';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { ConfidenceMeter } from '../components/pathology/ConfidenceMeter';
import { AIOverlayToggle } from '../components/pathology/AIOverlayToggle';
import { Disclaimer } from '../components/Histology';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';
import type { DiagnosticReviewUpdate, Point } from '../types';

type Layer = 'none' | 'mask' | 'manual';
type Pattern = 3 | 4 | 5 | null;

function colorFor(pattern: Pattern): string {
  return pattern ? `var(--gleason-${pattern})` : 'var(--gleason-benign)';
}

function pointsToAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function PatternPicker({ label, value, onChange, disabled }: { label: string; value: Pattern; onChange: (p: Pattern) => void; disabled?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {([3, 4, 5] as const).map((p) => (
          <button
            key={p}
            disabled={disabled}
            onClick={() => onChange(p)}
            style={{
              border: `1px solid ${value === p ? 'var(--blue-300)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-md)', padding: '4px 8px', cursor: disabled ? 'not-allowed' : 'pointer',
              background: value === p ? 'var(--blue-50)' : 'var(--white)', opacity: disabled ? 0.6 : 1,
            }}
          >
            <GleasonChip pattern={String(p)} size="sm" />
          </button>
        ))}
        <button
          disabled={disabled}
          onClick={() => onChange(null)}
          style={{
            border: `1px solid ${value === null ? 'var(--blue-300)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-md)', padding: '4px 10px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12,
            background: value === null ? 'var(--blue-50)' : 'var(--white)', color: 'var(--text-body)', opacity: disabled ? 0.6 : 1,
          }}
        >
          Lành tính
        </button>
      </div>
    </div>
  );
}

export function Viewer({ token, imageId, caseLabel, onBack, onGoReport, onRunAI, onAnnotate }: {
  token: string;
  imageId: number;
  caseLabel?: string;
  onBack: () => void;
  onGoReport: () => void;
  onRunAI: () => void;
  onAnnotate: () => void;
}) {
  const [runState] = useApiData(() => api.getInference(token, imageId), [token, imageId]);
  const [reviewState, reloadReview] = useApiData(() => api.getReview(token, imageId), [token, imageId]);
  const [annosState] = useApiData(() => api.listAnnotations(token, imageId), [token, imageId]);
  const run = runState.status === 'data' ? runState.data : null;
  const review = reviewState.status === 'data' ? reviewState.data : null;
  const annotations = annosState.status === 'data' ? annosState.data : [];

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>('none');
  const [zoom, setZoom] = useState(100);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [pickingZoomPoint, setPickingZoomPoint] = useState(false);

  const [primary, setPrimary] = useState<Pattern>(null);
  const [secondary, setSecondary] = useState<Pattern>(null);
  const [biopsyLocation, setBiopsyLocation] = useState('');
  const [pni, setPni] = useState(false);
  const [pniNotes, setPniNotes] = useState('');
  const [lvi, setLvi] = useState(false);
  const [lviNotes, setLviNotes] = useState('');
  const [freeNotes, setFreeNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setImgUrl(null);
    api.getImageBlobUrl(token, imageId, 'view').then((u) => { if (!cancelled) { objectUrl = u; setImgUrl(u); } }).catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [token, imageId]);

  useEffect(() => {
    let maskObjUrl: string | null = null;
    let cancelled = false;
    setMaskUrl(null);
    if (run?.segmentation?.has_mask) {
      api.getMaskBlobUrl(token, run.id).then((u) => { if (!cancelled) { maskObjUrl = u; setMaskUrl(u); } }).catch(() => {});
    }
    return () => { cancelled = true; if (maskObjUrl) URL.revokeObjectURL(maskObjUrl); };
  }, [token, run?.id, run?.segmentation?.has_mask]);

  // Prefill the editable review form from the existing draft, or — if no
  // draft exists yet — from the AI's own classification, so the form reads
  // as "the doctor's editable copy of the AI output" even before the first save.
  useEffect(() => {
    if (review) {
      setPrimary(review.primary_pattern);
      setSecondary(review.secondary_pattern);
      setBiopsyLocation(review.biopsy_location || '');
      setPni(review.pni_present);
      setPniNotes(review.pni_notes || '');
      setLvi(review.lvi_present);
      setLviNotes(review.lvi_notes || '');
      setFreeNotes(review.free_notes || '');
    } else if (run?.classification) {
      setPrimary(run.classification.primary_pattern);
      setSecondary(run.classification.secondary_pattern);
    }
  }, [review, run]);

  const locked = review?.status === 'confirmed';

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const payload: DiagnosticReviewUpdate = {
      primary_pattern: primary, secondary_pattern: secondary, biopsy_location: biopsyLocation || null,
      pni_present: pni, pni_notes: pniNotes || null, lvi_present: lvi, lvi_notes: lviNotes || null,
      free_notes: freeNotes || null,
    };
    try {
      await api.updateReview(token, imageId, payload);
      reloadReview();
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 423) {
        reloadReview();
        setSaveError('Kết quả đã được xác nhận (có thể ở phiên khác) — không thể sửa thêm.');
      } else {
        setSaveError(err instanceof api.ApiError ? err.message : 'Lưu thất bại.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.confirmReview(token, imageId);
      reloadReview();
    } catch (err) {
      setSaveError(err instanceof api.ApiError ? err.message : 'Xác nhận thất bại.');
    } finally {
      setSaving(false);
    }
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pickingZoomPoint) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setZoomOrigin({ x, y });
    setPickingZoomPoint(false);
  }

  if (runState.status === 'loading' || reviewState.status === 'loading') {
    return <StateMessage kind="loading" />;
  }

  const seg = run?.segmentation;
  const clf = run?.classification;
  const total = (primary || 0) + (secondary || 0);

  const overlayLayers = [
    { key: 'none', label: 'Ảnh gốc' },
    ...(maskUrl ? [{ key: 'mask', label: 'Mặt nạ phân đoạn' }] : []),
    ...(annotations.length > 0 ? [{ key: 'manual', label: 'Mask thủ công' }] : []),
  ];

  const viewerArea = (
    <div
      style={{ position: 'relative', height: '100%', minHeight: 440, background: '#111', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: pickingZoomPoint ? 'crosshair' : 'default' }}
      onClick={handleContainerClick}
    >
      {imgUrl ? (
        <div style={{ position: 'relative', width: '100%', transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`, transform: `scale(${zoom / 100})`, transition: 'transform var(--dur-fast) var(--ease-standard)' }}>
          <img src={imgUrl} alt="" style={{ width: '100%', display: 'block' }} />
          {layer === 'mask' && maskUrl && <img src={maskUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }} />}
          {layer === 'manual' && annotations.length > 0 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {annotations.map((a) => (
                <polygon
                  key={a.id}
                  points={pointsToAttr(a.points)}
                  fill={colorFor(a.gleason_pattern)}
                  fillOpacity={0.45}
                  stroke={colorFor(a.gleason_pattern)}
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          )}
        </div>
      ) : (
        <StateMessage kind="loading" />
      )}
      <div style={{
        position: 'absolute', left: `${zoomOrigin.x}%`, top: `${zoomOrigin.y}%`, transform: 'translate(-50%, -50%)',
        color: pickingZoomPoint ? 'var(--blue-400)' : 'rgba(255,255,255,.55)', pointerEvents: 'none',
      }}>
        <Icon name="crosshair" size={18} />
      </div>
      {overlayLayers.length > 1 && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}>
          <AIOverlayToggle layers={overlayLayers} value={layer} onChange={(k) => setLayer(k as Layer)} />
        </div>
      )}
      {pickingZoomPoint && (
        <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(30,143,230,.92)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-md)' }}>
          Nhấp vào ảnh để đặt tâm phóng to
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', padding: 6, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}>
        <IconButton
          label="Chọn điểm phóng to" active={pickingZoomPoint}
          onClick={(e) => { e.stopPropagation(); setPickingZoomPoint((v) => !v); }}
        ><Icon name="crosshair" /></IconButton>
        <IconButton label="Phóng to" onClick={() => setZoom((z) => Math.min(300, z + 25))}><Icon name="plus" /></IconButton>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{zoom}%</div>
        <IconButton label="Thu nhỏ" onClick={() => setZoom((z) => Math.max(50, z - 25))}><Icon name="minus" /></IconButton>
      </div>
    </div>
  );

  const panel = (
    <div style={{ borderLeft: '1px solid var(--border-subtle)', background: 'var(--white)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--brand-accent)' }}>Phân tích AI</div>
          {caseLabel && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--blue-800)', marginTop: 4 }}>{caseLabel}</div>}
        </div>
        {locked ? <Badge tone="success" dot>Đã khóa</Badge> : run?.status === 'completed' ? <Badge tone="brand" dot>Hoàn tất</Badge> : null}
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!run ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Chưa có kết quả AI cho ảnh này.</div>
            <Button variant="accent" size="sm" iconLeft={<Icon name="sparkles" />} onClick={onRunAI}>Chạy phân tích AI</Button>
          </div>
        ) : run.status !== 'completed' ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {run.status === 'failed' ? `Lần chạy trước thất bại: ${run.error_message || ''}` : 'Đang chạy phân tích AI…'}
            </div>
            <Button variant="accent" size="sm" iconLeft={<Icon name={run.status === 'failed' ? 'refresh-cw' : 'loader-2'} />} onClick={onRunAI}>
              {run.status === 'failed' ? 'Thử lại' : 'Xem tiến trình'}
            </Button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 10 }}>Kết quả AI (chỉ đọc)</div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Primary</div>
                <GleasonChip pattern={clf?.primary_pattern ? String(clf.primary_pattern) : 'benign'} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Secondary</div>
                <GleasonChip pattern={clf?.secondary_pattern ? String(clf.secondary_pattern) : 'benign'} />
              </div>
            </div>
            {clf?.primary_confidence != null && <ConfidenceMeter value={Math.round(clf.primary_confidence)} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 10 }}>
              <span style={{ color: 'var(--text-muted)' }}>Tỷ lệ vùng ung thư</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{seg?.cancer_area_percentage != null ? `${seg.cancer_area_percentage.toFixed(1)}%` : '—'}</span>
            </div>
          </div>
        )}
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 10 }}>
            Đánh giá của bác sĩ {locked && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(đã khóa)</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Điểm Gleason</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--brand)' }}>{primary ? `${primary}+${secondary || 0}=${total}` : 'Lành tính'}</span>
            </div>
            <PatternPicker label="Primary" value={primary} onChange={setPrimary} disabled={locked} />
            <PatternPicker label="Secondary" value={secondary} onChange={setSecondary} disabled={locked} />
            <Input label="Vị trí sinh thiết" value={biopsyLocation} disabled={locked} onChange={(e) => setBiopsyLocation(e.target.value)} size="sm" />
            <Checkbox label="PNI (xâm lấn quanh thần kinh)" checked={pni} disabled={locked} onChange={(e) => setPni(e.target.checked)} />
            {pni && <textarea placeholder="Ghi chú PNI…" disabled={locked} value={pniNotes} onChange={(e) => setPniNotes(e.target.value)} rows={2} style={taStyle(locked)} />}
            <Checkbox label="LVI (xâm lấn mạch bạch huyết)" checked={lvi} disabled={locked} onChange={(e) => setLvi(e.target.checked)} />
            {lvi && <textarea placeholder="Ghi chú LVI…" disabled={locked} value={lviNotes} onChange={(e) => setLviNotes(e.target.value)} rows={2} style={taStyle(locked)} />}
            <textarea placeholder="Ghi chú của bác sĩ…" disabled={locked} value={freeNotes} onChange={(e) => setFreeNotes(e.target.value)} rows={2} style={taStyle(locked)} />
          </div>
          {saveError && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{saveError}</div>}
        </div>
      </div>
      <div style={{ marginTop: 'auto', padding: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!locked && <Button variant="secondary" fullWidth iconLeft={<Icon name="save" />} disabled={saving} onClick={handleSave}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>}
        {locked
          ? <Button variant="ghost" fullWidth iconLeft={<Icon name="lock" />} disabled>Bản ghi đã khóa</Button>
          : <Button variant="primary" fullWidth iconLeft={<Icon name="lock" />} disabled={saving || !review} onClick={handleConfirm}>Xác nhận & khóa</Button>}
        <Button variant="ghost" fullWidth iconLeft={<Icon name="pencil" />} onClick={onAnnotate}>Vẽ / sửa mask thủ công</Button>
        <Button variant="ghost" fullWidth iconLeft={<Icon name="file-text" />} onClick={onGoReport}>Xem báo cáo</Button>
        <Disclaimer compact />
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100%' }}>
      <div style={{ padding: 20, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack} style={{ alignSelf: 'flex-start' }}>Quay lại ca bệnh</Button>
        {viewerArea}
      </div>
      {panel}
    </div>
  );
}

function taStyle(locked: boolean): CSSProperties {
  return { width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontFamily: 'var(--font-sans)', fontSize: 13, resize: 'vertical', background: locked ? 'var(--gray-50)' : '#fff' };
}
