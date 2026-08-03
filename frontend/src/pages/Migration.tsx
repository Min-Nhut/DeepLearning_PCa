import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import type { MigrationImportResult, MigrationPreview } from '../types';

const STEPS: [string, string, string][] = [
  ['Kết nối nguồn', 'Chọn file CSV xuất từ hệ thống desktop', 'database'],
  ['Ánh xạ trường', 'Ca bệnh → Slide → Ảnh', 'git-compare-arrows'],
  ['Ẩn danh hóa', 'Loại bỏ Họ tên, giữ mã ẩn danh', 'shield-off'],
  ['Nhập dữ liệu', 'Ghi vào SQLite', 'import'],
];

export function Migration({ token, onFinish }: { token: string; onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [anonymize, setAnonymize] = useState(true);
  const [confirmedPermission, setConfirmedPermission] = useState(false);
  const [result, setResult] = useState<MigrationImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChosen(f: File) {
    setFile(f);
    setError(null);
    setBusy(true);
    try {
      const p = await api.migrationPreview(token, f);
      setPreview(p);
      setStep(1);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Không đọc được file CSV.');
    } finally {
      setBusy(false);
    }
  }

  function handleBack() {
    if (step === 1) { setFile(null); setPreview(null); }
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.migrationImport(token, file, anonymize);
      setResult(r);
      setStep(3);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Nhập dữ liệu thất bại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 4, borderRadius: 999, background: i <= step ? 'var(--blue-600)' : 'var(--gray-200)', marginBottom: 8 }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: i <= step ? 'var(--blue-800)' : 'var(--text-muted)' }}>{s[0]}</div>
          </div>
        ))}
      </div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--blue-50)', color: 'var(--blue-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={STEPS[step][2]} size={22} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0, color: 'var(--text-strong)' }}>Bước {step + 1}: {STEPS[step][0]}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{STEPS[step][1]}</div>
          </div>
        </div>

        {step === 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--blue-50)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--blue-800)', marginBottom: 14 }}>
              <Icon name="info" size={15} /> Chưa có kết nối trực tiếp tới database hệ thống desktop cũ — hãy xuất dữ liệu ra file CSV (cột: Mã số, Mã năm, Họ tên, Tuổi, Kết Luận) rồi tải lên đây.
            </div>
            <label
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                height: 130, border: '2px dashed var(--border-default)', borderRadius: 'var(--radius-lg)',
                background: 'var(--gray-50)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
              }}
            >
              <Icon name="upload" size={22} />
              {file ? file.name : 'Bấm để chọn file CSV'}
              <input
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChosen(f); }}
              />
            </label>
            {busy && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>Đang đọc file…</div>}
          </div>
        )}

        {step === 1 && preview && (
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 10, color: 'var(--text-body)' }}>
              Phát hiện <strong>{preview.row_count}</strong> dòng dữ liệu, <strong>{preview.columns.length}</strong> cột.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {Object.entries(preview.field_mapping).map(([column, field]) => (
                <div key={column} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                  <Icon name="check" size={15} style={{ color: 'var(--success)' }} /> {column} → {field}
                </div>
              ))}
            </div>
            {preview.unmapped_columns.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                Cột không dùng: {preview.unmapped_columns.join(', ')}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'var(--warning-soft)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--warning)' }}>
              <Icon name="triangle-alert" size={16} /> Dữ liệu bệnh nhân thật — bắt buộc ẩn danh trước khi dùng cho huấn luyện/demo.
            </div>
            <Checkbox label="Loại bỏ Họ tên bệnh nhân (giữ mã ca ẩn danh)" checked={anonymize} onChange={(e) => setAnonymize(e.target.checked)} />
            <Checkbox label="Đã xác nhận quyền sử dụng dữ liệu với cơ sở y tế" checked={confirmedPermission} onChange={(e) => setConfirmedPermission(e.target.checked)} />
          </div>
        )}

        {step === 3 && result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              <Icon name="check-circle" size={18} /> Đã nhập {result.imported} ca, bỏ qua {result.skipped}.
            </div>
            {result.skipped_reasons.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text-muted)' }}>
                {result.skipped_reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        )}

        {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--red-600)' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
          <Button variant="ghost" disabled={step === 0 || busy} onClick={handleBack}>Quay lại</Button>
          {step === 1 && <Button variant="primary" iconRight={<Icon name="arrow-right" />} onClick={() => setStep(2)}>Tiếp tục</Button>}
          {step === 2 && (
            <Button variant="primary" iconRight={<Icon name="arrow-right" />} disabled={!confirmedPermission || busy} onClick={handleImport}>
              {busy ? 'Đang nhập…' : 'Nhập dữ liệu'}
            </Button>
          )}
          {step === 3 && <Button variant="accent" iconLeft={<Icon name="check" />} onClick={onFinish}>Xong</Button>}
        </div>
      </Card>
    </div>
  );
}
