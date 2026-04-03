import { useState, useCallback, useEffect } from 'react';
import {
  useIdeStore,
  type ChildTask,
  type BoardTaskStatus,
} from '@/store/use-ide-store';
import {
  ListChecks, Loader2,
  Sparkles, X,
  RefreshCw, Crown,
  Plus, LayoutGrid, ChevronDown,
  Users,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TASK_RAIL_WIDTH = 240;

const HIDDEN_IN_LIST = new Set<BoardTaskStatus>(['done', 'archived']);

function formatIndex(index: number): string {
  return `#${String(index).padStart(3, '0')}`;
}

// ─── Status visual config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BoardTaskStatus, { dot: string; label: string }> = {
  draft:       { dot: 'bg-muted-foreground/40',   label: 'Draft'       },
  pending:     { dot: 'bg-muted-foreground/40',   label: 'Pending'     },
  running:     { dot: 'bg-blue-400 animate-pulse', label: 'Active'     },
  done:        { dot: 'bg-green-500',              label: 'Done'        },
  archived:    { dot: 'bg-muted-foreground/30',    label: 'Archived'    },
  error:       { dot: 'bg-green-400',              label: 'Ready'       },
  cancelled:   { dot: 'bg-red-500',               label: 'Cancelled'   },
  interrupted: { dot: 'bg-green-400',             label: 'Ready'       },
  stalled:     { dot: 'bg-blue-400',              label: 'Active'      },
  blocked:     { dot: 'bg-blue-400',              label: 'Active'      },
  partial:     { dot: 'bg-green-400',             label: 'Ready'       },
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

// ─── Filter toggle ─────────────────────────────────────────────────────────────

type FilterType = 'tasks' | 'plans';

function FilterToggle({ value, onChange }: { value: FilterType; onChange: (v: FilterType) => void }) {
  return (
    <div className="flex items-center rounded overflow-hidden border border-panel-border/50 h-5">
      {(['tasks', 'plans'] as FilterType[]).map(f => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-2 h-full text-[9px] font-semibold uppercase tracking-wide transition-colors ${
            value === f
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground/35 hover:text-muted-foreground/60 bg-transparent'
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TaskListPanel() {
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [filterType, setFilterType]   = useState<FilterType>('tasks');

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

  // Poll every 5 s to keep tasks fresh.
  useEffect(() => {
    const id = setInterval(() => { void fetchBoard(); }, 5000);
    return () => clearInterval(id);
  }, [fetchBoard]);

  // Derived lists.
  const activeTasks = childTasks.filter(t => !HIDDEN_IN_LIST.has(t.status));
  const hiddenCount = childTasks.filter(t => HIDDEN_IN_LIST.has(t.status)).length;

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

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto vg-scroll min-h-0">

        {boardLoading && !masterSession ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
          </div>
        ) : (
          <>
            {/* ── Master session card — pinned at top ─────────────────── */}
            {masterSession && (
              <div className="mx-2 mt-2 mb-0 px-2 py-1.5 rounded border border-primary/15 bg-primary/5 flex items-center gap-2">
                <Crown className="w-3 h-3 shrink-0 text-primary/50" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-wide leading-none mb-0.5">Session</p>
                  <p className="text-[11px] text-foreground/70 font-mono truncate" title={masterSession.workspaceRoot}>
                    {masterSession.workspaceRoot.split('/').pop() || masterSession.workspaceRoot}
                  </p>
                </div>
              </div>
            )}

            {/* ── + New task button — directly below master session ─────── */}
            <button
              onClick={() => setMainView('editor')}
              className="mx-2 mt-1.5 mb-1 w-[calc(100%-1rem)] flex items-center gap-1.5 px-2 py-1.5 rounded border text-[11px] font-medium transition-colors border-dashed border-primary/20 text-muted-foreground/50 hover:text-foreground/80 hover:border-primary/35 hover:bg-primary/5"
              title="Create a new task"
            >
              <Plus className="w-3 h-3 shrink-0" />
              + New task
            </button>

            {/* Task list */}
            <div className="px-2 pt-1">
              <div className="flex items-center gap-1 px-1 mb-1">
                <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-widest flex-1">
                  Tasks
                </span>
                <span className="text-[9px] text-muted-foreground/30 tabular-nums">
                  {activeTasks.length}
                </span>
              </div>

              {activeTasks.length === 0 ? (
                <div className="text-center py-4 px-2">
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
                </div>
              ) : (
                <div className="space-y-0.5">
                  {activeTasks.map(task => (
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
            </div>
          </>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="border-t border-panel-border shrink-0 bg-background/20">
        {/* Plans/Tasks filter + Creator stub row */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-panel-border/40">
          <FilterToggle value={filterType} onChange={setFilterType} />
          <button
            className="flex items-center gap-1 text-[9px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors ml-auto"
            title="Filter by creator (coming soon)"
          >
            <Users className="w-2.5 h-2.5" />
            <ChevronDown className="w-2 h-2" />
          </button>
        </div>
        {/* Open board control */}
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
