import { StateMessage } from '../components/ui/StateMessage';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';

export function Log({ token }: { token: string }) {
  const [logs] = useApiData(() => api.getLogs(token, 100), [token]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 160px 1fr 130px', gap: 14, padding: '11px 18px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {['Thời gian', 'Người dùng', 'Hành động · Chi tiết', 'Đối tượng'].map((t, i) => <span key={i}>{t}</span>)}
        </div>
        {logs.status !== 'data' && <StateMessage kind={logs.status === 'error' ? 'error' : 'loading'}>{logs.status === 'error' ? logs.message : undefined}</StateMessage>}
        {logs.status === 'data' && logs.data.length === 0 && <StateMessage kind="loading">Chưa có hoạt động nào được ghi nhận.</StateMessage>}
        {logs.status === 'data' && logs.data.map((l) => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '150px 160px 1fr 130px', gap: 14, padding: '13px 18px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center', fontSize: 13 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{l.created_at}</span>
            <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{l.username ?? 'Hệ thống'}</span>
            <div>
              <div style={{ color: 'var(--text-strong)' }}>{l.action}</div>
              {l.details && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.details}</div>}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue-800)' }}>
              {l.entity_type}{l.entity_id != null ? ` #${l.entity_id}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
