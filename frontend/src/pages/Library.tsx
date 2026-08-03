import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';

const FORMAT_OPTIONS = [{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }];
const SCOPE_OPTIONS = [{ value: 'all', label: 'Tất cả ca' }, { value: 'reviewed', label: 'Ca đã duyệt (đã xác nhận)' }];

export function Library({ token }: { token: string }) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [scope, setScope] = useState<'all' | 'reviewed'>('all');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await api.exportLibrary(token, format, scope);
      api.downloadBlob(blob, `prostaai_library_export.${format}`);
      setMessage({ kind: 'success', text: `Đã tải xuống prostaai_library_export.${format}.` });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof api.ApiError ? err.message : 'Xuất thư viện thất bại.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--blue-50)', color: 'var(--blue-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="folder-down" size={22} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0, color: 'var(--text-strong)' }}>Xuất thư viện dữ liệu</h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Đóng gói thông tin ca bệnh (ẩn danh) phục vụ huấn luyện / đánh giá model</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <Select label="Định dạng" options={FORMAT_OPTIONS} value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'json')} />
          <Select label="Phạm vi" options={SCOPE_OPTIONS} value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'reviewed')} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <Checkbox label="Ẩn danh hóa toàn bộ (loại bỏ Họ tên bệnh nhân)" checked readOnly />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--blue-50)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--blue-800)', marginBottom: 16 }}>
          <Icon name="info" size={15} /> Trường Họ tên bệnh nhân luôn bị loại bỏ khỏi file xuất, không thể tắt.
        </div>
        {message && (
          <div style={{ marginBottom: 12, fontSize: 13, color: message.kind === 'error' ? 'var(--red-600)' : 'var(--success)' }}>
            {message.text}
          </div>
        )}
        <Button variant="primary" iconLeft={<Icon name="download" />} fullWidth onClick={handleExport} disabled={busy}>
          {busy ? 'Đang xuất…' : 'Xuất thư viện'}
        </Button>
      </Card>
    </div>
  );
}
