import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { StateMessage } from '../components/ui/StateMessage';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';
import type { Nav } from '../types';

export function AdminDashboard({ token, onGo }: { token: string; onGo: (nav: Nav) => void }) {
  const [stats] = useApiData(() => api.getStats(token), [token]);
  const [logs] = useApiData(() => api.getLogs(token, 5), [token]);
  const [models] = useApiData(() => api.getModels(token), [token]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
        {stats.status === 'data' ? (
          <>
            <StatCard label="Tổng ca hệ thống" value={stats.data.total_cases} icon={<Icon name="database" />} />
            <StatCard label="Người dùng hoạt động" value={stats.data.active_users} icon={<Icon name="users" />} />
            <StatCard
              label="Thời gian xử lý TB"
              value={stats.data.avg_processing_seconds != null ? stats.data.avg_processing_seconds.toFixed(1) : '—'}
              unit="s"
              icon={<Icon name="timer" />}
            />
            <StatCard
              label="Tỷ lệ lỗi pipeline"
              value={stats.data.pipeline_error_rate != null ? (stats.data.pipeline_error_rate * 100).toFixed(1) : '—'}
              unit="%"
              icon={<Icon name="triangle-alert" />}
            />
          </>
        ) : (
          <div style={{ gridColumn: '1 / -1' }}><StateMessage kind={stats.status === 'error' ? 'error' : 'loading'}>{stats.status === 'error' ? stats.message : undefined}</StateMessage></div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <Card padding="none">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', margin: 0, fontFamily: 'var(--font-display)' }}>Hoạt động gần đây</h3>
            <Button variant="ghost" size="sm" iconRight={<Icon name="arrow-right" />} onClick={() => onGo('alog')}>Xem log</Button>
          </div>
          {logs.status !== 'data' && <StateMessage kind={logs.status === 'error' ? 'error' : 'loading'}>{logs.status === 'error' ? logs.message : undefined}</StateMessage>}
          {logs.status === 'data' && logs.data.length === 0 && <StateMessage kind="loading">Chưa có hoạt động nào.</StateMessage>}
          {logs.status === 'data' && logs.data.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--blue-50)', color: 'var(--blue-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="activity" size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-strong)' }}><strong>{l.username ?? 'Hệ thống'}</strong> · {l.action}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {l.entity_type}{l.entity_id != null ? ` #${l.entity_id}` : ''}{l.details ? ` · ${l.details}` : ''}
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l.created_at}</span>
            </div>
          ))}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 12, fontFamily: 'var(--font-display)' }}>Trạng thái Model AI</h3>
            {models.status !== 'data' && <StateMessage kind={models.status === 'error' ? 'error' : 'loading'}>{models.status === 'error' ? models.message : undefined}</StateMessage>}
            {models.status === 'data' && models.data.map((m) => (
              <div key={m.arch_key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.checkpoint_available ? 'var(--success)' : 'var(--gray-300)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.encoder}</div>
                </div>
                {m.checkpoint_available
                  ? <Badge tone="success">Sẵn sàng</Badge>
                  : <Badge tone="neutral">Chưa có</Badge>}
              </div>
            ))}
            <Button variant="secondary" size="sm" fullWidth iconLeft={<Icon name="brain-circuit" />} onClick={() => onGo('models')} style={{ marginTop: 12 }}>Chi tiết model</Button>
          </Card>
          <div style={{ background: 'linear-gradient(150deg, var(--blue-900), var(--blue-700))', borderRadius: 'var(--radius-lg)', padding: 22, color: '#fff', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="database-zap" size={22} />
            </div>
            <h3 style={{ color: '#fff', fontSize: 'var(--text-lg)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>Di trú dữ liệu</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.82)', marginBottom: 16, lineHeight: 1.5 }}>Nhập dữ liệu Ca → Slide → Ảnh từ hệ thống desktop cũ, kèm ẩn danh hóa.</p>
            <Button variant="accent" fullWidth iconLeft={<Icon name="import" />} onClick={() => onGo('migration')}>Mở công cụ di trú</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
