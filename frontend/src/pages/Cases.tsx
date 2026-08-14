import { useState } from 'react';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { Badge } from '../components/ui/Badge';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { Icon } from '../lib/icon';
import { createdSince, hasHighGradeScore, startOfWeek } from '../lib/caseFilters';
import type { Case } from '../types';

const STATUS_OPTIONS = ['Tất cả trạng thái', 'Chờ duyệt', 'Đã duyệt', 'Đang xử lý', 'Mới'];
const STATUS_MAP: Record<string, Case['status']> = { 'Chờ duyệt': 'review', 'Đã duyệt': 'reviewed', 'Đang xử lý': 'processing', 'Mới': 'new' };
const STATUS_BADGE: Record<Case['status'], ['neutral' | 'brand' | 'success' | 'warning', string]> = {
  review: ['warning', 'Chờ duyệt'], reviewed: ['success', 'Đã duyệt'], processing: ['brand', 'Đang xử lý'], new: ['neutral', 'Mới'],
};

/** A filter chip that shows its own state: muted outline when off, the solid
 *  `Tag` with a clear-× when on. The mockup only ever had the "on" look, which
 *  read as a filter already applied. */
function FilterTag({ active, onToggle, children }: { active: boolean; onToggle: () => void; children: React.ReactNode }) {
  if (active) return <Tag onRemove={onToggle}>{children}</Tag>;
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '4px 10px', cursor: 'pointer',
        borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
        fontWeight: 500, background: 'var(--white)', color: 'var(--text-muted)',
        border: '1px solid var(--border-default)',
      }}
    >
      {children}
    </button>
  );
}

export function Cases({ cases, onOpenCase, onNewCase, onExportLibrary }: { cases: Case[]; onOpenCase: (c: Case) => void; onNewCase: () => void; onExportLibrary: () => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(STATUS_OPTIONS[0]);
  // These two were decorative chips rendered as if already active while
  // filtering nothing. They default to off now, and actually filter.
  const [highGrade, setHighGrade] = useState(false);
  const [thisWeek, setThisWeek] = useState(false);

  const weekStart = startOfWeek();
  const filtered = cases.filter((c) => {
    const okq = !q || (c.id + ' ' + c.hoTen + ' ' + c.maSo).toLowerCase().includes(q.toLowerCase());
    const oks = status === STATUS_OPTIONS[0] || c.status === STATUS_MAP[status];
    const okg = !highGrade || hasHighGradeScore(c);
    const okw = !thisWeek || createdSince(c, weekStart);
    return okq && oks && okg && okw;
  });

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 280 }}>
          <Input label="Tìm kiếm" iconLeft={<Icon name="search" />} placeholder="Mã số, họ tên bệnh nhân" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ width: 190 }}>
          <Select label="Trạng thái" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" iconLeft={<Icon name="folder-down" />} onClick={onExportLibrary}>Xuất thư viện</Button>
        <Button variant="primary" iconLeft={<Icon name="plus" />} onClick={onNewCase}>Thêm ca bệnh</Button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <FilterTag active={highGrade} onToggle={() => setHighGrade((v) => !v)}>Gleason ≥ 7</FilterTag>
        <FilterTag active={thisWeek} onToggle={() => setThisWeek((v) => !v)}>Tuần này</FilterTag>
        {highGrade && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Chỉ tính các ca đã có đánh giá xác nhận — ca chưa duyệt không có điểm để so sánh.
          </span>
        )}
      </div>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px 130px 120px 100px 90px', gap: 14, padding: '11px 18px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {['Mã số', 'Họ tên · Kết luận', 'Tuổi', 'ISUP (AI)', 'Trạng thái', 'Ngày tạo', ''].map((t, i) => <span key={i}>{t}</span>)}
        </div>
        {filtered.map((c) => {
          const [tone, label] = STATUS_BADGE[c.status];
          return (
            <div key={c.id} onClick={() => onOpenCase(c)} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px 130px 120px 100px 90px', gap: 14, padding: '13px 18px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue-800)', fontWeight: 600 }}>{c.id}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{c.hoTen}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ketLuan}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-body)' }}>{c.tuoi}</span>
              {/* ISUP Grade column — from Stage 3 ML fusion, available as soon as a
                  run completes. When no run has produced a Stage 3 result yet, show
                  '—'. The sub-label shows confidence so the doctor can gauge reliability. */}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {c.isupGrade != null ? (
                  <>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15,
                      color: c.isupGrade === 0 ? 'var(--gleason-benign)'
                           : c.isupGrade <= 2 ? 'var(--gleason-3)'
                           : c.isupGrade <= 3 ? 'var(--gleason-4)'
                           : 'var(--gleason-5)',
                    }}>Grade {c.isupGrade}</span>
                    {c.isupConfidence != null && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        AI {c.isupConfidence}%
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </span>
              <Badge tone={tone} dot>{label}</Badge>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.ngayTao}</span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Icon name="chevron-right" size={18} style={{ color: 'var(--gray-400)' }} /></span>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Không có ca nào khớp bộ lọc.</div>}
      </div>
    </div>
  );
}
