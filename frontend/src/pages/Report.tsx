import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StateMessage } from '../components/ui/StateMessage';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';
import prostaMark from '../assets/prosta-mark.png';

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{title}</h4>
      <p style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

export function Report({ token, imageId, caseLabel, patientName, onBack }: {
  token: string;
  imageId: number;
  caseLabel?: string;
  patientName?: string;
  onBack: () => void;
}) {
  const [reviewState] = useApiData(() => api.getReview(token, imageId), [token, imageId]);
  const [runState] = useApiData(() => api.getInference(token, imageId), [token, imageId]);

  if (reviewState.status === 'loading' || runState.status === 'loading') return <StateMessage kind="loading" />;
  if (reviewState.status === 'error') return <StateMessage kind="error">{reviewState.message}</StateMessage>;

  const review = reviewState.data;
  const clf = runState.status === 'data' ? runState.data?.classification : null;

  if (!review) {
    return (
      <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
        <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack}>Về trình xem</Button>
        <StateMessage kind="error">Chưa có đánh giá nào cho ảnh này — hãy lưu kết quả đánh giá trước khi xem báo cáo.</StateMessage>
      </div>
    );
  }

  const total = (review.primary_pattern || 0) + (review.secondary_pattern || 0);
  const meta: [string, string][] = [
    ['Bệnh phẩm', 'Sinh thiết kim tuyến tiền liệt'], ['Nhuộm', 'H&E'],
    ...(patientName ? [['Bệnh nhân', patientName] as [string, string]] : []),
    ['Vị trí sinh thiết', review.biopsy_location || '—'],
    ['Trạng thái', review.status === 'confirmed' ? 'Đã xác nhận' : 'Bản nháp'],
  ];

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack}>Về trình xem</Button>
        <Button variant="secondary" size="sm" iconLeft={<Icon name="printer" />} onClick={() => window.print()}>In</Button>
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
            <div>{caseLabel || `#image-${imageId}`}</div>
            <div style={{ color: 'var(--text-muted)' }}>{review.updated_at}</div>
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
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, color: 'var(--blue-900)', lineHeight: 1 }}>{review.primary_pattern ? `${review.primary_pattern}+${review.secondary_pattern}=${total}` : 'Lành tính'}</div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--blue-200)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--blue-700)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>ISUP Grade Group</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue-900)', fontFamily: 'var(--font-display)' }}>{review.grade_group ? 'Group ' + review.grade_group : '—'}</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <Badge tone="success" dot>Độ tin cậy AI {clf?.primary_confidence != null ? `${Math.round(clf.primary_confidence)}%` : '—'}</Badge>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{review.cancer_area_percentage != null ? `${review.cancer_area_percentage.toFixed(1)}% diện tích ung thư` : 'Chưa có diện tích ung thư'}</span>
            </div>
          </div>
          <Section
            title="Vi thể (Microscopic findings)"
            body={`Phân đoạn mô bằng AI với Gleason pattern chính ${review.primary_pattern ?? '—'} và phụ ${review.secondary_pattern ?? '—'}.${review.pni_present ? ' Ghi nhận xâm lấn quanh thần kinh (PNI).' : ''}${review.lvi_present ? ' Ghi nhận xâm lấn mạch bạch huyết (LVI).' : ''}`}
          />
          {(review.pni_notes || review.lvi_notes) && (
            <Section title="Ghi chú PNI/LVI" body={[review.pni_notes, review.lvi_notes].filter(Boolean).join(' — ')} />
          )}
          <Section title="Nhận xét" body={review.free_notes || 'Kết quả đã được bác sĩ xem xét. Đầu ra AI được dùng như công cụ hỗ trợ quyết định và không thay thế phán đoán của bác sĩ.'} />
          <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ width: 180, borderBottom: '1px solid var(--gray-400)', marginBottom: 6, height: 28 }} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {review.status === 'confirmed' ? `Đã xác nhận · ${review.confirmed_at || ''}` : 'Chữ ký bác sĩ phụ trách'}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', maxWidth: 260, lineHeight: 1.5 }}>ProstaAI là công cụ hỗ trợ. Quyết định phân độ cuối cùng thuộc về bác sĩ.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
