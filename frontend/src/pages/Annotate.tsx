import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type OpenSeadragon from 'openseadragon';
import { Button } from '../components/ui/Button';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { Disclaimer } from '../components/Histology';
import { StateMessage } from '../components/ui/StateMessage';
import { Icon } from '../lib/icon';
import { useApiData } from '../lib/useApiData';
import * as api from '../lib/api';
import { createDeepZoomViewer, fullImageRect, openDeepZoom } from '../lib/dzi';
import type { ApiAnnotation, ApiImage, Point } from '../types';

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
  // Deep-zoom (Google Maps-style) tile viewer — same mechanism as Viewer.tsx (see
  // lib/dzi.ts / backend/app/dzi.py): real detail loads as the doctor zooms in,
  // instead of CSS-scaling an already-downsized raster.
  const osdContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const [osdReady, setOsdReady] = useState(false);
  const [osdError, setOsdError] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<ApiImage | null>(null);
  // One overlay container for the whole drawing SVG (saved regions + vertex
  // handles + in-progress trace) — content is portaled in from React below, so
  // all the existing polygon/circle JSX is unchanged; only how it's positioned
  // (OSD overlay vs. CSS-transform wrapper) changes.
  const [drawOverlayEl] = useState(() => document.createElement('div'));

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
  const [editPoints, setEditPoints] = useState<Point[]>([]);
  const [shapeEditing, setShapeEditing] = useState(false);
  const [draggingVertexIndex, setDraggingVertexIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!osdContainerRef.current) return;
    setOsdReady(false);
    setOsdError(null);
    const viewer = createDeepZoomViewer(osdContainerRef.current, token);
    viewerRef.current = viewer;
    const handleOpen = () => setOsdReady(true);
    const handleOpenFailed = () => setOsdError('Không tải được ảnh độ phân giải cao.');
    viewer.addHandler('open', handleOpen);
    viewer.addHandler('open-failed', handleOpenFailed);
    openDeepZoom(viewer, imageId);
    return () => {
      viewer.removeHandler('open', handleOpen);
      viewer.removeHandler('open-failed', handleOpenFailed);
      viewer.destroy();
      viewerRef.current = null;
      setOsdReady(false);
    };
  }, [token, imageId]);

  useEffect(() => {
    let cancelled = false;
    setImageMeta(null);
    api.getImage(token, imageId).then((im) => { if (!cancelled) setImageMeta(im); }).catch(() => {});
    return () => { cancelled = true; };
  }, [token, imageId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !osdReady || !imageMeta?.width_px || !imageMeta?.height_px) return;
    const rect = fullImageRect(imageMeta.width_px, imageMeta.height_px);
    viewer.addOverlay({ element: drawOverlayEl, location: rect });
    return () => {
      try { viewer.removeOverlay(drawOverlayEl); } catch { /* viewer already destroyed */ }
    };
  }, [osdReady, imageMeta?.width_px, imageMeta?.height_px, drawOverlayEl]);

  // Disable OSD's own drag-to-pan exactly while we're capturing a drag gesture
  // ourselves (tracing a new shape, or dragging a vertex handle) — otherwise the
  // same drag would fight between "draw" and "pan the viewport".
  useEffect(() => {
    viewerRef.current?.setMouseNavEnabled(!(mode === 'drawing' || draggingVertexIndex !== null));
  }, [mode, draggingVertexIndex]);

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

  // The overlay <svg> is sized/positioned by OSD to exactly cover the image
  // (see the addOverlay effect above), so its own live rect maps a screen point
  // to 0-100% image space correctly at any zoom/pan level — same technique the
  // CSS-transform wrapper used before, just a different element supplies the rect.
  function pointFromOverlay(e: { clientX: number; clientY: number }): Point {
    const rect = drawOverlayEl.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    };
  }

  function handlePolygonClick(e: React.MouseEvent, a: ApiAnnotation) {
    if (mode !== 'idle') return;
    e.stopPropagation();
    setSelectedId(a.id);
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (mode !== 'drawing') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsTracing(true);
    setDraftPoints([pointFromOverlay(e)]);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!isTracing) return;
    const p = pointFromOverlay(e);
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
      autoSaveNewRegion(draftPoints);
    } else {
      setDraftPoints([]);
    }
  }

  // Persist the traced shape the instant drawing finishes — not after the doctor
  // also picks a pattern/note — so a crash or interruption mid-decision never loses
  // the shape itself. Falls back to the manual "pending" flow (form still open,
  // shape still visible) only if the request itself fails.
  async function autoSaveNewRegion(points: Point[]) {
    setMode('pending');
    setDraftPoints(points);
    setSaving(true);
    try {
      const created = await api.createAnnotation(token, imageId, { points, gleason_pattern: null });
      await reload();
      setMode('idle');
      setDraftPoints([]);
      startEdit(created);
    } catch {
      // keep the pending shape + form so the doctor can retry without redrawing
    } finally {
      setSaving(false);
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
    setEditPoints(a.points);
    setShapeEditing(false);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.updateAnnotation(token, imageId, editing.id, { gleason_pattern: editPattern, note: editNote || null, points: editPoints });
      setEditing(null);
      setShapeEditing(false);
      reload();
    } catch {
      // keep the edit form open so the doctor can retry
    } finally {
      setSaving(false);
    }
  }

  function handleVertexPointerDown(e: React.PointerEvent<SVGCircleElement>, index: number) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingVertexIndex(index);
  }

  function handleVertexPointerMove(e: React.PointerEvent<SVGCircleElement>) {
    if (draggingVertexIndex === null) return;
    const p = pointFromOverlay(e);
    setEditPoints((pts) => pts.map((pt, i) => (i === draggingVertexIndex ? p : pt)));
  }

  function handleVertexPointerUp(e: React.PointerEvent<SVGCircleElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingVertexIndex(null);
  }

  async function handleDelete(a: ApiAnnotation) {
    if (!window.confirm('Xóa vùng đánh dấu này?')) return;
    await api.deleteAnnotation(token, imageId, a.id);
    if (selectedId === a.id) setSelectedId(null);
    reload();
  }

  const drawSvg = (
    <svg
      viewBox="0 0 100 100" preserveAspectRatio="none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        width: '100%', height: '100%', touchAction: 'none',
        // Only capture pointer events ourselves while actively tracing a new
        // shape — otherwise leave the background transparent to input so OSD's
        // own drag-to-pan/scroll-to-zoom keeps working. Individual polygons/
        // vertex handles re-enable pointer events on themselves below so they
        // stay clickable/draggable even when the svg background doesn't.
        pointerEvents: mode === 'drawing' ? 'auto' : 'none',
        cursor: mode === 'drawing' ? 'crosshair' : 'default',
      }}
    >
      {annotations.map((a) => {
        const isShapeEditingThis = shapeEditing && editing?.id === a.id;
        const pts = isShapeEditingThis ? editPoints : a.points;
        return (
          <polygon
            key={a.id}
            points={pointsToAttr(pts)}
            onClick={(e) => handlePolygonClick(e, a)}
            style={{ cursor: mode === 'idle' ? 'pointer' : undefined, pointerEvents: 'auto' }}
            fill={colorFor(a.gleason_pattern)}
            fillOpacity={selectedId === a.id || isShapeEditingThis ? 0.35 : 0.18}
            stroke={colorFor(a.gleason_pattern)}
            strokeWidth={selectedId === a.id || isShapeEditingThis ? 0.6 : 0.35}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {shapeEditing && editing && editPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y} r={1.4}
          fill="var(--white)" stroke="var(--blue-500)" strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'grab', touchAction: 'none', pointerEvents: 'auto' }}
          onPointerDown={(e) => handleVertexPointerDown(e, i)}
          onPointerMove={handleVertexPointerMove}
          onPointerUp={handleVertexPointerUp}
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
  );

  const imageArea = (
    <div style={{ position: 'relative', width: '100%', height: 520, borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#111' }}>
      <div ref={osdContainerRef} style={{ position: 'absolute', inset: 0 }} />
      {(!osdReady && !osdError) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StateMessage kind="loading" />
        </div>
      )}
      {osdError && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StateMessage kind="error">{osdError}</StateMessage>
        </div>
      )}
      {osdReady && imageMeta?.width_px && createPortal(drawSvg, drawOverlayEl)}
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
            <Button
              variant={shapeEditing ? 'secondary' : 'ghost'} size="sm" fullWidth
              iconLeft={<Icon name="move" />}
              onClick={() => setShapeEditing((v) => !v)}
            >
              {shapeEditing ? 'Đang sửa hình dạng — kéo các điểm neo' : 'Sửa hình dạng'}
            </Button>
            <PatternPicker value={editPattern} onChange={setEditPattern} />
            <textarea
              placeholder="Ghi chú…" value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontFamily: 'var(--font-sans)', fontSize: 13, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="accent" size="sm" fullWidth disabled={saving} onClick={handleSaveEdit}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
              <Button variant="ghost" size="sm" fullWidth onClick={() => { setEditing(null); setShapeEditing(false); }}>Hủy</Button>
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
