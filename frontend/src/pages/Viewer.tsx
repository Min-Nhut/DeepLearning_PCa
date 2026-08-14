import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type OpenSeadragon from 'openseadragon';
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
import { createDeepZoomViewer, fullImageRect, openDeepZoom } from '../lib/dzi';
import { aiReadingProblem, classLabel, crossModelDisagreement } from '../lib/aiReliability';
import type { ApiImage, Calibration, DiagnosticReviewUpdate, Point } from '../types';

type Pattern = 3 | 4 | 5 | null;

function colorFor(pattern: Pattern): string {
  return pattern ? `var(--gleason-${pattern})` : 'var(--gleason-benign)';
}

// Key for the 6 classes the segmentation mask paints, in the mask's own pixel
// order (0=background .. 5=gleason_5) — mirrors `MASK_COLORS_BGR` in
// backend/app/inference/pipeline.py. The four Gleason colours read from the
// shared tokens, which were themselves sourced from that same palette, so they
// cannot drift; background/stroma have no token because nothing else in the UI
// uses them. Without this key the overlay was six unlabelled colours.
const MASK_LEGEND: readonly (readonly [label: string, color: string])[] = [
  ['Nền', '#1a1a1a'],
  ['Mô đệm', '#9e9e9e'],
  ['Lành tính', 'var(--gleason-benign)'],
  ['Pattern 3', 'var(--gleason-3)'],
  ['Pattern 4', 'var(--gleason-4)'],
  ['Pattern 5', 'var(--gleason-5)'],
];

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

  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  // Independent toggles (not single-select) — a doctor comparing findings wants to see
  // the base image alone first, then layer AI/manual overlays in on top as needed,
  // rather than always looking at a fixed composite. Both default off.
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [maskOpacity, setMaskOpacity] = useState(50);

  // Deep-zoom (Google Maps-style) tile viewer — real detail is fetched from the
  // full-resolution original as the doctor zooms in, instead of CSS-scaling an
  // already-downsized raster (which never reveals more gland structure). See
  // lib/dzi.ts / backend/app/dzi.py.
  const osdContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const [osdReady, setOsdReady] = useState(false);
  const [osdError, setOsdError] = useState<string | null>(null);
  // Stable overlay container elements — content is portaled into them from React
  // (declarative, same JSX as before); OpenSeadragon just handles positioning them
  // so they pan/zoom in lockstep with the base tile image.
  const [maskOverlayEl] = useState(() => { const el = document.createElement('div'); el.style.pointerEvents = 'none'; return el; });
  const [manualOverlayEl] = useState(() => { const el = document.createElement('div'); el.style.pointerEvents = 'none'; return el; });
  const [measureOverlayEl] = useState(() => { const el = document.createElement('div'); el.style.pointerEvents = 'none'; return el; });

  const [imageMeta, setImageMeta] = useState<ApiImage | null>(null);
  const [calibration, setCalibration] = useState<Calibration[]>([]);
  const [measuring, setMeasuring] = useState(false);
  // Real image-pixel coordinates now (from viewport.viewportToImageCoordinates()),
  // not 0-100% — OSD gives us true pixel coordinates directly, so the percent-based
  // detour through imageMeta.width_px/height_px that measurement math used to need
  // is gone (that detour is also what caused a real bug earlier: naturalWidth of the
  // rendered <img> silently didn't match the true original size).
  const [measurePoints, setMeasurePoints] = useState<Point[]>([]);

  const [primary, setPrimary] = useState<Pattern>(null);
  const [secondary, setSecondary] = useState<Pattern>(null);
  const [biopsyLocation, setBiopsyLocation] = useState('');
  const [pni, setPni] = useState(false);
  const [pniNotes, setPniNotes] = useState('');
  const [lvi, setLvi] = useState(false);
  const [lviNotes, setLviNotes] = useState('');
  const [freeNotes, setFreeNotes] = useState('');
  const [needsSecondOpinion, setNeedsSecondOpinion] = useState(false);
  const [secondOpinionNotes, setSecondOpinionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Create/destroy the OpenSeadragon viewer whenever the image changes.
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

  // Attach the 3 overlay containers once the viewer has opened and we know the
  // image's real dimensions (needed for the aspect-correct full-image Rect).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !osdReady || !imageMeta?.width_px || !imageMeta?.height_px) return;
    const rect = fullImageRect(imageMeta.width_px, imageMeta.height_px);
    viewer.addOverlay({ element: maskOverlayEl, location: rect });
    viewer.addOverlay({ element: manualOverlayEl, location: rect });
    viewer.addOverlay({ element: measureOverlayEl, location: rect });
    return () => {
      try { viewer.removeOverlay(maskOverlayEl); } catch { /* viewer already destroyed */ }
      try { viewer.removeOverlay(manualOverlayEl); } catch { /* viewer already destroyed */ }
      try { viewer.removeOverlay(measureOverlayEl); } catch { /* viewer already destroyed */ }
    };
  }, [osdReady, imageMeta?.width_px, imageMeta?.height_px, maskOverlayEl, manualOverlayEl, measureOverlayEl]);

  // Ruler tool — real click handling now comes from OSD's own canvas-click event
  // instead of a manual getBoundingClientRect() on a CSS-transformed wrapper.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !osdReady) return;
    function handleCanvasClick(e: OpenSeadragon.CanvasClickEvent) {
      if (!measuring || !e.quick) return;
      const imagePoint = viewer!.viewport.viewportToImageCoordinates(viewer!.viewport.pointFromPixel(e.position));
      const p: Point = { x: imagePoint.x, y: imagePoint.y };
      setMeasurePoints((pts) => {
        const next = pts.length >= 2 ? [p] : [...pts, p];
        if (next.length === 2) setMeasuring(false);
        return next;
      });
      e.preventDefaultAction = true;
    }
    viewer.addHandler('canvas-click', handleCanvasClick);
    return () => { viewer.removeHandler('canvas-click', handleCanvasClick); };
  }, [osdReady, measuring]);

  // Magnification + µm/pixel calibration — for the ruler tool below.
  useEffect(() => {
    let cancelled = false;
    setImageMeta(null);
    setMeasurePoints([]);
    setMeasuring(false);
    api.getImage(token, imageId).then((im) => { if (!cancelled) setImageMeta(im); }).catch(() => {});
    api.getCalibration(token).then((c) => { if (!cancelled) setCalibration(c); }).catch(() => {});
    return () => { cancelled = true; };
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
      setNeedsSecondOpinion(review.needs_second_opinion);
      setSecondOpinionNotes(review.second_opinion_notes || '');
    } else if (run?.classification && aiReadingProblem(run) == null) {
      // Only prefill from a result the AI actually produced. When it assigned no
      // pattern, a null prefill would pre-select "Lành tính" for the doctor —
      // the same false negative as the chip, arrived at through the form.
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
      needs_second_opinion: needsSecondOpinion, second_opinion_notes: secondOpinionNotes || null,
      // Copy over from the real AI segmentation output (never hand-entered) — closes a
      // known gap where Report always showed "Chưa có diện tích ung thư" even for a
      // confirmed review, since nothing used to write this field.
      cancer_area_percentage: seg?.cancer_area_percentage ?? undefined,
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

  // Deliberately not an early return before the rest of this render: the deep-zoom
  // container below needs to mount (and attach its ref) on every render regardless
  // of AI/review load state, otherwise the OSD-creation effect's dependencies
  // ([token, imageId]) never change once loading finishes and the ref would never
  // get (re-)attached — the image panel loads independently of the AI/review panel.
  const panelLoading = runState.status === 'loading' || reviewState.status === 'loading';

  const seg = run?.segmentation;
  const clf = run?.classification;
  const total = (primary || 0) + (secondary || 0);
  const agreesWithAi = clf != null && primary === clf.primary_pattern && secondary === clf.secondary_pattern;
  // A null primary_pattern has three possible meanings and they must not be
  // conflated — see lib/aiReliability.ts for the real case that forced this.
  const readingProblem = aiReadingProblem(run);
  const modelDisagreement = crossModelDisagreement(run?.stage3?.classification_pct);

  function handleAgreeWithAi() {
    if (!clf) return;
    setPrimary(clf.primary_pattern);
    setSecondary(clf.secondary_pattern);
  }

  const activeCalibration = imageMeta?.magnification
    ? calibration.find((c) => c.magnification === imageMeta.magnification)
    : undefined;
  const measurement = (() => {
    if (measurePoints.length !== 2) return null;
    const [p1, p2] = measurePoints;
    const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return { distPx, mm: activeCalibration ? (distPx * activeCalibration.um_per_pixel) / 1000 : null };
  })();

  // Convert a real image-pixel point back to the 0-100 space the overlay <svg>s use
  // (viewBox "0 0 100 100" over the full-image Rect) — only needed for rendering.
  function toPct(p: Point): Point {
    if (!imageMeta?.width_px || !imageMeta?.height_px) return { x: 0, y: 0 };
    return { x: (p.x / imageMeta.width_px) * 100, y: (p.y / imageMeta.height_px) * 100 };
  }

  async function handleSaveMeasurement() {
    if (measurement?.mm == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateReview(token, imageId, { tumor_length_mm: measurement.mm });
      reloadReview();
    } catch (err) {
      setSaveError(err instanceof api.ApiError ? err.message : 'Lưu chiều dài thất bại.');
    } finally {
      setSaving(false);
    }
  }

  const overlayLayers = [
    ...(maskUrl ? [{ key: 'mask', label: 'Mặt nạ AI' }] : []),
    ...(annotations.length > 0 ? [{ key: 'manual', label: 'Mask thủ công' }] : []),
  ];

  const measurePointsPct = measurePoints.map(toPct);

  const viewerArea = (
    <div style={{ position: 'relative', height: '100%', minHeight: 440, background: '#111', borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: measuring ? 'crosshair' : 'default' }}>
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
      {osdReady && imageMeta?.width_px && activeLayers.includes('mask') && maskUrl &&
        createPortal(
          <img src={maskUrl} alt="" style={{ width: '100%', height: '100%', display: 'block', opacity: maskOpacity / 100 }} />,
          maskOverlayEl,
        )}
      {osdReady && imageMeta?.width_px && activeLayers.includes('manual') && annotations.length > 0 &&
        createPortal(
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            {annotations.map((a) => (
              <polygon
                key={a.id}
                points={pointsToAttr(a.points)}
                fill={colorFor(a.gleason_pattern)}
                fillOpacity={maskOpacity / 100}
                stroke={colorFor(a.gleason_pattern)}
                strokeWidth={0.4}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>,
          manualOverlayEl,
        )}
      {osdReady && imageMeta?.width_px && measurePoints.length > 0 &&
        createPortal(
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            {measurePointsPct.length === 2 && (
              <line
                x1={measurePointsPct[0].x} y1={measurePointsPct[0].y} x2={measurePointsPct[1].x} y2={measurePointsPct[1].y}
                stroke="var(--blue-500)" strokeWidth={0.4} vectorEffect="non-scaling-stroke"
              />
            )}
            {measurePointsPct.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={0.9} fill="var(--blue-500)" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>,
          measureOverlayEl,
        )}
      {overlayLayers.length > 0 && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <AIOverlayToggle layers={overlayLayers} value={activeLayers} onChange={setActiveLayers} />
          {activeLayers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', padding: '6px 12px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}>
              <Icon name="droplet" size={14} style={{ color: 'var(--text-muted)' }} />
              <input
                type="range" min={10} max={100} value={maskOpacity}
                onChange={(e) => setMaskOpacity(Number(e.target.value))}
                style={{ width: 110 }}
              />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', width: 30, textAlign: 'right' }}>{maskOpacity}%</span>
            </div>
          )}
          {activeLayers.includes('mask') && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '4px 12px', maxWidth: 420, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', padding: '7px 12px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}>
              {MASK_LEGEND.map(([label, color]) => (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-body)', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, border: '1px solid rgba(0,0,0,.15)', flexShrink: 0 }} />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {measuring && (
        <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(30,143,230,.92)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--radius-md)' }}>
          Nhấp 2 điểm trên ảnh để đo khoảng cách ({measurePoints.length}/2)
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        <IconButton
          label="Đo khoảng cách" active={measuring}
          onClick={() => { setMeasuring((v) => !v); if (!measuring) setMeasurePoints([]); }}
          style={{ background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)' }}
        ><Icon name="ruler" /></IconButton>
        {measurement && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(8px)', padding: '10px 14px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-subtle)', fontSize: 12, maxWidth: 220 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-strong)' }}>
              {measurement.mm != null ? `${measurement.mm.toFixed(2)} mm` : `${measurement.distPx.toFixed(0)} px`}
            </div>
            {measurement.mm == null && (
              <div style={{ color: 'var(--warning)' }}>
                Chưa hiệu chỉnh µm/pixel cho {imageMeta?.magnification || 'độ phóng đại này'} — chỉ hiện pixel.
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              {measurement.mm != null && (
                <Button variant="secondary" size="sm" disabled={saving} onClick={handleSaveMeasurement}>Lưu vào báo cáo</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setMeasurePoints([])}>Xóa</Button>
            </div>
          </div>
        )}
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
        {panelLoading ? (
          <StateMessage kind="loading" />
        ) : !run ? (
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
            {readingProblem === 'no_tissue' ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, background: 'var(--warning-soft)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--warning)' }}>
                <Icon name="triangle-alert" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  AI không phát hiện được mô nào trong ảnh này (có thể do ảnh mờ hoặc không đủ mô) — <strong>không phải</strong> kết luận lành tính. Cân nhắc chụp/tải lại ảnh rõ hơn.
                </span>
              </div>
            ) : readingProblem === 'pattern_not_assigned' ? (
              // Segmentation marked cancerous tissue while classification assigned no
              // pattern. Rendering that as a benign chip would state a negative finding
              // neither model made — and would sit directly beside a non-zero cancer area.
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, background: 'var(--warning-soft)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--warning)' }}>
                  <Icon name="triangle-alert" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    AI <strong>không gán được mẫu Gleason</strong> cho ảnh này: mô hình phân đoạn đánh
                    dấu có vùng nghi ngờ ung thư, nhưng mô hình phân loại không xác định được mẫu nào.
                    Hai mô hình mâu thuẫn nhau — <strong>không phải</strong> kết luận lành tính. Bác sĩ
                    cần tự đọc mask và quyết định.
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 10 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Vùng nghi ngờ / tổng mô tuyến</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{seg?.cancer_area_percentage != null ? `${seg.cancer_area_percentage.toFixed(1)}%` : '—'}</span>
                </div>
              </div>
            ) : (
              <>
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
                {clf?.primary_confidence != null && <ConfidenceMeter value={Math.round(clf.primary_confidence * 100)} />}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 10 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tỷ lệ vùng ung thư</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{seg?.cancer_area_percentage != null ? `${seg.cancer_area_percentage.toFixed(1)}%` : '—'}</span>
                </div>
              </>
            )}
            {modelDisagreement && (
              // Free signal: Stage 3 already runs both classification networks over every
              // tissue patch and stores their distributions, so a top-1 split between them
              // is available on every run without any extra compute.
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, marginTop: 12, background: 'var(--warning-soft)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--warning)' }}>
                <Icon name="triangle-alert" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ marginBottom: 6 }}>
                    Hai mô hình phân loại <strong>không đồng thuận</strong> trên ảnh này, dấu hiệu ảnh
                    nằm ngoài phân phối dữ liệu huấn luyện. Hãy đọc kết quả một cách thận trọng.
                  </div>
                  {modelDisagreement.map((v) => (
                    <div key={v.arch} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {v.arch}: {classLabel(v.label)} ({v.percentage.toFixed(1)}%)
                    </div>
                  ))}
                </div>
              </div>
            )}
            {clf && (
              <Button
                variant={agreesWithAi ? 'ghost' : 'secondary'} size="sm" fullWidth
                iconLeft={<Icon name={readingProblem != null ? 'triangle-alert' : agreesWithAi ? 'check' : 'thumbs-up'} />}
                // Agreeing with a result the AI never produced would write "benign" into the
                // review through a different door than the chip this pass just fixed.
                disabled={locked || readingProblem != null}
                onClick={handleAgreeWithAi}
                style={{ marginTop: 12 }}
              >
                {readingProblem != null ? 'AI chưa có kết quả để đồng ý' : agreesWithAi ? 'Đã khớp với AI' : 'Đồng ý với AI'}
              </Button>
            )}
            {run.stage3?.isup_grade != null && (
              <div style={{ marginTop: 14, padding: 12, background: 'var(--blue-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--blue-200)' }}>
                <div style={{ fontSize: 11, color: 'var(--blue-700)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>ISUP tổng hợp (Stage 3 — MLP)</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--blue-900)' }}>{run.stage3.isup_grade}</span>
                  {run.stage3.confidence != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{Math.round(run.stage3.confidence * 100)}% tin cậy</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                  Mô hình ML tổng hợp riêng biệt (dựa trên phân bố % lớp của 2 model phân loại
                  trên toàn bộ mô) — chỉ mang tính tham khảo, không tự điền vào lựa chọn bên dưới.
                </div>
              </div>
            )}
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
              {/* A null primary is "chưa chọn" until the doctor has actually saved
                  something — reading it as "Lành tính" on a form nobody has touched
                  states a negative finding on their behalf. Once a review exists, a
                  null really is their recorded benign call. */}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: primary || review ? 'var(--brand)' : 'var(--text-muted)' }}>
                {primary ? `${primary}+${secondary || 0}=${total}` : review ? 'Lành tính' : 'Chưa chọn'}
              </span>
            </div>
            <PatternPicker label="Primary" value={primary} onChange={setPrimary} disabled={locked} />
            <PatternPicker label="Secondary" value={secondary} onChange={setSecondary} disabled={locked} />
            <Input label="Vị trí sinh thiết" value={biopsyLocation} disabled={locked} onChange={(e) => setBiopsyLocation(e.target.value)} size="sm" />
            <Checkbox label="PNI (xâm lấn quanh thần kinh)" checked={pni} disabled={locked} onChange={(e) => setPni(e.target.checked)} />
            {pni && <textarea placeholder="Ghi chú PNI…" disabled={locked} value={pniNotes} onChange={(e) => setPniNotes(e.target.value)} rows={2} style={taStyle(locked)} />}
            <Checkbox label="LVI (xâm lấn mạch bạch huyết)" checked={lvi} disabled={locked} onChange={(e) => setLvi(e.target.checked)} />
            {lvi && <textarea placeholder="Ghi chú LVI…" disabled={locked} value={lviNotes} onChange={(e) => setLviNotes(e.target.value)} rows={2} style={taStyle(locked)} />}
            <Checkbox label="Cần hội chẩn (second opinion)" checked={needsSecondOpinion} disabled={locked} onChange={(e) => setNeedsSecondOpinion(e.target.checked)} />
            {needsSecondOpinion && <textarea placeholder="Lý do cần hội chẩn…" disabled={locked} value={secondOpinionNotes} onChange={(e) => setSecondOpinionNotes(e.target.value)} rows={2} style={taStyle(locked)} />}
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
