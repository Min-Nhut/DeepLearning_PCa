import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { Disclaimer } from '../components/Histology';
import { StateMessage } from '../components/ui/StateMessage';
import { Icon } from '../lib/icon';
import { useApiData } from '../lib/useApiData';
import * as api from '../lib/api';
import type { ApiAnnotation, Point } from '../types';

type Pattern = 3 | 4 | 5 | null;
type Mode = 'idle' | 'drawing' | 'pending';

const CLOSE_TOLERANCE = 3; // % distance to the first vertex that closes the polygon

function colorFor(pattern: Pattern): string {
  return pattern ? `var(--gleason-${pattern})` : 'var(--gray-500)';
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
        Không gán nhãn
      </button>
    </div>
  );
}

export function Annotate({ token, imageId, onBack }: {
  token: string;
  imageId: number;
  onBack: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const [annosState, reload] = useApiData(() => api.listAnnotations(token, imageId), [token, imageId]);
  const annotations = annosState.status === 'data' ? annosState.data : [];

  const [mode, setMode] = useState<Mode>('idle');
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [draftPattern, setDraftPattern] = useState<Pattern>(null);
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ApiAnnotation | null>(null);
  const [editPattern, setEditPattern] = useState<Pattern>(null);
  const [editNote, setEditNote] = useState('');

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
    setDraftPoints([]);
    setDraftPattern(null);
    setDraftNote('');
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (mode === 'idle') {
      setSelectedId(null);
      return;
    }
    if (mode !== 'drawing' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100);

    if (draftPoints.length >= 3) {
      const first = draftPoints[0];
      if (Math.hypot(x - first.x, y - first.y) < CLOSE_TOLERANCE) {
        setMode('pending');
        return;
      }
    }
    setDraftPoints((pts) => [...pts, { x, y }]);
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {imgFailed ? (
        <StateMessage kind="error">Không tải được ảnh.</StateMessage>
      ) : imgUrl ? (
        <img src={imgUrl} alt="" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 'var(--radius-lg)' }} />
      ) : (
        <StateMessage kind="loading" />
      )}
      <svg
        viewBox="0 0 100 100" preserveAspectRatio="none" onClick={handleSvgClick}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: mode === 'drawing' ? 'crosshair' : 'default' }}
      >
        {annotations.map((a) => (
          <polygon
            key={a.id}
            points={pointsToAttr(a.points)}
            onClick={(e) => { if (mode === 'idle') { e.stopPropagation(); setSelectedId(a.id); } }}
            style={{ cursor: mode === 'idle' ? 'pointer' : undefined }}
            fill={colorFor(a.gleason_pattern)}
            fillOpacity={selectedId === a.id ? 0.35 : 0.18}
            stroke={colorFor(a.gleason_pattern)}
            strokeWidth={selectedId === a.id ? 0.6 : 0.35}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {mode !== 'idle' && draftPoints.length > 0 && (
          <>
            <polyline
              points={pointsToAttr(mode === 'pending' ? [...draftPoints, draftPoints[0]] : draftPoints)}
              fill={mode === 'pending' ? colorFor(draftPattern) : 'none'}
              fillOpacity={0.2}
              stroke="var(--blue-500)"
              strokeDasharray={mode === 'drawing' ? '1.2 1' : undefined}
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
            {draftPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 1 : 0.6} fill="var(--blue-500)" />
            ))}
          </>
        )}
      </svg>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                {draftPoints.length} điểm — click gần điểm đầu để đóng vùng
              </span>
              {draftPoints.length >= 3 && (
                <Button variant="primary" size="sm" onClick={() => setMode('pending')}>Xong</Button>
              )}
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
                {a.gleason_pattern ? (
                  <GleasonChip pattern={String(a.gleason_pattern)} size="sm" showLabel={false} />
                ) : (
                  <span style={{ width: 20, height: 20, borderRadius: 'var(--radius-sm)', background: 'var(--gray-200)', display: 'inline-block' }} />
                )}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong)', flex: 1 }}>
                  {a.gleason_pattern ? `Pattern ${a.gleason_pattern}` : 'Chưa gán nhãn'}
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
