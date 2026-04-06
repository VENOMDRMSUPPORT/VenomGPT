import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  useIdeStore,
  type ChildTask,
  type BoardTaskStatus,
} from '@/store/use-ide-store';
import {
  ListChecks, Loader2,
  Sparkles, X,
  RefreshCw, Crown,
  Plus, LayoutGrid, Search,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TASK_RAIL_WIDTH = 240;

// Sidebar shows only tasks that need attention: running/stalled/blocked and
// error/interrupted/partial. Draft, pending, done, archived, cancelled are
// hidden here — they remain visible in the full task board.
const HIDDEN_IN_LIST = new Set<BoardTaskStatus>(['done', 'archived', 'draft', 'pending', 'cancelled']);

// Status filter chips available in the search bar.
// These surface the "history" statuses that are normally hidden from the rail.
const FILTER_CHIPS: { status: BoardTaskStatus; label: string; color: string }[] = [
  { status: 'done',        label: 'Done',        color: 'text-green-400 border-green-400/30 bg-green-400/8' },
  { status: 'error',       label: 'Error',       color: 'text-red-400 border-red-400/30 bg-red-400/8' },
  { status: 'cancelled',   label: 'Cancelled',   color: 'text-red-300 border-red-300/25 bg-red-300/6' },
  { status: 'interrupted', label: 'Interrupted', color: 'text-amber-400 border-amber-400/30 bg-amber-400/8' },
];

function formatIndex(index: number): string {
  return `#${String(index).padStart(3, '0')}`;
}

// ─── Status visual config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BoardTaskStatus, { dot: string; label: string }> = {
  draft:       { dot: 'bg-muted-foreground/40',    label: 'Draft'       },
  pending:     { dot: 'bg-muted-foreground/40',    label: 'Pending'     },
  running:     { dot: 'bg-blue-400 animate-pulse', label: 'Running'     },
  done:        { dot: 'bg-green-500',              label: 'Done'        },
  archived:    { dot: 'bg-muted-foreground/30',    label: 'Archived'    },
  error:       { dot: 'bg-red-400',               label: 'Error'       },
  cancelled:   { dot: 'bg-red-500',               label: 'Cancelled'   },
  interrupted: { dot: 'bg-amber-400',             label: 'Interrupted' },
  stalled:     { dot: 'bg-amber-400',             label: 'Stalled'     },
  blocked:     { dot: 'bg-amber-400',             label: 'Blocked'     },
  partial:     { dot: 'bg-amber-400',             label: 'Partial'     },
};

function StatusDot({ status }: { status: BoardTaskStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['pending'];
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} title={cfg.label} />;
}

// ─── Task row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: ChildTask;
  isActive: boolean;
  onSelect: (task: ChildTask) => void;
  onDelete: (taskId: string, e: React.MouseEvent) => void;
  deletingId: string | null;
}

