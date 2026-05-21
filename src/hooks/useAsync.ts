import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Простой async-хук с loading/error/data.
 * Не нужен TanStack Query для MVP, но интерфейс совместимый,
 * если потом захотим заменить — отзеркалили `{ data, error, isLoading, refetch }`.
 */
export interface UseAsyncResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  options: { immediate?: boolean } = {},
): UseAsyncResult<T> {
  const { immediate = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setLoading] = useState(immediate);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (immediate) void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, isLoading, refetch };
}
