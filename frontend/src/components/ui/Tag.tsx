import type { HTMLAttributes, ReactNode } from 'react';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
  onRemove?: () => void;
}

export function Tag({ children, onRemove, style, ...rest }: TagProps) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 10px',
        borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
        fontWeight: 500, background: 'var(--blue-50)', color: 'var(--blue-800)', border: '1px solid var(--blue-200)',
        ...style,
      }}
      {...rest}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, border: 'none', background: 'transparent', color: 'var(--blue-600)', cursor: 'pointer', borderRadius: 'var(--radius-xs)', padding: 0, fontSize: 13 }}
        >
          ×
        </button>
      )}
    </span>
  );
}
