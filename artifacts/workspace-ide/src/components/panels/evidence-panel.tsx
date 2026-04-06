/**
 * evidence-panel.tsx — Replay / Evidence inspection surface for completed tasks.
 *
 * Renders structured evidence from the /evidence and /actions endpoints,
 * grouped into clear sections. Each section degrades honestly when data is absent.
 *
 * Features:
 * - Rich action record rendering with per-type metadata
 * - Click-to-expand drill-down detail rows
 * - Action type filter chips (reset on task switch)
 * - Text search input (reset on task switch)
 * - Phase-grouped action sections using assignActionsToWindows
 * - Color-coded left-border evidence block visual distinction
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ListChecks, Activity, Clock, GitBranch, FileEdit, Terminal,
  Eye, CheckCircle2, AlertCircle, Loader2, Info, Shield,
  ChevronRight, ChevronDown, BarChart2, Layers, Database,
  Search, X, Cpu, Radio, GitMerge, Network, Lock, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTaskEvidence, useTaskActions } from '@/hooks/use-evidence';
import { useIdeStore } from '@/store/use-ide-store';
import { getVerifyQualityConfig } from '@/lib/verifyQuality';
import type {
  TaskEvidenceExecutionSummary,
  TaskEvidencePlan,
  TaskEvidenceRouteProfile,
  TaskEvidenceCheckpointSummary,
  TaskEvidenceRuntimeLifecycle,
  DependencyAnalysis,
  StepDependencyClass,
  ContinuationLineage,
  LaneSummary,
} from '@/lib/evidenceTypes';
import type {
  ActionRecord,
  ActionType,
  StepDependencyClass as ActionStepDepClass,
  ReadFileMeta,
  WriteFileMeta,
  ExecCommandMeta,
  VerifyResultMeta,
  ToolActionMeta,
  ApprovalCheckpointMeta,
  ApprovalDecisionMeta,
  LaneSteeeredMeta,
  OperatorOverrideMeta,
} from '@/lib/actionSelectors';
import {
  assignActionsToWindows,
  getActionItemLabel,
} from '@/lib/actionSelectors';
import { ToolIntrospectionPanel } from './tool-introspection-panel';

// ─── Absent-data placeholders ─────────────────────────────────────────────────

function AbsentBlock({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded border border-panel-border/40 bg-background/30 text-xs text-muted-foreground/50 italic">
      <Info className="w-3 h-3 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ─── Section wrapper with colored left-border accent ─────────────────────────

interface SectionProps {
  icon: React.FC<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  accentColor?: string;
}

function Section({ icon: Icon, title, children, accentColor }: SectionProps) {
  return (
    <div className="space-y-1.5">
      <div className={`flex items-center gap-1.5 ${accentColor ? `pl-2 border-l-2 ${accentColor}` : ''}`}>
        <Icon className="w-3 h-3 text-muted-foreground/50" />
        <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── (a) Plan block ────────────────────────────────────────────────────────────

function PlanBlock({ plan }: { plan: TaskEvidencePlan | null }) {
  if (!plan) {
    return <AbsentBlock message="No planning phase ran for this task (conversational or fast-path route)." />;
  }

  return (
    <div className="rounded border border-indigo-400/20 bg-indigo-400/5 text-xs overflow-hidden border-l-2 border-l-indigo-500/60">
      <div className="px-3 py-2.5 space-y-2">
        {plan.goal ? (
          <div>
            <span className="text-[10px] text-indigo-400/50 uppercase tracking-wider block mb-0.5">Objective</span>
            <p className="text-indigo-200/80 leading-relaxed">{plan.goal}</p>
          </div>
        ) : (
          <AbsentBlock message="Goal not captured." />
        )}

        {plan.approach && (
          <div>
            <span className="text-[10px] text-indigo-400/50 uppercase tracking-wider block mb-0.5">Approach</span>
            <p className="text-indigo-100/60 leading-relaxed">{plan.approach}</p>
          </div>
        )}

        {plan.verification && (
          <div>
            <span className="text-[10px] text-indigo-400/50 uppercase tracking-wider block mb-0.5">Verification Intent</span>
            <p className="text-indigo-100/60 leading-relaxed">{plan.verification}</p>
          </div>
        )}

        {plan.filesToRead && plan.filesToRead.length > 0 && (
          <div>
            <span className="text-[10px] text-indigo-400/50 uppercase tracking-wider block mb-1">Planned reads</span>
            <div className="flex flex-wrap gap-1">
              {plan.filesToRead.map((f, i) => (
                <span key={i} className="font-mono bg-indigo-400/10 border border-indigo-400/15 px-1.5 py-0.5 rounded text-indigo-200/60 text-[11px]">{f}</span>
              ))}
            </div>
          </div>
        )}

        {plan.expectedChanges && plan.expectedChanges.length > 0 && (
          <div>
            <span className="text-[10px] text-indigo-400/50 uppercase tracking-wider block mb-1">Expected changes</span>
            <div className="flex flex-wrap gap-1">
              {plan.expectedChanges.map((f, i) => (
                <span key={i} className="font-mono bg-emerald-400/8 border border-emerald-400/12 px-1.5 py-0.5 rounded text-emerald-300/60 text-[11px]">{f}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── (b) Execution stats block ────────────────────────────────────────────────

function ExecutionStatsBlock({
  exec,
  route,
}: {
  exec: TaskEvidenceExecutionSummary | null;
  route: TaskEvidenceRouteProfile;
}) {
  if (!exec) {
    return <AbsentBlock message="Execution summary not captured (task may have failed before the run loop started)." />;
  }

  const qCfg = getVerifyQualityConfig(exec.verificationQuality);

  return (
    <div className="rounded border border-slate-500/20 bg-slate-500/5 text-xs space-y-2.5 px-3 py-2.5 border-l-2 border-l-slate-500/50">

      <div className="grid grid-cols-4 gap-1.5 font-mono">
        {[
          { label: 'Steps',   used: exec.stepsUsed,      max: exec.stepsMax             },
          { label: 'Reads',   used: exec.readsUsed,       max: route.maxFileReads        },
          { label: 'Writes',  used: exec.writesUsed,      max: route.maxFileWrites       },
          { label: 'Cmds',    used: exec.commandsUsed,    max: null                      },
        ].map(({ label, used, max }) => (
          <div key={label} className="bg-panel-border/20 rounded px-2 py-1 text-center">
            <div className="text-[10px] text-muted-foreground/50">{label}</div>
            <div className="text-foreground font-semibold">
              {used}{max ? <span className="text-muted-foreground/40">/{max}</span> : ''}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <div>
          <span className="text-muted-foreground/40">Final phase: </span>
          <span className="text-foreground/70 font-mono">{exec.finalPhase || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground/40">Exit: </span>
          <span className={`font-mono ${exec.exitReason === 'clean_done' ? 'text-green-400/80' : 'text-amber-400/80'}`}>
            {exec.exitReason || '—'}
          </span>
        </div>
        {exec.verificationsDone > 0 && (
          <div>
            <span className="text-muted-foreground/40">Verifications: </span>
            <span className="text-foreground/70">{exec.verificationsDone}</span>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="w-3 h-3 shrink-0 text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Verification quality</span>
          <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded border ${qCfg.color} ${qCfg.bg} ${qCfg.border}`}>
            {qCfg.label}
          </span>
        </div>
        {exec.proofStatement ? (
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed pl-5">{exec.proofStatement}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground/35 italic pl-5">No proof statement available.</p>
        )}
      </div>
    </div>
  );
}

// ─── Scheduling Truth block / (c-pre) ────────────────────────────────────────

const DEP_CLASS_CONFIG: Record<StepDependencyClass, {
  label: string;
  color: string;
  bg: string;
  dot: string;
  description: string;
}> = {
  strictly_sequential: {
    label:       'Sequential',
    color:       'text-slate-300/90',
    bg:          'bg-slate-400/8',
    dot:         'bg-slate-400/60',
    description: 'Requires prior write or state to be present',
  },
  potentially_independent: {
    label:       'Read-only',
    color:       'text-purple-300/90',
    bg:          'bg-purple-400/8',
    dot:         'bg-purple-400/60',
    description: 'No outstanding unverified writes — read could run earlier',
  },
  verification_gated: {
    label:       'Verify-gated',
    color:       'text-cyan-300/90',
    bg:          'bg-cyan-400/8',
    dot:         'bg-cyan-400/60',
    description: 'Blocked on unverified file writes',
  },
  repair_driven: {
    label:       'Repair-driven',
    color:       'text-amber-300/90',
    bg:          'bg-amber-400/8',
    dot:         'bg-amber-400/60',
    description: 'Triggered by a prior action failure',
  },
};

function SchedulingTruthBlock({ analysis }: { analysis: DependencyAnalysis }) {
  const [expanded, setExpanded] = useState(false);

  const totalRecords = Object.values(analysis.counts).reduce((s, n) => s + n, 0);
  const classKeys = Object.keys(analysis.counts) as StepDependencyClass[];
  const nonZero = classKeys.filter(k => analysis.counts[k] > 0);

  return (
    <div className="space-y-2">
      {/* Collapsible header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded border border-indigo-400/20 bg-indigo-400/5 hover:bg-indigo-400/8 transition-colors text-xs text-left"
      >
        <Info className="w-3.5 h-3.5 shrink-0 text-indigo-400/70" />
        <span className="text-indigo-200/80 flex-1 leading-relaxed truncate">{analysis.serialReason}</span>
        <span className="text-indigo-400/40 text-[10px] shrink-0 tabular-nums">{totalRecords} records</span>
        {expanded
          ? <ChevronDown className="w-3 h-3 shrink-0 text-indigo-400/40 ml-1" />
          : <ChevronRight className="w-3 h-3 shrink-0 text-indigo-400/30 ml-1" />
        }
      </button>

      {/* Per-class breakdown (collapsible) */}
      {expanded && (
        <>
          {nonZero.length > 0 && (
            <div className="rounded border border-panel-border/30 overflow-hidden">
              {nonZero.map((cls, i) => {
                const cfg  = DEP_CLASS_CONFIG[cls];
                const n    = analysis.counts[cls];
                const pct  = totalRecords > 0 ? Math.round((n / totalRecords) * 100) : 0;
                return (
                  <div
                    key={cls}
                    className={`flex items-center gap-3 px-3 py-1.5 text-xs ${cfg.bg} ${
                      i < nonZero.length - 1 ? 'border-b border-panel-border/20' : ''
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className={`font-medium ${cfg.color} flex-1`}>{cfg.label}</span>
                    <span className="text-muted-foreground/50 text-[10px] hidden sm:inline">{cfg.description}</span>
                    <span className="tabular-nums text-muted-foreground/70 ml-2">
                      {n} <span className="text-muted-foreground/40">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Potentially-independent action IDs (if any) */}
          {analysis.potentiallyIndependentActionIds.length > 0 && (
            <div className="px-3 py-2 rounded border border-purple-400/15 bg-purple-400/5 text-[10px] text-muted-foreground/50">
              <span className="text-purple-300/70 font-medium">Read-only (first-access) records: </span>
              <span className="font-mono break-all">
                {analysis.potentiallyIndependentActionIds.slice(0, 6).join(', ')}
                {analysis.potentiallyIndependentActionIds.length > 6 && ` …+${analysis.potentiallyIndependentActionIds.length - 6} more`}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PhaseTimelineBlock({ timeline }: { timeline: Array<{ phase: string; enteredAt: number }> | null }) {
  if (!timeline || timeline.length === 0) {
    return <AbsentBlock message="Phase timeline not captured for this task." />;
  }

  const PHASE_COLORS: Record<string, string> = {
    initializing: 'text-muted-foreground/60',
    planning:     'text-blue-400/80',
    executing:    'text-emerald-400/80',
    verifying:    'text-cyan-400/80',
    repairing:    'text-amber-400/80',
    wrapping_up:  'text-green-400/80',
    complete:     'text-green-400',
    failed:       'text-red-400/80',
  };

  return (
    <div className="rounded border border-violet-400/20 bg-violet-400/5 overflow-hidden border-l-2 border-l-violet-500/50">
      <div className="divide-y divide-violet-400/10">
        {timeline.map((entry, i) => {
          const color = PHASE_COLORS[entry.phase] ?? 'text-foreground/60';
          const durationMs = i < timeline.length - 1
            ? timeline[i + 1].enteredAt - entry.enteredAt
            : null;

          return (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400/40 shrink-0" />
              <span className={`font-mono flex-1 ${color}`}>{entry.phase}</span>
              {durationMs !== null && durationMs > 0 && (
                <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                  {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/25 tabular-nums shrink-0">
                {format(new Date(entry.enteredAt), 'HH:mm:ss')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── (d) Checkpoint block ─────────────────────────────────────────────────────

function CheckpointBlock({ checkpoint }: { checkpoint: TaskEvidenceCheckpointSummary | null }) {
  if (!checkpoint) {
    return <AbsentBlock message="No files staged — no write operations were committed, or task failed before checkpoint." />;
  }

  return (
    <div className="rounded border border-emerald-500/20 bg-emerald-500/5 text-xs overflow-hidden border-l-2 border-l-emerald-500/50">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-emerald-500/10">
        <Database className="w-3 h-3 text-emerald-400/60 shrink-0" />
        <span className="text-emerald-300/70">
          {checkpoint.fileCount} file{checkpoint.fileCount !== 1 ? 's' : ''} staged
        </span>
        {checkpoint.staged && (
          <span className="ml-auto text-[10px] text-emerald-400/40">checkpoint captured</span>
        )}
      </div>
      {checkpoint.files.length > 0 && (
        <ul className="divide-y divide-emerald-500/5">
          {checkpoint.files.map((f, i) => (
            <li key={i} className="px-3 py-1 font-mono text-emerald-300/60 truncate" title={f}>
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── (e) Action records section ───────────────────────────────────────────────

const ACTION_TYPE_CONFIG: Record<ActionType, { label: string; color: string; bg: string; border: string; icon: SectionProps['icon'] }> = {
  READ_FILE:             { label: 'File reads',         color: 'text-purple-300',  bg: 'bg-purple-400/5',  border: 'border-purple-400/15',  icon: Eye          },
  WRITE_FILE:            { label: 'File writes',        color: 'text-emerald-300', bg: 'bg-emerald-400/5', border: 'border-emerald-400/15', icon: FileEdit     },
  EXEC_COMMAND:          { label: 'Commands',           color: 'text-cyan-300',    bg: 'bg-cyan-400/5',    border: 'border-cyan-400/15',    icon: Terminal     },
  VERIFY_RESULT:         { label: 'Verifications',      color: 'text-green-300',   bg: 'bg-green-400/5',   border: 'border-green-400/15',   icon: CheckCircle2 },
  TOOL_ACTION:           { label: 'Tool actions',       color: 'text-slate-300',   bg: 'bg-slate-400/5',   border: 'border-slate-400/15',   icon: Activity     },
  APPROVAL_CHECKPOINT:   { label: 'Approval gates',     color: 'text-blue-300',    bg: 'bg-blue-400/5',    border: 'border-blue-400/15',    icon: Shield       },
  APPROVAL_DECISION:     { label: 'Approval decisions', color: 'text-orange-300',  bg: 'bg-orange-400/5',  border: 'border-orange-400/15',  icon: Shield       },
  LANE_STEERED:          { label: 'Lane signals',       color: 'text-amber-300',   bg: 'bg-amber-400/5',   border: 'border-amber-400/15',   icon: Activity     },
  OPERATOR_OVERRIDE:     { label: 'Step overrides',     color: 'text-rose-300',    bg: 'bg-rose-400/5',    border: 'border-rose-400/15',    icon: Activity     },
};

const ACTION_TYPE_ORDER: ActionType[] = ['READ_FILE', 'WRITE_FILE', 'EXEC_COMMAND', 'VERIFY_RESULT', 'TOOL_ACTION', 'APPROVAL_CHECKPOINT', 'APPROVAL_DECISION', 'LANE_STEERED', 'OPERATOR_OVERRIDE'];

// ─── Drill-down detail panel ──────────────────────────────────────────────────

function ActionDetailPanel({ action }: { action: ActionRecord }) {
  const type = action.type;

  if (type === 'READ_FILE') {
    const meta = action.meta as ReadFileMeta;
    return (
      <div className="px-3 py-2 space-y-1 text-[11px] bg-black/20 border-t border-purple-400/10">
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Path</span>
          <span className="font-mono text-purple-200/70 break-all">{meta.filePath}</span>
        </div>
        {meta.byteCount != null && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Size</span>
            <span className="font-mono text-muted-foreground/60">{meta.byteCount.toLocaleString()} bytes</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Source</span>
          <span className="font-mono text-muted-foreground/50">{meta.fromStaging ? 'staging' : 'live filesystem'}</span>
        </div>
        {action.outcome?.summary && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Note</span>
            <span className="text-muted-foreground/60">{action.outcome.summary}</span>
          </div>
        )}
      </div>
    );
  }

  if (type === 'WRITE_FILE') {
    const meta = action.meta as WriteFileMeta;
    return (
      <div className="px-3 py-2 space-y-1 text-[11px] bg-black/20 border-t border-emerald-400/10">
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Path</span>
          <span className="font-mono text-emerald-200/70 break-all">{meta.filePath}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Size</span>
          <span className="font-mono text-muted-foreground/60">{meta.byteCount.toLocaleString()} bytes</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Status</span>
          <span className={`font-mono ${meta.isNew ? 'text-emerald-400/70' : 'text-blue-400/70'}`}>
            {meta.isNew ? 'new file' : 'overwritten'}
          </span>
        </div>
        {action.outcome?.summary && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Note</span>
            <span className="text-muted-foreground/60">{action.outcome.summary}</span>
          </div>
        )}
      </div>
    );
  }

  if (type === 'EXEC_COMMAND') {
    const meta = action.meta as ExecCommandMeta;
    const ok = action.outcome?.success;
    const exitCode = action.outcome?.exitCode;
    return (
      <div className="px-3 py-2 space-y-1 text-[11px] bg-black/20 border-t border-cyan-400/10">
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Command</span>
          <pre className="font-mono text-cyan-200/70 break-all whitespace-pre-wrap flex-1">{meta.command}</pre>
        </div>
        {meta.workingDir && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Dir</span>
            <span className="font-mono text-muted-foreground/50">{meta.workingDir}</span>
          </div>
        )}
        {exitCode !== undefined && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Exit</span>
            <span className={`font-mono font-semibold ${ok ? 'text-green-400/80' : 'text-red-400/80'}`}>
              {exitCode} — {ok ? 'success' : 'failed'}
            </span>
          </div>
        )}
        {meta.sideEffectClass && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Effect class</span>
            <span className="font-mono text-muted-foreground/50">{meta.sideEffectClass}</span>
          </div>
        )}
        {action.outcome?.error && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Error</span>
            <pre className="font-mono text-red-300/60 break-all whitespace-pre-wrap flex-1 text-[10px] max-h-20 overflow-y-auto">
              {action.outcome.error}
            </pre>
          </div>
        )}
        {action.outcome?.summary && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Output</span>
            <pre className="font-mono text-muted-foreground/50 break-all whitespace-pre-wrap flex-1 text-[10px] max-h-20 overflow-y-auto">
              {action.outcome.summary}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (type === 'VERIFY_RESULT') {
    const meta = action.meta as VerifyResultMeta;
    return (
      <div className="px-3 py-2 space-y-1 text-[11px] bg-black/20 border-t border-green-400/10">
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Probe</span>
          <span className="font-mono text-green-200/70 break-all flex-1">{meta.probe}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Method</span>
          <span className="font-mono text-muted-foreground/60">{meta.method}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Outcome</span>
          <span className={`font-mono font-semibold ${meta.passed ? 'text-green-400/80' : 'text-red-400/80'}`}>
            {meta.passed ? 'pass' : 'fail'}
          </span>
        </div>
        {action.outcome?.summary && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Note</span>
            <span className="text-muted-foreground/60">{action.outcome.summary}</span>
          </div>
        )}
      </div>
    );
  }

  if (type === 'TOOL_ACTION') {
    const meta = action.meta as ToolActionMeta;
    const extra = Object.entries(meta).filter(([k]) => k !== 'type' && k !== 'toolName');
    return (
      <div className="px-3 py-2 space-y-1 text-[11px] bg-black/20 border-t border-slate-400/10">
        <div className="flex gap-2">
          <span className="text-muted-foreground/40 shrink-0">Tool</span>
          <span className="font-mono text-slate-200/70">{meta.toolName}</span>
        </div>
        {extra.length > 0 && extra.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0 capitalize">{k}</span>
            <span className="font-mono text-muted-foreground/50 truncate">{String(v)}</span>
          </div>
        ))}
        {action.outcome?.summary && (
          <div className="flex gap-2">
            <span className="text-muted-foreground/40 shrink-0">Note</span>
            <span className="text-muted-foreground/60">{action.outcome.summary}</span>
          </div>
        )}
        {!meta.toolName && !action.outcome?.summary && (
          <span className="text-muted-foreground/30 italic">No detail available.</span>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 py-2 text-[11px] text-muted-foreground/30 italic bg-black/20 border-t border-panel-border/20">
      No detail available.
    </div>
  );
}

// ─── Single action row with drill-down ───────────────────────────────────────

function ActionRecordRow({
  action,
  expandedId,
  onToggle,
}: {
  action: ActionRecord;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const cfg = ACTION_TYPE_CONFIG[action.type] ?? ACTION_TYPE_CONFIG.TOOL_ACTION;
  const Icon = cfg.icon;
  const isExpanded = expandedId === action.id;

  let label = '';
  let detail: React.ReactNode = null;

  if (action.type === 'READ_FILE') {
    const meta = action.meta as ReadFileMeta;
    label = meta.filePath;
    detail = (
      <span className="flex items-center gap-1 shrink-0">
        {meta.fromStaging && (
          <span className="text-[9px] px-1 py-0.5 rounded border border-amber-400/25 bg-amber-400/8 text-amber-300/60 font-semibold uppercase tracking-wide">
            staging
          </span>
        )}
        {meta.byteCount != null && (
          <span className="text-[10px] text-muted-foreground/30 tabular-nums">{meta.byteCount.toLocaleString()} B</span>
        )}
      </span>
    );
  } else if (action.type === 'WRITE_FILE') {
    const meta = action.meta as WriteFileMeta;
    label = meta.filePath;
    detail = (
      <span className="flex items-center gap-1 shrink-0">
        <span className={`text-[9px] px-1 py-0.5 rounded border font-semibold uppercase tracking-wide ${
          meta.isNew
            ? 'border-emerald-400/25 bg-emerald-400/8 text-emerald-300/60'
            : 'border-blue-400/25 bg-blue-400/8 text-blue-300/60'
        }`}>
          {meta.isNew ? 'new' : 'overwrite'}
        </span>
        <span className="text-[10px] text-muted-foreground/30 tabular-nums">{meta.byteCount.toLocaleString()} B</span>
      </span>
    );
  } else if (action.type === 'EXEC_COMMAND') {
    const meta = action.meta as ExecCommandMeta;
    label = meta.command;
    detail = (
      <span className="flex items-center gap-1 shrink-0">
        {meta.sideEffectClass && (
          <span className="flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded border border-cyan-400/20 bg-cyan-400/5 text-cyan-300/60 font-mono">
            <Cpu className="w-2 h-2 shrink-0 opacity-60" />
            {meta.sideEffectClass}
          </span>
        )}
        {action.outcome?.exitCode != null && (() => {
          const ok = action.outcome!.success;
          return (
            <span className={`text-[10px] tabular-nums ${ok ? 'text-green-400/60' : 'text-red-400/60'}`}>
              {ok ? 'success' : 'failed'} · exit {action.outcome!.exitCode}
            </span>
          );
        })()}
      </span>
    );
  } else if (action.type === 'VERIFY_RESULT') {
    const meta = action.meta as VerifyResultMeta;
    label = meta.probe;
    detail = (
      <span className={`text-[10px] shrink-0 ${meta.passed ? 'text-green-400/60' : 'text-red-400/60'}`}>
        {meta.passed ? 'pass' : 'fail'}
      </span>
    );
  } else if (action.type === 'TOOL_ACTION') {
    const meta = action.meta as ToolActionMeta;
    label = meta.toolName;
  }

  const DEP_CLASS_BADGE: Record<ActionStepDepClass, { label: string; color: string }> = {
    strictly_sequential:     { label: 'seq',    color: 'text-slate-400/60 border-slate-400/20 bg-slate-400/5' },
    potentially_independent: { label: 'read∅',  color: 'text-purple-400/60 border-purple-400/20 bg-purple-400/5' },
    verification_gated:      { label: 'gated',  color: 'text-cyan-400/60 border-cyan-400/20 bg-cyan-400/5' },
    repair_driven:           { label: 'repair', color: 'text-amber-400/60 border-amber-400/20 bg-amber-400/5' },
  };

  const depBadge = action.dependencyClass != null
    ? DEP_CLASS_BADGE[action.dependencyClass as ActionStepDepClass]
    : null;

  return (
    <div>
      <button
        onClick={() => onToggle(action.id)}
        className={`w-full flex items-center gap-2 px-3 py-1 text-xs text-left hover:bg-white/3 transition-colors ${isExpanded ? 'bg-white/3' : ''}`}
      >
        <Icon className={`w-2.5 h-2.5 shrink-0 ${cfg.color} opacity-60`} />
        <span className={`font-mono truncate flex-1 ${cfg.color} opacity-70`} title={label}>{label || '—'}</span>
        {depBadge && (
          <span className={`text-[9px] px-1 py-0.5 rounded border font-mono shrink-0 ${depBadge.color}`}>
            {depBadge.label}
          </span>
        )}
        {detail}
        {isExpanded
          ? <ChevronDown className="w-2.5 h-2.5 shrink-0 text-muted-foreground/30 ml-1" />
          : <ChevronRight className="w-2.5 h-2.5 shrink-0 text-muted-foreground/20 ml-1" />
        }
      </button>
      {isExpanded && <ActionDetailPanel action={action} />}
    </div>
  );
}

// ─── Phase-grouped actions display ───────────────────────────────────────────

interface PhaseGroupProps {
  phase: string;
  actions: ActionRecord[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  defaultOpen?: boolean;
}

const PHASE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  PLANNING:    { color: 'text-blue-400/80',    bg: 'bg-blue-400/5',    border: 'border-blue-400/20'   },
  INSPECTING:  { color: 'text-purple-400/80',  bg: 'bg-purple-400/5',  border: 'border-purple-400/20' },
  EDITING:     { color: 'text-emerald-400/80', bg: 'bg-emerald-400/5', border: 'border-emerald-400/20'},
  VERIFYING:   { color: 'text-cyan-400/80',    bg: 'bg-cyan-400/5',    border: 'border-cyan-400/20'   },
  REPAIRING:   { color: 'text-amber-400/80',   bg: 'bg-amber-400/5',   border: 'border-amber-400/20'  },
  'WRAPPING UP':{ color: 'text-green-400/80',  bg: 'bg-green-400/5',   border: 'border-green-400/20'  },
  UNGROUPED:   { color: 'text-muted-foreground/50', bg: 'bg-panel-border/10', border: 'border-panel-border/30' },
};

function PhaseGroup({ phase, actions, expandedId, onToggle, defaultOpen = true }: PhaseGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const style = PHASE_STYLE[phase] ?? PHASE_STYLE.UNGROUPED;

  return (
    <div className={`rounded border ${style.border} ${style.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-2.5 py-1 text-left hover:brightness-110 transition-colors`}
      >
        <span className={`text-[10px] font-semibold uppercase tracking-wider flex-1 ${style.color}`}>
          {phase === 'UNGROUPED' ? 'Unphased' : phase}
        </span>
        <span className="text-[10px] text-muted-foreground/30 tabular-nums">{actions.length}</span>
        {open
          ? <ChevronDown className={`w-3 h-3 shrink-0 ${style.color} opacity-60`} />
          : <ChevronRight className={`w-3 h-3 shrink-0 ${style.color} opacity-60`} />
        }
      </button>
      {open && (
        <div className={`border-t ${style.border} divide-y divide-white/5`}>
          {actions.map(action => (
            <ActionRecordRow
              key={action.id}
              action={action}
              expandedId={expandedId}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Action type filter chips ─────────────────────────────────────────────────

interface FilterChipProps {
  type: ActionType;
  active: boolean;
  onToggle: (t: ActionType) => void;
}

function FilterChip({ type, active, onToggle }: FilterChipProps) {
  const cfg = ACTION_TYPE_CONFIG[type];
  const Icon = cfg.icon;
  return (
    <button
      onClick={() => onToggle(type)}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
        active
          ? `${cfg.color} ${cfg.bg} ${cfg.border}`
          : 'text-muted-foreground/30 border-panel-border/30 bg-transparent'
      }`}
      title={active ? `Hide ${cfg.label}` : `Show ${cfg.label}`}
    >
      <Icon className="w-2.5 h-2.5 shrink-0" />
      <span className="hidden sm:inline">{cfg.label}</span>
    </button>
  );
}

// ─── (f) Runtime Impact block ─────────────────────────────────────────────────

interface RuntimeDiffEntry {
  newlyOpened: number[];
  newlyClosed: number[];
  unchanged: number[];
  hasChange: boolean;
}

function RuntimeImpactBlock({ evidence }: { evidence: RuntimeDiffEntry[] | null }) {
  if (!evidence || evidence.length === 0) {
    return <AbsentBlock message="No runtime impact detected during this task (no port changes observed)." />;
  }

  const withChange = evidence.filter(e => e.hasChange);

  return (
    <div className="rounded border border-green-500/20 bg-green-500/5 text-xs overflow-hidden border-l-2 border-l-green-500/50">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-green-500/10">
        <Radio className="w-3 h-3 text-green-400/60 shrink-0" />
        <span className="text-green-300/70">
          {evidence.length} runtime probe{evidence.length !== 1 ? 's' : ''}
          {withChange.length > 0 && (
            <span className="text-green-400/50 ml-1">· {withChange.length} with port change</span>
          )}
        </span>
      </div>
      <div className="divide-y divide-green-500/5">
        {evidence.map((diff, i) => (
          <div key={i} className="px-3 py-1.5 space-y-0.5">
            {diff.newlyOpened.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-green-400/50 uppercase tracking-wider w-14 shrink-0">Opened</span>
                <div className="flex flex-wrap gap-1">
                  {diff.newlyOpened.map(p => (
                    <span key={p} className="font-mono text-green-300/70 bg-green-400/10 border border-green-400/15 px-1.5 py-0.5 rounded">:{p}</span>
                  ))}
                </div>
              </div>
            )}
            {diff.newlyClosed.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-400/50 uppercase tracking-wider w-14 shrink-0">Closed</span>
                <div className="flex flex-wrap gap-1">
                  {diff.newlyClosed.map(p => (
                    <span key={p} className="font-mono text-amber-300/70 bg-amber-400/10 border border-amber-400/15 px-1.5 py-0.5 rounded">:{p}</span>
                  ))}
                </div>
              </div>
            )}
            {!diff.hasChange && (
              <div className="text-[10px] text-muted-foreground/40 italic">
                {diff.unchanged.length > 0
                  ? `No change — port${diff.unchanged.length !== 1 ? 's' : ''} ${diff.unchanged.map(p => `:${p}`).join(', ')} stable`
                  : 'No port state changes detected'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── P4: Runtime Lifecycle block ─────────────────────────────────────────────

function RuntimeSnapshotRow({ label, snap }: {
  label: string;
  snap: { timestamp: string; openPorts: number[]; envMeta?: { nodeVersion: string; processCount: number | null; relevantEnvKeys: string[] } } | undefined;
}) {
  if (!snap) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground/40 italic">
        <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider">{label}</span>
        <span>not captured</span>
      </div>
    );
  }
  return (
    <div className="px-3 py-1.5 space-y-0.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/50">{label}</span>
        <span className="text-muted-foreground/60 font-mono text-[10px]">
          {format(new Date(snap.timestamp), 'HH:mm:ss.SSS')}
        </span>
      </div>
      <div className="flex items-center gap-2 ml-28">
        {snap.openPorts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {snap.openPorts.map(p => (
              <span key={p} className="font-mono text-emerald-300/70 bg-emerald-400/10 border border-emerald-400/15 px-1.5 py-0.5 rounded text-[10px]">:{p}</span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/30 italic">no open ports</span>
        )}
      </div>
      {snap.envMeta && (
        <div className="ml-28 flex items-center gap-3 text-[10px] text-muted-foreground/40">
          <span>Node {snap.envMeta.nodeVersion}</span>
          {snap.envMeta.processCount != null && <span>{snap.envMeta.processCount} processes</span>}
          {snap.envMeta.relevantEnvKeys.length > 0 && (
            <span>{snap.envMeta.relevantEnvKeys.length} relevant env keys</span>
          )}
        </div>
      )}
    </div>
  );
}

function RuntimeLifecycleBlock({ lifecycle }: { lifecycle: TaskEvidenceRuntimeLifecycle | null | undefined }) {
  if (!lifecycle) {
    return <AbsentBlock message="Runtime lifecycle data not available — snapshot capture requires task-start and post-apply runtime probing." />;
  }

  const { taskStartSnapshot, postApplySnapshot, portDiff, processLinkage, isStaleAfterApply } = lifecycle;

  return (
    <div className="rounded border border-purple-500/20 bg-purple-500/5 text-xs overflow-hidden border-l-2 border-l-purple-500/50 space-y-0">

      {/* Snapshots */}
      <div className="border-b border-purple-500/10">
        <RuntimeSnapshotRow label="Task start" snap={taskStartSnapshot} />
        <RuntimeSnapshotRow label="Post-apply" snap={postApplySnapshot} />
      </div>

      {/* Port diff */}
      {portDiff ? (
        <div className="px-3 py-1.5 border-b border-purple-500/10">
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/50">Port diff</span>
            {portDiff.hasChange ? (
              <div className="flex flex-wrap gap-1.5">
                {portDiff.newlyOpened.map(p => (
                  <span key={`o-${p}`} className="font-mono text-emerald-300/70 bg-emerald-400/10 border border-emerald-400/15 px-1.5 py-0.5 rounded text-[10px]">+:{p}</span>
                ))}
                {portDiff.newlyClosed.map(p => (
                  <span key={`c-${p}`} className="font-mono text-red-300/70 bg-red-400/10 border border-red-400/15 px-1.5 py-0.5 rounded text-[10px]">−:{p}</span>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground/40 italic">no port state changes</span>
            )}
          </div>
        </div>
      ) : (
        <div className="px-3 py-1.5 border-b border-purple-500/10 text-[10px] text-muted-foreground/30 italic">
          Port diff unavailable (snapshots required on both sides)
        </div>
      )}

      {/* Stale detection */}
      <div className="px-3 py-1.5 border-b border-purple-500/10">
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/50">Stale signal</span>
          {isStaleAfterApply === true ? (
            <div className="flex items-center gap-1.5 text-amber-400/80">
              <AlertCircle className="w-3 h-3" />
              <span className="text-[10px]">Runtime-impacting files applied but no server restart detected — preview may be stale</span>
            </div>
          ) : isStaleAfterApply === false ? (
            <div className="flex items-center gap-1.5 text-emerald-400/70">
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-[10px]">No stale-runtime condition detected</span>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground/30 italic">insufficient data</span>
          )}
        </div>
      </div>

      {/* Process linkage */}
      {processLinkage.length > 0 ? (
        <div className="px-3 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Process linkage</div>
          <div className="space-y-0.5">
            {processLinkage.slice(0, 8).map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`font-mono text-[10px] border px-1.5 py-0.5 rounded shrink-0 ${
                  entry.event === 'opened'
                    ? 'text-emerald-300/70 bg-emerald-400/10 border-emerald-400/15'
                    : 'text-red-300/70 bg-red-400/10 border-red-400/15'
                }`}>
                  {entry.event === 'opened' ? '+' : '−'}:{entry.port}
                </span>
                <span className="text-[10px] text-muted-foreground/50 font-mono truncate">{entry.command.slice(0, 80)}</span>
              </div>
            ))}
            {processLinkage.length > 8 && (
              <div className="text-[10px] text-muted-foreground/30 italic">+ {processLinkage.length - 8} more entries</div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground/30 italic">No process linkage entries (no runtime probe port changes observed)</div>
      )}
    </div>
  );
}

// ─── P4: Orchestration section ────────────────────────────────────────────────

interface OrchestrationBlockProps {
  lanes: LaneSummary[] | null | undefined;
  selectivelyBlockedLanes?: string[] | null;
}

function OrchestrationBlock({ lanes, selectivelyBlockedLanes }: OrchestrationBlockProps) {
  if (!lanes || lanes.length === 0) {
    return <AbsentBlock message="No parallel dispatch data for this task." />;
  }

  const distinctLaneIds = [...new Set(lanes.map(l => l.laneId))].sort();
  const laneCount = distinctLaneIds.length;
  const dispatchMode = laneCount > 1 ? 'parallel' : 'serial_fallback';

  const laneStatusMap = new Map<string, LaneSummary>();
  for (const lane of lanes) {
    if (!laneStatusMap.has(lane.laneId)) laneStatusMap.set(lane.laneId, lane);
  }

  const DISPATCH_COLOR: Record<string, string> = {
    parallel:       'text-teal-300/80 bg-teal-400/10 border-teal-400/25',
    serial_fallback:'text-slate-300/60 bg-slate-400/8 border-slate-400/20',
  };
  const dispatchStyle = DISPATCH_COLOR[dispatchMode] ?? DISPATCH_COLOR.serial_fallback;

  const STATUS_DOT: Record<string, string> = {
    success:  'bg-green-400/70',
    failed:   'bg-red-400/70',
    error:    'bg-red-400/70',
    cancelled:'bg-amber-400/70',
  };
  const STATUS_TEXT: Record<string, string> = {
    success:  'text-green-300/80',
    failed:   'text-red-300/80',
    error:    'text-red-300/80',
    cancelled:'text-amber-300/80',
  };

  const failureIsolationLanes = lanes.filter(
    l => l.status === 'failed' || l.status === 'error' || l.status === 'cancelled'
  );

  return (
    <div className="rounded border border-cyan-400/20 bg-cyan-400/5 text-xs overflow-hidden border-l-2 border-l-cyan-500/60">
      <div className="px-3 py-2.5 space-y-2.5">

        {/* Header stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <span className="text-[10px] text-cyan-400/40 uppercase tracking-wider block mb-0.5">Dispatch Mode</span>
            <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${dispatchStyle}`}>
              {dispatchMode}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-cyan-400/40 uppercase tracking-wider block mb-0.5">Lanes</span>
            <span className="font-mono text-cyan-200/80 font-semibold">{laneCount}</span>
          </div>
        </div>

        {/* Per-lane status table */}
        <div>
          <span className="text-[10px] text-cyan-400/40 uppercase tracking-wider block mb-1">Per-Lane Status</span>
          <div className="rounded border border-cyan-400/10 overflow-hidden divide-y divide-cyan-400/8">
            <div className="grid grid-cols-3 px-2 py-1 bg-cyan-400/5 text-[10px] text-cyan-400/40 uppercase tracking-wider">
              <span>Lane ID</span>
              <span>Status</span>
              <span>Failure</span>
            </div>
            {distinctLaneIds.map(laneId => {
              const lane = laneStatusMap.get(laneId)!;
              const dotColor = STATUS_DOT[lane.status] ?? 'bg-muted-foreground/30';
              const textColor = STATUS_TEXT[lane.status] ?? 'text-muted-foreground/50';
              return (
                <div key={laneId} className="grid grid-cols-3 px-2 py-1.5 items-center">
                  <span className="font-mono text-cyan-200/70 text-[11px]">{laneId}</span>
                  <span className={`flex items-center gap-1.5 ${textColor}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                    {lane.status}
                  </span>
                  <span className="text-red-400/60 text-[10px] truncate" title={lane.error ?? undefined}>
                    {lane.error ? lane.error.slice(0, 40) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Failure isolation events */}
        {(failureIsolationLanes.length > 0 || (selectivelyBlockedLanes && selectivelyBlockedLanes.length > 0)) && (
          <div>
            <span className="text-[10px] text-cyan-400/40 uppercase tracking-wider block mb-1">Failure Isolation Events</span>
            <div className="space-y-1">
              {failureIsolationLanes.map(lane => (
                <div key={lane.laneId} className="flex items-start gap-2 px-2 py-1 rounded border border-red-400/15 bg-red-400/5 text-[11px]">
                  <AlertCircle className="w-3 h-3 text-red-400/60 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-mono text-red-300/70">{lane.laneId}</span>
                    <span className="text-muted-foreground/50 ml-1">{lane.status}</span>
                    {lane.error && <span className="text-red-400/50 ml-1">— {lane.error.slice(0, 80)}</span>}
                  </span>
                </div>
              ))}
              {selectivelyBlockedLanes && selectivelyBlockedLanes.filter(id => !failureIsolationLanes.find(l => l.laneId === id)).map(id => (
                <div key={id} className="flex items-center gap-2 px-2 py-1 rounded border border-amber-400/15 bg-amber-400/5 text-[11px]">
                  <Shield className="w-3 h-3 text-amber-400/60 shrink-0" />
                  <span className="font-mono text-amber-300/70">{id}</span>
                  <span className="text-muted-foreground/50">operator-blocked via selective approval</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── task-9: Continuation Lineage section ────────────────────────────────────

function ContinuationLineageBlock({ lineage }: { lineage: ContinuationLineage | null | undefined }) {
  if (!lineage) {
    return <AbsentBlock message="Not a resumed task — no continuation lineage for this run." />;
  }

  const { whatRemainedAtResume: w } = lineage;

  return (
    <div className="rounded border border-sky-400/20 bg-sky-400/5 text-xs overflow-hidden border-l-2 border-l-sky-500/60">
      <div className="px-3 py-2.5 space-y-2.5">

        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div>
            <span className="text-sky-400/40 text-[10px] uppercase tracking-wider block mb-0.5">Parent task</span>
            <span className="font-mono text-sky-200/70 truncate block" title={lineage.parentTaskId}>{lineage.parentTaskId}</span>
          </div>
          <div>
            <span className="text-sky-400/40 text-[10px] uppercase tracking-wider block mb-0.5">Origin checkpoint</span>
            <span className="font-mono text-sky-200/70 truncate block" title={lineage.originCheckpointId}>{lineage.originCheckpointId}</span>
          </div>
          <div>
            <span className="text-sky-400/40 text-[10px] uppercase tracking-wider block mb-0.5">Ancestry depth</span>
            <span className="font-mono text-sky-200/80">{lineage.ancestryDepth} hop{lineage.ancestryDepth !== 1 ? 's' : ''} from original</span>
          </div>
          {w?.groundedFrom && (
            <div>
              <span className="text-sky-400/40 text-[10px] uppercase tracking-wider block mb-0.5">Grounded from</span>
              <span className="font-mono text-sky-200/50 text-[10px] truncate block">{w.groundedFrom.checkpointId}</span>
            </div>
          )}
        </div>

        {w && (
          <div className="space-y-1.5">
            {w.completedSteps.length > 0 && (
              <div>
                <span className="text-[10px] text-sky-400/40 uppercase tracking-wider block mb-0.5">
                  Completed at resume ({w.completedSteps.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {w.completedSteps.map((s, i) => (
                    <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-green-400/20 bg-green-400/5 text-green-300/60">
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {w.remainingSteps.length > 0 && (
              <div>
                <span className="text-[10px] text-sky-400/40 uppercase tracking-wider block mb-0.5">
                  Remaining at resume ({w.remainingSteps.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {w.remainingSteps.map((s, i) => (
                    <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-400/20 bg-amber-400/5 text-amber-300/60">
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {w.failedSteps.length > 0 && (
              <div>
                <span className="text-[10px] text-sky-400/40 uppercase tracking-wider block mb-0.5">
                  Failed / blocked at resume ({w.failedSteps.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {w.failedSteps.map((s, i) => (
                    <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-red-400/20 bg-red-400/5 text-red-300/60" title={s.reason}>
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── task-9: Lane Evidence section ───────────────────────────────────────────

const LANE_STATUS_CONFIG: Record<string, { color: string; dot: string }> = {
  success:    { color: 'text-green-300/80',  dot: 'bg-green-400/60'  },
  failed:     { color: 'text-red-300/80',    dot: 'bg-red-400/60'    },
  error:      { color: 'text-red-300/80',    dot: 'bg-red-400/60'    },
  cancelled:  { color: 'text-amber-300/80',  dot: 'bg-amber-400/60'  },
  serialized: { color: 'text-slate-300/60',  dot: 'bg-slate-400/40'  },
  unknown:    { color: 'text-muted-foreground/50', dot: 'bg-muted-foreground/30' },
};

const VERIFY_OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  passed:      { label: 'passed',    color: 'text-green-400/70'  },
  failed:      { label: 'failed',    color: 'text-red-400/70'    },
  deferred:    { label: 'deferred',  color: 'text-muted-foreground/40' },
  not_run:     { label: 'not run',   color: 'text-muted-foreground/30' },
};

function LaneEvidenceBlock({ lanes }: { lanes: LaneSummary[] | null | undefined }) {
  if (!lanes || lanes.length === 0) {
    return <AbsentBlock message="No parallel lane execution for this task — lane evidence not available." />;
  }

  // Group by laneId
  const byLane = new Map<string, LaneSummary[]>();
  for (const lane of lanes) {
    const existing = byLane.get(lane.laneId) ?? [];
    existing.push(lane);
    byLane.set(lane.laneId, existing);
  }

  const laneIds = [...byLane.keys()].sort();
  const successCount = lanes.filter(l => l.status === 'success').length;
  const failedCount  = lanes.filter(l => l.status === 'failed' || l.status === 'error').length;
  const otherCount   = lanes.filter(l => l.status !== 'success' && l.status !== 'failed' && l.status !== 'error').length;

  return (
    <div className="rounded border border-teal-400/20 bg-teal-400/5 text-xs overflow-hidden border-l-2 border-l-teal-500/50">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-teal-400/10">
        <Network className="w-3 h-3 text-teal-400/60 shrink-0" />
        <span className="text-teal-300/70">
          {laneIds.length} lane{laneIds.length !== 1 ? 's' : ''}
          <span className="text-teal-400/40 ml-1">
            · {successCount} success
            {failedCount > 0 && ` · ${failedCount} failed`}
            {otherCount > 0 && ` · ${otherCount} other`}
          </span>
        </span>
      </div>

      <div className="divide-y divide-teal-400/5">
        {laneIds.map(laneId => {
          const entries = byLane.get(laneId)!;
          const firstEntry = entries[0];
          const statusCfg = LANE_STATUS_CONFIG[firstEntry.status] ?? LANE_STATUS_CONFIG.unknown;
          const verifyCfg = VERIFY_OUTCOME_CONFIG[firstEntry.verificationOutcome ?? 'deferred'] ?? VERIFY_OUTCOME_CONFIG.deferred;

          return (
            <div key={laneId} className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusCfg.dot}`} />
                <span className={`font-mono font-semibold ${statusCfg.color}`}>{laneId}</span>
                {firstEntry.stepCount > 0 && (
                  <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                    {firstEntry.stepCount} step{firstEntry.stepCount !== 1 ? 's' : ''}
                  </span>
                )}
                <span className={`text-[10px] ml-auto ${statusCfg.color}`}>{firstEntry.status}</span>
                {firstEntry.durationMs != null && (
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                    {firstEntry.durationMs < 1000 ? `${firstEntry.durationMs}ms` : `${(firstEntry.durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
              {entries.map((e, i) => (
                <div key={i} className="pl-4 space-y-0.5">
                  <div className="font-mono text-[11px] text-teal-200/60 truncate" title={e.filePath}>{e.filePath || e.stepId}</div>
                  <div className="flex items-center gap-2 text-[10px]">
                    {e.dependencyClass && (
                      <span className="text-muted-foreground/40 font-mono">{e.dependencyClass.replace(/_/g, ' ')}</span>
                    )}
                    <span className={verifyCfg.color}>verify: {verifyCfg.label}</span>
                    {e.error && (
                      <span className="text-red-400/60 truncate max-w-[200px]" title={e.error}>{e.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Contribution / merge summary */}
      {successCount > 1 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-teal-400/10 bg-teal-400/5 text-[10px] text-teal-400/50">
          <GitMerge className="w-3 h-3 shrink-0" />
          <span>{successCount} lanes contributed to the merged result.</span>
        </div>
      )}
    </div>
  );
}

// ─── task-9: Dependency Graph & Scheduler Reasoning section ───────────────────

function DependencyGraphBlock({ analysis }: { analysis: DependencyAnalysis | null | undefined }) {
  if (!analysis) {
    return <AbsentBlock message="Dependency analysis not available for this task (older task or fast-path route)." />;
  }

  const [showIds, setShowIds] = useState(false);
  const classKeys = (Object.keys(analysis.counts) as StepDependencyClass[]).filter(k => analysis.counts[k] > 0);
  const totalRecords = Object.values(analysis.counts).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-2">
      {/* Scheduler reasoning — always shown prominently */}
      <div className="px-3 py-2 rounded border border-indigo-400/20 bg-indigo-400/5 border-l-2 border-l-indigo-500/50">
        <div className="text-[10px] text-indigo-400/40 uppercase tracking-wider mb-1">Scheduler reasoning</div>
        <p className="text-indigo-200/80 leading-relaxed text-[11px]">{analysis.serialReason}</p>
      </div>

      {/* Step class breakdown */}
      {classKeys.length > 0 && (
        <div className="rounded border border-panel-border/30 overflow-hidden">
          <div className="px-2.5 py-1 bg-panel-border/10 border-b border-panel-border/20">
            <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Dependency class breakdown</span>
            <span className="float-right text-[10px] text-muted-foreground/30 tabular-nums">{totalRecords} total steps</span>
          </div>
          {classKeys.map((cls, i) => {
            const cfg = DEP_CLASS_CONFIG[cls];
            const n   = analysis.counts[cls];
            const pct = totalRecords > 0 ? Math.round((n / totalRecords) * 100) : 0;
            return (
              <div
                key={cls}
                className={`flex items-center gap-3 px-3 py-1.5 text-xs ${cfg.bg} ${
                  i < classKeys.length - 1 ? 'border-b border-panel-border/15' : ''
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className={`font-medium ${cfg.color} w-24 shrink-0`}>{cfg.label}</span>
                <span className="text-muted-foreground/40 text-[10px] flex-1 truncate">{cfg.description}</span>
                <span className="tabular-nums text-muted-foreground/60 shrink-0">
                  {n} <span className="text-muted-foreground/30">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Potentially-independent action IDs — browseable */}
      {analysis.potentiallyIndependentActionIds.length > 0 && (
        <div className="px-3 py-2 rounded border border-purple-400/15 bg-purple-400/5 text-[11px] space-y-1">
          <button
            onClick={() => setShowIds(e => !e)}
            className="flex items-center gap-1.5 text-purple-300/70 hover:text-purple-300/90 transition-colors w-full text-left"
          >
            {showIds
              ? <ChevronDown className="w-3 h-3 shrink-0" />
              : <ChevronRight className="w-3 h-3 shrink-0" />
            }
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Read-only (first-access) action IDs
            </span>
            <span className="ml-auto text-purple-400/40 text-[10px] tabular-nums">
              {analysis.potentiallyIndependentActionIds.length}
            </span>
          </button>
          {showIds && (
            <div className="flex flex-wrap gap-1 pt-1">
              {analysis.potentiallyIndependentActionIds.map((id, i) => (
                <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-purple-400/15 bg-purple-400/5 text-purple-300/60">
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── task-9: Approval Workflow section ───────────────────────────────────────

const GATE_STATE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:   { label: 'Awaiting',  color: 'text-amber-300',  bg: 'bg-amber-400/10',  border: 'border-amber-400/25'  },
  approved:  { label: 'Approved',  color: 'text-green-300',  bg: 'bg-green-400/10',  border: 'border-green-400/25'  },
  denied:    { label: 'Denied',    color: 'text-red-300',    bg: 'bg-red-400/10',    border: 'border-red-400/25'    },
  selective: { label: 'Selective', color: 'text-orange-300', bg: 'bg-orange-400/10', border: 'border-orange-400/25' },
};

interface ApprovalWorkflowProps {
  taskId: string;
  taskStatus: string;
  actions: ActionRecord[];
  executionSummary: TaskEvidenceExecutionSummary | null;
}

function ApprovalWorkflowBlock({ taskId, taskStatus, actions, executionSummary }: ApprovalWorkflowProps) {
  const [approveNote, setApproveNote] = useState('');
  const [denyNote, setDenyNote] = useState('');
  const [selectiveNote, setSelectiveNote] = useState('');
  const [selectedLaneIds, setSelectedLaneIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<null | 'approve' | 'deny' | 'selective'>(null);
  const [actionResult, setActionResult] = useState<null | { ok: boolean; message: string }>(null);

  const approvalCheckpoints = actions.filter(a => a.type === 'APPROVAL_CHECKPOINT');
  const approvalDecisions   = actions.filter(a => a.type === 'APPROVAL_DECISION');

  const hasApprovalHistory = approvalCheckpoints.length > 0 || approvalDecisions.length > 0;
  const hasGateTriggers    = executionSummary?.gateTriggers != null;
  const gateDenied         = executionSummary?.approvalGateDenied;
  const selectivelyBlocked = executionSummary?.selectivelyBlockedLanes;

  if (!hasApprovalHistory && !hasGateTriggers && !gateDenied) {
    return <AbsentBlock message="No approval gate history for this task." />;
  }

  const isAwaitingApproval = taskStatus === 'running' &&
    approvalCheckpoints.length > approvalDecisions.length;
  const pendingGate = isAwaitingApproval
    ? approvalCheckpoints[approvalCheckpoints.length - 1]
    : null;
  const pendingGateMeta = pendingGate?.meta as { type: 'APPROVAL_CHECKPOINT'; checkpointId: string; description: string; laneIds?: string[] } | undefined;

  async function submitDecision(decision: 'approve' | 'deny' | 'selective') {
    if (!pendingGateMeta) return;
    setSubmitting(decision);
    setActionResult(null);
    try {
      let endpoint: string;
      let body: Record<string, unknown>;
      if (decision === 'approve') {
        endpoint = 'approve';
        body = { checkpointId: pendingGateMeta.checkpointId, note: approveNote || undefined };
      } else if (decision === 'deny') {
        endpoint = 'deny';
        body = { checkpointId: pendingGateMeta.checkpointId, note: denyNote || undefined };
      } else {
        endpoint = 'approve-selective';
        body = {
          checkpointId: pendingGateMeta.checkpointId,
          approvedLaneIds: [...selectedLaneIds],
          note: selectiveNote || undefined,
        };
      }
      const res = await fetch(`/api/agent/tasks/${taskId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { message?: string };
      setActionResult({ ok: res.ok, message: data.message ?? (res.ok ? 'Done.' : 'Failed.') });
    } catch (err) {
      setActionResult({ ok: false, message: String(err) });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="rounded border border-blue-400/20 bg-blue-400/5 text-xs overflow-hidden border-l-2 border-l-blue-500/50">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-blue-400/10">
        <Lock className="w-3 h-3 text-blue-400/60 shrink-0" />
        <span className="text-blue-300/70">
          {approvalCheckpoints.length} gate{approvalCheckpoints.length !== 1 ? 's' : ''}
          {approvalDecisions.length > 0 && <span className="text-blue-400/40 ml-1">· {approvalDecisions.length} decided</span>}
        </span>
        {gateDenied && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-red-400/25 bg-red-400/10 text-red-300/70 font-semibold">
            DENIED: {gateDenied}
          </span>
        )}
      </div>

      <div className="divide-y divide-blue-400/5">
        {/* Approval gate history */}
        {approvalCheckpoints.map((cp, i) => {
          const cpMeta = cp.meta as { type: 'APPROVAL_CHECKPOINT'; checkpointId: string; description: string; laneIds?: string[] };
          const matchingDecision = approvalDecisions.find(d => {
            const dm = d.meta as { type: 'APPROVAL_DECISION'; checkpointId: string; decision: string; note?: string; approvedLaneIds?: string[] };
            return dm.checkpointId === cpMeta.checkpointId;
          });
          const decMeta = matchingDecision?.meta as { type: 'APPROVAL_DECISION'; checkpointId: string; decision: string; note?: string; approvedLaneIds?: string[] } | undefined;
          const decisionKey = decMeta?.decision ?? (isAwaitingApproval && i === approvalCheckpoints.length - 1 ? 'pending' : 'pending');
          const cfg = GATE_STATE_CONFIG[decisionKey] ?? GATE_STATE_CONFIG.pending;

          return (
            <div key={cp.id} className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                  {cfg.label}
                </span>
                <span className="font-mono text-blue-200/70 flex-1 truncate">{cpMeta.checkpointId}</span>
                {cp.startedAt && (
                  <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">
                    {format(new Date(cp.startedAt), 'HH:mm:ss')}
                  </span>
                )}
              </div>
              {cpMeta.description && (
                <p className="text-[11px] text-blue-100/50 pl-1">{cpMeta.description}</p>
              )}
              {cpMeta.laneIds && cpMeta.laneIds.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-1">
                  <span className="text-[10px] text-muted-foreground/40">Lane scope:</span>
                  {cpMeta.laneIds.map(lid => (
                    <span key={lid} className="font-mono text-[10px] px-1 py-0.5 rounded border border-blue-400/20 bg-blue-400/5 text-blue-300/60">{lid}</span>
                  ))}
                </div>
              )}
              {decMeta?.note && (
                <p className="text-[11px] text-muted-foreground/50 italic pl-1">Note: {decMeta.note}</p>
              )}
              {decMeta?.approvedLaneIds && decMeta.approvedLaneIds.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-1">
                  <span className="text-[10px] text-muted-foreground/40">Approved lanes:</span>
                  {decMeta.approvedLaneIds.map(lid => (
                    <span key={lid} className="font-mono text-[10px] px-1 py-0.5 rounded border border-green-400/20 bg-green-400/5 text-green-300/60">{lid}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Selectively blocked lanes */}
        {selectivelyBlocked && selectivelyBlocked.length > 0 && (
          <div className="px-3 py-2">
            <div className="text-[10px] text-orange-400/50 uppercase tracking-wider mb-1">Selectively blocked lanes</div>
            <div className="flex flex-wrap gap-1">
              {selectivelyBlocked.map(lid => (
                <span key={lid} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-orange-400/20 bg-orange-400/5 text-orange-300/60">{lid}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actionable controls when awaiting approval */}
      {isAwaitingApproval && pendingGateMeta && (() => {
        // Prefer checkpoint's declared laneIds (authoritative gate scope).
        // Fall back to laneEvidence lane IDs only when the gate has no declared scope.
        const availableLaneIds = pendingGateMeta.laneIds && pendingGateMeta.laneIds.length > 0
          ? pendingGateMeta.laneIds
          : (executionSummary?.laneEvidence
              ? [...new Set(executionSummary.laneEvidence.map(l => l.laneId))].sort()
              : []);
        const hasLanes = availableLaneIds.length > 0;

        function toggleLane(lid: string) {
          setSelectedLaneIds(prev => {
            const next = new Set(prev);
            if (next.has(lid)) next.delete(lid);
            else next.add(lid);
            return next;
          });
        }

        return (
          <div className="px-3 py-3 border-t border-blue-400/15 bg-blue-400/5 space-y-3">
            <div className="text-[10px] text-amber-300/70 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Awaiting approval: {pendingGateMeta.checkpointId}
            </div>

            {/* Approve + Deny row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <input
                  type="text"
                  value={approveNote}
                  onChange={e => setApproveNote(e.target.value)}
                  placeholder="Optional note…"
                  className="w-full px-2 py-1 text-[11px] bg-background/30 border border-panel-border/40 rounded text-foreground/70 placeholder:text-muted-foreground/25 focus:outline-none focus:border-green-500/30"
                />
                <button
                  onClick={() => submitDecision('approve')}
                  disabled={submitting !== null}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-green-500/30 bg-green-500/10 text-green-300/80 hover:bg-green-500/20 transition-colors text-[11px] font-semibold disabled:opacity-50"
                >
                  {submitting === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                  Approve All
                </button>
              </div>
              <div className="space-y-1">
                <input
                  type="text"
                  value={denyNote}
                  onChange={e => setDenyNote(e.target.value)}
                  placeholder="Optional note…"
                  className="w-full px-2 py-1 text-[11px] bg-background/30 border border-panel-border/40 rounded text-foreground/70 placeholder:text-muted-foreground/25 focus:outline-none focus:border-red-500/30"
                />
                <button
                  onClick={() => submitDecision('deny')}
                  disabled={submitting !== null}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-red-500/30 bg-red-500/10 text-red-300/80 hover:bg-red-500/20 transition-colors text-[11px] font-semibold disabled:opacity-50"
                >
                  {submitting === 'deny' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                  Deny
                </button>
              </div>
            </div>

            {/* Selective-approve section — only when lanes are available */}
            {hasLanes && (
              <div className="rounded border border-orange-400/20 bg-orange-400/5 px-2.5 py-2 space-y-2">
                <div className="text-[10px] text-orange-300/70 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <GitMerge className="w-3 h-3 shrink-0" />
                  Selective approve — choose lanes
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableLaneIds.map(lid => {
                    const active = selectedLaneIds.has(lid);
                    return (
                      <button
                        key={lid}
                        onClick={() => toggleLane(lid)}
                        className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors ${
                          active
                            ? 'border-orange-400/40 bg-orange-400/15 text-orange-300/90'
                            : 'border-orange-400/15 bg-transparent text-orange-400/40 hover:text-orange-400/70 hover:border-orange-400/30'
                        }`}
                      >
                        {lid}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={selectiveNote}
                    onChange={e => setSelectiveNote(e.target.value)}
                    placeholder="Optional note…"
                    className="flex-1 px-2 py-1 text-[11px] bg-background/30 border border-panel-border/40 rounded text-foreground/70 placeholder:text-muted-foreground/25 focus:outline-none focus:border-orange-500/30"
                  />
                  <button
                    onClick={() => submitDecision('selective')}
                    disabled={submitting !== null || selectedLaneIds.size === 0}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-300/80 hover:bg-orange-500/20 transition-colors text-[11px] font-semibold disabled:opacity-50 shrink-0"
                  >
                    {submitting === 'selective' ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
                    Approve {selectedLaneIds.size > 0 ? `(${selectedLaneIds.size})` : 'Selected'}
                  </button>
                </div>
                {selectedLaneIds.size === 0 && (
                  <p className="text-[10px] text-orange-400/40">
                    Select at least one lane to activate selective approval.
                    Unselected lanes will be blocked.
                  </p>
                )}
              </div>
            )}

            {actionResult && (
              <div className={`text-[11px] px-2 py-1 rounded border ${actionResult.ok ? 'border-green-400/20 bg-green-400/5 text-green-300/70' : 'border-red-400/20 bg-red-400/5 text-red-300/70'}`}>
                {actionResult.message}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── task-9: Operator Steering Section ───────────────────────────────────────

const STEERING_ACTION_TYPES: ActionType[] = ['APPROVAL_CHECKPOINT', 'APPROVAL_DECISION', 'LANE_STEERED', 'OPERATOR_OVERRIDE'];

function SteeringRow({ action }: { action: ActionRecord }) {
  const [expanded, setExpanded] = useState(false);
  const meta = action.meta as (ApprovalCheckpointMeta | ApprovalDecisionMeta | LaneSteeeredMeta | OperatorOverrideMeta) | null | undefined;

  function getLabel(): string {
    if (!meta) return action.type;
    switch (meta.type) {
      case 'APPROVAL_CHECKPOINT': return `Checkpoint: ${meta.checkpointId}`;
      case 'APPROVAL_DECISION': return `Decision: ${meta.decision.toUpperCase()} on ${meta.checkpointId}`;
      case 'LANE_STEERED': return `Lane ${meta.laneId}: ${meta.signal}`;
      case 'OPERATOR_OVERRIDE': return `Override (${meta.kind}): step ${meta.stepId}`;
    }
  }

  function getColor(): string {
    if (!meta) return 'text-muted-foreground';
    switch (meta.type) {
      case 'APPROVAL_CHECKPOINT': return 'text-blue-400';
      case 'APPROVAL_DECISION': {
        const d = (meta as ApprovalDecisionMeta).decision;
        return d === 'approved' ? 'text-green-400' : d === 'denied' ? 'text-red-400' : 'text-amber-400';
      }
      case 'LANE_STEERED': {
        const s = (meta as LaneSteeeredMeta).signal;
        return s === 'proceed' ? 'text-green-400' : s === 'paused' ? 'text-amber-400' : 'text-red-400';
      }
      case 'OPERATOR_OVERRIDE': {
        const k = (meta as OperatorOverrideMeta).kind;
        return k === 'deny' ? 'text-red-400' : k === 'substitute' ? 'text-amber-400' : 'text-blue-400';
      }
    }
  }

  function getNote(): string | undefined {
    if (!meta) return undefined;
    switch (meta.type) {
      case 'APPROVAL_CHECKPOINT': return (meta as ApprovalCheckpointMeta).description;
      case 'APPROVAL_DECISION': return (meta as ApprovalDecisionMeta).note;
      case 'LANE_STEERED': return (meta as LaneSteeeredMeta).reason;
      case 'OPERATOR_OVERRIDE': return (meta as OperatorOverrideMeta).note;
    }
  }

  const note = getNote();

  return (
    <div className="text-xs border border-panel-border/30 rounded overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-background/40 hover:bg-background/70 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground/50" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/50" />}
        <span className={`font-mono font-medium ${getColor()}`}>{getLabel()}</span>
        {note && !expanded && (
          <span className="ml-2 text-muted-foreground/50 truncate max-w-[200px]">{note}</span>
        )}
        <span className="ml-auto text-muted-foreground/40 font-mono">
          {action.startedAt ? format(new Date(action.startedAt), 'HH:mm:ss') : '—'}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-background/20 space-y-1 border-t border-panel-border/20">
          {note && <div className="text-muted-foreground/70">{note}</div>}
          <div className="font-mono text-[10px] text-muted-foreground/40 break-all">
            {JSON.stringify(meta, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

function OperatorSteeringSection({ actions }: { actions: ActionRecord[] }) {
  const steeringActions = actions.filter(a => STEERING_ACTION_TYPES.includes(a.type as ActionType));
  if (steeringActions.length === 0) return null;

  return (
    <Section icon={Shield} title="Operator Steering" accentColor="border-l-orange-500/60">
      <div className="space-y-1.5">
        {steeringActions.map(a => (
          <SteeringRow key={a.id} action={a} />
        ))}
      </div>
    </Section>
  );
}

// ─── Lane-grouped action display ─────────────────────────────────────────────

const LANE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'lane-0': { color: 'text-teal-400/80',    bg: 'bg-teal-400/5',    border: 'border-teal-400/20'   },
  'lane-1': { color: 'text-sky-400/80',     bg: 'bg-sky-400/5',     border: 'border-sky-400/20'    },
  'lane-2': { color: 'text-violet-400/80',  bg: 'bg-violet-400/5',  border: 'border-violet-400/20' },
  DEFAULT:   { color: 'text-slate-400/80',  bg: 'bg-slate-400/5',   border: 'border-slate-400/20'  },
};

function getLaneStyle(laneId: string) {
  return LANE_STYLE[laneId] ?? LANE_STYLE.DEFAULT;
}

function LaneGroup({ laneId, actions, expandedId, onToggle }: {
  laneId: string;
  actions: ActionRecord[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const style = getLaneStyle(laneId);
  return (
    <div className={`rounded border ${style.border} ${style.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1 text-left hover:brightness-110 transition-colors"
      >
        <Network className={`w-3 h-3 shrink-0 ${style.color} opacity-70`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wider flex-1 ${style.color}`}>{laneId}</span>
        <span className="text-[10px] text-muted-foreground/30 tabular-nums">{actions.length}</span>
        {open
          ? <ChevronDown className={`w-3 h-3 shrink-0 ${style.color} opacity-60`} />
          : <ChevronRight className={`w-3 h-3 shrink-0 ${style.color} opacity-60`} />
        }
      </button>
      {open && (
        <div className={`border-t ${style.border} divide-y divide-white/5`}>
          {actions.map(action => (
            <ActionRecordRow
              key={action.id}
              action={action}
              expandedId={expandedId}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ActionRecordsSection ────────────────────────────────────────────────

function ActionRecordsSection({
  actions,
  isLoading,
  error,
  taskId,
  laneEvidence,
}: {
  actions: ActionRecord[];
  isLoading: boolean;
  error: Error | null;
  taskId: string;
  laneEvidence?: LaneSummary[] | null;
}) {
  const taskLogs = useIdeStore(s => s.taskLogs);
  const logs = taskLogs[taskId] ?? [];

  const prevTaskIdRef = useRef<string>(taskId);

  const [activeFilters, setActiveFilters] = useState<Set<ActionType>>(
    new Set<ActionType>(ACTION_TYPE_ORDER)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (prevTaskIdRef.current !== taskId) {
      prevTaskIdRef.current = taskId;
      setActiveFilters(new Set(ACTION_TYPE_ORDER));
      setSearchQuery('');
      setExpandedId(null);
    }
  }, [taskId]);

  const toggleFilter = (type: ActionType) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
    setExpandedId(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const filteredActions = useMemo(() => {
    let result = actions.filter(a => activeFilters.has(a.type));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(a => {
        const label = getActionItemLabel(a).toLowerCase();
        if (label.includes(q)) return true;
        if (a.outcome?.summary?.toLowerCase().includes(q)) return true;
        if (a.outcome?.error?.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    return result;
  }, [actions, activeFilters, searchQuery]);

  const phaseGrouped = useMemo(() => {
    if (logs.length === 0) return null;
    const logsForAssign = logs.map(l => ({
      type: l.type,
      message: l.message,
      timestamp: l.timestamp,
    }));
    const windowMap = assignActionsToWindows(logsForAssign, filteredActions);
    if (windowMap.size === 0) return null;

    // If only the ungrouped bucket (-1) exists, no real stage boundaries were found.
    // Fall back to flat display (return null so the caller renders a flat list).
    const hasRealStages = Array.from(windowMap.keys()).some(k => k !== -1);
    if (!hasRealStages) return null;

    const stageBoundaries: Array<{ logIndex: number; stage: string }> = [];
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (log.type !== 'thought') continue;
      const match = log.message.match(/^\[(PLANNING|INSPECTING|EDITING|VERIFYING|REPAIRING|WRAPPING UP)\]/i);
      if (!match) continue;
      stageBoundaries.push({ logIndex: i, stage: match[1].toUpperCase() });
    }

    const phases: Array<{ key: string; phase: string; actions: ActionRecord[] }> = [];

    const phaseByIndex = new Map(stageBoundaries.map(b => [b.logIndex, b.stage]));

    // Track occurrences per phase name to create unique keys for repeated phases
    const phaseOccurrences = new Map<string, number>();

    for (const [logIndex, groups] of windowMap) {
      if (logIndex === -1) continue;
      const phaseName = phaseByIndex.get(logIndex) ?? `Phase @${logIndex}`;
      const phaseActions = groups.flatMap(g => g.items);
      if (phaseActions.length > 0) {
        const occurrence = (phaseOccurrences.get(phaseName) ?? 0) + 1;
        phaseOccurrences.set(phaseName, occurrence);
        const key = occurrence === 1 ? phaseName : `${phaseName}-${occurrence}`;
        phases.push({ key, phase: phaseName, actions: phaseActions });
      }
    }

    // Include pre-stage / post-stage actions that didn't fall into any stage window
    const ungrouped = windowMap.get(-1);
    if (ungrouped) {
      const ungroupedActions = ungrouped.flatMap(g => g.items);
      if (ungroupedActions.length > 0) {
        phases.push({ key: 'UNGROUPED', phase: 'UNGROUPED', actions: ungroupedActions });
      }
    }

    return phases.length > 0 ? phases : null;
  }, [logs, filteredActions]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground/50">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        Loading action records…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded border border-red-500/20 bg-red-500/5 text-xs text-red-400/70">
        <AlertCircle className="w-3 h-3 shrink-0" />
        Failed to load action records: {error.message}
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <AbsentBlock message="No action records available. Action records are in-memory only — they are cleared on server restart." />
    );
  }

  const presentTypes = ACTION_TYPE_ORDER.filter(t => actions.some(a => a.type === t));

  return (
    <div className="space-y-2">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1">
        {presentTypes.map(type => (
          <FilterChip
            key={type}
            type={type}
            active={activeFilters.has(type)}
            onToggle={toggleFilter}
          />
        ))}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/30 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setExpandedId(null); }}
          placeholder="Search path, command, or outcome…"
          className="w-full pl-6 pr-6 py-1 text-[11px] bg-background/30 border border-panel-border/40 rounded text-foreground/70 placeholder:text-muted-foreground/25 focus:outline-none focus:border-cyan-500/30 focus:bg-background/50 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setExpandedId(null); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground/60"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Showing N of M count — only when a filter or search narrows the results */}
      {(presentTypes.some(t => !activeFilters.has(t)) || searchQuery.trim().length > 0) && (
        <div className="text-[10px] text-muted-foreground/40 tabular-nums">
          Showing {filteredActions.length} of {actions.length}
        </div>
      )}

      {/* Results */}
      {filteredActions.length === 0 ? (
        <AbsentBlock
          message={
            searchQuery
              ? `No matching actions for "${searchQuery}"`
              : 'No actions match active filters.'
          }
        />
      ) : (() => {
        // Lane grouping is authoritative when laneEvidence exists (task ran parallel lanes)
        // OR when any filtered action carries an explicit non-serial laneId.
        // laneEvidence existence is the primary signal (requirement: group by lane when lane
        // evidence exists), individual action laneIds are the secondary fallback.
        const laneTaggedActions = filteredActions.filter(a => a.laneId && a.laneId !== 'serial');
        const hasLaneTags = (laneEvidence != null && laneEvidence.length > 0) || laneTaggedActions.length > 0;

        if (hasLaneTags) {
          // Collect all known lane IDs: union of laneEvidence lanes and action-tagged lanes.
          // This ensures all declared lanes appear in grouping even if filtered down to zero actions.
          const evidenceLaneIds = laneEvidence?.map(l => l.laneId) ?? [];
          const actionLaneIds = filteredActions.map(a => a.laneId).filter((l): l is string => !!l && l !== 'serial');
          const laneIds = [...new Set([...evidenceLaneIds, ...actionLaneIds])].sort();
          const laneActionsByLane = new Map<string, ActionRecord[]>();
          const serial: ActionRecord[] = [];
          for (const action of filteredActions) {
            if (action.laneId && action.laneId !== 'serial') {
              const arr = laneActionsByLane.get(action.laneId) ?? [];
              arr.push(action);
              laneActionsByLane.set(action.laneId, arr);
            } else {
              serial.push(action);
            }
          }
          return (
            <div className="space-y-1.5">
              {laneIds.map(laneId => {
                const acts = laneActionsByLane.get(laneId) ?? [];
                if (acts.length === 0) return null;
                return (
                  <LaneGroup
                    key={laneId}
                    laneId={laneId}
                    actions={acts}
                    expandedId={expandedId}
                    onToggle={toggleExpand}
                  />
                );
              })}
              {serial.length > 0 && (
                <PhaseGroup
                  phase="SERIAL"
                  actions={serial}
                  expandedId={expandedId}
                  onToggle={toggleExpand}
                />
              )}
            </div>
          );
        }

        // Phase grouping when no lane tags
        if (phaseGrouped) {
          return (
            <div className="space-y-1.5">
              {phaseGrouped.map(({ key, phase, actions: phaseActions }) => (
                <PhaseGroup
                  key={key}
                  phase={phase}
                  actions={phaseActions}
                  expandedId={expandedId}
                  onToggle={toggleExpand}
                  defaultOpen={true}
                />
              ))}
            </div>
          );
        }

        // Flat fallback
        return (
          <div className="rounded border border-cyan-400/15 bg-cyan-400/5 overflow-hidden border-l-2 border-l-cyan-500/40">
            <div className="divide-y divide-white/5">
              {filteredActions.map(action => (
                <ActionRecordRow
                  key={action.id}
                  action={action}
                  expandedId={expandedId}
                  onToggle={toggleExpand}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Live Approval Controls (shown when task is live + awaiting_approval) ────

function LiveApprovalControls({ taskId }: { taskId: string }) {
  const livePhase = useIdeStore(s => s.livePhase);
  const liveActions = useIdeStore(s => s.taskActions[taskId] ?? []);

  const [approveNote, setApproveNote] = useState('');
  const [denyNote, setDenyNote] = useState('');
  const [selectiveNote, setSelectiveNote] = useState('');
  const [selectedLaneIds, setSelectedLaneIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<null | 'approve' | 'deny' | 'selective'>(null);
  const [actionResult, setActionResult] = useState<null | { ok: boolean; message: string }>(null);

  const approvalCheckpoints = liveActions.filter(a => a.type === 'APPROVAL_CHECKPOINT');
  const approvalDecisions   = liveActions.filter(a => a.type === 'APPROVAL_DECISION');
  const pendingGate = approvalCheckpoints.length > approvalDecisions.length
    ? approvalCheckpoints[approvalCheckpoints.length - 1]
    : null;
  const pendingGateMeta = pendingGate?.meta as { checkpointId: string; description?: string; laneIds?: string[] } | undefined;

  // Available lanes come from the gate's declared laneIds (set at checkpoint-record time).
  // This is the only authoritative source: gateTriggers is a reason-counter map, not lane IDs.
  const availableLaneIds: string[] = pendingGateMeta?.laneIds ?? [];

  function toggleLane(lid: string) {
    setSelectedLaneIds(prev => {
      const next = new Set(prev);
      if (next.has(lid)) next.delete(lid);
      else next.add(lid);
      return next;
    });
  }

  async function submitDecision(decision: 'approve' | 'deny' | 'selective') {
    if (!pendingGateMeta) return;
    setSubmitting(decision);
    setActionResult(null);
    try {
      let endpoint: string;
      let body: Record<string, unknown>;
      if (decision === 'approve') {
        endpoint = 'approve';
        body = { checkpointId: pendingGateMeta.checkpointId, note: approveNote || undefined };
      } else if (decision === 'deny') {
        endpoint = 'deny';
        body = { checkpointId: pendingGateMeta.checkpointId, note: denyNote || undefined };
      } else {
        endpoint = 'approve-selective';
        body = { checkpointId: pendingGateMeta.checkpointId, approvedLaneIds: [...selectedLaneIds], note: selectiveNote || undefined };
      }
      const res = await fetch(`/api/agent/tasks/${taskId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { message?: string };
      setActionResult({ ok: res.ok, message: data.message ?? (res.ok ? 'Done.' : 'Failed.') });
    } catch (err) {
      setActionResult({ ok: false, message: String(err) });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 px-3 py-2 rounded border border-amber-400/25 bg-amber-400/10 text-xs">
        <Lock className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
        <div>
          <div className="text-amber-300/80 font-semibold">
            Awaiting approval {pendingGateMeta ? `— ${pendingGateMeta.checkpointId}` : ''}
          </div>
          {pendingGateMeta?.description && (
            <div className="text-amber-200/50 text-[11px] mt-0.5">{pendingGateMeta.description}</div>
          )}
        </div>
      </div>

      <div className="rounded border border-blue-400/20 bg-blue-400/5 px-3 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <input
              type="text"
              value={approveNote}
              onChange={e => setApproveNote(e.target.value)}
              placeholder="Optional note…"
              className="w-full px-2 py-1 text-[11px] bg-background/30 border border-panel-border/40 rounded text-foreground/70 placeholder:text-muted-foreground/25 focus:outline-none focus:border-green-500/30"
            />
            <button
              onClick={() => submitDecision('approve')}
              disabled={submitting !== null || !pendingGateMeta}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-green-500/30 bg-green-500/10 text-green-300/80 hover:bg-green-500/20 transition-colors text-[11px] font-semibold disabled:opacity-50"
            >
              {submitting === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
              Approve All
            </button>
          </div>
          <div className="space-y-1">
            <input
              type="text"
              value={denyNote}
              onChange={e => setDenyNote(e.target.value)}
              placeholder="Optional note…"
              className="w-full px-2 py-1 text-[11px] bg-background/30 border border-panel-border/40 rounded text-foreground/70 placeholder:text-muted-foreground/25 focus:outline-none focus:border-red-500/30"
            />
            <button
              onClick={() => submitDecision('deny')}
              disabled={submitting !== null || !pendingGateMeta}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-red-500/30 bg-red-500/10 text-red-300/80 hover:bg-red-500/20 transition-colors text-[11px] font-semibold disabled:opacity-50"
            >
              {submitting === 'deny' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
              Deny
            </button>
          </div>
        </div>

        {availableLaneIds.length > 0 && (
          <div className="rounded border border-orange-400/20 bg-orange-400/5 px-2.5 py-2 space-y-2">
            <div className="text-[10px] text-orange-300/70 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <GitMerge className="w-3 h-3 shrink-0" />
              Selective approve — choose lanes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableLaneIds.map(lid => {
                const active = selectedLaneIds.has(lid);
                return (
                  <button
                    key={lid}
                    onClick={() => toggleLane(lid)}
                    className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors ${
                      active
                        ? 'border-orange-400/40 bg-orange-400/15 text-orange-300/90'
                        : 'border-orange-400/15 bg-transparent text-orange-400/40 hover:text-orange-400/70 hover:border-orange-400/30'
                    }`}
                  >
                    {lid}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={selectiveNote}
                onChange={e => setSelectiveNote(e.target.value)}
                placeholder="Optional note…"
                className="flex-1 px-2 py-1 text-[11px] bg-background/30 border border-panel-border/40 rounded text-foreground/70 placeholder:text-muted-foreground/25 focus:outline-none focus:border-orange-500/30"
              />
              <button
                onClick={() => submitDecision('selective')}
                disabled={submitting !== null || selectedLaneIds.size === 0 || !pendingGateMeta}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-300/80 hover:bg-orange-500/20 transition-colors text-[11px] font-semibold disabled:opacity-50 shrink-0"
              >
                {submitting === 'selective' ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
                Approve {selectedLaneIds.size > 0 ? `(${selectedLaneIds.size})` : 'Selected'}
              </button>
            </div>
          </div>
        )}

        {actionResult && (
          <div className={`text-[11px] px-2 py-1 rounded border ${actionResult.ok ? 'border-green-400/20 bg-green-400/5 text-green-300/70' : 'border-red-400/20 bg-red-400/5 text-red-300/70'}`}>
            {actionResult.message}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-2.5 py-2 rounded border border-panel-border/30 bg-background/20 text-[10px] text-muted-foreground/30">
        <Info className="w-3 h-3 shrink-0" />
        <span>Full inspect view available after task completion.</span>
      </div>
    </div>
  );
}

// ─── Main EvidencePanel ───────────────────────────────────────────────────────

interface EvidencePanelProps {
  taskId: string;
  isLive: boolean;
}

export function EvidencePanel({ taskId, isLive }: EvidencePanelProps) {
  const livePhase = useIdeStore(s => s.livePhase);

  const {
    data: evidenceData,
    isLoading: evidenceLoading,
    error: evidenceError,
  } = useTaskEvidence(taskId, !isLive);

  const {
    data: actionsData,
    isLoading: actionsLoading,
    error: actionsError,
  } = useTaskActions(taskId, !isLive);

  if (isLive) {
    // Special case: show approval controls when the live task is awaiting_approval
    if (livePhase?.interventionKind === 'awaiting_approval') {
      return (
        <div className="h-full overflow-y-auto vg-scroll">
          <LiveApprovalControls taskId={taskId} />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full px-6 py-10 text-center">
        <div className="space-y-2">
          <Activity className="w-6 h-6 mx-auto text-primary/40 animate-pulse" />
          <p className="text-xs text-muted-foreground/50">Task still running — inspect available after completion.</p>
        </div>
      </div>
    );
  }

  if (evidenceLoading) {
    return (
      <div className="flex items-center justify-center h-full px-6 py-10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading evidence…
        </div>
      </div>
    );
  }

  if (evidenceError) {
    return (
      <div className="flex items-center gap-2 m-3 px-3 py-2.5 rounded border border-red-500/20 bg-red-500/5 text-xs text-red-400/70">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Could not load evidence: {(evidenceError as Error).message}</span>
      </div>
    );
  }

  if (!evidenceData) {
    return (
      <div className="m-3">
        <AbsentBlock message="No evidence data returned from the server." />
      </div>
    );
  }

  if (!evidenceData.taskEvidence) {
    const reasonMessages: Record<string, string> = {
      task_still_running:               'Task is still running. Inspect view is available after completion.',
      task_interrupted_before_evidence: 'Task was interrupted by a server restart before evidence was assembled.',
      no_evidence_for_task_class:       'No structured evidence for this task type (conversational or early-exit task).',
    };
    const msg = reasonMessages[evidenceData.reason ?? ''] ?? 'Evidence not available for this task.';
    return (
      <div className="m-3">
        <AbsentBlock message={msg} />
      </div>
    );
  }

  const ev = evidenceData.taskEvidence;

  return (
    <div className="h-full overflow-y-auto vg-scroll">
      <div className="p-2.5 space-y-4">

        {/* Route badge */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-blue-400/15 bg-blue-400/5 text-xs">
          <ChevronRight className="w-3 h-3 text-blue-400/60 shrink-0" />
          <span className="text-blue-300/70">Route: <span className="font-mono font-semibold">{ev.routeProfile.category}</span></span>
          <span className="text-blue-400/30 ml-auto">
            {ev.routeProfile.maxSteps} steps · {ev.routeProfile.maxFileReads} reads · {ev.routeProfile.maxFileWrites} writes
            {ev.routeProfile.requiresVerify ? ' · verify required' : ''}
            {ev.routeProfile.planningPhase ? ' · planning' : ''}
          </span>
        </div>

        {/* (a) Plan — indigo left border */}
        <Section icon={ListChecks} title="Plan" accentColor="border-l-indigo-500/60">
          <PlanBlock plan={ev.planData} />
        </Section>

        {/* (b) Execution stats — slate/amber left border */}
        <Section icon={BarChart2} title="Execution Stats" accentColor="border-l-slate-400/50">
          <ExecutionStatsBlock exec={ev.executionSummary} route={ev.routeProfile} />
        </Section>

        {/* (b2) Tool introspection — orange left border */}
        <Section icon={Cpu} title="Tool Introspection" accentColor="border-l-orange-500/60">
          <ToolIntrospectionPanel
            actions={actionsData?.actions ?? []}
            sideEffectsObserved={ev.executionSummary?.sideEffectsObserved}
            readBurstUsed={ev.executionSummary?.dependencyAnalysis?.readBurstUsed ?? false}
            readBurstCount={ev.executionSummary?.dependencyAnalysis?.readBurstCount ?? 0}
            potentiallyIndependentCount={ev.executionSummary?.dependencyAnalysis?.potentiallyIndependentActionIds?.length ?? 0}
          />
        </Section>

        {/* (c) Phase timeline — violet left border */}
        <Section icon={Layers} title="Phase Timeline" accentColor="border-l-violet-500/60">
          <PhaseTimelineBlock timeline={ev.executionSummary?.phaseTimeline ?? null} />
        </Section>

        {/* (d) Checkpoint — emerald left border */}
        <Section icon={Database} title="Checkpoint" accentColor="border-l-emerald-500/60">
          <CheckpointBlock checkpoint={ev.checkpointSummary} />
        </Section>

        {/* (d2) Runtime Impact — green left border */}
        <Section icon={Radio} title="Runtime Impact" accentColor="border-l-green-500/60">
          <RuntimeImpactBlock evidence={ev.executionSummary?.runtimeEvidence ?? null} />
        </Section>

        {/* (d3) Runtime Lifecycle — purple left border (P4) */}
        <Section icon={Activity} title="Runtime Lifecycle" accentColor="border-l-purple-500/60">
          <RuntimeLifecycleBlock lifecycle={ev.runtimeLifecycle} />
        </Section>

        {/* (e) Action records — cyan left border */}
        <Section icon={Activity} title="Action Records" accentColor="border-l-cyan-500/60">
          <ActionRecordsSection
            actions={actionsData?.actions ?? []}
            isLoading={actionsLoading}
            error={actionsError as Error | null}
            taskId={taskId}
            laneEvidence={ev.executionSummary?.laneEvidence}
          />
        </Section>

        {/* (g) Operator Steering — orange left border; only rendered when steering actions exist */}
        <OperatorSteeringSection actions={actionsData?.actions ?? []} />

        {/* ── New Task-9 / P4 orchestration sections ──────────────────────── */}

        {/* (h0) Orchestration — cyan left border (P4) */}
        <Section icon={Network} title="Orchestration" accentColor="border-l-cyan-500/60">
          <OrchestrationBlock
            lanes={ev.executionSummary?.laneEvidence}
            selectivelyBlockedLanes={ev.executionSummary?.selectivelyBlockedLanes}
          />
        </Section>

        {/* (h) Continuation Lineage — sky left border */}
        <Section icon={GitMerge} title="Continuation Lineage" accentColor="border-l-sky-500/60">
          <ContinuationLineageBlock lineage={evidenceData.continuationLineage} />
        </Section>

        {/* (i) Lane Evidence — teal left border */}
        <Section icon={Network} title="Lane Evidence" accentColor="border-l-teal-500/50">
          <LaneEvidenceBlock lanes={ev.executionSummary?.laneEvidence} />
        </Section>

        {/* (j) Dependency Graph & Scheduler Reasoning — violet left border */}
        <Section icon={GitBranch} title="Dependency Graph & Scheduler Reasoning" accentColor="border-l-violet-500/60">
          <DependencyGraphBlock analysis={ev.executionSummary?.dependencyAnalysis ?? null} />
        </Section>

        {/* (k) Approval Workflow — blue left border */}
        <Section icon={Lock} title="Approval Workflow" accentColor="border-l-blue-500/60">
          <ApprovalWorkflowBlock
            taskId={taskId}
            taskStatus={evidenceData.status}
            actions={actionsData?.actions ?? []}
            executionSummary={ev.executionSummary}
          />
        </Section>

        {/* Retention boundary notice */}
        <div className="flex items-start gap-2 px-2.5 py-2 rounded border border-panel-border/30 bg-background/20 text-[10px] text-muted-foreground/30">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>
            Evidence (plan, checkpoint, execution summary) is persisted across server restarts.
            Action records are in-memory only and cleared on server restart.
          </span>
        </div>

      </div>
    </div>
  );
}
