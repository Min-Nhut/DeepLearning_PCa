import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Icon } from '../lib/icon';
import { grade } from '../data/mock';
import prostaMark from '../assets/prosta-mark.png';
import type { Case } from '../types';

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{title}</h4>
      <p style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

export function Report({ case: c, onBack }: { case: Case; onBack: () => void }) {
  const total = (c.primary || 0) + (c.secondary || 0);
  const meta: [string, string][] = [
    ['Bệnh phẩm', 'Sinh thiết kim tuyến tiền liệt'], ['Nhuộm', 'H&E'], ['Bệnh nhân', c.hoTen],
    ['Ngày nhận', c.ngayTao], ['Phân tích bởi', 'ProstaAI v2.4'], ['Bác sĩ duyệt', 'BS. Nguyễn Lâm'],
  ];
  return (
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack}>Về trình xem</Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" iconLeft={<Icon name="printer" />}>In</Button>
          <Button variant="primary" size="sm" iconLeft={<Icon name="download" />}>Tải PDF</Button>
        </div>
      </div>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px', borderBottom: '2px solid var(--blue-900)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={prostaMark} alt="" style={{ height: 40, width: 40, objectFit: 'contain' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--blue-900)', letterSpacing: '-0.02em' }}>Prosta<span style={{ color: 'var(--blue-500)' }}>AI</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Phiếu kết quả hỗ trợ bởi AI</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-body)' }}>
            <div>{c.id}</div>
            <div style={{ color: 'var(--text-muted)' }}>{c.ngayTao}</div>
          </div>
        </div>
        <div style={{ padding: 28 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 24 }}>
            {meta.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{k}</div>
                <div style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius-md)', padding: '18px 22px', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--blue-700)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Điểm Gleason</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, color: 'var(--blue-900)', lineHeight: 1 }}>{c.primary ? `${c.primary}+${c.secondary}=${total}` : 'Lành tính'}</div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--blue-200)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--blue-700)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>ISUP Grade Group</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue-900)', fontFamily: 'var(--font-display)' }}>{c.primary ? 'Group ' + grade(c.primary, c.secondary) : '—'}</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <Badge tone="success" dot>Độ tin cậy AI {c.confidence ?? '—'}%</Badge>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.regionsCount} vùng · {c.tumorArea} u</span>
            </div>
          </div>
          <Section title="Vi thể (Microscopic findings)" body={`Ung thư biểu mô tuyến tiền liệt trên ${c.regionsCount} ổ. Phân đoạn tuyến bằng AI khoanh vùng tuyến ác tính với Gleason pattern chính ${c.primary ?? '—'} và phụ ${c.secondary ?? '—'}.`} />
          <Section title="Đánh giá hỗ trợ bởi AI" body={`ProstaAI phân loại ${c.regionsCount} vùng nghi ngờ (xem overlay). Tổng hợp Gleason ${c.primary ? `${c.primary}+${c.secondary}=${total}` : 'lành tính'}. Độ tin cậy model ${c.confidence ?? '—'}%.`} />
          <Section title="Nhận xét" body="Kết quả đã được bác sĩ xem xét và xác nhận. Đầu ra AI được dùng như công cụ hỗ trợ quyết định và không thay thế phán đoán của bác sĩ." />
          <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ width: 180, borderBottom: '1px solid var(--gray-400)', marginBottom: 6, height: 28 }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>BS. Nguyễn Lâm · Giải phẫu bệnh</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', maxWidth: 260, lineHeight: 1.5 }}>ProstaAI là công cụ hỗ trợ. Quyết định phân độ cuối cùng thuộc về bác sĩ.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
