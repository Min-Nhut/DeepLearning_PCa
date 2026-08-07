import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { StateMessage } from '../components/ui/StateMessage';
import { CaseRow } from '../components/pathology/CaseRow';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';
import type { Case, Nav } from '../types';

const PATTERN_COLOR: Record<string, string> = {
  'Lành tính': 'var(--gleason-benign)',
  'Pattern 3': 'var(--gleason-3)',
  'Pattern 4': 'var(--gleason-4)',
  'Pattern 5': 'var(--gleason-5)',
};

export function DoctorDashboard({ cases, token, onOpenCase, onGo, onGoResult }: {
  cases: Case[];
  token: string;
  onOpenCase: (c: Case) => void;
  onGo: (nav: Nav) => void;
  onGoResult: (imageId: number) => void;
}) {
  const recent = cases.slice(0, 5);
  const [flaggedState] = useApiData(() => api.getFlaggedReviews(token), [token]);
  const flagged = flaggedState.status === 'data' ? flaggedState.data : [];
  const [statsState] = useApiData(() => api.getDoctorStats(token), [token]);
  const stats = statsState.status === 'data' ? statsState.data : null;
  const distributionTotal = stats ? stats.pattern_distribution.reduce((sum, p) => sum + p.count, 0) : 0;
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label="Ca mới hôm nay" value={stats ? stats.new_cases_today : '—'} icon={<Icon name="microscope" />} />
        <StatCard label="Chờ duyệt" value={stats ? stats.pending_reviews : '—'} icon={<Icon name="clock" />} />
        <StatCard
          label="Độ tin cậy AI TB"
          value={stats?.avg_ai_confidence != null ? Math.round(stats.avg_ai_confidence) : '—'}
          unit={stats?.avg_ai_confidence != null ? '%' : undefined}
          icon={<Icon name="activity" />}
        />
        <StatCard label="Đã xác nhận" value={stats ? stats.confirmed_reviews : '—'} icon={<Icon name="file-check" />} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <Card padding="none">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', margin: 0, fontFamily: 'var(--font-display)' }}>Ca gần đây</h3>
            <Button variant="ghost" size="sm" iconRight={<Icon name="arrow-right" />} onClick={() => onGo('cases')}>Xem tất cả</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px 90px 130px 110px', gap: 16, padding: '10px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            <span>Mã ca</span><span>Bệnh nhân</span><span>Gleason</span><span>Tin cậy</span><span>Trạng thái</span><span>Ngày</span>
          </div>
          {recent.map((c) => (
            <CaseRow key={c.id} caseId={c.id} patient={c.hoTen} gleason={c.gleason || undefined} confidence={c.confidence ?? undefined} status={c.status} date={c.ngayTao.slice(0, 5)} onClick={() => onOpenCase(c)} />
          ))}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {flagged.length > 0 && (
            <Card padding="none">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
                <Icon name="users" size={16} style={{ color: 'var(--warning)' }} />
                <h3 style={{ fontSize: 'var(--text-base)', margin: 0, fontFamily: 'var(--font-display)' }}>Cần hội chẩn</h3>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{flagged.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {flagged.map((f) => (
                  <button
                    key={f.review_id}
                    onClick={() => onGoResult(f.image_id)}
                    style={{ textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border-subtle)', background: 'none', padding: '10px 18px', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                      <span>{f.case_label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{f.slide_label}</span>
                    </div>
                    {f.second_opinion_notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{f.second_opinion_notes}</div>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          )}
          <div style={{ background: 'linear-gradient(150deg, var(--blue-900), var(--blue-700))', borderRadius: 'var(--radius-lg)', padding: 22, color: '#fff', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="upload-cloud" size={22} />
            </div>
            <h3 style={{ color: '#fff', fontSize: 'var(--text-lg)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>Phân tích mới</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.82)', marginBottom: 16, lineHeight: 1.5 }}>Tải ảnh vi trường H&E để chạy phân đoạn tuyến và chấm điểm Gleason.</p>
            <Button variant="accent" fullWidth iconLeft={<Icon name="plus" />} onClick={() => onGo('upload')}>Tải ảnh lên</Button>
          </div>
          <Card>
            <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 12, fontFamily: 'var(--font-display)' }}>Phân bố mức độ</h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '-6px 0 12px' }}>Trên các đánh giá đã xác nhận</p>
            {!stats ? (
              <StateMessage kind={statsState.status === 'error' ? 'error' : 'loading'} />
            ) : distributionTotal === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Chưa có đánh giá nào được xác nhận.</div>
            ) : stats.pattern_distribution.map((p) => (
              <div key={p.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', marginBottom: 5 }}>
                  <span style={{ color: 'var(--text-body)' }}>{p.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{Math.round(p.percentage)}% ({p.count})</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'var(--gray-100)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: p.percentage + '%', background: PATTERN_COLOR[p.label], borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
