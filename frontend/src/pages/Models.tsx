import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { StateMessage } from '../components/ui/StateMessage';
import { Disclaimer } from '../components/Histology';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';

export function Models({ token }: { token: string }) {
  const [models] = useApiData(() => api.getModels(token), [token]);

  if (models.status !== 'data') {
    return <StateMessage kind={models.status === 'error' ? 'error' : 'loading'}>{models.status === 'error' ? models.message : undefined}</StateMessage>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
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
              <Button variant="secondary" size="sm" iconLeft={<Icon name="refresh-cw" />} style={{ marginTop: 6 }}>Tải lại checkpoint</Button>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 18 }}><Disclaimer /></div>
    </div>
  );
}
