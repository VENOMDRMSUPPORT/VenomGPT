/**
 * live-run-state-bar.tsx — Live RunState phase indicator bar.
 *
 * Displayed in the task console while a task is actively running.
 * Consumes `livePhase` from the IdeStore (populated by live_phase WS events).
 *
 * Shows:
 *   - Current phase badge (colour-coded to match the stage style system)
 *   - Contextual notice banner for verifying / repairing / blocked phases
 *   - Step progress bar (step / maxSteps)
 *   - Unverified write count pill (if non-zero)
 *   - Consecutive failure count pill (if non-zero)
 *   - Pause/Resume toggle (derived from livePhase.interventionKind)
 *   - "Proceed as partial" button (blocked interventionKind only)
 *   - "Approve" / "Deny" buttons (awaiting_approval phase only)
 */

import { useState, useCallback } from 'react';
import { useIdeStore } from '@/store/use-ide-store';
import type { RunPhase } from '@/store/use-ide-store';
import {
  Settings, Search, FileEdit, CheckCircle2, Wrench, Activity, XCircle,
  ShieldAlert, AlertTriangle, Lock, Loader2, Pause, Play, SkipForward, Clock, ThumbsUp, ThumbsDown,
} from 'lucide-react';

// ─── API base URL ──────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

// ─── Phase display config ──────────────────────────────────────────────────────

const PHASE_CONFIG: Record<RunPhase, {
  label:   string;
  color:   string;
  bg:      string;
  border:  string;
  icon:    React.FC<{ className?: string }>;
  notice?: {
    text:       string;
    icon:       React.FC<{ className?: string }>;
    noticeBg:   string;
    noticeText: string;
  };
}> = {
  initializing: { label: 'Initializing', color: 'text-slate-400',  bg: 'bg-slate-400/12',  border: 'border-slate-400/25',  icon: Loader2 },
  planning:     { label: 'Planning',     color: 'text-blue-400',    bg: 'bg-blue-400/12',    border: 'border-blue-400/25',    icon: Settings },
  inspecting:   { label: 'Inspecting',   color: 'text-purple-400',  bg: 'bg-purple-400/12',  border: 'border-purple-400/25',  icon: Search   },
  executing:    { label: 'Editing',      color: 'text-emerald-400', bg: 'bg-emerald-400/12', border: 'border-emerald-400/25', icon: FileEdit },
  verifying: {
    label: 'Verifying', color: 'text-cyan-400', bg: 'bg-cyan-400/12', border: 'border-cyan-400/25', icon: CheckCircle2,
    notice: {
      text:       'Waiting for verification — running checks on written files.',
      icon:       ShieldAlert,
      noticeBg:   'bg-cyan-500/10 border-cyan-400/20',
      noticeText: 'text-cyan-300',
    },
  },
  repairing: {
    label: 'Repairing', color: 'text-amber-400', bg: 'bg-amber-400/12', border: 'border-amber-400/25', icon: Wrench,
    notice: {
      text:       'Repair in progress — agent is fixing failures.',
      icon:       AlertTriangle,
      noticeBg:   'bg-amber-500/10 border-amber-400/20',
      noticeText: 'text-amber-300',
    },
  },
  wrapping_up: { label: 'Wrapping Up', color: 'text-green-400',   bg: 'bg-green-400/12',   border: 'border-green-400/25',   icon: CheckCircle2 },
  complete:    { label: 'Complete',    color: 'text-green-400',   bg: 'bg-green-400/12',   border: 'border-green-400/25',   icon: CheckCircle2 },
  failed:      { label: 'Failed',      color: 'text-red-400',     bg: 'bg-red-400/12',     border: 'border-red-400/25',     icon: XCircle },
  blocked: {
    label: 'Blocked', color: 'text-rose-400', bg: 'bg-rose-400/12', border: 'border-rose-400/25', icon: Lock,
    notice: {
      text:       'Task is blocked — waiting for operator input.',
      icon:       Lock,
      noticeBg:   'bg-rose-500/10 border-rose-400/20',
      noticeText: 'text-rose-300',
    },
  },
  // task-9: operator-steering phases
  awaiting_approval: {
    label: 'Awaiting Approval', color: 'text-amber-400', bg: 'bg-amber-400/12', border: 'border-amber-400/25', icon: Clock,
    notice: {
      text:       'Halted at an approval gate — operator must approve or deny to continue.',
      icon:       ShieldAlert,
      noticeBg:   'bg-amber-500/10 border-amber-400/20',
      noticeText: 'text-amber-300',
    },
  },
  approval_denied: {
    label: 'Approval Denied', color: 'text-red-400', bg: 'bg-red-400/12', border: 'border-red-400/25', icon: XCircle,
    notice: {
      text:       'An operator denied this approval gate. The run was stopped.',
      icon:       XCircle,
      noticeBg:   'bg-red-500/10 border-red-400/20',
      noticeText: 'text-red-300',
    },
  },
  selectively_blocked: {
    label: 'Selectively Blocked', color: 'text-amber-400', bg: 'bg-amber-400/12', border: 'border-amber-400/25', icon: AlertTriangle,
    notice: {
      text:       'Selective approval — some parallel lanes were blocked by the operator.',
      icon:       AlertTriangle,
      noticeBg:   'bg-amber-500/10 border-amber-400/20',
      noticeText: 'text-amber-300',
    },
  },
  operator_overridden: {
    label: 'Operator Override', color: 'text-blue-400', bg: 'bg-blue-400/12', border: 'border-blue-400/25', icon: Activity,
    notice: {
      text:       'One or more steps were overridden by the operator (skipped, denied, or substituted).',
      icon:       Activity,
      noticeBg:   'bg-blue-500/10 border-blue-400/20',
      noticeText: 'text-blue-300',
    },
  },
};

