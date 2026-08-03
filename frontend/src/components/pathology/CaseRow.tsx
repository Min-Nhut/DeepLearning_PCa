import { useState, type HTMLAttributes } from 'react';
import { Badge, type BadgeTone } from '../ui/Badge';
import { GleasonChip } from './GleasonChip';
import type { GleasonPattern } from '../../types';

const statusTone: Record<string, BadgeTone> = { reviewed: 'success', review: 'warning', processing: 'brand', new: 'neutral' };
const statusLabel: Record<string, string> = { reviewed: 'Đã duyệt', review: 'Chờ duyệt', processing: 'Đang xử lý', new: 'Mới' };

export interface CaseRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  caseId: string;
  patient: string;
  gleason?: GleasonPattern | string;
  confidence?: number | null;
  status?: keyof typeof statusTone;
  date: string;
  selected?: boolean;
  onClick?: () => void;
}

export function CaseRow({ caseId, patient, gleason, confidence, status = 'new', date, selected = false, onClick, style, ...rest }: CaseRowProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: '150px 1fr 130px 90px 130px 110px', alignItems: 'center', gap: 16,
        padding: '12px 16px', cursor: 'pointer',
        background: selected ? 'var(--blue-50)' : hover ? 'var(--gray-50)' : 'var(--white)',
        borderLeft: `3px solid ${selected ? 'var(--blue-500)' : 'transparent'}`,
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background var(--dur-fast) var(--ease-standard)',
        ...style,
      }}
      {...rest}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--blue-800)', fontWeight: 500 }}>{caseId}</span>
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-strong)', fontWeight: 500 }}>{patient}</span>
      <span>{gleason ? <GleasonChip pattern={gleason} size="sm" showLabel={false} /> : <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>—</span>}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>{confidence != null ? `${confidence}%` : '—'}</span>
      <span><Badge tone={statusTone[status]} dot>{statusLabel[status]}</Badge></span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{date}</span>
    </div>
  );
}
