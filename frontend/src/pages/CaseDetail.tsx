import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { ImageThumb } from '../components/ImageThumb';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';
import type { Case } from '../types';

const MAX_SLIDES = 12;

export function CaseDetail({ case: c, token, onBack, onEdit, onGoResult, onGoUpload, onAnnotate, onReload, onCaseReport, onDeleteCase }: {
  case: Case;
  token: string;
  onBack: () => void;
  onEdit: (c: Case) => void;
  onGoResult: (imageDbId: number) => void;
  onGoUpload: (slideDbId?: number) => void;
  onAnnotate: (imageDbId: number) => void;
  onReload: () => void;
  onCaseReport: () => void;
  onDeleteCase: () => void;
}) {
  const [addingSlide, setAddingSlide] = useState(false);
  const [slideError, setSlideError] = useState<string | null>(null);
  const [busySlideId, setBusySlideId] = useState<number | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<number | null>(null);
  const [deletingCase, setDeletingCase] = useState(false);
  const meta: [string, string | number][] = [['Mã số', c.maSo], ['Mã năm', c.maNam], ['Họ tên bệnh nhân', c.hoTen], ['Tuổi', c.tuoi]];
  // Case-level Gleason (CAP protocol: 1 case can have up to 12 slides, but the
  // signed report is per-case, not per-slide) — computed live across every
  // confirmed diagnostic review in the case, see GET /api/cases/{id}/gleason.
  const [caseGleasonState] = useApiData(
    () => (c.dbId ? api.getCaseGleason(token, c.dbId) : Promise.resolve(null)),
    [c.dbId],
  );
  const caseGleason = caseGleasonState.status === 'data' ? caseGleasonState.data : null;

  async function handleAddSlide() {
    if (!c.dbId) {
      setSlideError('Ca bệnh chưa được lưu nên chưa thêm được slide.');
      return;
    }
    setAddingSlide(true);
    setSlideError(null);
    try {
      await api.addSlide(token, c.dbId);
      onReload();
    } catch (err) {
      // This used to swallow the error entirely, so a failed request looked
      // exactly like a button that does nothing — no message, no retry cue,
      // nothing to report. Whatever went wrong (server down, 12-slide cap,
      // expired session) is now stated on screen.
      setSlideError(err instanceof api.ApiError ? err.message : 'Không thể thêm slide — kiểm tra kết nối tới máy chủ.');
    } finally {
      setAddingSlide(false);
    }
  }

  async function handleMoveSlide(slideDbId: number, direction: 'up' | 'down') {
    setBusySlideId(slideDbId);
    setSlideError(null);
    try {
      await api.moveSlide(token, slideDbId, direction);
      onReload();
    } catch (err) {
      setSlideError(err instanceof api.ApiError ? err.message : 'Không đổi được thứ tự slide.');
    } finally {
      setBusySlideId(null);
    }
  }

  async function handleDeleteSlide(slideDbId: number, label: string, imageCount: number) {
    const warning = imageCount > 0
      ? `Xóa ${label}? ${imageCount} ảnh trong slide này cùng toàn bộ kết quả AI và vùng đánh dấu sẽ bị xóa.`
      : `Xóa ${label}?`;
    if (!window.confirm(warning)) return;
    setBusySlideId(slideDbId);
    setSlideError(null);
    try {
      await api.deleteSlide(token, slideDbId);
      onReload();
    } catch (err) {
      setSlideError(err instanceof api.ApiError ? err.message : 'Xóa slide thất bại.');
    } finally {
      setBusySlideId(null);
    }
  }

  async function handleDeleteImage(imageId: number) {
    if (!window.confirm('Xóa ảnh này? Kết quả AI và vùng đánh dấu liên quan cũng sẽ bị xóa.')) return;
    setDeletingImageId(imageId);
    try {
      await api.deleteImage(token, imageId);
      onReload();
    } catch {
      // best-effort — the image stays visible so the doctor can retry
    } finally {
      setDeletingImageId(null);
    }
  }

  async function handleDeleteCase() {
    const totalImages = c.slides.reduce((sum, s) => sum + s.images.length, 0);
    const warning = totalImages > 0
      ? `Xóa ca ${c.id} — ${c.hoTen}?\n\n${c.slides.length} slide và ${totalImages} ảnh cùng toàn bộ kết quả AI và vùng đánh dấu sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.`
      : `Xóa ca ${c.id} — ${c.hoTen}? Thao tác này không thể hoàn tác.`;
    if (!window.confirm(warning)) return;
    if (!c.dbId) return;
    setDeletingCase(true);
    try {
      await api.deleteCase(token, c.dbId);
      onDeleteCase();
    } catch (err) {
      setSlideError(err instanceof api.ApiError ? err.message : 'Xóa ca bệnh thất bại — kiểm tra kết nối tới máy chủ.');
    } finally {
      setDeletingCase(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack}>Danh sách ca</Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" iconLeft={<Icon name="pencil" />} onClick={() => onEdit(c)}>Sửa ca</Button>
          {/* Destructive action — separated visually from the non-destructive ones. */}
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Icon name={deletingCase ? 'loader-2' : 'trash-2'} style={deletingCase ? { animation: 'pa-spin 1s linear infinite' } : { color: 'var(--red-600)' }} />}
            onClick={handleDeleteCase}
            disabled={deletingCase || !c.dbId}
            style={{ color: 'var(--red-600)', borderColor: 'var(--red-300)' }}
          >
            {deletingCase ? 'Đang xóa…' : 'Xóa ca'}
          </Button>
          {/* The signed document is per case, not per image — see CaseReport.tsx. */}
          <Button variant="primary" size="sm" iconLeft={<Icon name="file-text" />} onClick={onCaseReport}>Phiếu kết quả ca</Button>
        </div>
      </div>
      <Card padding="none">
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--blue-800)', marginBottom: 2 }}>{c.id}</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: 0, color: 'var(--text-strong)' }}>{c.hoTen}</h2>
          </div>
          {/* Primary: ISUP Grade from Stage 3 AI — available as soon as a run
              completes, no doctor review needed. Secondary: confirmed Gleason
              aggregation (shown when the doctor has signed off on images). */}
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {c.isupGrade != null ? (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>ISUP Grade (AI)</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700,
                  color: c.isupGrade === 0 ? 'var(--gleason-benign)'
                       : c.isupGrade <= 2 ? 'var(--gleason-3)'
                       : c.isupGrade <= 3 ? 'var(--gleason-4)'
                       : 'var(--gleason-5)' }}>
                  Grade {c.isupGrade}
                </div>
                {c.isupConfidence != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Độ tin cậy AI: {c.isupConfidence}%</div>
                )}
              </div>
            ) : (
              <Badge tone="neutral">Chưa có kết quả AI</Badge>
            )}
            {/* Doctor-confirmed Gleason — only shown when at least one image is signed off */}
            {caseGleason && caseGleason.images_confirmed > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {caseGleason.primary_pattern != null ? (
                  <>
                    <Badge tone="success">Bác sĩ: {caseGleason.primary_pattern}+{caseGleason.secondary_pattern}={caseGleason.total_score}</Badge>
                    <GleasonChip pattern={String(caseGleason.primary_pattern)} />
                  </>
                ) : (
                  <Badge tone="success">Bác sĩ: Lành tính</Badge>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({caseGleason.images_confirmed}/{caseGleason.images_total} ảnh)</span>
              </div>
            )}
          </div>

        </div>
        <div style={{ padding: '16px 22px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          {meta.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{v || '—'}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 22px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Kết luận</div>
          <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.5 }}>{c.ketLuan || '—'}</div>
        </div>
      </Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0, color: 'var(--text-strong)' }}>{`Slide & Ảnh vi trường (${c.slides.length} slide)`}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tối đa {MAX_SLIDES} slide / ca · 8 ảnh / slide</span>
          <Button variant="secondary" size="sm" iconLeft={<Icon name="plus" />} onClick={handleAddSlide} disabled={addingSlide || c.slides.length >= MAX_SLIDES}>
            {addingSlide ? 'Đang thêm…' : 'Thêm slide mới'}
          </Button>
        </div>
      </div>
      {slideError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--white)', border: '1px solid var(--red-600)', color: 'var(--red-600)', fontSize: 13 }}>
          <Icon name="alert-triangle" size={15} /> {slideError}
        </div>
      )}
      {c.slides.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', fontSize: 13 }}>
          Chưa có slide nào. Bấm "Thêm slide mới" để bắt đầu.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {c.slides.map((s, i) => (
          <Card key={s.id} padding="none">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
              <Icon name="layers-3" size={18} style={{ color: 'var(--blue-600)' }} />
              <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{s.label}</span>
              <Badge tone="neutral">{s.images.length} ảnh</Badge>
              <div style={{ flex: 1 }} />
              <IconButton
                aria-label="Chuyển lên trên" title="Chuyển lên trên"
                disabled={i === 0 || busySlideId != null || !s.dbId}
                onClick={() => s.dbId && handleMoveSlide(s.dbId, 'up')}
              ><Icon name="chevron-up" size={16} /></IconButton>
              <IconButton
                aria-label="Chuyển xuống dưới" title="Chuyển xuống dưới"
                disabled={i === c.slides.length - 1 || busySlideId != null || !s.dbId}
                onClick={() => s.dbId && handleMoveSlide(s.dbId, 'down')}
              ><Icon name="chevron-down" size={16} /></IconButton>
              <IconButton
                aria-label="Xóa slide" title="Xóa slide"
                disabled={busySlideId != null || !s.dbId}
                onClick={() => s.dbId && handleDeleteSlide(s.dbId, s.label, s.images.length)}
              ><Icon name="trash-2" size={16} style={{ color: 'var(--red-600)' }} /></IconButton>
              <Button variant="ghost" size="sm" iconLeft={<Icon name="camera" />} onClick={() => onGoUpload(s.dbId)}>Chụp / Thêm ảnh</Button>
            </div>
            <div style={{ display: 'flex', gap: 12, padding: 16, flexWrap: 'wrap' }}>
              {s.images.map((im) => (
                <div key={im.id} style={{ width: 150 }}>
                  <div style={{ height: 100, position: 'relative' }}>
                    {im.dbId ? <ImageThumb imageId={im.dbId} token={token} /> : null}
                    {im.magnification && (
                      <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 999 }}>
                        {im.magnification}
                      </span>
                    )}
                    {im.dbId && (
                      <IconButton
                        label="Xóa ảnh"
                        size="sm"
                        disabled={deletingImageId === im.dbId}
                        onClick={() => handleDeleteImage(im.dbId!)}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,255,255,.9)', boxShadow: 'var(--shadow-sm)' }}
                      >
                        <Icon name={deletingImageId === im.dbId ? 'loader-2' : 'x'} size={14} style={deletingImageId === im.dbId ? { animation: 'pa-spin 1s linear infinite' } : undefined} />
                      </IconButton>
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)', marginTop: 6 }}>{im.id}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{im.desc || '—'}</div>
                  {im.dbId && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      <Button variant="ghost" size="sm" iconLeft={<Icon name="pencil" />} onClick={() => onAnnotate(im.dbId!)} fullWidth>
                        Đánh dấu
                      </Button>
                      <Button variant="ghost" size="sm" iconLeft={<Icon name="sparkles" />} onClick={() => onGoResult(im.dbId!)} fullWidth>
                        Kết quả AI
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={() => onGoUpload(s.dbId)} style={{ width: 150, height: 100, border: '2px dashed var(--border-default)', borderRadius: 'var(--radius-lg)', background: 'var(--gray-50)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}>
                <Icon name="plus" size={20} /> Thêm ảnh
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
