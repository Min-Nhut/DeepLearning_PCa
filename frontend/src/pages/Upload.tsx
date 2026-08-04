import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { IconButton } from '../components/ui/IconButton';
import { ImageThumb } from '../components/ImageThumb';
import { Disclaimer } from '../components/Histology';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import type { Case } from '../types';

const MAX_IMAGES_PER_SLIDE = 8;
const NEW_SLIDE_VALUE = '__new__';
// Keep in sync with backend/app/routers/cases.py's MAX_UPLOAD_BYTES — this just
// avoids a pointless network round-trip for a file the server will reject anyway.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

interface SlideOption { dbId: number; label: string; imageCount: number }
interface UploadedImage { dbId: number; label: string }

export function Upload({
  token, cases, initialCaseDbId, initialSlideDbId, onReload, onGoPipeline,
}: {
  token: string;
  cases: Case[];
  initialCaseDbId?: number;
  initialSlideDbId?: number;
  onReload: () => void;
  onGoPipeline: (imageId: number, caseId: string) => void;
}) {
  const [selectedCaseId, setSelectedCaseId] = useState<number | ''>(initialCaseDbId ?? '');
  const [slides, setSlides] = useState<SlideOption[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState<number | ''>('');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastImageId, setLastImageId] = useState<number | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<number | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Populate the slide picker whenever the selected case changes.
  useEffect(() => {
    const c = cases.find((cc) => cc.dbId === selectedCaseId);
    const opts = (c?.slides ?? []).filter((s) => s.dbId != null).map((s) => ({ dbId: s.dbId as number, label: s.label, imageCount: s.images.length }));
    setSlides(opts);
    const wanted = initialSlideDbId && opts.some((o) => o.dbId === initialSlideDbId) ? initialSlideDbId : (opts[0]?.dbId ?? '');
    setSelectedSlideId(wanted);
    // Only re-run when the case selection itself changes — `cases` updates on
    // every reload and would otherwise reset the user's slide pick mid-upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaseId]);

  // Populate the already-uploaded image strip for the selected slide.
  useEffect(() => {
    const c = cases.find((cc) => cc.dbId === selectedCaseId);
    const s = c?.slides.find((ss) => ss.dbId === selectedSlideId);
    setImages((s?.images ?? []).filter((im) => im.dbId != null).map((im) => ({ dbId: im.dbId as number, label: im.id })));
  }, [selectedCaseId, selectedSlideId, cases]);

  // Camera lifecycle — request the microscope camera (any UVC-class webcam
  // device the OS exposes) once on mount, release it on unmount.
  useEffect(() => {
    let active = true;
    let mediaStream: MediaStream | null = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Trình duyệt này không hỗ trợ truy cập camera (cần HTTPS hoặc localhost).');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } } })
      .then((s) => {
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        mediaStream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCameraReady(true);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError('Không tìm thấy camera nào được kết nối với máy.');
        } else if (name === 'NotAllowedError' || name === 'SecurityError') {
          setCameraError('Chưa được cấp quyền truy cập camera.');
        } else {
          setCameraError('Không thể mở camera trên trình duyệt này.');
        }
      });

    return () => {
      active = false;
      mediaStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function ensureSlide(): Promise<number | null> {
    if (selectedSlideId) return selectedSlideId as number;
    if (!selectedCaseId) { setError('Chọn ca bệnh trước khi lưu ảnh.'); return null; }
    try {
      const s = await api.addSlide(token, selectedCaseId as number);
      setSlides((prev) => [...prev, { dbId: s.id, label: `Slide ${s.slide_number}`, imageCount: 0 }]);
      setSelectedSlideId(s.id);
      onReload();
      return s.id;
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Không thể tạo slide mới.');
      return null;
    }
  }

  async function saveImage(file: File | Blob, source: 'upload' | 'live_capture') {
    setError(null);
    if (images.length >= MAX_IMAGES_PER_SLIDE) {
      setError(`Slide này đã đạt giới hạn ${MAX_IMAGES_PER_SLIDE} ảnh.`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File quá lớn (${(file.size / (1024 * 1024)).toFixed(0)}MB) — giới hạn ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    const slideId = await ensureSlide();
    if (!slideId) return;
    setBusy(true);
    try {
      const img = await api.uploadImage(token, slideId, file, { description: description || undefined, source, filename: source === 'live_capture' ? 'capture.jpg' : undefined });
      setImages((prev) => [...prev, { dbId: img.id, label: `H${img.image_number}` }]);
      setSlides((prev) => prev.map((s) => (s.dbId === slideId ? { ...s, imageCount: s.imageCount + 1 } : s)));
      setLastImageId(img.id);
      onReload();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Lưu ảnh thất bại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteImage(imageId: number) {
    if (!window.confirm('Xóa ảnh này? Kết quả AI và vùng đánh dấu liên quan cũng sẽ bị xóa.')) return;
    setDeletingImageId(imageId);
    try {
      await api.deleteImage(token, imageId);
      setImages((prev) => prev.filter((im) => im.dbId !== imageId));
      setSlides((prev) => prev.map((s) => (s.dbId === selectedSlideId ? { ...s, imageCount: Math.max(0, s.imageCount - 1) } : s)));
      if (lastImageId === imageId) setLastImageId(null);
      onReload();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Xóa ảnh thất bại.');
    } finally {
      setDeletingImageId(null);
    }
  }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) saveImage(blob, 'live_capture'); }, 'image/jpeg', 0.92);
  }

  const currentCase = cases.find((c) => c.dbId === selectedCaseId);
  const caseOptions = [{ value: '', label: 'Chọn ca bệnh…' }, ...cases.filter((c) => c.dbId != null).map((c) => ({ value: String(c.dbId), label: `${c.id} · ${c.hoTen}` }))];
  const slideOptions = [...slides.map((s) => ({ value: String(s.dbId), label: `${s.label} (${s.imageCount} ảnh)` })), { value: NEW_SLIDE_VALUE, label: '+ Slide mới' }];

  return (
    <div style={{ padding: 24, maxWidth: 1120, margin: '0 auto' }}>
      <Card padding="none" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          <Icon name="camera" size={18} style={{ color: 'var(--blue-600)' }} />
          <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>Chụp / tải ảnh vi trường</span>
          <div style={{ width: 230 }}>
            <Select size="sm" options={caseOptions} value={String(selectedCaseId)} onChange={(e) => setSelectedCaseId(e.target.value ? Number(e.target.value) : '')} />
          </div>
          <div style={{ width: 170 }}>
            <Select
              size="sm"
              options={slideOptions}
              value={String(selectedSlideId)}
              disabled={!selectedCaseId}
              onChange={(e) => { if (e.target.value === NEW_SLIDE_VALUE) ensureSlide(); else setSelectedSlideId(Number(e.target.value)); }}
            />
          </div>
          {currentCase && <Badge tone="neutral">{currentCase.id}</Badge>}
          <div style={{ flex: 1 }} />
          <input ref={fileInputRef} type="file" accept="image/*,.tif,.tiff" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) saveImage(f, 'upload'); e.target.value = ''; }} />
          <Button variant="secondary" size="sm" iconLeft={<Icon name="image-plus" />} onClick={() => fileInputRef.current?.click()}>Tải tệp có sẵn (JPG/PNG/TIFF)</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="accent" fullWidth iconLeft={<Icon name="aperture" />} onClick={handleCapture} disabled={!cameraReady || busy}>Lưu</Button>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)' }}>Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Vị trí sinh thiết, đặc điểm quan sát được…"
              rows={8}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontFamily: 'var(--font-sans)', fontSize: 13, resize: 'vertical' }}
            />
          </div>
          <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#111', minHeight: 300 }}>
            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: 300, objectFit: 'cover', display: cameraReady ? 'block' : 'none' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {!cameraReady && (
              <div style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--gray-300)', fontSize: 13, textAlign: 'center', padding: '0 24px' }}>
                <Icon name="camera-off" size={26} />
                {cameraError ?? 'Đang kết nối camera…'}
                {cameraError && <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Vẫn có thể tải ảnh có sẵn từ nút bên trên.</span>}
              </div>
            )}
            {cameraReady && (
              <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(211,59,59,.9)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} /> LIVE · Camera kính hiển vi
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Ảnh đã lưu cho slide này — tối đa {MAX_IMAGES_PER_SLIDE} ảnh / slide</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {Array.from({ length: MAX_IMAGES_PER_SLIDE }, (_, i) => {
              const im = images[i];
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{im ? im.label : `Hình ${i + 1}`}</div>
                  {im ? (
                    <div style={{ height: 82, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)', position: 'relative' }}>
                      <ImageThumb imageId={im.dbId} token={token} />
                      <IconButton
                        label="Xóa ảnh"
                        size="sm"
                        disabled={deletingImageId === im.dbId}
                        onClick={() => handleDeleteImage(im.dbId)}
                        style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(255,255,255,.9)', boxShadow: 'var(--shadow-sm)', width: 24, height: 24 }}
                      >
                        <Icon name={deletingImageId === im.dbId ? 'loader-2' : 'x'} size={13} style={deletingImageId === im.dbId ? { animation: 'pa-spin 1s linear infinite' } : undefined} />
                      </IconButton>
                    </div>
                  ) : (
                    <div style={{ height: 82, borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-default)', background: 'var(--gray-50)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11 }}>
                      <Icon name="image-off" size={18} /> No image data
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      {error && <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--red-600)' }}>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--blue-50)', color: 'var(--blue-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="sparkles" size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>Sẵn sàng phân tích</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{images.length} / {MAX_IMAGES_PER_SLIDE} ảnh đã lưu · Segmentation → Classification → Tổng hợp Gleason</div>
        </div>
        <Button
          variant="accent" iconRight={<Icon name="arrow-right" />}
          disabled={!currentCase || !lastImageId}
          onClick={() => currentCase && lastImageId && onGoPipeline(lastImageId, currentCase.id)}
        >
          Chạy phân tích AI trên ảnh vừa lưu
        </Button>
      </div>
      <div style={{ marginTop: 14 }}><Disclaimer /></div>
    </div>
  );
}