const TERMINAL_PHASES: ReadonlySet<RunPhase> = new Set(['complete', 'failed', 'approval_denied']);

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, maxSteps }: { step: number; maxSteps: number }) {
  const pct = maxSteps > 0 ? Math.min(100, Math.round((step / maxSteps) * 100)) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden min-w-[60px]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-current transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground/60 shrink-0">
        {step}/{maxSteps}
      </span>
    </div>
  );
}

// ─── Live run state bar ───────────────────────────────────────────────────────

interface LiveRunStateBarProps {
  /** If provided, only render when the live phase belongs to this task. */
  taskId?: string | null;
}

export function LiveRunStateBar({ taskId: _taskId }: LiveRunStateBarProps) {
  const livePhase  = useIdeStore(s => s.livePhase);
  const activeTask = useIdeStore(s => s.activeTaskId);

  const [pauseLoading,   setPauseLoading]   = useState(false);
  const [proceedLoading, setProceedLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [denyLoading,    setDenyLoading]    = useState(false);

  // Derive pause/blocked state from backend truth via interventionKind.
  const interventionKind   = livePhase?.interventionKind ?? null;
  const isPaused           = interventionKind === 'pause';
  const isBlocked          = interventionKind === 'blocked';
  const blockedContext      = livePhase?.blockedContext ?? null;
  const gateTriggers        = livePhase?.gateTriggers ?? null;
  const verificationQuality = livePhase?.verificationQuality ?? null;

  // Derive human-readable gate label for blocked notice
  const blockedGateLabel: string | null = isBlocked && gateTriggers
    ? (gateTriggers['verification_required'] ?? 0) > 0
        ? 'verification_required gate'
        : (gateTriggers['runtime_proof_required'] ?? 0) > 0
          ? 'runtime_proof_required gate'
          : Object.keys(gateTriggers).find(k => gateTriggers[k] > 0) ?? null
    : null;

  const handlePauseResume = useCallback(async () => {
    if (!activeTask || pauseLoading) return;
    setPauseLoading(true);
    try {
      const action = isPaused ? 'resume' : 'pause';
      const res = await fetch(`${API_BASE}/api/agent/tasks/${activeTask}/${action}`, { method: 'POST' });
      if (!res.ok) {
        console.warn(`[LiveRunStateBar] ${action} failed:`, res.status);
      }
    } catch (err) {
      console.error('[LiveRunStateBar] pause/resume error:', err);
    } finally {
      setPauseLoading(false);
    }
  }, [activeTask, isPaused, pauseLoading]);

  const handleProceedAsPartial = useCallback(async () => {
    if (!activeTask || proceedLoading) return;
    setProceedLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/tasks/${activeTask}/proceed-as-partial`, { method: 'POST' });
      if (!res.ok) console.warn('[LiveRunStateBar] proceed-as-partial failed:', res.status);
    } catch (err) {
      console.error('[LiveRunStateBar] proceed-as-partial error:', err);
    } finally {
      setProceedLoading(false);
    }
  }, [activeTask, proceedLoading]);

  const handleApprove = useCallback(async () => {
    if (!activeTask || approveLoading) return;
    setApproveLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/tasks/${activeTask}/approve`, { method: 'POST' });
      if (!res.ok) console.warn('[LiveRunStateBar] approve failed:', res.status);
    } catch (err) {
      console.error('[LiveRunStateBar] approve error:', err);
    } finally {
      setApproveLoading(false);
    }
  }, [activeTask, approveLoading]);

  const handleDeny = useCallback(async () => {
    if (!activeTask || denyLoading) return;
    setDenyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/tasks/${activeTask}/deny`, { method: 'POST' });
      if (!res.ok) console.warn('[LiveRunStateBar] deny failed:', res.status);
    } catch (err) {
      console.error('[LiveRunStateBar] deny error:', err);
    } finally {
      setDenyLoading(false);
    }
  }, [activeTask, denyLoading]);

  if (!livePhase || !activeTask) return null;

  const cfg = PHASE_CONFIG[livePhase.phase] ?? PHASE_CONFIG['executing'];
  const Icon = cfg.icon;
  const notice = cfg.notice;
  const isTerminal = TERMINAL_PHASES.has(livePhase.phase);
  const showPauseResume = !isTerminal && !isBlocked;
  const showProceedAsPartial = livePhase.phase === 'blocked' && isBlocked;

  return (
    <div className="flex flex-col gap-1">
      {/* Phase badge row */}
      <div
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${cfg.bg} ${cfg.border}`}
        title={`Phase: ${cfg.label} · Step ${livePhase.step}/${livePhase.maxSteps}${interventionKind ? ` · ${interventionKind}` : ''}`}
      >
        <Icon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
        <span className={`font-semibold shrink-0 ${cfg.color}`}>
          {cfg.label}{isPaused ? ' (paused)' : ''}
        </span>

        <div className={`flex-1 min-w-0 ${cfg.color}`}>
          <ProgressBar step={livePhase.step} maxSteps={livePhase.maxSteps} />
        </div>

        {livePhase.unverifiedWriteCount > 0 && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-300 border border-amber-400/20"
            title={`${livePhase.unverifiedWriteCount} unverified write${livePhase.unverifiedWriteCount !== 1 ? 's' : ''}`}
          >
            {livePhase.unverifiedWriteCount} unverified
          </span>
        )}

        {livePhase.consecutiveFailures > 0 && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/15 text-red-300 border border-red-400/20"
            title={`${livePhase.consecutiveFailures} consecutive failure${livePhase.consecutiveFailures !== 1 ? 's' : ''}`}
          >
            {livePhase.consecutiveFailures}&times; fail
          </span>
        )}

        {/* Pause/Resume toggle — shown while task is active and not blocked */}
        {showPauseResume && (
          <button
            onClick={handlePauseResume}
            disabled={pauseLoading}
            title={isPaused ? 'Resume task' : 'Pause task at next step boundary'}
            className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors
              ${isPaused
                ? 'bg-blue-500/15 text-blue-300 border-blue-400/20 hover:bg-blue-500/25'
                : 'bg-white/5 text-muted-foreground/60 border-white/10 hover:bg-white/10 hover:text-muted-foreground'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isPaused
              ? <><Play className="w-2.5 h-2.5" /><span>Resume</span></>
              : <><Pause className="w-2.5 h-2.5" /><span>Pause</span></>
            }
          </button>
        )}

        {!isTerminal && (
          <Activity className="w-3 h-3 shrink-0 text-muted-foreground/40 animate-pulse" />
        )}
      </div>

      {/* Contextual notice banner (verifying / repairing / blocked / awaiting_approval) */}
      {notice && (
        <div className={`rounded border text-[11px] ${notice.noticeBg}`}>
          <div className="flex items-center gap-1.5 px-2.5 py-1">
            <notice.icon className={`w-3 h-3 shrink-0 ${notice.noticeText}`} />
            <span className={`${notice.noticeText} flex-1`}>{notice.text}</span>

            {/* Proceed as partial — only shown when interventionKind === "blocked" */}
            {showProceedAsPartial && (
              <button
                onClick={handleProceedAsPartial}
                disabled={proceedLoading}
                title="Accept current progress as a partial completion and end the run"
                className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/20 text-rose-300 border border-rose-400/25 hover:bg-rose-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <SkipForward className="w-2.5 h-2.5" />
                Proceed as partial
              </button>
            )}

            {/* Approve / Deny — shown while awaiting operator approval gate decision */}
            {livePhase.phase === 'awaiting_approval' && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={approveLoading}
                  title="Approve this gate and allow the run to continue"
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-400/25 hover:bg-green-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {approveLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ThumbsUp className="w-2.5 h-2.5" />}
                  Approve
                </button>
                <button
                  onClick={handleDeny}
                  disabled={denyLoading}
                  title="Deny this gate and stop the run"
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-400/25 hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {denyLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ThumbsDown className="w-2.5 h-2.5" />}
                  Deny
                </button>
              </>
            )}
          </div>

          {/* Blocked context — gate identity, verificationQuality, blockedContext, operator guidance */}
          {isBlocked && (blockedContext || blockedGateLabel || verificationQuality || (livePhase?.unverifiedWriteCount ?? 0) > 0) && (
            <div className="px-2.5 pb-1.5 border-t border-rose-400/15 pt-1 mt-0.5 space-y-1">
              {/* Gate identity + verification quality row */}
              {(blockedGateLabel || verificationQuality) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {blockedGateLabel && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-400/10 border border-rose-400/20 text-rose-300/70">
                      {blockedGateLabel}
                    </span>
                  )}
                  {verificationQuality && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground/50">
                      verify: {verificationQuality}
                    </span>
                  )}
                </div>
              )}
              {/* What the agent reported it cannot proceed on */}
              {blockedContext && (
                <p className="text-[10px] text-rose-300/70 leading-relaxed italic">{blockedContext}</p>
              )}
              {/* Operator guidance: unverified writes + action hint */}
              {(livePhase?.unverifiedWriteCount ?? 0) > 0 && (
                <p className="text-[9px] text-muted-foreground/40">
                  {livePhase!.unverifiedWriteCount} unverified write{livePhase!.unverifiedWriteCount !== 1 ? 's' : ''} pending. Use &ldquo;Proceed as partial&rdquo; to accept current progress, or wait — the agent may self-correct on its next step.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
