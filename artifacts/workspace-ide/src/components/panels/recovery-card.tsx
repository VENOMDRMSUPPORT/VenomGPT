/**
 * recovery-card.tsx — Human-in-the-Loop Recovery Card
 *
 * Fetches /agent/tasks/:id/recovery-options for any completed task with a
 * non-clean_done outcome class. Renders:
 *   - "What happened" sentence
 *   - "What remains" sentence (when applicable)
 *   - Affordance buttons (Retry Verification, Continue from Partial, Re-check Runtime)
 *
 * Each button is shown only when available: true.
 * Unavailable affordances are shown greyed with a tooltip.
 * When an affordance action succeeds, shows a notice with a link to the new task.
 */

import { useState, useEffect } from 'react';
import {
  AlertTriangle, RefreshCw, PlayCircle, Activity,
  ArrowRight, Loader2, Clock, Shield, CheckCircle2, XCircle, RotateCcw, Unlock,
} from 'lucide-react';

// ─── API base URL ──────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

type OutcomeClass =
  | 'clean_done'
  | 'partial'
  | 'blocked'
  | 'verification_limited'
  | 'runtime_stale_after_apply'
  | 'cancelled_with_progress'
  | 'interrupted_with_progress'
  | 'step_budget_exhausted'
  | 'error_no_recovery'
  | 'approval_denied'
  | 'selectively_blocked'
  | 'operator_overridden';

interface RecoveryAffordance {
  kind:               'retry_verification' | 'continue_partial' | 'recheck_runtime' | 'resubmit_after_denial' | 'bypass_gate_continue' | 'view_approval_checkpoint';
  label:              string;
  description:        string;
  endpoint:           string;
  httpMethod?:        'GET' | 'POST';
  available:          boolean;
  unavailableReason?: string;
}

interface RecoveryAssessment {
  taskId:       string;
  outcomeClass: OutcomeClass;
  whatHappened: string;
  whatRemains:  string | null;
  affordances:  RecoveryAffordance[];
}

interface FollowUpResult {
  newTaskId:      string;
  followUpKind:   string;
  originalTaskId: string;
  explicit:       string;
}

// ─── Outcome class configs ────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<OutcomeClass, {
  label:      string;
  color:      string;
  bg:         string;
  border:     string;
  icon:       React.FC<{ className?: string }>;
  showCard:   boolean;
}> = {
  clean_done: {
    label: 'Completed', color: 'text-green-400', bg: 'bg-green-400/8', border: 'border-green-400/20',
    icon: CheckCircle2, showCard: false,
  },
  partial: {
    label: 'Partial Completion', color: 'text-amber-400', bg: 'bg-amber-400/8', border: 'border-amber-400/20',
    icon: AlertTriangle, showCard: true,
  },
  blocked: {
    label: 'Blocked', color: 'text-red-400', bg: 'bg-red-400/8', border: 'border-red-400/20',
    icon: XCircle, showCard: true,
  },
  verification_limited: {
    label: 'Verification Limited', color: 'text-amber-400', bg: 'bg-amber-400/8', border: 'border-amber-400/20',
    icon: Shield, showCard: true,
  },
  runtime_stale_after_apply: {
    label: 'Runtime May Be Stale', color: 'text-blue-400', bg: 'bg-blue-400/8', border: 'border-blue-400/20',
    icon: RefreshCw, showCard: true,
  },
  cancelled_with_progress: {
    label: 'Cancelled With Progress', color: 'text-amber-400', bg: 'bg-amber-400/8', border: 'border-amber-400/20',
    icon: AlertTriangle, showCard: true,
  },
  interrupted_with_progress: {
    label: 'Interrupted With Progress', color: 'text-amber-400', bg: 'bg-amber-400/8', border: 'border-amber-400/20',
    icon: AlertTriangle, showCard: true,
  },
  step_budget_exhausted: {
    label: 'Step Budget Exhausted', color: 'text-amber-400', bg: 'bg-amber-400/8', border: 'border-amber-400/20',
    icon: Clock, showCard: true,
  },
  error_no_recovery: {
    label: 'Error', color: 'text-red-400', bg: 'bg-red-400/8', border: 'border-red-400/20',
    icon: XCircle, showCard: false,
  },
  approval_denied: {
    label: 'Approval Denied', color: 'text-red-400', bg: 'bg-red-400/8', border: 'border-red-400/20',
    icon: XCircle, showCard: true,
  },
  selectively_blocked: {
    label: 'Selectively Blocked', color: 'text-amber-400', bg: 'bg-amber-400/8', border: 'border-amber-400/20',
    icon: Shield, showCard: true,
  },
  operator_overridden: {
    label: 'Operator Overridden', color: 'text-blue-400', bg: 'bg-blue-400/8', border: 'border-blue-400/20',
    icon: Activity, showCard: true,
  },
};

