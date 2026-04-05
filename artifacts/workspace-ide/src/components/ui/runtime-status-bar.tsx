/**
 * runtime-status-bar.tsx — Persistent dev-server port status indicator.
 *
 * Polls /api/runtime/status every 10 seconds via the typed React Query hook
 * (generated from OpenAPI) and renders:
 *   • Port chips for each open port (with label if known, e.g. ":5173 Vite")
 *   • "No preview detected" when no ports are open
 *   • "Status unknown" when the backend is unreachable
 *
 * Never invents labels — only shows labels confirmed by the backend response.
 * Provides an imperative `triggerRecheckRuntime` function (exported) that
 * allows other components (e.g., CheckpointCard post-apply) to force an
 * immediate re-probe without waiting for the polling interval.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetRuntimeStatus, getGetRuntimeStatusQueryKey } from '@workspace/api-client-react';
import { Radio, Wifi, WifiOff } from 'lucide-react';

// ─── Global recheck callback registry ────────────────────────────────────────
// Allows CheckpointCard to trigger an immediate re-probe by calling
// triggerRecheckRuntime() without prop drilling.

type RecheckCallback = () => void;
let globalRecheckCallback: RecheckCallback | null = null;

export function triggerRecheckRuntime(): void {
  globalRecheckCallback?.();
}

// ─── Polling interval ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

// ─── Component ───────────────────────────────────────────────────────────────

export function RuntimeStatusBar() {
  const queryClient = useQueryClient();
  const queryKey = getGetRuntimeStatusQueryKey();

  // Stable callback ref — always points to the latest invalidation closure
  const recheckRef = useRef<() => void>(() => {
    void queryClient.invalidateQueries({ queryKey });
  });

  // Re-register the global callback on every render and clean up on unmount
  useEffect(() => {
    recheckRef.current = () => {
      void queryClient.invalidateQueries({ queryKey });
    };
    globalRecheckCallback = () => recheckRef.current();
    return () => {
      // Only clear if this component still owns the callback
      if (globalRecheckCallback === recheckRef.current) {
        globalRecheckCallback = null;
      }
    };
  });

  const { data, isError, isPending } = useGetRuntimeStatus({
    query: { queryKey: queryKey, refetchInterval: POLL_INTERVAL_MS },
  });

  // Build service label map from response
  const serviceLabels = new Map<number, string>(
    data?.knownServices?.map(s => [s.port, s.label]) ?? []
  );

  if (isPending) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground/30">
        <Radio className="w-3 h-3 animate-pulse shrink-0" />
        <span>Probing…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground/30" title="Runtime status backend unreachable">
        <WifiOff className="w-3 h-3 shrink-0" />
        <span>Status unknown</span>
      </div>
    );
  }

  if (!data.openPorts || data.openPorts.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground/25" title="No dev server ports detected">
        <Wifi className="w-3 h-3 shrink-0 opacity-40" />
        <span>No preview detected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" title={`Probed at ${new Date(data.probedAt).toLocaleTimeString()}`}>
      <Radio className="w-3 h-3 shrink-0 text-green-400/60 mr-0.5" />
      {data.openPorts.map(port => {
        const label = serviceLabels.get(port);
        return (
          <span
            key={port}
            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-green-400/20 bg-green-400/8 text-green-300/70 font-mono"
          >
            <span>:{port}</span>
            {label && <span className="text-green-400/40 ml-0.5">{label}</span>}
          </span>
        );
      })}
    </div>
  );
}
