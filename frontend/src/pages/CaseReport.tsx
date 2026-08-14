import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StateMessage } from '../components/ui/StateMessage';
import { GleasonChip } from '../components/pathology/GleasonChip';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';
import prostaMark from '../assets/prosta-mark.png';
import type { CaseReportImage } from '../types';

/**
 * The case-level report — the document a pathologist actually signs.
 *
 * Report.tsx covers a single image, but under the CAP protocol one case (up to
 * 12 slides) produces one report. Everything here comes from
 * GET /api/cases/{id}/report, which returns only **confirmed** reviews: a draft
 * is still an opinion in progress and has no place on a signed document. The
 * count of unsigned images is shown anyway, so nobody reads a partial report as
 * a complete one.
 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text-strong)' }}>{value}</div>
    </div>
  );
}

function findingLines(image: CaseReportImage): string[] {
  const lines: string[] = [];
  if (image.biopsy_location) lines.push(`Vị trí: ${image.biopsy_location}`);
  if (image.pni_present) lines.push(`PNI: có${image.pni_notes ? ` — ${image.pni_notes}` : ''}`);
  if (image.lvi_present) lines.push(`LVI: có${image.lvi_notes ? ` — ${image.lvi_notes}` : ''}`);
  if (image.tumor_length_mm != null) lines.push(`Chiều dài u: ${image.tumor_length_mm.toFixed(2)} mm`);
  if (image.cancer_area_percentage != null) lines.push(`Diện tích ung thư: ${image.cancer_area_percentage.toFixed(1)}%`);
  if (image.free_notes) lines.push(image.free_notes);
  return lines;
}

export function CaseReport({ token, caseId, onBack }: {
  token: string;
  caseId: number;
  onBack: () => void;
}) {
  const [state] = useApiData(() => api.getCaseReport(token, caseId), [token, caseId]);

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') return <StateMessage kind="error">{state.message}</StateMessage>;

  const report = state.data;
  const { gleason } = report;
  const unsigned = report.images_total - report.images.length;
  const caseLabel = `PA-${report.case_year ?? '----'}-${report.case_code.padStart(4, '0')}`;

  return (
    <div className="print-area" style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* These controls are screen-only — hidden automatically by @media print. */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack}>Về chi tiết ca</Button>
        <Button variant="secondary" size="sm" iconLeft={<Icon name="printer" />} onClick={() => window.print()}>In</Button>
      </div>

      <div className="print-card" style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px', borderBottom: '2px solid var(--blue-900)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={prostaMark} alt="" style={{ height: 40, width: 40, objectFit: 'contain' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--blue-900)' }}>Phiếu kết quả giải phẫu bệnh</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sinh thiết kim tuyến tiền liệt · Nhuộm H&amp;E</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-strong)' }}>{caseLabel}</div>
        </div>

        <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, borderBottom: '1px solid var(--border-subtle)' }}>
          <Field label="Mã số" value={report.case_code} />
          <Field label="Mã năm" value={report.case_year ?? '—'} />
          <Field label="Bệnh nhân" value={report.patient_name ?? '—'} />
          <Field label="Tuổi" value={report.patient_age != null ? String(report.patient_age) : '—'} />
        </div>

        {/* Aggregate first: this is the line the report is signed on. */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Kết luận toàn ca</div>
          {gleason.primary_pattern ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--brand)' }}>
                {gleason.primary_pattern}+{gleason.secondary_pattern}={gleason.total_score}
              </span>
              <GleasonChip pattern={String(gleason.primary_pattern) as '3' | '4' | '5'} />
            </div>
          ) : gleason.images_confirmed > 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, color: 'var(--gleason-benign)' }}>Lành tính</div>
          ) : (
            <Badge tone="neutral">Chưa có ảnh nào được xác nhận</Badge>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Tổng hợp từ {report.images.length}/{report.images_total} ảnh đã xác nhận
            {unsigned > 0 && ` · còn ${unsigned} ảnh chưa xác nhận, không tính vào kết luận này`}
          </div>
        </div>

        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Chi tiết từng mảnh sinh thiết</div>
          {report.images.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Chưa có ảnh nào được xác nhận — hãy xác nhận &amp; khóa kết quả từng ảnh trước khi in phiếu.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <th style={{ padding: '6px 8px 6px 0' }}>Slide</th>
                    <th style={{ padding: '6px 8px' }}>Ảnh</th>
                    <th style={{ padding: '6px 8px' }}>Gleason</th>
                    <th style={{ padding: '6px 8px' }}>Ghi nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {report.images.map((image) => (
                    <tr key={image.image_id} style={{ borderTop: '1px solid var(--border-subtle)', verticalAlign: 'top' }}>
                      <td style={{ padding: '10px 8px 10px 0', whiteSpace: 'nowrap' }}>
                        {image.slide_label}
                        {image.needs_second_opinion && (
                          <div style={{ marginTop: 4 }}><Badge tone="warning">Cần hội chẩn</Badge></div>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                        H{image.image_number}{image.magnification ? ` · ${image.magnification}` : ''}
                      </td>
                      <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                        {image.primary_pattern
                          ? `${image.primary_pattern}+${image.secondary_pattern}=${image.total_score}`
                          : 'Lành tính'}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-body)', lineHeight: 1.6 }}>
                        {findingLines(image).length > 0
                          ? findingLines(image).map((line) => <div key={line}>{line}</div>)
                          : '—'}
                        {image.needs_second_opinion && image.second_opinion_notes && (
                          <div style={{ color: 'var(--text-muted)' }}>Hội chẩn: {image.second_opinion_notes}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {report.conclusion && (
          <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Kết luận của bác sĩ</div>
            <p style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>{report.conclusion}</p>
          </div>
        )}

        {/* Named signers, not just a timestamp — a signed document has to say who. */}
        <div style={{ padding: '20px 28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 460, lineHeight: 1.6 }}>
            ProstaAI là công cụ hỗ trợ nghiên cứu, không phải thiết bị y tế được chứng nhận.
            Kết quả AI chỉ mang tính gợi ý; bác sĩ giải phẫu bệnh là người ra quyết định cuối cùng.
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Bác sĩ xác nhận</div>
            {report.signed_by.length > 0 ? (
              report.signed_by.map((name) => (
                <div key={name} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{name}</div>
              ))
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Chưa có</div>
            )}
            {report.images[0]?.confirmed_at && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                {report.images[0].confirmed_at}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