const AFFORDANCE_ICON: Record<RecoveryAffordance['kind'], React.FC<{ className?: string }>> = {
  retry_verification:      Shield,
  continue_partial:        PlayCircle,
  recheck_runtime:         RefreshCw,
  resubmit_after_denial:   RotateCcw,
  bypass_gate_continue:    Unlock,
  view_approval_checkpoint: Shield,
};

const AFFORDANCE_COLOR: Record<RecoveryAffordance['kind'], { active: string; muted: string }> = {
  retry_verification:      { active: 'border-amber-400/30 text-amber-300 bg-amber-400/10 hover:bg-amber-400/20', muted: 'border-white/8 text-muted-foreground/30 bg-transparent cursor-not-allowed' },
  continue_partial:        { active: 'border-amber-400/30 text-amber-300 bg-amber-400/10 hover:bg-amber-400/20', muted: 'border-white/8 text-muted-foreground/30 bg-transparent cursor-not-allowed' },
  recheck_runtime:         { active: 'border-blue-400/30 text-blue-300 bg-blue-400/10 hover:bg-blue-400/20',   muted: 'border-white/8 text-muted-foreground/30 bg-transparent cursor-not-allowed' },
  resubmit_after_denial:   { active: 'border-amber-400/30 text-amber-300 bg-amber-400/10 hover:bg-amber-400/20', muted: 'border-white/8 text-muted-foreground/30 bg-transparent cursor-not-allowed' },
  bypass_gate_continue:    { active: 'border-blue-400/30 text-blue-300 bg-blue-400/10 hover:bg-blue-400/20', muted: 'border-white/8 text-muted-foreground/30 bg-transparent cursor-not-allowed' },
  view_approval_checkpoint: { active: 'border-purple-400/30 text-purple-300 bg-purple-400/10 hover:bg-purple-400/20', muted: 'border-white/8 text-muted-foreground/30 bg-transparent cursor-not-allowed' },
};

// ─── Checkpoint evidence payload (view_approval_checkpoint affordance) ─────────

interface CheckpointEvidence {
  evidenceKind:      string;
  deniedGateId:      string | null;
  deniedAt:          string | null;
  description:       string | null;
  filesWritten:      { path: string; hasDiff: boolean }[];
  approvalGates:     { id: string; status: string; description: string; decidedAt: string | null }[];
  approvalDecisions: { checkpointId: string; decision: string; decidedAt: string }[];
}

// ─── Affordance button ────────────────────────────────────────────────────────

