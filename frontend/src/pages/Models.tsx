import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { StateMessage } from '../components/ui/StateMessage';
import { Disclaimer } from '../components/Histology';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';

const MAGNIFICATIONS = ['4x', '10x', '20x', '40x'] as const;

function CalibrationSection({ token }: { token: string }) {
  const [calibration, reload] = useApiData(() => api.getCalibration(token), [token]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byMag = calibration.status === 'data'
    ? Object.fromEntries(calibration.data.map((c) => [c.magnification, c]))
    : {};

  async function handleSave(mag: string) {
    const raw = drafts[mag];
    const value = raw != null ? parseFloat(raw) : NaN;
    if (!value || value <= 0) {
      setError('Nhập một số µm/pixel hợp lệ (> 0).');
      return;
    }
    setSaving(mag);
    setError(null);
    try {
      await api.setCalibration(token, mag, value);
      setDrafts((d) => { const next = { ...d }; delete next[mag]; return next; });
      reload();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Lưu hiệu chỉnh thất bại.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <h3 style={{ fontSize: 'var(--text-lg)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>Hiệu chỉnh độ phóng đại (µm/pixel)</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Dùng cho công cụ đo khoảng cách trong Trình xem tiêu bản — đo bằng thước hiệu chuẩn
        thật (stage micrometer) trên kính hiển vi ở từng độ phóng đại, rồi nhập số µm ứng
        với 1 pixel tại đây. Bỏ trống nghĩa là "chưa hiệu chỉnh" cho độ phóng đại đó.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {MAGNIFICATIONS.map((mag) => {
          const existing = byMag[mag];
          const draft = drafts[mag];
          return (
            <div key={mag} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>{mag}</div>
              <input
                type="number" step="0.0001" min="0"
                placeholder={existing ? String(existing.um_per_pixel) : 'Chưa hiệu chỉnh'}
                value={draft ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [mag]: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 13, fontFamily: 'var(--font-mono)', marginBottom: 8 }}
              />
              <Button variant="secondary" size="sm" fullWidth disabled={saving === mag || draft == null || draft === ''} onClick={() => handleSave(mag)}>
                {saving === mag ? 'Đang lưu…' : 'Lưu'}
              </Button>
            </div>
          );
        })}
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

export function Models({ token }: { token: string }) {
  const [models, reloadModels] = useApiData(() => api.getModels(token), [token]);
  // Keyed by task_type/arch_key — each card reloads independently.
  const [reloading, setReloading] = useState<string | null>(null);
  const [reloaded, setReloaded] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);

  async function handleReload(taskType: string, archKey: string) {
    const key = `${taskType}/${archKey}`;
    setReloading(key);
    setReloadError(null);
    setReloaded(null);
    try {
      await api.reloadModel(token, taskType, archKey);
      setReloaded(key);
      // Availability is read from disk on every request, so refetching also
      // picks up a checkpoint that was added or removed since this page loaded.
      reloadModels();
    } catch (err) {
      setReloadError(err instanceof api.ApiError ? err.message : 'Tải lại checkpoint thất bại.');
    } finally {
      setReloading(null);
    }
  }

  if (models.status !== 'data') {
    return <StateMessage kind={models.status === 'error' ? 'error' : 'loading'}>{models.status === 'error' ? models.message : undefined}</StateMessage>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {reloadError && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{reloadError}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {models.data.map((m) => (
          <Card key={m.name} padding="none">
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--blue-50)', color: 'var(--blue-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="brain-circuit" size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>{m.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.task_label}</div>
              </div>
              {m.checkpoint_available
                ? <Badge tone="success" dot>Sẵn sàng</Badge>
                : <Badge tone="neutral" dot>Chưa có checkpoint</Badge>}
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              {m.metrics.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '10px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Chưa có số liệu đánh giá
                </div>
              ) : m.metrics.map((metric) => (
                <div key={metric.name} style={{ textAlign: 'center', padding: '10px 0', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--brand)', fontWeight: 500 }}>{metric.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{metric.name}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([['Encoder', m.encoder], ['Huấn luyện', m.trained_at || '—']] as const).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v}</span>
                </div>
              ))}
              <Button
                variant="secondary" size="sm" iconLeft={<Icon name="refresh-cw" />} style={{ marginTop: 6 }}
                disabled={reloading === `${m.task_type}/${m.arch_key}`}
                onClick={() => handleReload(m.task_type, m.arch_key)}
              >
                {reloading === `${m.task_type}/${m.arch_key}` ? 'Đang tải lại…' : 'Tải lại checkpoint'}
              </Button>
              {reloaded === `${m.task_type}/${m.arch_key}` && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Đã bỏ trọng số khỏi bộ nhớ — lần chạy tiếp theo sẽ đọc lại file checkpoint.
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 18 }}><CalibrationSection token={token} /></div>
      <div style={{ marginTop: 18 }}><Disclaimer /></div>
    </div>
  );
}
