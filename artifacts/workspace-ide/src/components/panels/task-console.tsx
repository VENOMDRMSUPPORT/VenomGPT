import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useListAgentTasks } from '@workspace/api-client-react';
import { useIdeStore, AgentLogEvent } from '@/store/use-ide-store';
import type { LivePhaseState } from '@/store/use-ide-store';
import {
  X, Loader2, Sparkles,
  AlignLeft, AlertCircle, CheckCircle2,
  Eye, FileEdit, Terminal, Settings, Search, Wrench,
  Activity, MapPin, ListChecks, ChevronRight, ChevronDown,
  FileCheck, GitBranch, DatabaseBackup, RotateCcw, Check,
  Clock, FileCode, WifiOff, ScanSearch, Shield, RefreshCw,
  ChevronsDown, ChevronsUp, Lock, Network,
} from 'lucide-react';
import { triggerRecheckRuntime } from '@/components/ui/runtime-status-bar';
import { getVerifyQualityConfig } from '@/lib/verifyQuality';
import { EvidencePanel } from '@/components/panels/evidence-panel';
import { RecoveryCard } from '@/components/panels/recovery-card';
import { format, intervalToDuration, formatDuration } from 'date-fns';
import { TaskStatusCluster } from '@/components/ui/task-status-cluster';
import { LiveRunStateBar } from '@/components/ui/live-run-state-bar';
import {
  assignActionsToWindows,
  computeActionTallies,
  getActionItemLabel,
  filterActionGroups,
  type ActionRecord,
  type ActionGroup,
  type ActionTallies,
  type ActionType,
} from '@/lib/actionSelectors';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSOLE_WIDTH = 300;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const d = intervalToDuration({ start: 0, end: ms });
  return formatDuration(d, { format: ['minutes', 'seconds'] });
}

// ─── Stage constants ──────────────────────────────────────────────────────────

const STAGE_TAGS = ['PLANNING', 'INSPECTING', 'EDITING', 'VERIFYING', 'REPAIRING', 'WRAPPING UP'] as const;
type StageTag = typeof STAGE_TAGS[number];

interface ParsedThought { stage: StageTag | null; body: string; }

function parseThought(message: string): ParsedThought {
  const match = message.match(/^\[(PLANNING|INSPECTING|EDITING|VERIFYING|REPAIRING|WRAPPING UP)\]\s*/i);
  if (match) return { stage: match[1].toUpperCase() as StageTag, body: message.slice(match[0].length).trim() };
  return { stage: null, body: message };
}