function TaskRow({ task, isActive, onSelect, onDelete, deletingId }: TaskRowProps) {
  const isRunning = task.status === 'running';
  return (
    <div
      onClick={() => onSelect(task)}
      className={`group relative flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors select-none
        ${isActive
          ? 'bg-primary/10 border border-primary/25'
          : 'border border-transparent hover:bg-background hover:border-panel-border/40'
        }`}
    >
      <div className="mt-0.5 shrink-0">
        <StatusDot status={task.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-mono font-semibold leading-none mb-0.5 ${isRunning ? 'text-primary' : 'text-muted-foreground/45'}`}>
          {formatIndex(task.index)}
        </p>
        <p className="text-[11px] text-foreground/80 leading-snug truncate" title={task.prompt}>
          {task.name || task.prompt}
        </p>
      </div>
      {!isRunning && (
        <button
          onClick={(e) => onDelete(task.id, e)}
          disabled={deletingId === task.id}
          className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground/30 hover:text-destructive rounded"
          title="Remove from board"
        >
          {deletingId === task.id
            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
            : <X className="w-2.5 h-2.5" />
          }
        </button>
      )}
    </div>
  );
}

// ─── Search + filter bar ──────────────────────────────────────────────────────

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  activeChips: Set<BoardTaskStatus>;
  onToggleChip: (s: BoardTaskStatus) => void;
}

function FilterBar({ search, onSearch, activeChips, onToggleChip }: FilterBarProps) {
  return (
    <div className="px-2 pt-1.5 pb-1 space-y-1 border-b border-panel-border/30">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/30 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Filter tasks…"
          className="w-full bg-background/40 border border-panel-border/40 rounded px-2 py-1 pl-6 text-[11px] text-foreground/80 placeholder-muted-foreground/30 focus:outline-none focus:border-primary/30 transition-colors"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground/60 rounded"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
      {/* Status chips */}
      <div className="flex flex-wrap gap-1">
        {FILTER_CHIPS.map(({ status, label, color }) => {
          const active = activeChips.has(status);
          return (
            <button
              key={status}
              onClick={() => onToggleChip(status)}
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border transition-all ${
                active ? color : 'text-muted-foreground/35 border-panel-border/30 bg-transparent hover:border-panel-border/60'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TaskListPanel() {
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [activeChips, setActiveChips]   = useState<Set<BoardTaskStatus>>(new Set());

  const activeTaskId         = useIdeStore(s => s.activeTaskId);
  const viewingTaskId        = useIdeStore(s => s.viewingTaskId);
  const activeBoardTaskId    = useIdeStore(s => s.activeBoardTaskId);
  const masterSession        = useIdeStore(s => s.masterSession);
  const childTasks           = useIdeStore(s => s.childTasks);
  const boardLoading         = useIdeStore(s => s.boardLoading);
  const fetchBoard           = useIdeStore(s => s.fetchBoard);
  const deleteBoardTask      = useIdeStore(s => s.deleteBoardTask);
  const setActiveBoardTaskId = useIdeStore(s => s.setActiveBoardTaskId);
  const setViewingTask       = useIdeStore(s => s.setViewingTask);
  const hydrateTaskEvents    = useIdeStore(s => s.hydrateTaskEvents);
  const taskLogsLoaded       = useIdeStore(s => s.taskLogsLoaded);
  const setMainView          = useIdeStore(s => s.setMainView);
  const mainView             = useIdeStore(s => s.mainView);
  const sidebarOpen          = useIdeStore(s => s.sidebarOpen);

  const isFiltering = search.trim().length > 0 || activeChips.size > 0;

  // Poll every 5 s to keep tasks fresh.
  useEffect(() => {
    const id = setInterval(() => { void fetchBoard(); }, 5000);
    return () => clearInterval(id);
  }, [fetchBoard]);

  // ── Filter logic ────────────────────────────────────────────────────────────
  // When no filter is active: show only active tasks (same as before).
  // When any filter is active: show all tasks that match the search AND status.

  const filteredTasks = useMemo((): ChildTask[] => {
    if (!isFiltering) return childTasks.filter(t => !HIDDEN_IN_LIST.has(t.status));

    const q = search.trim().toLowerCase();
    return childTasks.filter(t => {
      const matchesStatus = activeChips.size === 0 || activeChips.has(t.status);
      const matchesSearch = q.length === 0 || (t.prompt ?? '').toLowerCase().includes(q) || (t.name ?? '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [childTasks, search, activeChips, isFiltering]);

  const totalVisible = isFiltering ? childTasks.length : childTasks.filter(t => !HIDDEN_IN_LIST.has(t.status)).length;

  // ── Chip toggle ─────────────────────────────────────────────────────────────
  const toggleChip = useCallback((status: BoardTaskStatus) => {
    setActiveChips(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  // ── Task selection ─────────────────────────────────────────────────────────

  const handleSelect = useCallback(async (task: ChildTask) => {
    setActiveBoardTaskId(task.id);
    setMainView('editor');
    if (!task.agentTaskId) return;
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
  }, [setActiveBoardTaskId, setViewingTask, setMainView, taskLogsLoaded, hydrateTaskEvents]);

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

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!boardLoading && !masterSession) {
    return (
      <div
        className={`task-rail-panel h-full flex flex-col bg-panel border-r border-panel-border overflow-hidden shrink-0 ${!sidebarOpen ? 'rail-sidebar-collapsed' : ''}`}
        style={{ width: TASK_RAIL_WIDTH, minWidth: TASK_RAIL_WIDTH, maxWidth: TASK_RAIL_WIDTH }}
      >
        <div className="vg-panel-header">
          <ListChecks className="w-3.5 h-3.5 text-primary/60 shrink-0" />
          <span className="text-xs font-semibold text-foreground">Tasks</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <ListChecks className="w-6 h-6 text-muted-foreground/20 mb-2" />
          <p className="text-[11px] text-muted-foreground/40 leading-snug">
            Set a workspace to activate the task board.
          </p>
        </div>
      </div>
    );
  }

  // Derive workspace display name
  const workspaceName = masterSession?.name
    || (masterSession?.workspaceRoot
        ? (masterSession.workspaceRoot.split('/').filter(Boolean).pop() || 'Workspace')
        : 'Workspace');

  const hiddenCount = childTasks.filter(t => HIDDEN_IN_LIST.has(t.status)).length;

  return (
    <div
      className={`task-rail-panel h-full flex flex-col bg-panel border-r border-panel-border overflow-hidden shrink-0 ${!sidebarOpen ? 'rail-sidebar-collapsed' : ''}`}
      style={{ width: TASK_RAIL_WIDTH, minWidth: TASK_RAIL_WIDTH, maxWidth: TASK_RAIL_WIDTH }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="vg-panel-header">
        <ListChecks className="w-3.5 h-3.5 text-primary/60 shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1">Tasks</span>
        <button
          onClick={() => void fetchBoard()}
          className="p-0.5 text-muted-foreground/30 hover:text-foreground/60 rounded transition-colors"
          title="Refresh board"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* ── Search + filter bar ───────────────────────────────────────────── */}
      {masterSession && (
        <FilterBar
          search={search}
          onSearch={setSearch}
          activeChips={activeChips}
          onToggleChip={toggleChip}
        />
      )}

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto vg-scroll min-h-0">

        {boardLoading && !masterSession ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
          </div>
        ) : (
          <>
            {/* ── Workspace session card — pinned at top ─────────────────── */}
            {masterSession && (
              <div className="mx-2 mt-2 mb-0 px-2 py-1.5 rounded border border-primary/15 bg-primary/5 flex items-center gap-2">
                <Crown className="w-3 h-3 shrink-0 text-primary/50" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-wide leading-none mb-0.5">Workspace</p>
                  <p className="text-[11px] text-foreground/70 font-mono truncate" title={masterSession.workspaceRoot}>
                    {workspaceName}
                  </p>
                </div>
              </div>
            )}

            {/* ── + New task button — directly below workspace card ─────── */}
            {!isFiltering && (
              <button
                onClick={() => setMainView('editor')}
                className="mx-2 mt-1.5 mb-1 w-[calc(100%-1rem)] flex items-center gap-1.5 px-2 py-1.5 rounded border text-[11px] font-medium transition-colors border-dashed border-primary/20 text-muted-foreground/50 hover:text-foreground/80 hover:border-primary/35 hover:bg-primary/5"
                title="Create a new task"
              >
                <Plus className="w-3 h-3 shrink-0" />
                + New task
              </button>
            )}

            {/* Task list */}
            <div className="px-2 pt-1">
              <div className="flex items-center gap-1 px-1 mb-1">
                <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-widest flex-1">
                  {isFiltering ? 'Filtered results' : 'Active & Needs Review'}
                </span>
                {/* Match count — shown when any filter is active */}
                {isFiltering ? (
                  <span className="text-[9px] text-muted-foreground/40 tabular-nums">
                    {filteredTasks.length} of {totalVisible}
                  </span>
                ) : (
                  <span className="text-[9px] text-muted-foreground/30 tabular-nums">
                    {filteredTasks.length}
                  </span>
                )}
              </div>

              {filteredTasks.length === 0 ? (
                <div className="text-center py-4 px-2">
                  {isFiltering ? (
                    <>
                      <Search className="w-4 h-4 mx-auto mb-1.5 text-muted-foreground/20" />
                      <p className="text-[10px] text-muted-foreground/35 leading-snug">No tasks match your filter.</p>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mx-auto mb-1.5 text-muted-foreground/20" />
                      <p className="text-[10px] text-muted-foreground/35 leading-snug">
                        No active tasks.
                        {hiddenCount > 0 && (
                          <> <button
                            onClick={() => setMainView('board')}
                            className="text-primary/50 hover:text-primary/80 underline transition-colors"
                          >
                            View {hiddenCount} completed
                          </button></>
                        )}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isActive={
                        task.id === activeBoardTaskId ||
                        (!!task.agentTaskId && (task.agentTaskId === activeTaskId || task.agentTaskId === viewingTaskId))
                      }
                      onSelect={handleSelect}
                      onDelete={handleDelete}
                      deletingId={deletingId}
                    />
                  ))}
                </div>
              )}

              {/* B2 note: bulk-delete disabled — DELETE /api/settings/history is full-history wipe only (Option C).
                  Per-task or batch deletion endpoints are not available from settings.ts.
                  Full history clear is available in Settings → History & Data → Clear History. */}
            </div>
          </>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="border-t border-panel-border shrink-0 bg-background/20">
        <div className="flex items-center px-2.5 py-1.5">
          <button
            onClick={() => setMainView(mainView === 'board' ? 'editor' : 'board')}
            className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded w-full justify-center transition-colors border ${
              mainView === 'board'
                ? 'bg-primary/15 border-primary/25 text-primary'
                : 'border-panel-border/40 text-muted-foreground/40 hover:text-muted-foreground/70 hover:border-panel-border/60 hover:bg-background/40'
            }`}
          >
            <LayoutGrid className="w-3 h-3 shrink-0" />
            {mainView === 'board' ? 'Close board' : 'Open board'}
          </button>
        </div>
      </div>
    </div>
  );
}
