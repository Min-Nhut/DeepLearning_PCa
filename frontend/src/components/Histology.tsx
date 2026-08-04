import { Icon } from '../lib/icon';

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, margin: compact ? 0 : '18px 0 0', textAlign: compact ? 'center' : 'left', display: 'flex', gap: 6, alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start' }}>
      <Icon name="info" size={13} style={{ flexShrink: 0 }} />
      ProstaAI là công cụ hỗ trợ nghiên cứu (prototype), không phải thiết bị y tế đã kiểm định. Quyết định chẩn đoán cuối cùng thuộc về bác sĩ.
    </p>
  );
}
