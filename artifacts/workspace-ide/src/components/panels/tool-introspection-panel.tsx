/**
 * tool-introspection-panel.tsx — Tool Introspection section for the Evidence Panel.
 *
 * Derived entirely from the ActionRecord[] already fetched by the Evidence Panel.
 * No new backend routes or API surface required.
 *
 * Renders:
 * - Per-action-type stat cards with success/failure rate indicators
 * - Command class distribution chips (from sideEffectClass on EXEC_COMMAND records,
 *   cross-checked with executionSummary.sideEffectsObserved where available)
 * - Execution shape badge — a heuristic structural descriptor
 *
 * Degrades honestly when no action records exist (conversational / zero-action tasks).
 */

import { useMemo } from 'react';
import {
  Eye, FileEdit, Terminal, CheckCircle2, Activity,
  Info, Cpu, Zap, GitBranch,
} from 'lucide-react';
import type { ActionRecord, ActionType } from '@/lib/actionSelectors';
import { computeActionTallies, deriveExecutionShape } from '@/lib/actionSelectors';

// ─── Absent-data placeholder (mirrors AbsentBlock in evidence-panel.tsx) ─────

function AbsentBlock({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded border border-panel-border/40 bg-background/30 text-xs text-muted-foreground/50 italic">
      <Info className="w-3 h-3 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ─── Per-type display config ──────────────────────────────────────────────────

const TYPE_CONFIG: Record<ActionType, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.FC<{ className?: string }>;
}> = {
  READ_FILE:             { label: 'File Read',        color: 'text-purple-300',  bg: 'bg-purple-400/8',  border: 'border-purple-400/20',  icon: Eye          },
  WRITE_FILE:            { label: 'File Write',       color: 'text-emerald-300', bg: 'bg-emerald-400/8', border: 'border-emerald-400/20', icon: FileEdit     },
  EXEC_COMMAND:          { label: 'Command',          color: 'text-cyan-300',    bg: 'bg-cyan-400/8',    border: 'border-cyan-400/20',    icon: Terminal     },
  VERIFY_RESULT:         { label: 'Verify',           color: 'text-green-300',   bg: 'bg-green-400/8',   border: 'border-green-400/20',   icon: CheckCircle2 },
  TOOL_ACTION:           { label: 'Tool Action',      color: 'text-slate-300',   bg: 'bg-slate-400/8',   border: 'border-slate-400/15',   icon: Activity     },
  APPROVAL_CHECKPOINT:   { label: 'Gate',             color: 'text-blue-300',    bg: 'bg-blue-400/8',    border: 'border-blue-400/20',    icon: CheckCircle2 },
  APPROVAL_DECISION:     { label: 'Decision',         color: 'text-orange-300',  bg: 'bg-orange-400/8',  border: 'border-orange-400/20',  icon: Activity     },
  LANE_STEERED:          { label: 'Lane Signal',      color: 'text-amber-300',   bg: 'bg-amber-400/8',   border: 'border-amber-400/20',   icon: Terminal     },
  OPERATOR_OVERRIDE:     { label: 'Override',         color: 'text-rose-300',    bg: 'bg-rose-400/8',    border: 'border-rose-400/20',    icon: Activity     },
};

const TYPE_ORDER: ActionType[] = ['READ_FILE', 'WRITE_FILE', 'EXEC_COMMAND', 'VERIFY_RESULT', 'TOOL_ACTION', 'APPROVAL_CHECKPOINT', 'APPROVAL_DECISION', 'LANE_STEERED', 'OPERATOR_OVERRIDE'];

// ─── Execution shape label config ─────────────────────────────────────────────

const SHAPE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'read-only inspection':  { color: 'text-purple-300',              bg: 'bg-purple-400/8',              border: 'border-purple-400/20'              },
  'batched reads':         { color: 'text-purple-300',              bg: 'bg-purple-400/8',              border: 'border-purple-400/20'              },
  'writes only':           { color: 'text-emerald-300',             bg: 'bg-emerald-400/8',             border: 'border-emerald-400/20'             },
  'command-only':          { color: 'text-cyan-300',                bg: 'bg-cyan-400/8',                border: 'border-cyan-400/20'                },
  'command-heavy':         { color: 'text-cyan-300',                bg: 'bg-cyan-400/8',                border: 'border-cyan-400/20'                },
  'full edit cycle':       { color: 'text-sky-300',                 bg: 'bg-sky-400/8',                 border: 'border-sky-400/20'                 },
  'read → write → verify': { color: 'text-teal-300',                bg: 'bg-teal-400/8',                border: 'border-teal-400/20'                },
  'write → verify':        { color: 'text-green-300',               bg: 'bg-green-400/8',               border: 'border-green-400/20'               },
  'inspect → edit':        { color: 'text-emerald-300',             bg: 'bg-emerald-400/8',             border: 'border-emerald-400/20'             },
  'inspect → run':         { color: 'text-cyan-300',                bg: 'bg-cyan-400/8',                border: 'border-cyan-400/20'                },
  'run → verify':          { color: 'text-green-300',               bg: 'bg-green-400/8',               border: 'border-green-400/20'               },
  'read + command':        { color: 'text-cyan-300',                bg: 'bg-cyan-400/8',                border: 'border-cyan-400/20'                },
  'mixed actions':         { color: 'text-slate-300',               bg: 'bg-slate-400/8',               border: 'border-slate-400/20'               },
  'no actions':            { color: 'text-muted-foreground/40',     bg: 'bg-panel-border/10',           border: 'border-panel-border/20'            },
};

