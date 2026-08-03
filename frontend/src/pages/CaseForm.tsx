import { useState } from 'react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { caseFromApi } from '../lib/caseAdapter';
import type { Case } from '../types';

export function CaseForm({ editing, token, onCancel, onSaved }: {
  editing: Case;
  token: string;
  onCancel: () => void;
  onSaved: (saved: Case) => void;
}) {
  const [draft, setDraft] = useState<Case>(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !editing.dbId;
  const set = <K extends keyof Case>(k: K, v: Case[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function handleSave() {
    if (!draft.maSo.trim()) {
      setError('Cần nhập Mã số.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      case_code: draft.maSo.trim(),
      case_year: draft.maNam || undefined,
      patient_name: draft.hoTen || undefined,
      patient_age: draft.tuoi === '' ? undefined : Number(draft.tuoi),
      conclusion: draft.ketLuan || undefined,
    };
    try {
      const saved = draft.dbId
        ? await api.updateCase(token, draft.dbId, payload)
        : await api.createCase(token, payload);
      onSaved(caseFromApi(saved));
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Không thể lưu ca bệnh.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
      <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onCancel}>Quay lại</Button>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '10px 0 20px', color: 'var(--text-strong)' }}>
        {isNew ? 'Thêm ca bệnh mới' : 'Sửa ca bệnh ' + draft.id}
      </h1>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Input label="Mã số" value={draft.maSo} onChange={(e) => set('maSo', e.target.value)} placeholder="0143" />
          <Input label="Mã năm" value={draft.maNam} onChange={(e) => set('maNam', e.target.value)} placeholder="2026" />
          <Input label="Họ tên bệnh nhân" value={draft.hoTen} onChange={(e) => set('hoTen', e.target.value)} placeholder="Nguyễn Văn ..." />
          <Input label="Tuổi" value={draft.tuoi} onChange={(e) => set('tuoi', e.target.value === '' ? '' : Number(e.target.value))} placeholder="65" />
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', display: 'block', marginBottom: 6 }}>Kết luận (chẩn đoán tổng hợp)</label>
          <textarea
            value={draft.ketLuan}
            onChange={(e) => set('ketLuan', e.target.value)}
            rows={3}
            placeholder="Ví dụ: Adenocarcinoma tuyến tiền liệt, Gleason 3+4=7…"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 12px', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-body)', resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, padding: 12, background: 'var(--blue-50)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--blue-800)' }}>
          <Icon name="info" size={15} />
          {isNew
            ? 'Sau khi lưu, mở ca bệnh để thêm Slide và chụp/tải ảnh vi trường.'
            : 'Cấu trúc dữ liệu: Ca bệnh → Slide → Ảnh. Quản lý Slide/Ảnh từ màn Chi tiết ca bệnh.'}
        </div>
        {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--red-600)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <Button variant="ghost" onClick={onCancel}>Hủy</Button>
          <Button variant="primary" iconLeft={<Icon name="check" />} onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu ca bệnh'}</Button>
        </div>
      </Card>
    </div>
  );
}
