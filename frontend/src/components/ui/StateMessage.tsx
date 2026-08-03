import type { ReactNode } from 'react';

export function StateMessage({ kind, children }: { kind: 'loading' | 'error'; children?: ReactNode }) {
  const fallback = kind === 'loading' ? 'Đang tải…' : 'Đã xảy ra lỗi khi tải dữ liệu.';
  return (
    <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: kind === 'error' ? 'var(--red-600)' : 'var(--text-muted)' }}>
      {children ?? fallback}
    </div>
  );
}