const STAGE_STYLE: Record<StageTag, { color: string; bg: string; border: string; icon: React.FC<{ className?: string }> }> = {
  PLANNING:      { color: 'text-blue-400',    bg: 'bg-blue-400/10',    border: 'border-blue-400/25',    icon: Settings },
  INSPECTING:    { color: 'text-purple-400',  bg: 'bg-purple-400/10',  border: 'border-purple-400/25',  icon: Search },
  EDITING:       { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/25', icon: FileEdit },
  VERIFYING:     { color: 'text-cyan-400',    bg: 'bg-cyan-400/10',    border: 'border-cyan-400/25',    icon: CheckCircle2 },
  REPAIRING:     { color: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/25',   icon: Wrench },
  'WRAPPING UP': { color: 'text-green-400',   bg: 'bg-green-400/10',   border: 'border-green-400/25',   icon: CheckCircle2 },
};

// ─── Log segmentation ─────────────────────────────────────────────────────────

type LogSegment =
  | { kind: 'single'; log: AgentLogEvent }
  | { kind: 'file_read_group'; logs: AgentLogEvent[] };

function segmentLogs(logs: AgentLogEvent[]): LogSegment[] {
  const out: LogSegment[] = [];
  let i = 0;
  while (i < logs.length) {
    if (logs[i].type === 'file_read') {
      const group: AgentLogEvent[] = [logs[i]];
      let j = i + 1;
      while (j < logs.length && logs[j].type === 'file_read') { group.push(logs[j]); j++; }
      if (group.length >= 3) { out.push({ kind: 'file_read_group', logs: group }); i = j; }
      else { group.forEach(l => out.push({ kind: 'single', log: l })); i = j; }
    } else {
      out.push({ kind: 'single', log: logs[i] });
      i++;
    }
  }
  return out;
}

// ─── Timestamp ───────────────────────────────────────────────────────────────

function Timestamp({ ts }: { ts: string }) {
  return (
    <span className="ml-auto text-[10px] text-muted-foreground/40 shrink-0 tabular-nums">
      {format(new Date(ts), 'HH:mm:ss')}
    </span>
  );
}

// ─── Log items ────────────────────────────────────────────────────────────────

function ThoughtItem({ log }: { log: AgentLogEvent }) {
  const { stage, body } = parseThought(log.message);
  if (stage) {
    const style = STAGE_STYLE[stage];
    const Icon = style.icon;
    return (
      <div className={`px-2.5 py-1.5 rounded border ${style.bg} ${style.border}`}>
        <div className="flex items-start gap-1.5">
          <Icon className={`w-3 h-3 shrink-0 mt-0.5 ${style.color}`} />
          {body
            ? <p className={`flex-1 text-xs leading-snug ${style.color} opacity-90`}>{body}</p>
            : <span className={`flex-1 text-xs ${style.color} opacity-40 italic`}>{stage.toLowerCase()}</span>
          }
          <div className="flex flex-col items-end shrink-0 ml-1 gap-0.5">
            <span className={`text-[9px] font-semibold uppercase tracking-widest ${style.color} opacity-35`}>{stage}</span>
            <Timestamp ts={log.timestamp} />
          </div>
        </div>
      </div>
    );
  }
  // Unstaged thought — agent reply or internal reasoning note.
  return (
    <div className="px-2.5 py-2 rounded border border-white/5 bg-white/[0.02] text-xs">
      <div className="flex items-start gap-2">
        <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-primary/40" />
        <span className="text-gray-200/85 leading-relaxed flex-1">{body}</span>
        <Timestamp ts={log.timestamp} />
      </div>
    </div>
  );
}

function FileReadGroup({ logs }: { logs: AgentLogEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const last = logs[logs.length - 1];
  return (
    <div className="rounded border border-purple-400/10 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-2 py-1 text-xs text-purple-300/70 hover:bg-purple-400/5 transition-colors"
      >
        <Eye className="w-3 h-3 shrink-0 text-purple-400/70" />
        <span className="text-purple-400/50 shrink-0">Read</span>
        <span className="flex-1 text-left text-purple-300/70">{logs.length} files</span>
        <Timestamp ts={last.timestamp} />
        {expanded ? <ChevronDown className="w-3 h-3 shrink-0 text-purple-400/40" /> : <ChevronRight className="w-3 h-3 shrink-0 text-purple-400/40" />}
      </button>
      {expanded && (
        <div className="border-t border-purple-400/10 bg-[#0a0a0c] divide-y divide-purple-400/5">
          {logs.map(l => (
            <div key={l.id} className="flex items-center gap-2 px-3 py-0.5 text-xs">
              <Eye className="w-2.5 h-2.5 shrink-0 text-purple-400/40" />
              <span className="text-purple-300/60 font-mono truncate flex-1">{l.message}</span>
              <Timestamp ts={l.timestamp} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Transcript filter bar ────────────────────────────────────────────────────

const TRANSCRIPT_FILTER_CHIPS: Array<{
  type: ActionType;
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
}> = [
  { type: 'READ_FILE',    label: 'Reads',         icon: Eye,          color: 'text-purple-300',  bg: 'bg-purple-400/10',  border: 'border-purple-400/20'  },
  { type: 'WRITE_FILE',   label: 'Writes',         icon: FileEdit,     color: 'text-emerald-300', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  { type: 'EXEC_COMMAND', label: 'Commands',       icon: Terminal,     color: 'text-cyan-300',    bg: 'bg-cyan-400/10',    border: 'border-cyan-400/20'    },
  { type: 'VERIFY_RESULT',label: 'Verifications',  icon: CheckCircle2, color: 'text-green-300',   bg: 'bg-green-400/10',   border: 'border-green-400/20'   },
  { type: 'TOOL_ACTION',  label: 'Tool actions',   icon: Wrench,       color: 'text-slate-300',   bg: 'bg-slate-400/10',   border: 'border-slate-400/20'   },
];

interface TranscriptFilterBarProps {
  activeTypes: Set<ActionType>;
  searchQuery: string;
  onToggleType: (type: ActionType) => void;
  onSearchChange: (q: string) => void;
  onClearAll: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  hasActions: boolean;
}

function TranscriptFilterBar({
  activeTypes,
  searchQuery,
  onToggleType,
  onSearchChange,
  onClearAll,
  onCollapseAll,
  onExpandAll,
  hasActions,
}: TranscriptFilterBarProps) {
  if (!hasActions) return null;
  const isFiltered = activeTypes.size > 0 || searchQuery.trim().length > 0;
  return (
    <div className="px-2 py-1.5 border-b border-panel-border/30 bg-background/20 space-y-1.5 shrink-0">
      {/* Filter chips + collapse/expand */}
      <div className="flex items-center gap-1 flex-wrap">
        {TRANSCRIPT_FILTER_CHIPS.map(chip => {
          const isActive = activeTypes.has(chip.type);
          const Icon = chip.icon;
          return (
            <button
              key={chip.type}
              onClick={() => onToggleType(chip.type)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                isActive
                  ? `${chip.color} ${chip.bg} ${chip.border}`
                  : 'text-muted-foreground/35 border-panel-border/30 bg-transparent hover:text-muted-foreground/60 hover:border-panel-border/50'
              }`}
              title={isActive ? `Hide ${chip.label}` : `Show only ${chip.label}`}
            >
              <Icon className="w-2.5 h-2.5 shrink-0" />
              <span>{chip.label}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <button
            onClick={onCollapseAll}
            title="Collapse all action groups"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-panel-border/30 text-[10px] text-muted-foreground/35 hover:text-muted-foreground/60 hover:border-panel-border/50 transition-colors"
          >
            <ChevronsDown className="w-2.5 h-2.5 shrink-0" />
          </button>
          <button
            onClick={onExpandAll}
            title="Expand all action groups"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-panel-border/30 text-[10px] text-muted-foreground/35 hover:text-muted-foreground/60 hover:border-panel-border/50 transition-colors"
          >
            <ChevronsUp className="w-2.5 h-2.5 shrink-0" />
          </button>
          {isFiltered && (
            <button
              onClick={onClearAll}
              title="Clear all filters"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-panel-border/30 text-[10px] text-muted-foreground/35 hover:text-amber-400/60 hover:border-amber-400/20 transition-colors ml-0.5"
            >
              <X className="w-2.5 h-2.5 shrink-0" />
            </button>
          )}
        </div>
      </div>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-muted-foreground/30 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search by file, command, probe…"
          className="w-full pl-6 pr-2 py-0.5 rounded border border-panel-border/30 bg-background/30 text-[11px] text-foreground/80 placeholder:text-muted-foreground/25 focus:outline-none focus:border-primary/30 focus:bg-background/50 transition-colors font-mono"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Action group row ─────────────────────────────────────────────────────────

const ACTION_ICON_MAP: Record<ActionGroup['iconToken'], React.FC<{ className?: string }>> = {
  Eye:          Eye,
  FileEdit:     FileEdit,
  Terminal:     Terminal,
  CheckCircle2: CheckCircle2,
  Wrench:       Wrench,
};

function ActionGroupRow({ group, collapseOverride }: { group: ActionGroup; collapseOverride?: 'collapse' | 'expand' | null }) {
  const [expanded, setExpanded] = useState(false);
  const [manuallySet, setManuallySet] = useState(false);
  const Icon = ACTION_ICON_MAP[group.iconToken];
  const isSingle = group.count === 1;
  const isExpandable = !isSingle;
  const singleLabel = isSingle ? getActionItemLabel(group.items[0]) : '';
  const singleExitCode = isSingle ? group.items[0].outcome?.exitCode : undefined;
  const singleSuccess  = isSingle ? (group.items[0].outcome?.success ?? true) : true;

  const hasGroupFailure = !isSingle && group.items.some(
    a => a.outcome?.success === false || (a.outcome?.exitCode !== undefined && a.outcome.exitCode !== 0)
  );

  // Apply global collapse/expand override unless the user has manually toggled this group since the last override
  useEffect(() => {
    if (!collapseOverride) return;
    setExpanded(collapseOverride === 'expand');
    setManuallySet(false);
  }, [collapseOverride]);

  const handleToggle = () => {
    if (!isExpandable) return;
    setManuallySet(true);
    setExpanded(e => !e);
  };

  const isEffectivelyExpanded = manuallySet ? expanded : (collapseOverride === 'expand' ? true : expanded);

  return (
    <div className={`rounded border ${group.bg} ${group.border} overflow-hidden`}>
      <button
        onClick={handleToggle}
        className={`w-full flex items-center gap-2 px-2 py-1 text-xs ${group.color} ${isExpandable ? 'hover:brightness-110 transition-colors cursor-pointer' : 'cursor-default'}`}
        disabled={!isExpandable}
      >
        <Icon className={`w-3 h-3 shrink-0 opacity-70`} />
        {isSingle ? (
          /* Single item: show verb + path inline, no expand control */
          <>
            <span className="opacity-60 shrink-0">{group.verb}</span>
            <span className={`font-mono truncate flex-1 text-left opacity-80`}>{singleLabel}</span>
            {singleExitCode !== undefined && (
              <span className={`text-[10px] tabular-nums shrink-0 ${singleSuccess ? 'text-green-400/60' : 'text-red-400/60'}`}>
                exit {singleExitCode}
              </span>
            )}
          </>
        ) : (
          /* Multiple items: show count label + failure badge + expand chevron */
          <>
            <span className="flex-1 text-left opacity-80">{group.label}</span>
            {hasGroupFailure && !isEffectivelyExpanded && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Contains failed action(s)" />
            )}
            {isEffectivelyExpanded
              ? <ChevronDown className="w-3 h-3 shrink-0 opacity-40" />
              : <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />
            }
          </>
        )}
      </button>
      {isEffectivelyExpanded && (
        <div className={`border-t ${group.border} bg-[#0a0a0c] divide-y divide-white/5`}>
          {group.items.map((action) => (
            <div key={action.id} className="flex items-center gap-2 px-3 py-0.5 text-xs">
              <Icon className={`w-2.5 h-2.5 shrink-0 ${group.color} opacity-50`} />
              <span className={`font-mono truncate flex-1 ${group.color} opacity-70`}>
                {getActionItemLabel(action)}
              </span>
              {action.outcome?.exitCode !== undefined && (
                <span className={`text-[10px] tabular-nums ${action.outcome.success ? 'text-green-400/60' : 'text-red-400/60'}`}>
                  exit {action.outcome.exitCode}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Route label map ─────────────────────────────────────────────────────────

const ROUTE_LABEL: Record<string, string> = {
  conversational:       'Conversational response',
  conversational_call:  'Conversational response',
  'agentic/coding':     'Coding task',
  agentic:              'Agentic execution',
  planning:             'Planning task',
  repair:               'Repair run',
};

// ─── Agent log item renderer ──────────────────────────────────────────────────

function SchedulingTruthItem({ log }: { log: AgentLogEvent }) {
  const phase   = log.data?.phase as string | undefined;
  const isDone  = phase === 'done';
  const counts  = log.data?.counts as Record<string, number> | undefined;

  return (
    <div className="rounded border border-indigo-400/15 bg-indigo-400/5 text-xs overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-indigo-400/10">
        <GitBranch className="w-3 h-3 shrink-0 text-indigo-400/70" />
        <span className="font-medium text-indigo-300/80 text-xs">
          Scheduling Truth · {isDone ? 'observed' : 'expected'}
        </span>
        <Timestamp ts={log.timestamp} />
      </div>
      <div className="px-3 py-2 space-y-1">
        <p className="text-indigo-200/60 leading-relaxed">{log.message}</p>
        {isDone && counts && (
          <div className="flex flex-wrap gap-1 pt-1">
            {Object.entries(counts)
              .filter(([, n]) => n > 0)
              .map(([cls, n]) => (
                <span key={cls} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-400/10 border border-indigo-400/12 text-indigo-300/60 font-mono">
                  {cls.replace(/_/g, ' ')}: {n}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentLogItem({ log }: { log: AgentLogEvent }) {
  if (log.type === 'done')              return null;
  if (log.type === 'checkpoint')        return null;
  if (log.type === 'execution_summary') return null;
  if (log.type === 'scheduling_truth')  return <SchedulingTruthItem log={log} />;
  if (log.type === 'thought')           return <ThoughtItem log={log} />;

  if (log.type === 'status') {
    if (log.message.startsWith('Workspace: ')) {
      const projectName = log.message.slice('Workspace: '.length).split('/').pop() ?? '';
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5">
          <span className="text-[10px] text-muted-foreground/25 font-mono select-none">
            project: {projectName}
          </span>
        </div>
      );
    }

    const eventClass = log.data?.eventClass as string | undefined;

    // expected_condition — very dim info-level note (e.g. "new file will be created")
    if (eventClass === 'expected_condition') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5">
          <span className="text-[11px] text-muted-foreground/30 italic">{log.message}</span>
        </div>
      );
    }

    // warning — amber tint to distinguish from noise (e.g. retries, large writes)
    if (eventClass === 'warning') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5">
          <span className="w-1 h-1 rounded-full bg-amber-400/50 shrink-0" />
          <span className="text-[11px] text-amber-300/55 italic">{log.message}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
        <span className="text-[11px] text-muted-foreground/50 italic">{log.message}</span>
      </div>
    );
  }

  if (log.type === 'file_read') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs">
        <Eye className="w-3 h-3 shrink-0 text-purple-400/70" />
        <span className="text-purple-400/50 shrink-0">Reading</span>
        <span className="text-purple-300/70 font-mono truncate flex-1">{log.message}</span>
        <Timestamp ts={log.timestamp} />
      </div>
    );
  }

  if (log.type === 'file_write') {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-emerald-400/5 border border-emerald-400/10 text-xs">
        <FileEdit className="w-3 h-3 shrink-0 text-emerald-400" />
        <span className="text-emerald-400/60 shrink-0">Wrote</span>
        <span className="text-emerald-300 font-mono flex-1 truncate">{log.message}</span>
        <Timestamp ts={log.timestamp} />
      </div>
    );
  }

  if (log.type === 'command') {
    const cmd = log.message.replace(/^Running:\s*/, '');
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border bg-cyan-400/5 border-cyan-400/15 text-xs">
        <Terminal className="w-3 h-3 shrink-0 text-cyan-400" />
        <pre className="text-cyan-200 font-mono text-xs flex-1 truncate">$ {cmd}</pre>
        <Timestamp ts={log.timestamp} />
      </div>
    );
  }

  if (log.type === 'command_output') {
    const isSuccess = log.message.startsWith('✓');
    const lines = log.message.split('\n');
    const statusLine = lines[0];
    const outputBody = lines.slice(1).filter(l => l.trim()).join('\n').trim();
    return (
      <div className="text-xs">
        <div className={`flex items-center gap-2 px-2 py-1 ${isSuccess ? 'text-green-400/70' : 'text-red-400/70'}`}>
          {isSuccess ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
          <span className="font-mono flex-1 truncate">{statusLine}</span>
          <Timestamp ts={log.timestamp} />
        </div>
        {outputBody && (
          <pre className="mx-2 mb-1.5 px-2 py-1.5 rounded bg-black/20 border border-white/5 text-[10px] text-gray-400/70 font-mono leading-relaxed overflow-x-hidden whitespace-pre-wrap break-all">
            {outputBody}
          </pre>
        )}
      </div>
    );
  }

  if (log.type === 'error') {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border bg-red-400/8 border-red-400/20 text-xs">
        <AlertCircle className="w-3 h-3 shrink-0 text-red-400" />
        <span className="text-red-300 truncate flex-1">{log.message}</span>
        <Timestamp ts={log.timestamp} />
      </div>
    );
  }

  if (log.type === 'route') {
    const category  = log.data?.category      as string | undefined;
    const maxSteps  = log.data?.maxSteps       as number | undefined;
    const maxWrites = log.data?.maxFileWrites  as number | undefined;
    const maxReads  = log.data?.maxFileReads   as number | undefined;
    const label = category ? (ROUTE_LABEL[category] ?? category) : 'Routed';
    const isConversational = category === 'conversational' || category === 'conversational_call';
    const capHint = isConversational
      ? ''
      : maxSteps != null && maxSteps > 0
        ? `up to ${maxSteps} steps`
        : (maxReads != null && maxReads > 0 ? `${maxReads} reads · ${maxWrites ?? 0} writes` : '');
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-blue-300/75 bg-blue-500/6 border border-blue-400/12 rounded">
        <MapPin className="w-3 h-3 shrink-0 text-blue-400/60" />
        <span className="text-blue-200/80">{label}</span>
        {capHint && (
          <span className="text-blue-400/40 text-[10px] ml-1">· {capHint}</span>
        )}
        <Timestamp ts={log.timestamp} />
      </div>
    );
  }

  if (log.type === 'plan') {
    const goal     = log.data?.goal     as string | undefined;
    const approach = log.data?.approach as string | undefined;
    const files    = log.data?.filesToRead as string[] | undefined;
    const changes  = log.data?.expectedChanges as string[] | undefined;
    return (
      <div className="rounded border border-indigo-400/20 bg-indigo-400/5 text-xs overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-indigo-400/10">
          <ListChecks className="w-3 h-3 shrink-0 text-indigo-400" />
          <span className="font-medium text-indigo-300 text-xs">Plan</span>
          <Timestamp ts={log.timestamp} />
        </div>
        <div className="px-3 py-2 space-y-1.5">
          {goal && <div><span className="text-indigo-400/50 text-[10px] uppercase tracking-wider mr-1">Objective</span><span className="text-indigo-200/80">{goal}</span></div>}
          {approach && <div className="text-indigo-100/50 leading-relaxed">{approach}</div>}
          {files && files.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              <span className="text-indigo-400/50 text-[10px] uppercase tracking-wider mr-1">Will read</span>
              {files.map((f, i) => <span key={i} className="font-mono bg-indigo-400/10 border border-indigo-400/15 px-1.5 py-0.5 rounded text-indigo-200/60">{f}</span>)}
            </div>
          )}
          {changes && changes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-indigo-400/50 text-[10px] uppercase tracking-wider mr-1">Will modify</span>
              {changes.map((f, i) => <span key={i} className="font-mono bg-emerald-400/8 border border-emerald-400/12 px-1.5 py-0.5 rounded text-emerald-300/60">{f}</span>)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 px-2 py-1 text-xs text-muted-foreground">
      <Activity className="w-3 h-3 shrink-0 mt-0.5" />
      <span className="truncate flex-1">{log.message}</span>
    </div>
  );
}

// ─── Completion types ─────────────────────────────────────────────────────────

interface CompletionData {
  summary?: string;
  changed_files?: string[];
  commands_run?: string[];
  final_status?: string;
  remaining?: string;
}

interface FailureData {
  title?: string;
  detail?: string;
  step?: string;
  category?: string;
}

interface CancelledDrainData {
  filesWritten?: string[];
  unverifiedFiles?: string[];
  phaseAtCancellation?: string;
  stepsUsed?: number;
}

interface CheckpointFileSummary {
  path: string;
  existed: boolean;
  snapshotAt: string;
  originalBytes: number;
  diff?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

interface ExecutionSummaryData {
  stepsUsed: number;
  stepsMax: number;
  readsUsed: number;
  readsMax: number;
  writesUsed: number;
  writesMax: number;
  commandsUsed: number;
  commandsMax: number;
  verificationsDone: number;
  finalPhase: string;
  gateTriggers: Record<string, number> | null;
  shellReadsBlocked: number;
  verificationQuality?: string;
  exitReason?: string;
}

interface CheckpointData {
  taskId: string;
  createdAt: string;
  status: 'pending' | 'applied' | 'discarded';
  appliedAt?: string;
  discardedAt?: string;
  files: CheckpointFileSummary[];
  fileCount: number;
  durable?: boolean;
  runtimeImpactFiles?: string[];
}

// ─── Gate trigger → human-readable explanation ───────────────────────────────

function gateToHumanReason(gateCounts: Record<string, number> | null): string | null {
  if (!gateCounts) return null;
  if ((gateCounts['verification_required'] ?? 0) > 0) {
    return 'Verification was required but no substantive verification (build/test/compile) ran before completion. Run a build or test command to satisfy this gate.';
  }
  if ((gateCounts['runtime_proof_required'] ?? 0) > 0) {
    return 'Runtime proof was required — a port change or live server confirmation — but no port activity was observed during the run.';
  }
  return null;
}

// ─── Failure card ─────────────────────────────────────────────────────────────

function FailureCard({
  data,
  cancelledDrain,
  taskId,
  onNavigateTask,
}: {
  data: FailureData;
  cancelledDrain?: CancelledDrainData | null;
  taskId?: string;
  onNavigateTask?: (taskId: string) => void;
}) {
  const categoryLabel: Record<string, string> = {
    model: 'AI Provider', missing_api_key: 'Missing API Key', invalid_api_key: 'Invalid API Key',
    model_not_found: 'Model Not Found', insufficient_balance: 'Insufficient Balance',
    rate_limit: 'Rate Limited', network_error: 'Network Error', base_url_error: 'Bad Base URL',
    context_length: 'Context Too Long', tool: 'Tool Execution', command: 'Command Execution',
    workspace: 'Workspace', orchestration: 'Internal Orchestration', cancelled: 'Cancelled',
  };
  const isCancelled = data.category === 'cancelled';

  const hasCancelledProgress = isCancelled && cancelledDrain && (
    (cancelledDrain.filesWritten?.length ?? 0) > 0 ||
    (cancelledDrain.stepsUsed ?? 0) > 0
  );

  return (
    <div className="space-y-2">
      <div className={`rounded-lg border p-3 space-y-2 ${isCancelled ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
        <div className="flex items-center gap-2">
          <TaskStatusCluster status={isCancelled ? 'cancelled' : 'error'} size="sm" />
          <span className={`font-semibold text-sm ${isCancelled ? 'text-amber-400' : 'text-red-400'}`}>
            {isCancelled ? 'Cancelled' : 'Task Failed'}
          </span>
          {data.category && (
            <span className="ml-auto text-xs text-muted-foreground bg-panel-border px-2 py-0.5 rounded-full">
              {categoryLabel[data.category] ?? data.category}
            </span>
          )}
        </div>
        {data.title && <p className="text-sm text-gray-100 font-medium leading-snug">{data.title}</p>}
        {data.detail && (
          <pre className={`text-xs whitespace-pre-wrap break-words rounded-lg px-3 py-2 font-mono leading-relaxed ${isCancelled ? 'text-amber-300 bg-amber-400/10 border border-amber-400/20' : 'text-red-300 bg-red-400/10 border border-red-400/20'}`}>
            {data.detail}
          </pre>
        )}
        {data.step && <p className="text-xs text-muted-foreground"><span className="font-semibold">Failed at:</span> <code className="font-mono">{data.step}</code></p>}

        {/* Cancelled drain info — shows file/phase context when cancelled mid-run */}
        {hasCancelledProgress && cancelledDrain && (
          <div className="rounded border border-amber-400/20 bg-amber-400/8 px-2.5 py-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider">Progress at cancellation</p>
            <p className="text-xs text-amber-300/80">
              {(cancelledDrain.filesWritten?.length ?? 0)} file{(cancelledDrain.filesWritten?.length ?? 0) !== 1 ? 's' : ''} written,{' '}
              {(cancelledDrain.unverifiedFiles?.length ?? 0)} unverified.
              {cancelledDrain.phaseAtCancellation ? ` Cancelled during ${cancelledDrain.phaseAtCancellation} phase.` : ''}
              {cancelledDrain.stepsUsed != null ? ` ${cancelledDrain.stepsUsed} steps used.` : ''}
            </p>
            {(cancelledDrain.filesWritten?.length ?? 0) > 0 && (
              <ul className="space-y-0.5">
                {cancelledDrain.filesWritten!.map((f, i) => (
                  <li key={i} className="text-[10px] font-mono text-amber-300/60 truncate">{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Recovery card for cancelled / interrupted states */}
      {taskId && (
        <RecoveryCard taskId={taskId} onNavigateTask={onNavigateTask} />
      )}
    </div>
  );
}

// ─── Action ledger (compact panel inside TaskSummaryCard) ─────────────────────

function ActionLedger({ tallies }: { tallies: ActionTallies }) {
  const [showFiles, setShowFiles] = useState(false);
  const [showCmds, setShowCmds]   = useState(false);

  if (tallies.totalCount === 0) return null;

  return (
    <div className="border-t border-white/5 pt-2.5 mt-0.5 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider flex items-center gap-1.5">
        <Activity className="w-3 h-3" /> Action Ledger
      </p>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] font-mono bg-panel-border/30 text-muted-foreground/70 px-1.5 py-0.5 rounded">
          {tallies.totalCount} actions
        </span>
        {tallies.readCount > 0 && (
          <span className="text-[10px] font-mono bg-purple-400/8 text-purple-300/60 px-1.5 py-0.5 rounded border border-purple-400/10">
            {tallies.readCount} read{tallies.readCount !== 1 ? 's' : ''}
          </span>
        )}
        {tallies.writeCount > 0 && (
          <span className="text-[10px] font-mono bg-emerald-400/8 text-emerald-300/60 px-1.5 py-0.5 rounded border border-emerald-400/10">
            {tallies.writeCount} write{tallies.writeCount !== 1 ? 's' : ''}
          </span>
        )}
        {tallies.commandCount > 0 && (
          <span className="text-[10px] font-mono bg-cyan-400/8 text-cyan-300/60 px-1.5 py-0.5 rounded border border-cyan-400/10">
            {tallies.commandCount} cmd{tallies.commandCount !== 1 ? 's' : ''}
          </span>
        )}
        {tallies.verifyCount > 0 && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tallies.verifyPassed ? 'bg-green-400/8 text-green-300/60 border-green-400/10' : 'bg-amber-400/8 text-amber-300/60 border-amber-400/10'}`}>
            {tallies.verifyPassed ? 'verified ✓' : `${tallies.verifyCount} verify`}
          </span>
        )}
      </div>

      {/* Written files collapsible */}
      {tallies.writtenFiles.length > 0 && (
        <div>
          <button
            onClick={() => setShowFiles(f => !f)}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 mb-1"
          >
            <FileEdit className="w-2.5 h-2.5" />
            Files changed ({tallies.writtenFiles.length})
            {showFiles ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
          </button>
          {showFiles && (
            <ul className="space-y-0.5">
              {tallies.writtenFiles.map((f, i) => (
                <li key={i} className="text-[11px] font-mono text-emerald-400/70 bg-emerald-400/5 px-2 py-0.5 rounded truncate" title={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Commands collapsible */}
      {tallies.commandsRun.length > 0 && (
        <div>
          <button
            onClick={() => setShowCmds(c => !c)}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 mb-1"
          >
            <Terminal className="w-2.5 h-2.5" />
            Commands run ({tallies.commandsRun.length})
            {showCmds ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
          </button>
          {showCmds && (
            <ul className="space-y-0.5">
              {tallies.commandsRun.map((c, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-400/70 bg-cyan-400/5 px-2 py-0.5 rounded">
                  <span className="truncate flex-1" title={c.command}>$ {c.command}</span>
                  {c.exitCode !== undefined && (
                    <span className={`shrink-0 text-[10px] ${c.success ? 'text-green-400/60' : 'text-red-400/60'}`}>
                      exit {c.exitCode}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task summary card (product-grade, visually distinct from live logs) ──────

function TaskSummaryCard({
  completion,
  failure,
  checkpoint,
  executionSummary,
  elapsedMs,
  stepCount,
  repairCount,
  actionTallies,
  taskId,
  cancelledDrain,
  taskStatus,
  isConversational,
  onNavigateTask,
}: {
  completion: CompletionData | null;
  failure: FailureData | null;
  checkpoint: CheckpointData | null;
  executionSummary: ExecutionSummaryData | null;
  elapsedMs: number | null;
  stepCount: number;
  repairCount: number;
  actionTallies: ActionTallies | null;
  taskId?: string;
  cancelledDrain?: CancelledDrainData | null;
  taskStatus?: string;
  isConversational?: boolean;
  onNavigateTask?: (taskId: string) => void;
}) {
  // cpRefetchKey is incremented whenever the checkpoint is applied or discarded.
  // Passing it to RecoveryCard ensures a re-fetch that can surface runtime_stale_after_apply.
  const [cpRefetchKey, setCpRefetchKey] = useState(0);
  const handleCpStatusChange = () => setCpRefetchKey(k => k + 1);

  if (failure) return <FailureCard data={failure} cancelledDrain={cancelledDrain} taskId={taskId} onNavigateTask={onNavigateTask} />;

  // Pure-cancelled state: no done or error event was emitted, but cancelled drain was.
  // Render a synthetic cancelled FailureCard so the user sees progress and RecoveryCard.
  if (!completion && cancelledDrain) {
    const syntheticFailure: FailureData = { title: 'Task was cancelled', category: 'cancelled' };
    return <FailureCard data={syntheticFailure} cancelledDrain={cancelledDrain} taskId={taskId} onNavigateTask={onNavigateTask} />;
  }

  // Interrupted / stalled / cancelled tasks (when in-memory events are absent — e.g., after server restart):
  // Surface a truthful status card + RecoveryCard so the operator can navigate next steps.
  if (!completion && !failure && !cancelledDrain &&
      (taskStatus === 'interrupted' || taskStatus === 'stalled' || taskStatus === 'cancelled')) {
    const syntheticFailure: FailureData = taskStatus === 'interrupted'
      ? { title: 'Task interrupted by server restart', category: 'orchestration' }
      : taskStatus === 'cancelled'
        ? { title: 'Task was cancelled', category: 'cancelled' }
        : { title: 'Task stalled — step budget exhausted', category: 'orchestration' };
    return <FailureCard data={syntheticFailure} taskId={taskId} onNavigateTask={onNavigateTask} />;
  }

  if (!completion) return null;

  const statusKey = (completion.final_status ?? 'complete') as 'complete' | 'partial' | 'blocked';
  const statusConfig = {
    complete: {
      border: 'border-green-500/15',
      bg: 'bg-green-500/3',
      icon: <TaskStatusCluster status="done" size="sm" />,
      label: 'Completed',
      labelColor: 'text-green-400/80',
    },
    partial: {
      border: 'border-amber-500/15',
      bg: 'bg-amber-500/3',
      icon: <TaskStatusCluster status="stalled" size="sm" />,
      label: 'Partially Completed',
      labelColor: 'text-amber-400/80',
    },
    blocked: {
      border: 'border-red-500/15',
      bg: 'bg-red-500/3',
      icon: <TaskStatusCluster status="error" size="sm" />,
      label: 'Blocked',
      labelColor: 'text-red-400/80',
    },
  }[statusKey];

  const verificationEvidence = completion.summary
    ? completion.summary.match(/exit 0|compiled clean|test passed|verified|✓|output matches|GONE|confirmed/i)
    : null;

  const realStepCount = executionSummary?.stepsUsed ?? stepCount;
  const realStepMax = executionSummary?.stepsMax;

  // Lines changed — sum linesAdded/linesRemoved from checkpoint files when available
  const totalLinesAdded = checkpoint?.files.reduce((s, f) => s + (f.linesAdded ?? 0), 0) ?? 0;
  const totalLinesRemoved = checkpoint?.files.reduce((s, f) => s + (f.linesRemoved ?? 0), 0) ?? 0;
  const hasLineStats = totalLinesAdded > 0 || totalLinesRemoved > 0;

  // Blocked: derive human-readable gate reason
  const isBlocked = statusKey === 'blocked';
  const isPartial = statusKey === 'partial';
  const blockedGateReason = isBlocked ? gateToHumanReason(executionSummary?.gateTriggers ?? null) : null;
  const verifyQualityLabel = executionSummary?.verificationQuality;

  return (
    <div className="space-y-2">
      <div className={`rounded border ${statusConfig.border} ${statusConfig.bg} overflow-hidden`}>
        {/* Header strip */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5">
          {statusConfig.icon}
          <div className="flex-1 min-w-0">
            <span className={`font-medium text-xs ${statusConfig.labelColor}`}>{statusConfig.label}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {repairCount > 0 && (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                {repairCount} repair{repairCount > 1 ? 's' : ''}
              </span>
            )}
            {verificationEvidence && (
              <span className="text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">
                verified
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 px-3 py-2 border-b border-white/5 flex-wrap">
          {isConversational ? (
            /* Conversational tasks: honest label + always-visible elapsed + no-file-changes indicator */
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground/70 italic">Conversational reply</span>
              <span className="text-muted-foreground/30">·</span>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-xs font-mono text-muted-foreground">
                  {elapsedMs != null ? (elapsedMs < 500 ? '< 1s' : formatMs(elapsedMs)) : '—'}
                </span>
              </div>
              <span className="text-muted-foreground/30">·</span>
              <div className="flex items-center gap-1">
                <FileCode className="w-3 h-3 text-muted-foreground/30" />
                <span className="text-xs text-muted-foreground/50">No file changes</span>
              </div>
            </div>
          ) : (
            <>
              {elapsedMs != null && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-muted-foreground/50" />
                  <span className="text-xs font-mono text-muted-foreground">{formatMs(elapsedMs)}</span>
                </div>
              )}
              {realStepCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-muted-foreground/50" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {realStepCount}{realStepMax ? `/${realStepMax}` : ''} steps
                  </span>
                </div>
              )}
              {/* Files written — prefer action tally over completion list (more accurate) */}
              {(actionTallies?.writeCount ?? 0) > 0 ? (
                <div className="flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-emerald-400/60" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {actionTallies!.writeCount} write{actionTallies!.writeCount !== 1 ? 's' : ''}
                  </span>
                </div>
              ) : completion.changed_files && completion.changed_files.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-muted-foreground/50" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {completion.changed_files.length} file{completion.changed_files.length !== 1 ? 's' : ''}
                  </span>
                </div>
              ) : null}
              {/* Files read — from action tally */}
              {(actionTallies?.readCount ?? 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3 h-3 text-purple-400/50" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {actionTallies!.readCount} read{actionTallies!.readCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {/* Commands run */}
              {(actionTallies?.commandCount ?? 0) > 0 && (
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3 h-3 text-cyan-400/50" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {actionTallies!.commandCount} cmd{actionTallies!.commandCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {/* Lines changed — from checkpoint file diffs */}
              {hasLineStats && (
                <div className="flex items-center gap-1 font-mono text-xs">
                  {totalLinesAdded > 0 && (
                    <span className="text-green-400/80">+{totalLinesAdded}</span>
                  )}
                  {totalLinesRemoved > 0 && (
                    <span className="text-red-400/70">-{totalLinesRemoved}</span>
                  )}
                  <span className="text-muted-foreground/50 ml-0.5">lines</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Blocked: why-blocked section */}
        {isBlocked && (blockedGateReason || verifyQualityLabel) && (
          <div className="px-3 py-2 border-b border-white/5 bg-red-400/5">
            <p className="text-[10px] font-semibold text-red-400/60 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Shield className="w-2.5 h-2.5" /> Why Blocked
            </p>
            {blockedGateReason && (
              <p className="text-xs text-red-300/80 leading-relaxed">{blockedGateReason}</p>
            )}
            {verifyQualityLabel && (
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Verification quality: <span className="font-mono">{verifyQualityLabel}</span>
              </p>
            )}
          </div>
        )}

        {/* Summary text */}
        <div className="px-3 py-2.5 space-y-2.5">
          {completion.summary && (
            <p className="text-sm text-gray-200 leading-relaxed">{completion.summary}</p>
          )}

          {/* Partial: elevate "remaining" to a prominent block */}
          {isPartial && completion.remaining && (
            <div className="rounded border border-amber-400/25 bg-amber-400/8 px-2.5 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-2.5 h-2.5" /> Remaining Work
              </p>
              <p className="text-xs text-amber-300/90 leading-relaxed">{completion.remaining}</p>
            </div>
          )}

          {/* Changed files */}
          {completion.changed_files && completion.changed_files.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <FileCheck className="w-3 h-3" /> Files Changed ({completion.changed_files.length})
              </p>
              <ul className="space-y-0.5">
                {completion.changed_files.map((f, i) => (
                  <li key={i} className="text-xs font-mono text-emerald-400 bg-emerald-400/8 px-2 py-0.5 rounded truncate" title={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Commands run */}
          {completion.commands_run && completion.commands_run.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" /> Commands ({completion.commands_run.length})
              </p>
              <ul className="space-y-0.5">
                {completion.commands_run.map((c, i) => (
                  <li key={i} className="text-xs font-mono text-cyan-400 bg-cyan-400/5 px-2 py-0.5 rounded truncate" title={c}>$ {c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Remaining — non-partial (small chip for blocked/other) */}
          {!isPartial && completion.remaining && (
            <div className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2.5 py-1.5">
              <span className="font-semibold">Remaining: </span>{completion.remaining}
            </div>
          )}

          {/* Action ledger — grounded in real ActionRecord data */}
          {actionTallies && actionTallies.totalCount > 0 && (
            <ActionLedger tallies={actionTallies} />
          )}
        </div>

        {/* Checkpoint row */}
        {checkpoint && <CheckpointCard data={checkpoint} onStatusChange={handleCpStatusChange} />}
      </div>

      {/* Recovery card — shown for non-conversational terminal outcomes; RecoveryCard self-filters via showCard.
          This covers: blocked, partial, verification_limited, runtime_stale_after_apply,
          cancelled_with_progress, step_budget_exhausted, interrupted_with_progress.
          Suppressed for trivial conversational tasks where it adds no operator value.
          cpRefetchKey re-triggers fetch when checkpoint apply/discard changes backend truth. */}
      {taskId && !isConversational && (
        <RecoveryCard taskId={taskId} onNavigateTask={onNavigateTask} refetchKey={cpRefetchKey} />
      )}
    </div>
  );
}

// ─── Checkpoint card ──────────────────────────────────────────────────────────

function CheckpointCard({
  data,
  onStatusChange,
}: {
  data: CheckpointData;
  onStatusChange?: (status: CheckpointData['status']) => void;
}) {
  const [status, setStatus] = useState<CheckpointData['status']>(data.status);
  const [loading, setLoading] = useState<'discard' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<string[]>([]);
  const [showFiles, setShowFiles] = useState(false);

  const taskId = data.taskId;
  const isPending = status === 'pending';

  const handleDiscard = async () => {
    setLoading('discard'); setError(null);
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/discard`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Discard failed');
      setStatus('discarded'); setRestored(body.restoredFiles ?? []);
      onStatusChange?.('discarded');
    } catch (err) { setError(String(err)); } finally { setLoading(null); }
  };

  const handleApply = async () => {
    setLoading('apply'); setError(null);
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/apply`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Apply failed');
      setStatus('applied');
      // Notify parent so RecoveryCard can re-evaluate (runtime_stale_after_apply).
      onStatusChange?.('applied');
      // Trigger an immediate runtime re-probe after apply
      triggerRecheckRuntime();
    } catch (err) { setError(String(err)); } finally { setLoading(null); }
  };

  const borderColor =
    status === 'discarded' ? 'border-t border-amber-500/20 bg-amber-500/5' :
    status === 'applied'   ? 'border-t border-green-500/20 bg-green-500/5'  :
                             'border-t border-blue-500/20 bg-blue-500/5';

  return (
    <div className={`${borderColor} px-3 py-2.5 space-y-2`}>
      <div className="flex items-center gap-2">
        <DatabaseBackup className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Checkpoint</span>
        <button
          onClick={() => setShowFiles(e => !e)}
          className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
        >
          {data.fileCount} file{data.fileCount !== 1 ? 's' : ''}
          {showFiles ? ' ▲' : ' ▼'}
        </button>
        <div className="ml-auto">
          {status === 'pending'   && <span className="text-[10px] text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded-full">Pending</span>}
          {status === 'applied'   && <span className="text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">Accepted</span>}
          {status === 'discarded' && <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">Discarded</span>}
        </div>
      </div>

      {showFiles && (
        <ul className="space-y-0.5">
          {data.files.map((f, i) => (
            <li key={i} className="text-[11px] font-mono text-muted-foreground bg-panel-border/20 px-2 py-0.5 rounded truncate">
              <span className={f.existed ? 'text-blue-400/60' : 'text-emerald-400/60'}>{f.existed ? '~' : '+'}</span>{' '}
              {f.path}
            </li>
          ))}
        </ul>
      )}

      {/* Runtime-impact file callout */}
      {data.runtimeImpactFiles && data.runtimeImpactFiles.length > 0 && (
        <div className="rounded border border-green-500/20 bg-green-500/5 px-2 py-1.5 flex items-start gap-1.5">
          <RefreshCw className="w-3 h-3 text-green-400/60 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] text-green-300/70 font-semibold">Runtime-impacting files</span>
            <ul className="mt-0.5 space-y-0">
              {data.runtimeImpactFiles.map((f, i) => (
                <li key={i} className="text-[10px] font-mono text-green-400/50 truncate">{f}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-2 py-1">{error}</div>}

      {isPending && (
        <div className="flex gap-2">
          <button
            onClick={handleDiscard} disabled={loading !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-red-500/40 text-red-400 bg-red-500/8 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {loading === 'discard' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Discard
          </button>
          <button
            onClick={handleApply} disabled={loading !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-green-500/40 text-green-400 bg-green-500/8 hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            {loading === 'apply' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Accept
          </button>
        </div>
      )}

      {status === 'applied' && (
        <>
          <p className="text-xs text-green-400/80 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Changes accepted.
          </p>
          {/* Post-apply runtime nudge if runtime-impacting files were changed */}
          {data.runtimeImpactFiles && data.runtimeImpactFiles.length > 0 && (
            <div className="flex items-center gap-2 rounded border border-green-500/20 bg-green-500/5 px-2 py-1.5">
              <RefreshCw className="w-3 h-3 text-green-400/60 shrink-0" />
              <span className="text-[10px] text-green-300/60 flex-1">
                Runtime-impacting files were applied. Check that your dev server reloaded.
              </span>
              <button
                onClick={triggerRecheckRuntime}
                className="flex items-center gap-1 text-[10px] text-green-400/70 hover:text-green-400 border border-green-400/20 bg-green-400/8 hover:bg-green-400/15 px-1.5 py-0.5 rounded transition-colors"
                title="Re-probe open ports now"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                Re-check
              </button>
            </div>
          )}
        </>
      )}
      {status === 'discarded' && (
        <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
          <RotateCcw className="w-3 h-3" />
          {restored.length > 0 ? `${restored.length} file(s) restored.` : 'Changes discarded.'}
        </p>
      )}
    </div>
  );
}

// ─── Execution summary mini card ──────────────────────────────────────────────

function ExecutionSummaryMini({ data }: { data: ExecutionSummaryData }) {
  const [expanded, setExpanded] = useState(false);
  const qCfg = getVerifyQualityConfig(data.verificationQuality);
  return (
    <div className="rounded border border-slate-500/20 bg-slate-500/5 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-500/5 transition-colors"
      >
        <Activity className="w-3 h-3 text-slate-400 shrink-0" />
        <span className="text-slate-300 font-semibold">Execution</span>
        <span className="text-muted-foreground ml-1">
          {data.stepsUsed}/{data.stepsMax} steps · {data.verificationsDone} verify
        </span>
        {/* Verification quality badge */}
        <span
          className={`ml-1 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${qCfg.color} ${qCfg.bg} ${qCfg.border}`}
          title={`Verification quality: ${qCfg.label}`}
        >
          <Shield className="w-2.5 h-2.5 shrink-0" />
          {qCfg.label}
        </span>
        <div className="ml-auto">
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground/40" /> : <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 grid grid-cols-3 gap-1.5 font-mono border-t border-slate-500/10 pt-2">
          {[
            { label: 'Reads',    used: data.readsUsed,    max: data.readsMax    },
            { label: 'Writes',   used: data.writesUsed,   max: data.writesMax   },
            { label: 'Cmds',     used: data.commandsUsed, max: data.commandsMax },
          ].map(({ label, used, max }) => (
            <div key={label} className="bg-panel-border/20 rounded px-2 py-1 text-center">
              <div className="text-[10px] text-muted-foreground">{label}</div>
              <div className="text-foreground font-semibold">{used}<span className="text-muted-foreground/50">/{max}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-10 text-center select-none">
      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
        <TaskStatusCluster status="default" size="md" className="opacity-60" />
      </div>
      <p className="text-sm font-medium text-muted-foreground/70 mb-1">Ready</p>
      <p className="text-xs text-muted-foreground/40 leading-relaxed">
        Describe a task below. The agent will plan, write files, and run commands.
      </p>
    </div>
  );
}

// ─── P4: ApprovalGateCard ─────────────────────────────────────────────────────

type ApprovalAction = 'approve' | 'deny' | 'selective';

function ApprovalGateCard({ taskId, livePhase, actions }: {
  taskId: string;
  livePhase: LivePhaseState;
  actions: ActionRecord[];
}) {
  const [loading, setLoading] = useState<ApprovalAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denyMode, setDenyMode] = useState(false);
  const [denyNote, setDenyNote] = useState('');
  const [selectiveMode, setSelectiveMode] = useState(false);
  const [selectedLanes, setSelectedLanes] = useState<Set<string>>(new Set());

  // Authoritative source: APPROVAL_CHECKPOINT action records carry checkpointId + laneIds
  const approvalCheckpoints = actions.filter(a => a.type === 'APPROVAL_CHECKPOINT');
  const approvalDecisions   = actions.filter(a => a.type === 'APPROVAL_DECISION');
  const pendingGate = approvalCheckpoints.length > approvalDecisions.length
    ? approvalCheckpoints[approvalCheckpoints.length - 1]
    : null;
  const pendingGateMeta = pendingGate?.meta as
    { checkpointId: string; description?: string; laneIds?: string[] } | undefined;
  const laneIds: string[] = pendingGateMeta?.laneIds ?? [];

  const callEndpoint = async (action: ApprovalAction, body: Record<string, unknown>) => {
    setLoading(action); setError(null);
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/${action === 'selective' ? 'approve-selective' : action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  const handleApproveAll = () => {
    callEndpoint('approve', { checkpointId: pendingGateMeta?.checkpointId });
  };

  const handleDeny = () => {
    if (!denyMode) { setDenyMode(true); setSelectiveMode(false); return; }
    callEndpoint('deny', { checkpointId: pendingGateMeta?.checkpointId, note: denyNote.trim() || undefined });
  };

  const handleApproveSelective = () => {
    if (!selectiveMode) {
      setSelectiveMode(true); setDenyMode(false);
      if (laneIds.length > 0) setSelectedLanes(new Set(laneIds));
      return;
    }
    callEndpoint('selective', {
      checkpointId: pendingGateMeta?.checkpointId,
      approvedLaneIds: [...selectedLanes],
    });
  };

  const toggleLane = (id: string) => {
    setSelectedLanes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-2 my-1.5 rounded border border-blue-400/30 bg-blue-400/5 text-xs overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-400/15 bg-blue-400/8">
        <Lock className="w-3.5 h-3.5 text-blue-400/70 shrink-0" />
        <span className="text-blue-200/90 font-semibold text-[11px]">Awaiting Approval</span>
        {pendingGateMeta?.checkpointId && (
          <span className="ml-auto font-mono text-[10px] text-blue-400/40">{pendingGateMeta.checkpointId}</span>
        )}
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* Gate description (from checkpoint meta) or blockedContext fallback */}
        {(pendingGateMeta?.description || livePhase.blockedContext) && (
          <p className="text-muted-foreground/60 text-[11px] leading-relaxed">
            {pendingGateMeta?.description ?? livePhase.blockedContext}
          </p>
        )}

        {error && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-red-400/30 bg-red-400/5 text-red-300/80 text-[11px]">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Deny note input */}
        {denyMode && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Denial note (optional)</span>
            <textarea
              value={denyNote}
              onChange={e => setDenyNote(e.target.value)}
              placeholder="Reason for denial…"
              rows={2}
              className="w-full bg-background/40 border border-panel-border/40 rounded px-2 py-1.5 text-[11px] text-foreground/80 placeholder-muted-foreground/30 resize-none focus:outline-none focus:border-red-400/40"
            />
          </div>
        )}

        {/* Selective lane picker — uses authoritative laneIds from checkpoint meta */}
        {selectiveMode && laneIds.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Approve lanes (checked = proceed)</span>
            <div className="space-y-1">
              {laneIds.map(id => (
                <label key={id} className="flex items-center gap-2 cursor-pointer hover:bg-blue-400/5 px-1 py-0.5 rounded">
                  <input
                    type="checkbox"
                    checked={selectedLanes.has(id)}
                    onChange={() => toggleLane(id)}
                    className="accent-blue-500"
                  />
                  <span className="font-mono text-blue-200/70 text-[11px]">{id}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {selectiveMode && laneIds.length === 0 && (
          <div className="text-[11px] text-amber-400/60">No lane scope declared for this gate — use Approve all or Deny.</div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <button
            onClick={handleApproveAll}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-green-400/30 bg-green-400/8 text-green-300/80 text-[11px] font-medium hover:bg-green-400/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Approve all
          </button>
          <button
            onClick={handleDeny}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-400/30 bg-red-400/8 text-red-300/80 text-[11px] font-medium hover:bg-red-400/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading === 'deny' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            {denyMode ? 'Confirm denial' : 'Deny'}
          </button>
          <button
            onClick={handleApproveSelective}
            disabled={loading !== null || (selectiveMode && selectedLanes.size === 0)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-blue-400/30 bg-blue-400/8 text-blue-300/80 text-[11px] font-medium hover:bg-blue-400/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading === 'selective' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
            {selectiveMode ? `Approve ${selectedLanes.size} lane${selectedLanes.size !== 1 ? 's' : ''}` : 'Approve selective'}
          </button>
          {(denyMode || selectiveMode) && (
            <button
              onClick={() => { setDenyMode(false); setSelectiveMode(false); setError(null); }}
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 px-1"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── P4: SelectivelyBlockedLaneGrid ───────────────────────────────────────────

function SelectivelyBlockedLaneGrid({ livePhase }: { livePhase: LivePhaseState }) {
  return (
    <div className="mx-2 my-1.5 rounded border border-amber-400/25 bg-amber-400/5 text-xs overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-400/15 bg-amber-400/8">
        <Network className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
        <span className="text-amber-200/90 font-semibold text-[11px]">Selectively Blocked</span>
        <span className="ml-auto text-[10px] text-amber-400/50">Some lanes were blocked by operator</span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {livePhase.blockedContext ? (
          <p className="text-muted-foreground/60 text-[11px] leading-relaxed">{livePhase.blockedContext}</p>
        ) : null}
        <p className="text-amber-400/50 text-[11px]">Lane detail unavailable — see Inspect tab after task completes for full lane evidence.</p>
      </div>
    </div>
  );
}

// ─── Main TaskConsole ─────────────────────────────────────────────────────────

const EMPTY_LOGS: AgentLogEvent[] = [];
const EMPTY_ACTIONS: ActionRecord[] = [];

type ConsoleTab = 'transcript' | 'inspect';

export function TaskConsole({ resizable = false }: { resizable?: boolean }) {
  const sidebarOpen    = useIdeStore(s => s.sidebarOpen);
  const activeTaskId   = useIdeStore(s => s.activeTaskId);
  const viewingTaskId  = useIdeStore(s => s.viewingTaskId);
  const childTasks     = useIdeStore(s => s.childTasks);

  const [activeTab, setActiveTab] = useState<ConsoleTab>('transcript');

  // ── Transcript action filter state ──────────────────────────────────────────
  const [activeFilterTypes, setActiveFilterTypes] = useState<Set<ActionType>>(new Set());
  const [actionSearchQuery, setActionSearchQuery] = useState('');
  const [collapseOverride, setCollapseOverride] = useState<'collapse' | 'expand' | null>(null);

  const taskLogs       = useIdeStore(s => s.taskLogs);
  const taskActions    = useIdeStore(s => s.taskActions);
  const taskStartedAt  = useIdeStore(s => s.taskStartedAt);
  const taskPrompts    = useIdeStore(s => s.taskPrompts);
  const setViewingTask    = useIdeStore(s => s.setViewingTask);
  const hydrateTaskEvents = useIdeStore(s => s.hydrateTaskEvents);
  const taskLogsLoaded    = useIdeStore(s => s.taskLogsLoaded);
  const setTaskActions    = useIdeStore(s => s.setTaskActions);
  const mergeTaskActions  = useIdeStore(s => s.mergeTaskActions);
  const isConnected              = useIdeStore(s => s.isConnected);
  const pendingSubmitPrompt      = useIdeStore(s => s.pendingSubmitPrompt);
  const livePhase                = useIdeStore(s => s.livePhase);

  // Task list — authoritative source of task status for historical tasks.
  // Used to enable the Inspect tab even when the transcript is empty (persistence-only tasks).
  const { data: taskListData } = useListAgentTasks();
  const taskListItems = (taskListData?.tasks ?? []) as Array<{ id: string; status: string }>;

  const agentLogs: AgentLogEvent[] = (viewingTaskId ? taskLogs[viewingTaskId] : undefined) ?? EMPTY_LOGS;
  const currentActions: ActionRecord[] = (viewingTaskId ? taskActions[viewingTaskId] : undefined) ?? EMPTY_ACTIONS;
  const viewingPrompt: string | null = (viewingTaskId ? taskPrompts[viewingTaskId] : undefined) ?? null;
  const isLive    = activeTaskId !== null && activeTaskId === viewingTaskId;
  const isRunning = activeTaskId !== null;

  const feedEndRef    = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  // Track which historical task IDs have already been fetched, to avoid re-fetch loops
  const fetchedActionTaskIds = useRef<Set<string>>(new Set());

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    if (!userScrolled) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentLogs.length, userScrolled]);

  const handleScroll = useCallback(() => {
    const el = feedScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setUserScrolled(!atBottom);
  }, []);

  // Reset scroll state, tab, and filters when the visible task changes
  useEffect(() => {
    setUserScrolled(false);
    setActiveTab('transcript');
    setActiveFilterTypes(new Set());
    setActionSearchQuery('');
    setCollapseOverride(null);
  }, [viewingTaskId]);

  // ── Action seed fetch — active tasks ──────────────────────────────────────
  // On mount (or when a new task becomes active), seed the action list with a
  // single fetch so the ledger is populated immediately. After that, all updates
  // arrive via WebSocket `action_updated` messages. No polling.
  //
  // Uses mergeTaskActions (upsert-by-id) rather than setTaskActions (replace),
  // so any WS events that race ahead of the seed response are preserved rather
  // than overwritten. Sort by createdAt is applied inside mergeTaskActions.
  useEffect(() => {
    if (!activeTaskId) return;

    let cancelled = false;
    const seed = async () => {
      try {
        const res = await fetch(`/api/agent/runs/${activeTaskId}/actions`);
        if (!res.ok || cancelled) return;
        const body = await res.json() as { taskId: string; count: number; actions: ActionRecord[] };
        if (!cancelled) mergeTaskActions(activeTaskId, body.actions ?? []);
      } catch {
        // Seed failed — WS updates will still arrive; not fatal
      }
    };
    seed();
    return () => { cancelled = true; };
  }, [activeTaskId, mergeTaskActions]);

  // ── Action fetch — non-live historical task view ───────────────────────────
  // When the user switches to view a task that is NOT the currently running one
  // (e.g. clicking a previous task in history), fetch its actions once so the
  // transcript and summary card can show action detail for that task too.
  // Uses a ref to track fetched IDs so we don't re-trigger on every store update.
  useEffect(() => {
    if (!viewingTaskId) return;
    // Don't duplicate-fetch for the active task (handled by seed fetch + WS updates above)
    if (viewingTaskId === activeTaskId) return;
    // Skip if we've already issued a fetch for this task id this session
    if (fetchedActionTaskIds.current.has(viewingTaskId)) return;
    fetchedActionTaskIds.current.add(viewingTaskId);

    let cancelled = false;
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/agent/runs/${viewingTaskId}/actions`);
        if (!res.ok || cancelled) return;
        const body = await res.json() as { taskId: string; count: number; actions: ActionRecord[] };
        if (!cancelled) {
          setTaskActions(viewingTaskId, body.actions ?? []);
        }
      } catch {
        // No actions available for this task (e.g. server restart cleared in-memory store)
        if (!cancelled) setTaskActions(viewingTaskId, []);
      }
    };
    fetch_();
    return () => { cancelled = true; };
  }, [viewingTaskId, activeTaskId, setTaskActions]);

  // Derive completion/failure/checkpoint data
  const findLast = (arr: AgentLogEvent[], pred: (l: AgentLogEvent) => boolean) => {
    for (let i = arr.length - 1; i >= 0; i--) { if (pred(arr[i])) return arr[i]; }
    return undefined;
  };
  const doneLog       = useMemo(() => findLast(agentLogs, (l) => l.type === 'done') ?? null,            [agentLogs]);
  const lastErrorLog  = useMemo(() => findLast(agentLogs, (l) => l.type === 'error' && !!l.data?.category) ?? null, [agentLogs]);
  const checkpointLog = useMemo(() => findLast(agentLogs, (l) => l.type === 'checkpoint') ?? null,      [agentLogs]);
  const summaryLog    = useMemo(() => findLast(agentLogs, (l) => l.type === 'execution_summary') ?? null, [agentLogs]);
  const cancelledLog  = useMemo(() => findLast(agentLogs, (l) => l.type === 'cancelled') ?? null,        [agentLogs]);

  const completionData = doneLog?.data as CompletionData | null ?? null;
  const failureData: FailureData | null = (!doneLog && lastErrorLog?.data) ? lastErrorLog.data as FailureData : null;
  const checkpointData: CheckpointData | null = checkpointLog?.data ? checkpointLog.data as unknown as CheckpointData : null;
  const executionSummary: ExecutionSummaryData | null = summaryLog?.data ? summaryLog.data as unknown as ExecutionSummaryData : null;
  const cancelledDrain: CancelledDrainData | null = cancelledLog?.data ? cancelledLog.data as unknown as CancelledDrainData : null;

  const repairCount = useMemo(
    () => agentLogs.filter(l => l.type === 'thought' && parseThought(l.message).stage === 'REPAIRING').length,
    [agentLogs]
  );
  const stepCount = useMemo(
    () => agentLogs.filter(l => ['file_write', 'command', 'file_read'].includes(l.type)).length,
    [agentLogs]
  );

  // isComplete: true when we have any conclusive terminal evidence to render a summary card.
  // cancelledDrain (cancelled event) is also terminal — cancelled tasks may have no 'done' or 'error' events.
  // interrupted/stalled/cancelled task status (from task list) also triggers the summary card so
  // that tasks whose in-memory event logs are absent (e.g., after a server restart) still render
  // the RecoveryCard.
  // Note: viewingTaskStatus is declared below but used in taskStatus prop; for isComplete we peek at taskListItems here.
  const viewingTaskStatusEarly = viewingTaskId
    ? (taskListItems.find(t => t.id === viewingTaskId)?.status ?? null)
    : null;
  const isComplete = !!(
    completionData || failureData || cancelledDrain ||
    viewingTaskStatusEarly === 'interrupted' ||
    viewingTaskStatusEarly === 'stalled' ||
    viewingTaskStatusEarly === 'cancelled'
  );

  // Stage-aware action window map: logIndex → ActionGroup[] for interleaving into transcript
  const actionWindowMap = useMemo(
    () => assignActionsToWindows(agentLogs, currentActions),
    [agentLogs, currentActions]
  );

  // Filtered action window map — applies active type filters and search query
  const filteredActionWindowMap = useMemo(() => {
    const isFiltering = activeFilterTypes.size > 0 || actionSearchQuery.trim().length > 0;
    if (!isFiltering) return actionWindowMap;
    const result = new Map<number, ActionGroup[]>();
    for (const [logIdx, groups] of actionWindowMap) {
      const filtered = filterActionGroups(groups, activeFilterTypes, actionSearchQuery);
      if (filtered.length > 0) result.set(logIdx, filtered);
    }
    return result;
  }, [actionWindowMap, activeFilterTypes, actionSearchQuery]);

  // Whether any action groups were filtered away (for the no-match indicator)
  const totalActionGroupCount = useMemo(() => {
    let n = 0;
    for (const groups of actionWindowMap.values()) n += groups.length;
    return n;
  }, [actionWindowMap]);
  const filteredActionGroupCount = useMemo(() => {
    let n = 0;
    for (const groups of filteredActionWindowMap.values()) n += groups.length;
    return n;
  }, [filteredActionWindowMap]);
  const isFilterActive = activeFilterTypes.size > 0 || actionSearchQuery.trim().length > 0;
  const hasNoMatchingActions = isFilterActive && totalActionGroupCount > 0 && filteredActionGroupCount === 0;

  // ── Filter handlers ──────────────────────────────────────────────────────────
  const handleToggleFilterType = useCallback((type: ActionType) => {
    setActiveFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setActiveFilterTypes(new Set());
    setActionSearchQuery('');
  }, []);

  const handleCollapseAll = useCallback(() => {
    setCollapseOverride('collapse');
  }, []);

  const handleExpandAll = useCallback(() => {
    setCollapseOverride('expand');
  }, []);

  // Derive action tallies for the summary card
  const actionTallies = useMemo(
    () => currentActions.length > 0 ? computeActionTallies(currentActions) : null,
    [currentActions]
  );

  // Detect if this task was conversational (no real work done)
  // Uses: route log category, step count, and action count
  const routeLog = useMemo(
    () => agentLogs.find(l => l.type === 'route') ?? null,
    [agentLogs]
  );
  const routeCategory = routeLog?.data?.category as string | undefined;
  const isConversationalTask = useMemo(() => {
    // Explicit route category is the most reliable signal
    if (routeCategory === 'conversational' || routeCategory === 'conversational_call') return true;
    // Fallback: only classify as conversational when the task successfully completed (no failure/cancel)
    // and has no substantive work — prevents hiding RecoveryCard for early-failed non-trivial tasks
    if (!failureData && !cancelledDrain && completionData &&
        stepCount === 0 && (actionTallies === null || actionTallies.totalCount === 0)) return true;
    return false;
  }, [routeCategory, stepCount, actionTallies, failureData, cancelledDrain, completionData]);

  // Elapsed time — for the live active task, prefer taskStartedAt (set at submit time) for accuracy.
  // For historical tasks being inspected, always derive from log timestamps to avoid using stale
  // global taskStartedAt from an unrelated currently-running task.
  const elapsedMs = useMemo(() => {
    if (isLive && taskStartedAt) {
      const lastTs = agentLogs.length > 0
        ? new Date(agentLogs[agentLogs.length - 1].timestamp).getTime()
        : Date.now();
      return Math.max(0, lastTs - new Date(taskStartedAt).getTime());
    }
    if (agentLogs.length < 2) return null;
    const first = agentLogs[0];
    const last  = agentLogs[agentLogs.length - 1];
    return new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
  }, [agentLogs, taskStartedAt, isLive]);


  // ── Collapsed: hide entirely (AppRail provides the narrow collapsed treatment) ─
  if (!sidebarOpen) {
    return (
      <div className="task-console collapsed h-full" style={{ flexShrink: 0, overflow: 'hidden' }} />
    );
  }

  // ── Glow: resolve the active task status for the panel border glow ─────────
  const viewingBoardTask = viewingTaskId
    ? childTasks.find(t => t.agentTaskId === viewingTaskId) ?? null
    : null;
  const glowStatus = isLive ? 'running' : (viewingBoardTask?.status ?? null);

  const glowStyle: React.CSSProperties = (() => {
    if (glowStatus === 'running' || glowStatus === 'stalled' || glowStatus === 'blocked') {
      return { boxShadow: '0 0 0 1px rgba(59,130,246,0.25), 0 0 18px 3px rgba(59,130,246,0.12)' };
    }
    if (glowStatus === 'done' || glowStatus === 'partial' || glowStatus === 'error' || glowStatus === 'interrupted') {
      return { boxShadow: '0 0 0 1px rgba(34,197,94,0.2), 0 0 16px 3px rgba(34,197,94,0.08)' };
    }
    if (glowStatus === 'cancelled') {
      return { boxShadow: '0 0 0 1px rgba(239,68,68,0.2), 0 0 16px 3px rgba(239,68,68,0.07)' };
    }
    return {};
  })();

  // Inspect tab is enabled for any completed/errored/cancelled historical task.
  // Primary: use the authoritative task status from the persisted task list — transcripts
  // are empty for persistence-hydrated historical tasks after a server restart.
  // Fallback: if the task list query is stale/failed (status not found), allow Inspect
  // for any non-live task that has a viewingTaskId, so stale query state never fully
  // blocks evidence access.
  const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled', 'interrupted', 'stalled']);
  const viewingTaskStatus = viewingTaskId
    ? (taskListItems.find(t => t.id === viewingTaskId)?.status ?? null)
    : null;
  const canInspect = !isLive && !!viewingTaskId && (
    viewingTaskStatus === null                    // task list stale/failed — allow fallback
    || TERMINAL_STATUSES.has(viewingTaskStatus)   // authoritative terminal status
  );

  // ── Expanded ───────────────────────────────────────────────────────────────
  // When `resizable` is true the parent Panel (react-resizable-panels) controls
  // the outer width, so we must NOT apply the .task-console CSS class which sets
  // fixed pixel widths that would fight the panel system.
  const outerClass = resizable
    ? 'h-full flex flex-col bg-panel border-r border-panel-border overflow-hidden transition-shadow duration-500'
    : 'task-console h-full flex flex-col bg-panel border-r border-panel-border overflow-hidden transition-shadow duration-500';

  return (
    <div
      className={outerClass}
      style={resizable ? { ...glowStyle } : { flexShrink: 0, ...glowStyle }}
    >

      {/* Console header — gradient glow treatment */}
      <div className="vg-panel-header-glow">
        <span className="relative z-10 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Task Console</span>
        <div className="relative z-10 ml-auto flex items-center gap-2">
          {agentLogs.length > 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground/30">
              {agentLogs.length} events
            </span>
          )}
          {currentActions.length > 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground/25">
              · {currentActions.length} actions
            </span>
          )}
          {!isLive && viewingTaskId && !isRunning && agentLogs.length > 0 && (
            <span className="text-[10px] text-muted-foreground/35">history</span>
          )}
          {isLive && (
            <span className="flex items-center gap-1.5 text-[10px] text-primary/80">
              <TaskStatusCluster status="running" size="xs" />
              <span>Live</span>
            </span>
          )}
        </div>
      </div>

      {/* Tab bar — shown when a task is selected (logs, evidence, or at minimum a viewingTaskId) */}
      {!!viewingTaskId && (
        <div className="flex items-center border-b border-panel-border shrink-0 bg-background/20 px-1.5 gap-0.5">
          <button
            onClick={() => setActiveTab('transcript')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-sm transition-colors
              ${activeTab === 'transcript'
                ? 'text-foreground bg-panel-border/30'
                : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-panel-border/15'
              }`}
          >
            <AlignLeft className="w-3 h-3" />
            Transcript
          </button>
          <button
            onClick={() => canInspect && setActiveTab('inspect')}
            disabled={!canInspect}
            title={!canInspect ? 'Available for completed tasks' : 'Inspect structured evidence'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-sm transition-colors
              ${activeTab === 'inspect'
                ? 'text-foreground bg-panel-border/30'
                : canInspect
                  ? 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-panel-border/15'
                  : 'text-muted-foreground/25 cursor-not-allowed'
              }`}
          >
            <ScanSearch className="w-3 h-3" />
            Inspect
          </button>
        </div>
      )}

      {/* Degraded-state banner — shown when WebSocket is disconnected during a live task */}
      {isLive && !isConnected && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400/80 shrink-0">
          <WifiOff className="w-3 h-3 shrink-0" />
          <span>Connection lost — action updates paused. Reconnecting…</span>
        </div>
      )}

      {/* Live RunState phase bar — shown when a task is running and live phase data is available */}
      {isLive && (
        <div className="px-2 pt-1.5 pb-0 shrink-0">
          <LiveRunStateBar />
        </div>
      )}

      {/* P4: Approval gate card — shown when task is awaiting operator approval */}
      {isLive && livePhase?.phase === 'awaiting_approval' && viewingTaskId && (
        <div className="shrink-0">
          <ApprovalGateCard
            taskId={viewingTaskId}
            livePhase={livePhase}
            actions={currentActions}
          />
        </div>
      )}

      {/* P4: Selectively blocked lane indicator — shown when operator has partially approved */}
      {isLive && livePhase?.phase === 'selectively_blocked' && (
        <div className="shrink-0">
          <SelectivelyBlockedLaneGrid livePhase={livePhase} />
        </div>
      )}

      {/* Transcript filter bar — shown on transcript tab when actions are present */}
      {activeTab === 'transcript' && (
        <TranscriptFilterBar
          activeTypes={activeFilterTypes}
          searchQuery={actionSearchQuery}
          onToggleType={handleToggleFilterType}
          onSearchChange={setActionSearchQuery}
          onClearAll={handleClearAllFilters}
          onCollapseAll={handleCollapseAll}
          onExpandAll={handleExpandAll}
          hasActions={currentActions.length > 0}
        />
      )}

      {/* Inspect tab: EvidencePanel — occupies the same flex-1 slot as the transcript */}
      {activeTab === 'inspect' && viewingTaskId && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <EvidencePanel taskId={viewingTaskId} isLive={isLive} />
        </div>
      )}

      {/* Feed body — transcript tab (always transcript-first when activeTab = transcript) */}
      <div
        ref={feedScrollRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto min-h-0 vg-scroll bg-[#0a0a0c]${activeTab === 'inspect' ? ' hidden' : ''}`}
      >
        {agentLogs.length === 0 && !pendingSubmitPrompt && !viewingPrompt && !isLive ? (
          <EmptyState />
        ) : (
          /* ── Transcript feed: always visible, summary appended on completion ── */
          <div className="p-2.5 space-y-1 font-mono text-sm">

            {/* Task start header */}
            <div className="flex items-center gap-2 px-2 pb-1 mb-0.5 border-b border-panel-border/30">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-widest">Execution transcript</span>
              {agentLogs[0] && (
                <span className="ml-auto text-[10px] text-muted-foreground/25 tabular-nums">
                  {format(new Date(agentLogs[0].timestamp), 'HH:mm:ss')}
                </span>
              )}
            </div>

            {/* User prompt bubble — shown immediately on submit (pendingSubmitPrompt) or from store (viewingPrompt) */}
            {(pendingSubmitPrompt || viewingPrompt) && (
              <div className="flex items-start gap-2 px-2.5 py-2 rounded border border-primary/15 bg-primary/5">
                <div className="w-4 h-4 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[8px] font-bold text-primary/70">U</span>
                </div>
                <p className="text-xs text-gray-200/80 leading-relaxed flex-1 break-words">{pendingSubmitPrompt ?? viewingPrompt}</p>
              </div>
            )}

            {/* While awaiting first event: show in-progress indicator below the prompt bubble */}
            {agentLogs.length === 0 && (pendingSubmitPrompt !== null || isLive) && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground/60">
                <TaskStatusCluster status="running" size="xs" />
                <span>Task received — starting execution…</span>
              </div>
            )}

            {/* Stage-aware interleaved transcript: log segments with action groups injected
                at stage window boundaries. Each stage boundary (logIndex) accumulates
                actions that occurred while that stage was active, then renders them as
                compact collapsible group rows immediately after the stage block closes.
                filteredActionWindowMap applies any active type filters / search query. */}
            {(() => {
              const segments = segmentLogs(agentLogs);
              const rendered: React.ReactNode[] = [];
              // Track which window logIndices have already been emitted to avoid duplicates
              const emittedWindows = new Set<number>();

              // Walk segments, tracking the original log cursor position so we can
              // look up which stage window each position falls in.
              let logCursor = 0;

              for (let si = 0; si < segments.length; si++) {
                const seg = segments[si];

                if (seg.kind === 'file_read_group') {
                  rendered.push(<FileReadGroup key={`grp-${si}`} logs={seg.logs} />);
                  logCursor += seg.logs.length;
                } else {
                  rendered.push(<AgentLogItem key={seg.log.id} log={seg.log} />);
                  logCursor++;
                }

                // Inject action groups when transitioning between stages or at end:
                // — after the current block, if the next segment starts a new stage
                // — at end of all segments
                const nextSeg = segments[si + 1];
                const nextIsStage =
                  nextSeg?.kind === 'single' &&
                  nextSeg.log.type === 'thought' &&
                  /^\[(PLANNING|INSPECTING|EDITING|VERIFYING|REPAIRING|WRAPPING UP)\]/i.test(nextSeg.log.message);

                if (nextIsStage || si === segments.length - 1) {
                  // Scan backward from current cursor to find the stage boundary log index
                  let stageLogIdx = -1;
                  for (let li = logCursor - 1; li >= 0; li--) {
                    const l = agentLogs[li];
                    if (l && l.type === 'thought' &&
                        /^\[(PLANNING|INSPECTING|EDITING|VERIFYING|REPAIRING|WRAPPING UP)\]/i.test(l.message)) {
                      stageLogIdx = li;
                      break;
                    }
                  }
                  if (stageLogIdx >= 0 && !emittedWindows.has(stageLogIdx)) {
                    const windowGroups = filteredActionWindowMap.get(stageLogIdx);
                    if (windowGroups && windowGroups.length > 0) {
                      emittedWindows.add(stageLogIdx);
                      rendered.push(
                        <div key={`aw-${stageLogIdx}`} className="ml-2 mt-0.5 mb-1 pl-2 border-l border-panel-border/30 space-y-0.5">
                          {windowGroups.map((group, gi) => (
                            <ActionGroupRow key={`ag-${stageLogIdx}-${gi}`} group={group} collapseOverride={collapseOverride} />
                          ))}
                        </div>
                      );
                    }
                  }
                }
              }

              // Render ungrouped actions (pre-stage actions that don't belong to any window)
              const ungrouped = filteredActionWindowMap.get(-1);
              if (ungrouped && ungrouped.length > 0) {
                rendered.push(
                  <div key="aw-ungrouped" className="mt-1 pt-1 border-t border-panel-border/20 space-y-0.5">
                    <div className="px-2 pb-0.5">
                      <span className="text-[9px] font-semibold text-muted-foreground/30 uppercase tracking-widest">Actions</span>
                    </div>
                    {ungrouped.map((group, gi) => (
                      <ActionGroupRow key={`ag-ung-${gi}`} group={group} collapseOverride={collapseOverride} />
                    ))}
                  </div>
                );
              }

              // No-match state: filters active but all action groups hidden
              if (hasNoMatchingActions) {
                rendered.push(
                  <div key="no-match-actions" className="flex items-center gap-2 px-3 py-2 rounded border border-panel-border/40 bg-background/20 text-xs text-muted-foreground/50 italic mt-1">
                    <Search className="w-3 h-3 shrink-0" />
                    <span>No matching actions — try a different filter or search term.</span>
                  </div>
                );
              }

              return rendered;
            })()}

            {/* Live thinking indicator — shown while agent is actively processing */}
            {isLive && !isComplete && (
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="flex gap-0.5 items-center">
                  <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[10px] text-muted-foreground/35">processing</span>
              </div>
            )}

            {/* Completion summary appended at end of transcript */}
            {isComplete && (
              <div className="mt-3 pt-3 border-t border-panel-border/50 space-y-2">
                <TaskSummaryCard
                  completion={completionData}
                  failure={failureData}
                  checkpoint={checkpointData}
                  executionSummary={executionSummary}
                  elapsedMs={elapsedMs}
                  stepCount={stepCount}
                  repairCount={repairCount}
                  actionTallies={actionTallies}
                  taskId={viewingTaskId ?? undefined}
                  cancelledDrain={cancelledDrain}
                  taskStatus={viewingTaskStatusEarly ?? undefined}
                  isConversational={isConversationalTask}
                  onNavigateTask={(tid) => setViewingTask(tid)}
                />
                {executionSummary && (
                  <ExecutionSummaryMini data={executionSummary} />
                )}
              </div>
            )}

            {/* Auto-scroll anchor */}
            <div ref={feedEndRef} />
          </div>
        )}
      </div>

    </div>
  );
}
