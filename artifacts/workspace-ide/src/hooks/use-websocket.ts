import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIdeStore } from '@/store/use-ide-store';
import type { LivePhaseState, RunPhase } from '@/store/use-ide-store';
import { getListAgentTasksQueryKey, getListFilesQueryKey } from '@workspace/api-client-react';
import type { ActionRecord } from '@/lib/actionSelectors';

const KNOWN_RUN_PHASES: readonly RunPhase[] = [
  "initializing", "planning", "inspecting", "executing",
  "verifying", "repairing", "wrapping_up", "complete", "blocked", "failed",
  // task-9: operator-steering phases
  "awaiting_approval", "approval_denied", "selectively_blocked", "operator_overridden",
];

function isRunPhase(v: unknown): v is RunPhase {
  return typeof v === "string" && (KNOWN_RUN_PHASES as readonly string[]).includes(v);
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const appendTerminalOutput = useIdeStore(s => s.appendTerminalOutput);
  const appendAgentLog      = useIdeStore(s => s.appendAgentLog);
  const clearActiveTask     = useIdeStore(s => s.clearActiveTask);
  const openFile            = useIdeStore(s => s.openFile);
  const setConnected        = useIdeStore(s => s.setConnected);
  const upsertTaskAction    = useIdeStore(s => s.upsertTaskAction);
  const mergeTaskActions    = useIdeStore(s => s.mergeTaskActions);
  const setLivePhase        = useIdeStore(s => s.setLivePhase);
  const clearLivePhase      = useIdeStore(s => s.clearLivePhase);

  // Track openFiles and activeTaskId via refs so the WS message handler
  // always has the current value without needing to be rebuilt on every change.
  const openFiles    = useIdeStore(s => s.openFiles);
  const activeTaskId = useIdeStore(s => s.activeTaskId);

  const setLivePhaseRef   = useRef(setLivePhase);
  const clearLivePhaseRef = useRef(clearLivePhase);
  const openFilesRef       = useRef(openFiles);
  const activeTaskIdRef    = useRef(activeTaskId);
  const mergeTaskActionsRef = useRef(mergeTaskActions);
  setLivePhaseRef.current   = setLivePhase;
  clearLivePhaseRef.current = clearLivePhase;
  openFilesRef.current       = openFiles;
  activeTaskIdRef.current    = activeTaskId;
  mergeTaskActionsRef.current = mergeTaskActions;

  useEffect(() => {
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmounted) {
          setConnected(true);
          console.log('[WS] Connected');
          // Backfill any action events missed while the socket was down.
          // Uses merge semantics so no in-flight WS upserts are overwritten.
          const liveTaskId = activeTaskIdRef.current;
          if (liveTaskId) {
            fetch(`/api/agent/runs/${liveTaskId}/actions`)
              .then(r => r.ok ? r.json() : null)
              .then((body: { taskId: string; count: number; actions: ActionRecord[] } | null) => {
                if (!unmounted && body?.actions) {
                  mergeTaskActionsRef.current(liveTaskId, body.actions);
                }
              })
              .catch(() => { /* not fatal */ });
          }
        }
      };

      ws.onmessage = async (event) => {
        if (unmounted) return;
        try {
          const payload = JSON.parse(event.data as string);

          switch (payload.type) {
            case 'terminal_output':
              if (payload.data) appendTerminalOutput(payload.data as string);
              break;

            case 'agent_event': {
              if (!payload.event) break;
              const ev = payload.event as {
                type: string;
                message: string;
                timestamp: string;
                data?: Record<string, unknown>;
              };

              // Append to the running task's log bucket.
              // Use ref so we always see the current taskId even inside a stale closure.
              const runningTaskId = activeTaskIdRef.current;
              if (runningTaskId) {
                appendAgentLog(runningTaskId, ev);
              }

              if (ev.type === 'file_write' && ev.data?.path) {
                const writtenPath = String(ev.data.path);
                const isOpen = openFilesRef.current.some(f => f.path === writtenPath);
                if (isOpen) {
                  try {
                    const res = await fetch(`/api/files/read?path=${encodeURIComponent(writtenPath)}`);
                    if (res.ok) {
                      const fileData = await res.json() as { path: string; content: string; language: string };
                      openFile({ path: fileData.path, content: fileData.content, language: fileData.language, isDirty: false });
                    }
                  } catch {
                    // File refresh failed silently — user can re-open manually
                  }
                }
                queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
              }

              if (ev.type === 'done') {
                queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
              }
              break;
            }

            case 'task_updated': {
              queryClient.invalidateQueries({ queryKey: getListAgentTasksQueryKey() });
              const updatedTask = payload.task as { id: string; status: string } | undefined;
              // Unlock the composer on any terminal status — includes the new
              // cancelled / interrupted / stalled statuses in addition to done / error.
              const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled', 'interrupted', 'stalled']);
              if (updatedTask && TERMINAL_STATUSES.has(updatedTask.status)) {
                // Unlock the composer. viewingTaskId is intentionally kept so the
                // output panel continues showing the just-finished task's log.
                clearActiveTask();
                clearLivePhaseRef.current();
              }
              break;
            }

            case 'action_updated': {
              const taskId = payload.taskId as string | undefined;
              const action = payload.action as ActionRecord | undefined;
              if (taskId && action) {
                upsertTaskAction(taskId, action);
              }
              break;
            }

            case 'live_phase': {
              const lp = payload as {
                taskId?: string;
                phase?: string;
                step?: number;
                maxSteps?: number;
                unverifiedWriteCount?: number;
                consecutiveFailures?: number;
                recoverable?: boolean;
                interventionKind?: string | null;
                blockedContext?: string | null;
                gateTriggers?: Record<string, number> | null;
                verificationQuality?: string | null;
              };
              if (lp.phase && isRunPhase(lp.phase)) {
                const ik = lp.interventionKind;
                setLivePhaseRef.current({
                  phase:                lp.phase,
                  step:                 lp.step ?? 0,
                  maxSteps:             lp.maxSteps ?? 0,
                  unverifiedWriteCount: lp.unverifiedWriteCount ?? 0,
                  consecutiveFailures:  lp.consecutiveFailures ?? 0,
                  recoverable:          lp.recoverable ?? false,
                  interventionKind:     (ik === "pause" || ik === "blocked" || ik === "partial_proceed" || ik === "awaiting_approval" || ik === "approval_denied") ? ik : null,
                  blockedContext:       typeof lp.blockedContext === 'string' ? lp.blockedContext : null,
                  gateTriggers:         lp.gateTriggers != null && typeof lp.gateTriggers === 'object' ? lp.gateTriggers : null,
                  verificationQuality:  typeof lp.verificationQuality === 'string' ? lp.verificationQuality : null,
                });
              }
              break;
            }
          }
        } catch (err) {
          console.error('[WS] Failed to parse message', err);
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnected(false);
        console.log('[WS] Disconnected, reconnecting in 2s…');
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => { ws.close(); };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      setConnected(false);
    };
  }, [appendTerminalOutput, appendAgentLog, clearActiveTask, openFile, setConnected, upsertTaskAction, mergeTaskActions, setLivePhase, clearLivePhase, queryClient]);

  return { ws: wsRef.current };
}
