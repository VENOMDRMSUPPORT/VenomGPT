import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

interface OptimizeState {
  isOptimizing: boolean;
  optimizedResult: string | null;
  error: string | null;
}

interface UseOptimizePromptReturn extends OptimizeState {
  optimize: (prompt: string) => Promise<void>;
  clearResult: () => void;
}

export function useOptimizePrompt(): UseOptimizePromptReturn {
  const [state, setState] = useState<OptimizeState>({
    isOptimizing: false,
    optimizedResult: null,
    error: null,
  });

  const optimize = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setState({ isOptimizing: true, optimizedResult: null, error: null });

    try {
      const response = await fetch(`${API_BASE}/api/prompt/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const data = await response.json() as { optimized?: string; message?: string; error?: string };

      if (!response.ok) {
        setState({
          isOptimizing: false,
          optimizedResult: null,
          error: data.message ?? 'Optimization failed. Please try again.',
        });
        return;
      }

      if (!data.optimized) {
        setState({
          isOptimizing: false,
          optimizedResult: null,
          error: 'Optimization returned an empty result.',
        });
        return;
      }

      setState({ isOptimizing: false, optimizedResult: data.optimized, error: null });
    } catch (err) {
      setState({
        isOptimizing: false,
        optimizedResult: null,
        error: err instanceof Error ? err.message : 'Network error during optimization.',
      });
    }
  }, []);

  const clearResult = useCallback(() => {
    setState((prev) => ({ ...prev, optimizedResult: null, error: null }));
  }, []);

  return {
    isOptimizing: state.isOptimizing,
    optimizedResult: state.optimizedResult,
    error: state.error,
    optimize,
    clearResult,
  };
}
