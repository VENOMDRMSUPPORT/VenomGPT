import { useState, useCallback, useRef, useEffect } from 'react';
import { useIdeStore, type ChildTask } from '@/store/use-ide-store';
import {
  Loader2, CheckCircle2, Archive, AlertCircle,
  Sparkles, X, ListChecks,
  Inbox, Play, Search, Plus, Send,
  ChevronRight, ChevronDown, FileText,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import type { BoardTaskStatus } from '@/store/use-ide-store';

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

// Plan artifact shape from GET /api/board/plans
interface PlanArtifact {
  index: number;
  agentTaskId: string;
  boardTaskId?: string;
  savedAt: string;
  plan: { goal: string; approach: string };
}

// Contextual status transitions per current status (not drag-and-drop)
const STATUS_TRANSITIONS: Partial<Record<BoardTaskStatus, { label: string; target: BoardTaskStatus }[]>> = {
  error:       [{ label: 'Retry',    target: 'pending'  }, { label: 'Archive', target: 'archived'  }],
  interrupted: [{ label: 'Retry',    target: 'pending'  }, { label: 'Archive', target: 'archived'  }],
  partial:     [{ label: 'Retry',    target: 'pending'  }, { label: 'Archive', target: 'archived'  }],
  stalled:     [{ label: 'Archive',  target: 'archived' }],
  blocked:     [{ label: 'Archive',  target: 'archived' }],
  done:        [{ label: 'Archive',  target: 'archived' }],
  archived:    [{ label: 'Restore',  target: 'pending'  }],
  cancelled:   [{ label: 'Restore',  target: 'pending'  }],
  draft:       [{ label: 'Cancel',   target: 'cancelled'}],
  pending:     [{ label: 'Cancel',   target: 'cancelled'}],
};

// ─── Status column config ─────────────────────────────────────────────────────

interface ColumnConfig {
  id: string;
  label: string;
  statuses: Set<BoardTaskStatus>;
  color: string;
  bg: string;
  border: string;
  Icon: React.FC<{ className?: string }>;
  dimmed?: boolean;
}

const COLUMNS: ColumnConfig[] = [
  {
    id:       'drafts',
    label:    'Drafts',
    statuses: new Set(['draft', 'pending'] as BoardTaskStatus[]),
    color:    'text-muted-foreground/60',
    bg:       'bg-muted-foreground/3',
    border:   'border-panel-border/40',
    Icon:     Inbox,
  },
  {
    id:       'in-progress',
    label:    'In Progress',
    statuses: new Set(['running', 'stalled', 'blocked'] as BoardTaskStatus[]),
    color:    'text-blue-400',
    bg:       'bg-blue-400/5',
    border:   'border-blue-400/20',
    Icon:     Play,
  },
  {
    id:       'needs-review',
    label:    'Needs Review',
    statuses: new Set(['error', 'interrupted', 'partial'] as BoardTaskStatus[]),
    color:    'text-amber-400',
    bg:       'bg-amber-400/5',
    border:   'border-amber-400/20',
    Icon:     AlertCircle,
  },
  {
    id:       'done',
    label:    'Done',
    statuses: new Set(['done'] as BoardTaskStatus[]),
    color:    'text-green-400',
    bg:       'bg-green-400/5',
    border:   'border-green-400/20',
    Icon:     CheckCircle2,
  },
  {
    id:       'archived',
    label:    'Archived',
    statuses: new Set(['archived'] as BoardTaskStatus[]),
    color:    'text-muted-foreground/30',
    bg:       'bg-muted-foreground/2',
    border:   'border-panel-border/20',
    Icon:     Archive,
    dimmed:   true,
  },
  {
    id:       'cancelled',
    label:    'Cancelled',
    statuses: new Set(['cancelled'] as BoardTaskStatus[]),
    color:    'text-red-400/60',
    bg:       'bg-red-400/3',
    border:   'border-red-400/15',
    Icon:     AlertCircle,
    dimmed:   true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatIndex(index: number): string {
  return `#${String(index).padStart(3, '0')}`;
}

function taskMatchesSearch(task: ChildTask, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    task.name?.toLowerCase().includes(lower) ||
    task.prompt?.toLowerCase().includes(lower)
  );
}

// ─── Status dot map ───────────────────────────────────────────────────────────

const CARD_STATUS_DOT: Record<BoardTaskStatus, string> = {
  draft:       'bg-amber-500/60',
  pending:     'bg-muted-foreground/40',
  running:     'bg-blue-400 animate-pulse',
  done:        'bg-emerald-500',
  archived:    'bg-muted-foreground/30',
  error:       'bg-red-400',
  cancelled:   'bg-red-500',
  interrupted: 'bg-amber-400',
  stalled:     'bg-amber-400',
  blocked:     'bg-amber-400',
  partial:     'bg-amber-400',
};

const CARD_STATUS_LABEL: Record<BoardTaskStatus, string> = {
  draft:       'Draft',
  pending:     'Pending',
  running:     'Running',
  done:        'Done',
  archived:    'Archived',
  error:       'Error',
  cancelled:   'Cancelled',
  interrupted: 'Interrupted',
  stalled:     'Stalled',
  blocked:     'Blocked',
  partial:     'Partial',
};

// ─── Task card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: ChildTask;
  isSelected: boolean;
  planGoal: string | null;
  onSelect: (task: ChildTask) => void;
  onDelete: (taskId: string, e: React.MouseEvent) => void;
  onStatusChange: (taskId: string, status: BoardTaskStatus, e: React.MouseEvent) => void;
  changingStatus: string | null;
  deletingId: string | null;
  dimmed?: boolean;
}

function TaskCard({ task, isSelected, planGoal, onSelect, onDelete, onStatusChange, changingStatus, deletingId, dimmed }: TaskCardProps) {
  const dotColor = CARD_STATUS_DOT[task.status] ?? 'bg-muted-foreground/30';
  const statusLabel = CARD_STATUS_LABEL[task.status] ?? task.status;
  const isActive = task.status === 'running' || task.status === 'stalled' || task.status === 'blocked';
  const transitions = STATUS_TRANSITIONS[task.status] ?? [];
  const isChanging = changingStatus === task.id;

  return (
    <div
      onClick={() => onSelect(task)}
      className={`group rounded-lg border p-2.5 cursor-pointer transition-all select-none text-left w-full relative overflow-hidden
        ${dimmed ? 'opacity-50 hover:opacity-80' : ''}
        ${isSelected
          ? 'bg-primary/8 border-primary/25 ring-1 ring-primary/15'
          : 'bg-background/60 border-panel-border hover:bg-[#0f0f13] hover:border-panel-border/60'
        }`}
    >
      {/* Purple left-border accent for active/in-progress cards */}
      {isActive && !isSelected && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg bg-violet-500/70" />
      )}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} title={statusLabel} />
          <span className="text-[9px] font-mono font-semibold text-muted-foreground/40 shrink-0 uppercase tracking-widest">
            {formatIndex(task.index)}
          </span>
        </div>
        <button
          onClick={(e) => onDelete(task.id, e)}
          disabled={deletingId === task.id}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground/30 hover:text-destructive rounded shrink-0"
          title="Remove from board"
        >
          {deletingId === task.id
            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
            : <X className="w-2.5 h-2.5" />
          }
        </button>
      </div>
      <p className="text-[11px] text-foreground/80 leading-snug line-clamp-3 mb-1.5" title={task.prompt}>
        {task.name || task.prompt}
      </p>

      {/* Plan association badge */}
      {planGoal && (
        <div className="flex items-center gap-1 mb-1.5 text-[10px] text-primary/50 truncate" title={planGoal}>
          <FileText className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{planGoal}</span>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground/30 leading-none mb-1.5">
        {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
      </p>

      {/* Status-change action buttons (shown when not running) */}
      {transitions.length > 0 && (
        <div
          className="flex flex-wrap gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          {transitions.map(({ label, target }) => (
            <button
              key={target}
              onClick={(e) => onStatusChange(task.id, target, e)}
              disabled={isChanging}
              className="text-[9px] px-1.5 py-0.5 rounded border border-panel-border/50 text-muted-foreground/50 hover:text-foreground/80 hover:border-panel-border/80 hover:bg-background/60 disabled:opacity-40 transition-all"
            >
              {isChanging ? <Loader2 className="w-2 h-2 animate-spin inline" /> : label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  col: ColumnConfig;
  tasks: ChildTask[];
  activeBoardTaskId: string | null;
  plansByBoardTaskId: Map<string, string>;
  onSelect: (task: ChildTask) => void;
  onDelete: (taskId: string, e: React.MouseEvent) => void;
  onStatusChange: (taskId: string, status: BoardTaskStatus, e: React.MouseEvent) => void;
  changingStatus: string | null;
  deletingId: string | null;
}

function KanbanColumn({ col, tasks, activeBoardTaskId, plansByBoardTaskId, onSelect, onDelete, onStatusChange, changingStatus, deletingId }: KanbanColumnProps) {
  const [collapsed, setCollapsed] = useState(col.dimmed);

  return (
    <div
      className={`flex flex-col rounded-xl border overflow-hidden shrink-0 ${col.bg} ${col.border}`}
      style={{ width: 220, minWidth: 220 }}
    >
      {/* Column header */}
      <div
        className={`flex items-center gap-1.5 px-3 py-2.5 border-b ${col.border} ${col.dimmed ? 'cursor-pointer select-none' : ''}`}
        onClick={() => col.dimmed && setCollapsed(c => !c)}
      >
        <col.Icon className={`w-3.5 h-3.5 shrink-0 ${col.color}`} />
        <span className={`text-[10px] font-bold uppercase tracking-widest flex-1 ${col.color}`}>
          {col.label}
        </span>
        <span className={`text-[9px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full ${col.color} bg-white/5 border border-white/5`}>
          {tasks.length}
        </span>
        {col.dimmed && (
          collapsed
            ? <ChevronRight className={`w-3 h-3 ${col.color} opacity-40`} />
            : <ChevronDown className={`w-3 h-3 ${col.color} opacity-40`} />
        )}
      </div>

      {/* Column tasks */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto vg-scroll p-2 space-y-1.5 min-h-[120px]">
          {tasks.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/20 text-center py-4 italic">
              No tasks
            </p>
          ) : (
            tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                isSelected={activeBoardTaskId === task.id}
                planGoal={plansByBoardTaskId.get(task.id) ?? null}
                onSelect={onSelect}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
                changingStatus={changingStatus}
                deletingId={deletingId}
                dimmed={col.dimmed}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bottom composer ──────────────────────────────────────────────────────────

function BoardComposer() {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const setMainView = useIdeStore(s => s.setMainView);
  const setPendingNewTaskPrompt = useIdeStore(s => s.setPendingNewTaskPrompt);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim()) return;
    setPendingNewTaskPrompt(prompt.trim());
    setMainView('editor');
    setPrompt('');
  }, [prompt, setMainView, setPendingNewTaskPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-panel-border shrink-0 bg-panel/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Plan a new task…"
          className="flex-1 bg-background/60 border border-panel-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40 focus:bg-background transition-colors"
        />
        <button
          onClick={handleSubmit}
          disabled={!prompt.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-background text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
          title="Open task console (Enter)"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TaskBoard() {
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [plansByBoardTaskId, setPlansByBoardTaskId] = useState<Map<string, string>>(new Map());

  const activeBoardTaskId      = useIdeStore(s => s.activeBoardTaskId);
  const setActiveBoardTaskId   = useIdeStore(s => s.setActiveBoardTaskId);
  const setMainView            = useIdeStore(s => s.setMainView);
  const setViewingTask         = useIdeStore(s => s.setViewingTask);
  const hydrateTaskEvents      = useIdeStore(s => s.hydrateTaskEvents);
  const taskLogsLoaded         = useIdeStore(s => s.taskLogsLoaded);
  const childTasks             = useIdeStore(s => s.childTasks);
  const boardLoading           = useIdeStore(s => s.boardLoading);
  const deleteBoardTask        = useIdeStore(s => s.deleteBoardTask);
  const updateBoardTaskStatus  = useIdeStore(s => s.updateBoardTaskStatus);

  // Fetch plan associations on mount (GET /api/board/plans)
  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch(`${API_BASE}/api/board/plans`);
        if (!res.ok) return;
        const body = await res.json() as { plans: PlanArtifact[] };
        const map = new Map<string, string>();
        for (const p of body.plans) {
          if (p.boardTaskId && p.plan.goal && !map.has(p.boardTaskId)) {
            map.set(p.boardTaskId, p.plan.goal);
          }
        }
        setPlansByBoardTaskId(map);
      } catch { }
    }
    void fetchPlans();
  }, []);

  // ── Task selection — navigate back to editor and open task in Task Console ─

  const handleSelect = useCallback(async (task: ChildTask) => {
    setActiveBoardTaskId(task.id);
    if (task.agentTaskId) {
      setViewingTask(task.agentTaskId);

      const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
      if (!taskLogsLoaded.has(task.agentTaskId) && task.status !== 'running') {
        try {
          const res = await fetch(`${API_BASE}/api/agent/tasks/${task.agentTaskId}/events`);
          if (res.ok) {
            const body = await res.json() as { events: { type: string; message: string; timestamp: string; data?: Record<string, unknown> }[] };
            hydrateTaskEvents(task.agentTaskId, body.events ?? []);
          }
        } catch { }
      }
    }
    // Return to editor view so the Task Console is visible with the selected task
    setMainView('editor');
  }, [setActiveBoardTaskId, setViewingTask, taskLogsLoaded, hydrateTaskEvents, setMainView]);

  // ── Task delete ────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(taskId);
    try {
      await deleteBoardTask(taskId);
      if (activeBoardTaskId === taskId) setActiveBoardTaskId(null);
    } catch { } finally {
      setDeletingId(null);
    }
  }, [activeBoardTaskId, setActiveBoardTaskId, deleteBoardTask]);

  const handleStatusChange = useCallback(async (taskId: string, status: BoardTaskStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    setChangingStatus(taskId);
    try {
      await updateBoardTaskStatus(taskId, status);
    } catch { } finally {
      setChangingStatus(null);
    }
  }, [updateBoardTaskStatus]);

  // ── Filtered tasks ─────────────────────────────────────────────────────────

  const filteredTasks = searchQuery
    ? childTasks.filter(t => taskMatchesSearch(t, searchQuery))
    : childTasks;

  return (
    <div className="ide-editor-area bg-background flex flex-col overflow-hidden">
      {/* ── Board header ─────────────────────────────────────────────────── */}
      <div className="vg-panel-header gap-3 px-4 bg-panel/50">
        <ListChecks className="w-4 h-4 text-primary/60 shrink-0" />
        <span className="text-sm font-semibold text-foreground flex-1">Task Board</span>

        {/* Search input */}
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/35 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tasks…"
            className="pl-7 pr-3 py-1 w-48 rounded-md border border-panel-border/50 bg-background/60 text-xs text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-primary/40 focus:bg-background transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => setMainView('editor')}
          className="flex items-center gap-1 px-2.5 py-1 rounded border border-dashed border-primary/25 text-[11px] text-muted-foreground/50 hover:text-primary hover:border-primary/50 transition-colors"
          title="New task"
        >
          <Plus className="w-3 h-3" />
          New task
        </button>

        <button
          onClick={() => setMainView('editor')}
          className="p-1.5 text-muted-foreground/40 hover:text-foreground/70 rounded transition-colors"
          title="Close board"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Board body (horizontal kanban) ────────────────────────────────── */}
      {boardLoading && childTasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
        </div>
      ) : filteredTasks.length === 0 && searchQuery ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <Search className="w-7 h-7 text-muted-foreground/15 mb-3" />
          <p className="text-xs text-muted-foreground/35 leading-snug">
            No tasks match "<span className="text-foreground/60">{searchQuery}</span>".
          </p>
        </div>
      ) : childTasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <Sparkles className="w-7 h-7 text-muted-foreground/15 mb-3" />
          <p className="text-xs text-muted-foreground/35 leading-snug">
            Tasks will appear here across all stages.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden min-w-0">
          <div className="flex gap-3 p-4 h-full items-start min-w-max">
            {COLUMNS.map(col => {
              const colTasks = filteredTasks
                .filter(t => col.statuses.has(t.status))
                .sort((a, b) => b.index - a.index);

              return (
                <KanbanColumn
                  key={col.id}
                  col={col}
                  tasks={colTasks}
                  activeBoardTaskId={activeBoardTaskId}
                  plansByBoardTaskId={plansByBoardTaskId}
                  onSelect={handleSelect}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  changingStatus={changingStatus}
                  deletingId={deletingId}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bottom composer ───────────────────────────────────────────────── */}
      <BoardComposer />
    </div>
  );
}
