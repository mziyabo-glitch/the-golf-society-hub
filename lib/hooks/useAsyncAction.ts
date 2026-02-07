import { useCallback, useState } from "react";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

type AsyncActionResult = {
  loading: boolean;
  error: FormattedError | null;
  run: <T>(action: () => Promise<T>) => Promise<T | null>;
  reset: () => void;
};

export function useAsyncAction(): AsyncActionResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(formatError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { run, loading, error, reset };
}
