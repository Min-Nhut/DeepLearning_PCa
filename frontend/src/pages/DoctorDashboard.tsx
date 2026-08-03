import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { CaseRow } from '../components/pathology/CaseRow';
import { Icon } from '../lib/icon';
import type { Case, Nav } from '../types';

const DISTRIBUTION: [string, number, string][] = [
  ['Lành tính', 42, 'var(--gleason-benign)'],
  ['Pattern 3', 31, 'var(--gleason-3)'],
  ['Pattern 4', 19, 'var(--gleason-4)'],
  ['Pattern 5', 8, 'var(--gleason-5)'],
];

export function DoctorDashboard({ cases, onOpenCase, onGo }: { cases: Case[]; onOpenCase: (c: Case) => void; onGo: (nav: Nav) => void }) {
  const recent = cases.slice(0, 5);
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label="Ca hôm nay" value="24" delta="+6 so với hôm qua" deltaDir="up" icon={<Icon name="microscope" />} />
        <StatCard label="Chờ duyệt" value="7" delta="3 ưu tiên cao" deltaDir="flat" icon={<Icon name="clock" />} />
        <StatCard label="Độ tin cậy AI TB" value="88" unit="%" delta="+2% tuần này" deltaDir="up" icon={<Icon name="activity" />} />
        <StatCard label="Báo cáo đã xuất" value="19" delta="Tuần này" deltaDir="flat" icon={<Icon name="file-check" />} />
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
            {DISTRIBUTION.map(([l, pct, col]) => (
              <div key={l} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', marginBottom: 5 }}>
                  <span style={{ color: 'var(--text-body)' }}>{l}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{pct}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'var(--gray-100)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: pct + '%', background: col, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
