import { useEffect, useState } from 'react';
import { ApiError } from './api';

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'data'; data: T };

/** Shared load/error/data pattern for the read-mostly Admin screens. */
export function useApiData<T>(fetcher: () => Promise<T>, deps: unknown[]): [ApiState<T>, () => void] {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ status: 'data', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : 'Lỗi kết nối máy chủ.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  return [state, () => setReloadKey((k) => k + 1)];
}
