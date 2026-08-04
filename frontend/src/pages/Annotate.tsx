import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { Disclaimer } from '../components/Histology';
import { StateMessage } from '../components/ui/StateMessage';
import { Icon } from '../lib/icon';
import { useApiData } from '../lib/useApiData';
import * as api from '../lib/api';
import type { ApiAnnotation, Point } from '../types';

type Pattern = 3 | 4 | 5 | null;
type Mode = 'idle' | 'drawing' | 'pending';

const MIN_DRAG_DISTANCE = 0.8; // % of image space between recorded points while tracing

function colorFor(pattern: Pattern): string {
  return pattern ? `var(--gleason-${pattern})` : 'var(--gleason-benign)';
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function pointsToAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function PatternPicker({ value, onChange }: { value: Pattern; onChange: (p: Pattern) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {([3, 4, 5] as const).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            border: `1px solid ${value === p ? 'var(--blue-300)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-md)', padding: '4px 8px', cursor: 'pointer',
            background: value === p ? 'var(--blue-50)' : 'var(--white)',
          }}
        >
          <GleasonChip pattern={String(p)} size="sm" />
        </button>
      ))}
      <button
        onClick={() => onChange(null)}
        style={{
          border: `1px solid ${value === null ? 'var(--blue-300)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-md)', padding: '4px 10px', cursor: 'pointer', fontSize: 12,
          background: value === null ? 'var(--blue-50)' : 'var(--white)', color: 'var(--text-body)',
        }}
      >
        Lành tính
      </button>
    </div>
  );
}

export function Annotate({ token, imageId, onBack }: {
  token: string;
  imageId: number;
  onBack: () => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const [annosState, reload] = useApiData(() => api.listAnnotations(token, imageId), [token, imageId]);
  const annotations = annosState.status === 'data' ? annosState.data : [];

  const [mode, setMode] = useState<Mode>('idle');
  const [isTracing, setIsTracing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [draftPattern, setDraftPattern] = useState<Pattern>(null);
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ApiAnnotation | null>(null);
  const [editPattern, setEditPattern] = useState<Pattern>(null);
  const [editNote, setEditNote] = useState('');

  const [zoom, setZoom] = useState(100);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [pickingZoomPoint, setPickingZoomPoint] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setImgUrl(null);
    setImgFailed(false);
    api.getImageBlobUrl(token, imageId, 'view')
      .then((u) => { if (!cancelled) { objectUrl = u; setImgUrl(u); } })
      .catch(() => { if (!cancelled) setImgFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, imageId]);

  function startDrawing() {
    setMode('drawing');
    setDraftPoints([]);
    setSelectedId(null);
  }

  function cancelDrawing() {
    setMode('idle');
    setIsTracing(false);
    setDraftPoints([]);
    setDraftPattern(null);
    setDraftNote('');
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pickingZoomPoint) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100);
    setZoomOrigin({ x, y });
    setPickingZoomPoint(false);
  }

  function pointFromWrapper(e: { clientX: number; clientY: number }): Point {
    const rect = wrapperRef.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    };
  }

  function handleSvgBackgroundClick() {
    if (pickingZoomPoint) return;
    if (mode === 'idle') setSelectedId(null);
  }

  function handlePolygonClick(e: React.MouseEvent, a: ApiAnnotation) {
    if (pickingZoomPoint) return;
    if (mode !== 'idle') return;
    e.stopPropagation();
    setSelectedId(a.id);
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (pickingZoomPoint || mode !== 'drawing') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsTracing(true);
    setDraftPoints([pointFromWrapper(e)]);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!isTracing) return;
    const p = pointFromWrapper(e);
    setDraftPoints((pts) => {
      const last = pts[pts.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_DRAG_DISTANCE) return pts;
      return [...pts, p];
    });
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (!isTracing) return;
    setIsTracing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (draftPoints.length >= 3) {
      setMode('pending');
    } else {
      setDraftPoints([]);
    }
  }

  async function handleSaveNew() {
    setSaving(true);
    try {
      await api.createAnnotation(token, imageId, { points: draftPoints, gleason_pattern: draftPattern, note: draftNote || undefined });
      setDraftPoints([]);
      setDraftPattern(null);
      setDraftNote('');
      setMode('idle');
      reload();
    } catch {
      // keep the pending shape + form so the doctor can retry without redrawing
    } finally {
      setSaving(false);
    }
  }

  function startEdit(a: ApiAnnotation) {
    setEditing(a);
    setEditPattern(a.gleason_pattern);
    setEditNote(a.note ?? '');
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.updateAnnotation(token, imageId, editing.id, { gleason_pattern: editPattern, note: editNote || null });
      setEditing(null);
      reload();
    } catch {
      // keep the edit form open so the doctor can retry
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: ApiAnnotation) {
    if (!window.confirm('Xóa vùng đánh dấu này?')) return;
    await api.deleteAnnotation(token, imageId, a.id);
    if (selectedId === a.id) setSelectedId(null);
    reload();
  }

  const imageArea = (
    <div
      ref={outerRef}
      style={{ position: 'relative', width: '100%', overflow: 'hidden', cursor: pickingZoomPoint ? 'crosshair' : 'default' }}
      onClick={handleContainerClick}
    >
      <div
        ref={wrapperRef}
        style={{ position: 'relative', width: '100%', transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`, transform: `scale(${zoom / 100})`, transition: 'transform var(--dur-fast) var(--ease-standard)' }}
      >
        {imgFailed ? (
          <StateMessage kind="error">Không tải được ảnh.</StateMessage>
        ) : imgUrl ? (
          <img src={imgUrl} alt="" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 'var(--radius-lg)' }} />
        ) : (
          <StateMessage kind="loading" />
        )}
        <svg
          viewBox="0 0 100 100" preserveAspectRatio="none"
          onClick={handleSvgBackgroundClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: mode === 'drawing' ? 'crosshair' : 'default' }}
        >
          {annotations.map((a) => (
            <polygon
              key={a.id}
              points={pointsToAttr(a.points)}
              onClick={(e) => handlePolygonClick(e, a)}
              style={{ cursor: mode === 'idle' ? 'pointer' : undefined }}
              fill={colorFor(a.gleason_pattern)}
              fillOpacity={selectedId === a.id ? 0.35 : 0.18}
              stroke={colorFor(a.gleason_pattern)}
              strokeWidth={selectedId === a.id ? 0.6 : 0.35}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {mode === 'drawing' && draftPoints.length > 0 && (
            <polyline
              points={pointsToAttr(draftPoints)}
              fill="none"
              stroke="var(--blue-500)"
              strokeWidth={0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {mode === 'pending' && draftPoints.length > 0 && (
            <polygon
              points={pointsToAttr(draftPoints)}
              fill={colorFor(draftPattern)}
              fillOpacity={0.25}
              stroke={colorFor(draftPattern)}
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
      <div style={{
        position: 'absolute', left: `${zoomOrigin.x}%`, top: `${zoomOrigin.y}%`, transform: 'translate(-50%, -50%)',
        color: pickingZoomPoint ? 'var(--blue-500)' : 'rgba(0,0,0,.3)', pointerEvents: 'none',
      }}>
        <Icon name="crosshair" size={18} />
      </div>
      {pickingZoomPoint && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(30,143,230,.92)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-md)' }}>
          Nhấp vào ảnh để đặt tâm phóng to
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', padding: 6, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}>
        <IconButton
          label="Chọn điểm phóng to" active={pickingZoomPoint}
          onClick={(e) => { e.stopPropagation(); setPickingZoomPoint((v) => !v); }}
        ><Icon name="crosshair" /></IconButton>
        <IconButton label="Phóng to" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(300, z + 25)); }}><Icon name="plus" /></IconButton>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{zoom}%</div>
        <IconButton label="Thu nhỏ" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(50, z - 25)); }}><Icon name="minus" /></IconButton>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100%' }}>
      <div style={{ padding: 20, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack}>Quay lại ca bệnh</Button>
          {mode === 'idle' && (
            <Button variant="accent" size="sm" iconLeft={<Icon name="pencil" />} onClick={startDrawing}>Vẽ vùng mới</Button>
          )}
          {mode === 'drawing' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Giữ và kéo trên ảnh để vẽ vùng, thả ra để hoàn tất
              </span>
              <Button variant="ghost" size="sm" onClick={cancelDrawing}>Hủy</Button>
            </div>
          )}
        </div>
        {imageArea}
      </div>
      <div style={{ borderLeft: '1px solid var(--border-subtle)', background: 'var(--white)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {mode === 'pending' && (
          <div style={{ padding: 20, borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Vùng mới</div>
            <PatternPicker value={draftPattern} onChange={setDraftPattern} />
            <textarea
              placeholder="Ghi chú…" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontFamily: 'var(--font-sans)', fontSize: 13, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="accent" size="sm" fullWidth disabled={saving} onClick={handleSaveNew}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
              <Button variant="ghost" size="sm" fullWidth onClick={cancelDrawing}>Hủy</Button>
            </div>
          </div>
        )}
        {editing && (
          <div style={{ padding: 20, borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Sửa vùng</div>
            <PatternPicker value={editPattern} onChange={setEditPattern} />
            <textarea
              placeholder="Ghi chú…" value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontFamily: 'var(--font-sans)', fontSize: 13, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="accent" size="sm" fullWidth disabled={saving} onClick={handleSaveEdit}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
              <Button variant="ghost" size="sm" fullWidth onClick={() => setEditing(null)}>Hủy</Button>
            </div>
          </div>
        )}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Vùng đã đánh dấu</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{annotations.length}</span>
          </div>
          {annosState.status === 'error' && <StateMessage kind="error">{annosState.message}</StateMessage>}
          {annosState.status === 'data' && annotations.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chưa có vùng nào. Bấm "Vẽ vùng mới" để bắt đầu.</div>
          )}
          {annotations.map((a) => (
            <div key={a.id} style={{ border: `1px solid ${selectedId === a.id ? 'var(--blue-300)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', padding: '8px 10px', background: selectedId === a.id ? 'var(--blue-50)' : 'var(--white)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setSelectedId(a.id)}>
                <GleasonChip pattern={a.gleason_pattern ? String(a.gleason_pattern) : 'benign'} size="sm" showLabel={false} />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong)', flex: 1 }}>
                  {a.gleason_pattern ? `Pattern ${a.gleason_pattern}` : 'Lành tính'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>~{a.area_percentage.toFixed(1)}%</span>
              </div>
              {a.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{a.note}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <Button variant="ghost" size="sm" onClick={() => startEdit(a)}>Sửa</Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(a)}>Xóa</Button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Diện tích (%) là ước lượng theo tọa độ vẽ trên ảnh, không phải số đo y khoa hiệu chuẩn.
          </div>
        </div>
        <div style={{ padding: 20, borderTop: '1px solid var(--border-subtle)' }}>
          <Disclaimer compact />
        </div>
      </div>
    </div>
  );
}