function AffordanceButton({
  affordance,
  taskId,
  onSuccess,
}: {
  affordance:  RecoveryAffordance;
  taskId:      string;
  onSuccess:   (result: FollowUpResult) => void;
}) {
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [checkpointData,  setCheckpointData]  = useState<CheckpointEvidence | null>(null);

  const Icon    = AFFORDANCE_ICON[affordance.kind];
  const colors  = AFFORDANCE_COLOR[affordance.kind];
  const isAvail = affordance.available;

  const isDataAffordance = affordance.kind === 'view_approval_checkpoint';

  const handleClick = async () => {
    if (!isAvail || loading) return;
    // If checkpoint is already loaded, toggle visibility
    if (isDataAffordance && checkpointData) {
      setCheckpointData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const method = affordance.httpMethod ?? 'POST';
      const res = await fetch(`${API_BASE}${affordance.endpoint}`, { method });
      const body = await res.json() as FollowUpResult | CheckpointEvidence | { error: string; message: string };
      if (!res.ok) {
        const errBody = body as { error: string; message: string };
        setError(errBody.message ?? 'Request failed');
      } else if (isDataAffordance) {
        // view_approval_checkpoint returns evidence data, not a FollowUpResult
        setCheckpointData(body as CheckpointEvidence);
      } else {
        onSuccess(body as FollowUpResult);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={!isAvail || loading}
        title={!isAvail ? (affordance.unavailableReason ?? 'Not available') : affordance.description}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors
          ${isAvail ? colors.active : colors.muted}
          ${loading ? 'opacity-60' : ''}
          disabled:opacity-40`}
      >
        {loading
          ? <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          : <Icon className="w-3 h-3 shrink-0" />
        }
        <span>{affordance.label}</span>
        {isDataAffordance && checkpointData && (
          <span className="text-[9px] font-normal opacity-60 ml-0.5">▲ hide</span>
        )}
        {!isAvail && (
          <span className="text-[9px] font-normal opacity-50 ml-0.5">n/a</span>
        )}
      </button>
      {error && (
        <p className="absolute top-full mt-1 left-0 right-0 text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 rounded px-2 py-1 z-10">
          {error}
        </p>
      )}
      {isDataAffordance && checkpointData && (
        <div className="mt-2 p-2.5 rounded border border-purple-400/20 bg-purple-400/5 text-[11px] space-y-1.5">
          {checkpointData.deniedGateId && (
            <div className="text-purple-300 font-medium">
              Gate: {checkpointData.deniedGateId}
              {checkpointData.deniedAt && (
                <span className="text-white/40 font-normal ml-1.5">
                  denied {new Date(checkpointData.deniedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          )}
          {checkpointData.description && (
            <p className="text-white/60">{checkpointData.description}</p>
          )}
          {checkpointData.filesWritten.length > 0 && (
            <div>
              <span className="text-white/40">Files written before denial: </span>
              {checkpointData.filesWritten.map(f => (
                <span key={f.path} className="text-white/70 mr-1.5 font-mono text-[10px]">{f.path}</span>
              ))}
            </div>
          )}
          {checkpointData.approvalDecisions.length > 0 && (
            <div className="text-white/40">
              Decisions: {checkpointData.approvalDecisions.map(d =>
                `${d.decision} (${d.checkpointId})`
              ).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Recovery Card ────────────────────────────────────────────────────────────

interface RecoveryCardProps {
  taskId:          string;
  onNavigateTask?: (taskId: string) => void;
  /** Increment this to trigger a re-fetch (e.g., after checkpoint apply/discard). */
  refetchKey?:     number;
}

export function RecoveryCard({ taskId, onNavigateTask, refetchKey = 0 }: RecoveryCardProps) {
  const [assessment, setAssessment]   = useState<RecoveryAssessment | null>(null);
  const [loading,    setLoading]      = useState(false);
  const [followUps,  setFollowUps]    = useState<FollowUpResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Clear stale assessment immediately so a failed or slow refetch never shows
    // stale data from a previous task or checkpoint state.
    setAssessment(null);
    setLoading(true);
    fetch(`${API_BASE}/api/agent/tasks/${taskId}/recovery-options`)
      .then(r => r.json())
      .then((data: RecoveryAssessment | { error: string }) => {
        if (!cancelled && !('error' in data)) {
          setAssessment(data as RecoveryAssessment);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // refetchKey is intentionally included: incrementing it re-evaluates recovery
  // options after checkpoint lifecycle events (apply / discard) that change backend truth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, refetchKey]);

  if (loading || !assessment) return null;

  const cfg = OUTCOME_CONFIG[assessment.outcomeClass];
  if (!cfg.showCard) return null;

  const hasAvailableAffordances = assessment.affordances.some(a => a.available);
  const Icon = cfg.icon;

  return (
    <div className={`rounded border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5`}>
        <Icon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
        <span className={`text-xs font-semibold ${cfg.color}`}>Recovery Assessment</span>
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border ${cfg.border} ${cfg.color} opacity-60`}>
          {cfg.label}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        {/* What happened */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <Activity className="w-2.5 h-2.5" /> What Happened
          </p>
          <p className="text-xs text-gray-300/80 leading-relaxed">{assessment.whatHappened}</p>
        </div>

        {/* What remains */}
        {assessment.whatRemains && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <ArrowRight className="w-2.5 h-2.5" /> What Remains
            </p>
            <p className="text-xs text-gray-300/60 leading-relaxed">{assessment.whatRemains}</p>
          </div>
        )}

        {/* Affordance buttons */}
        {(hasAvailableAffordances || assessment.affordances.length > 0) && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1.5">
              What You Can Do
            </p>
            <div className="flex flex-wrap gap-1.5">
              {assessment.affordances.map(affordance => (
                <AffordanceButton
                  key={affordance.kind}
                  affordance={affordance}
                  taskId={taskId}
                  onSuccess={(result) => setFollowUps(prev => [...prev, result])}
                />
              ))}
            </div>
          </div>
        )}

        {/* Follow-up notices */}
        {followUps.map((fu, i) => (
          <div key={i} className="flex items-center gap-2 rounded border border-blue-400/20 bg-blue-400/8 px-2 py-1.5 text-xs">
            <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" />
            <span className="text-blue-300/80 flex-1">
              {fu.explicit} — task <code className="font-mono text-blue-400">{fu.newTaskId.slice(0, 8)}…</code>
            </span>
            {onNavigateTask && (
              <button
                onClick={() => onNavigateTask(fu.newTaskId)}
                className="text-[10px] text-blue-400/70 hover:text-blue-400 underline shrink-0"
              >
                View
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