function shapeStyle(label: string) {
  return SHAPE_STYLE[label] ?? { color: 'text-slate-300', bg: 'bg-slate-400/8', border: 'border-slate-400/20' };
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  type: ActionType;
  count: number;
  successCount: number;
  failureCount: number;
}

function StatCard({ type, count, successCount, failureCount }: StatCardProps) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;

  const inFlight = count - successCount - failureCount;
  const successRate = count > 0 ? Math.round((successCount / count) * 100) : null;

  return (
    <div className={`flex-1 min-w-[80px] rounded border ${cfg.border} ${cfg.bg} px-2.5 py-2 space-y-1`}>
      <div className="flex items-center gap-1">
        <Icon className={`w-2.5 h-2.5 shrink-0 ${cfg.color} opacity-70`} />
        <span className={`text-[10px] font-semibold ${cfg.color} uppercase tracking-wider`}>{cfg.label}</span>
      </div>
      <div className={`text-base font-mono font-bold leading-none ${cfg.color}`}>{count}</div>
      <div className="flex items-center gap-1.5 text-[10px] tabular-nums">
        {successCount > 0 && (
          <span className="text-green-400/60">✓{successCount}</span>
        )}
        {failureCount > 0 && (
          <span className="text-red-400/60">✗{failureCount}</span>
        )}
        {inFlight > 0 && (
          <span className="text-muted-foreground/30">~{inFlight}</span>
        )}
        {successRate !== null && count > 1 && (
          <span className="text-muted-foreground/30 ml-auto">{successRate}%</span>
        )}
      </div>
    </div>
  );
}

// ─── Command class chip ───────────────────────────────────────────────────────

function CommandClassChip({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-400/20 bg-cyan-400/5 text-[10px] text-cyan-300/70 font-mono">
      <Zap className="w-2.5 h-2.5 shrink-0 opacity-60" />
      {label}
      <span className="text-cyan-400/40">×{count}</span>
    </span>
  );
}

// ─── ToolIntrospectionPanel ───────────────────────────────────────────────────

interface SideEffectObserved {
  command: string;
  sideEffectClass: string;
  trustLevel: string;
  reason: string;
}

interface ToolIntrospectionPanelProps {
  actions: ActionRecord[];
  sideEffectsObserved?: SideEffectObserved[] | null;
  readBurstUsed?:               boolean;
  readBurstCount?:              number;
  /** Number of actions identified as potentially independent (for burst badge gate). */
  potentiallyIndependentCount?: number;
}

export function ToolIntrospectionPanel({ actions, sideEffectsObserved, readBurstUsed, readBurstCount, potentiallyIndependentCount }: ToolIntrospectionPanelProps) {
  const tallies = useMemo(() => computeActionTallies(actions), [actions]);
  const shape   = useMemo(() => deriveExecutionShape(actions),  [actions]);

  // Merge commandClassFreq from tallies with sideEffectsObserved (dedup by class)
  // Must be declared before any early returns to satisfy the Rules of Hooks.
  const mergedClassFreq = useMemo(() => {
    const freq: Record<string, number> = { ...tallies.commandClassFreq };
    if (sideEffectsObserved) {
      for (const entry of sideEffectsObserved) {
        if (entry.sideEffectClass && !(entry.sideEffectClass in freq)) {
          freq[entry.sideEffectClass] = 1;
        }
      }
    }
    return freq;
  }, [tallies.commandClassFreq, sideEffectsObserved]);

  if (actions.length === 0) {
    return (
      <AbsentBlock message="No action records — tool introspection is unavailable for conversational or zero-action tasks." />
    );
  }

  const presentTypes = TYPE_ORDER.filter(t => tallies.typeStats[t] != null);
  const shapeStyle_  = shapeStyle(shape);
  const classEntries = Object.entries(mergedClassFreq).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded border border-orange-400/15 bg-orange-400/5 text-xs overflow-hidden border-l-2 border-l-orange-500/50 space-y-3 px-3 py-2.5">

      {/* Execution shape badge */}
      <div className="flex items-center gap-2">
        <GitBranch className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Execution shape</span>
        <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded border ${shapeStyle_.color} ${shapeStyle_.bg} ${shapeStyle_.border}`}>
          {shape}
        </span>
      </div>

      {/* Read burst badge — shown when burst was dispatched AND produced independently-classified reads */}
      {readBurstUsed && (potentiallyIndependentCount ?? 0) > 0 && (
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-purple-400/60 shrink-0" />
          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Read burst</span>
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded border text-purple-300 bg-purple-400/10 border-purple-400/25"
            title={`${readBurstCount ?? 0} file${(readBurstCount ?? 0) !== 1 ? 's' : ''} read concurrently via Promise.all before the main agent loop`}
          >
            {readBurstCount ?? 0} file{(readBurstCount ?? 0) !== 1 ? 's' : ''} · concurrent
          </span>
        </div>
      )}

      {/* Per-type stat cards */}
      <div className="flex flex-wrap gap-1.5">
        {presentTypes.map(type => {
          const stat = tallies.typeStats[type]!;
          return (
            <StatCard
              key={type}
              type={type}
              count={stat.count}
              successCount={stat.successCount}
              failureCount={stat.failureCount}
            />
          );
        })}
      </div>

      {/* Command class distribution */}
      {classEntries.length > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
            <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Command classes</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {classEntries.map(([cls, cnt]) => (
              <CommandClassChip key={cls} label={cls} count={cnt} />
            ))}
          </div>
        </div>
      ) : tallies.commandCount > 0 ? (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30 italic">
          <Cpu className="w-2.5 h-2.5 shrink-0" />
          <span>No command class metadata on these records.</span>
        </div>
      ) : null}

    </div>
  );
}
