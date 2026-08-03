import { useState } from 'react';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { Badge } from '../components/ui/Badge';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { Icon } from '../lib/icon';
import type { Case } from '../types';

const STATUS_OPTIONS = ['Tất cả trạng thái', 'Chờ duyệt', 'Đã duyệt', 'Đang xử lý', 'Mới'];
const STATUS_MAP: Record<string, Case['status']> = { 'Chờ duyệt': 'review', 'Đã duyệt': 'reviewed', 'Đang xử lý': 'processing', 'Mới': 'new' };
const STATUS_BADGE: Record<Case['status'], ['neutral' | 'brand' | 'success' | 'warning', string]> = {
  review: ['warning', 'Chờ duyệt'], reviewed: ['success', 'Đã duyệt'], processing: ['brand', 'Đang xử lý'], new: ['neutral', 'Mới'],
};

export function Cases({ cases, onOpenCase, onNewCase, onExportLibrary }: { cases: Case[]; onOpenCase: (c: Case) => void; onNewCase: () => void; onExportLibrary: () => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(STATUS_OPTIONS[0]);
  const filtered = cases.filter((c) => {
    const okq = !q || (c.id + ' ' + c.hoTen + ' ' + c.maSo).toLowerCase().includes(q.toLowerCase());
    const oks = status === STATUS_OPTIONS[0] || c.status === STATUS_MAP[status];
    return okq && oks;
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Tag onRemove={() => {}}>Gleason ≥ 7</Tag>
        <Tag onRemove={() => {}}>Tuần này</Tag>
      </div>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px 130px 120px 100px 90px', gap: 14, padding: '11px 18px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {['Mã số', 'Họ tên · Kết luận', 'Tuổi', 'Gleason', 'Trạng thái', 'Ngày tạo', ''].map((t, i) => <span key={i}>{t}</span>)}
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
              {c.gleason ? <GleasonChip pattern={c.gleason} size="sm" /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
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
