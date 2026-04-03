import { useState, useCallback } from 'react';
import {
  useGetWorkspace,
  useListAgentTasks,
  getListAgentTasksQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  X,
  PanelRight,
  History,
  Loader2,
  Trash2,
  Eye,
  FileCheck,
  Terminal,
  ChevronRight,
  ChevronDown as ChevronDownIcon,
  ImageIcon,
} from 'lucide-react';
import { useIdeStore, AgentLogEvent } from '@/store/use-ide-store';
import {
  formatDistanceToNow,
  intervalToDuration,
  formatDuration,
} from 'date-fns';
import { TaskStatusCluster } from '@/components/ui/task-status-cluster';
import { RuntimeStatusBar } from '@/components/ui/runtime-status-bar';

function getProjectName(root: string): string {
  if (!root) return '';
  const parts = root.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || root;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const d = intervalToDuration({ start: 0, end: ms });
  return formatDuration(d, { format: ['minutes', 'seconds'] });
}

interface TaskFailureDetail { title?: string; detail?: string; step?: string; category?: string; }
interface TaskCompletion { summary?: string; final_status?: string; changed_files?: string[]; commands_run?: string[]; remaining?: string; }
interface TaskShape {
  id: string; prompt: string; status: string; createdAt: string; completedAt?: string;
  durationMs?: number; summary?: string; failureDetail?: TaskFailureDetail;
  completion?: TaskCompletion; imageCount?: number;
}
interface BackendEvent { type: string; message: string; timestamp: string; data?: Record<string, unknown>; }

function TaskHistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: historyData, isLoading } = useListAgentTasks();
  const activeTaskId = useIdeStore(s => s.activeTaskId);
  const viewingTaskId = useIdeStore(s => s.viewingTaskId);
  const taskLogsLoaded = useIdeStore(s => s.taskLogsLoaded);
  const setViewingTask = useIdeStore(s => s.setViewingTask);
  const hydrateTaskEvents = useIdeStore(s => s.hydrateTaskEvents);
  const clearActiveTask = useIdeStore(s => s.clearActiveTask);
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const tasks = (historyData?.tasks ?? []) as TaskShape[];

  const handleTaskClick = useCallback(async (task: TaskShape) => {
    setViewingTask(task.id);
    setExpandedId(prev => prev === task.id ? null : task.id);
    if (task.status !== 'running' && !taskLogsLoaded.has(task.id)) {
      try {
        const res = await fetch(`/api/agent/tasks/${task.id}/events`);
        if (res.ok) {
          const data = await res.json() as { events: BackendEvent[] };
          hydrateTaskEvents(task.id, data.events ?? []);
        }
      } catch { /* silent */ }
    }
  }, [setViewingTask, taskLogsLoaded, hydrateTaskEvents]);

  const handleDelete = useCallback(async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(taskId);
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeTaskId === taskId) clearActiveTask();
        if (expandedId === taskId) setExpandedId(null);
        queryClient.invalidateQueries({ queryKey: getListAgentTasksQueryKey() });
      }
    } catch { /* silent */ } finally { setDeletingId(null); }
  }, [activeTaskId, expandedId, clearActiveTask, queryClient]);

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[340px] bg-panel border-l border-panel-border flex flex-col shadow-2xl transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.5), -1px 0 0 rgba(138,43,226,0.1)' : undefined }}
      >
        <div className="vg-panel-header-glow">
          <History className="w-4 h-4 text-muted-foreground/70 relative z-10" />
          <span className="text-sm font-semibold text-foreground relative z-10">Task History</span>
          <span className="ml-auto text-[10px] text-muted-foreground/40 relative z-10">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
          <button onClick={onClose} className="ml-1 w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors relative z-10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto vg-scroll p-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><TaskStatusCluster status="running" size="md" /></div>
          ) : tasks.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-10 px-4">
              <div className="flex justify-center mb-3"><TaskStatusCluster status="default" size="md" className="opacity-30" /></div>
              No tasks yet.
            </div>
          ) : (
            <div className="space-y-1">
              {tasks.map(task => {
                const isExpanded = expandedId === task.id;
                const isActive = activeTaskId === task.id;
                const isViewing = viewingTaskId === task.id;
                const hasDetail = task.status === 'error' ? !!(task.failureDetail?.title || task.summary) : !!(task.completion?.summary || task.summary);
                const fileCount = task.completion?.changed_files?.length ?? 0;
                const cmdCount = task.completion?.commands_run?.length ?? 0;
                return (
                  <div key={task.id} className={`rounded-lg border transition-all ${isActive ? 'bg-primary/10 border-primary/30' : isViewing && !isActive ? 'bg-background border-primary/20 ring-1 ring-primary/10' : 'bg-background/60 hover:bg-background border-panel-border'}`}>
                    <div className="p-2.5 cursor-pointer" onClick={() => handleTaskClick(task)}>
                      <div className="flex items-start justify-between gap-1.5 mb-1">
                        <p className="text-[12px] font-medium text-foreground truncate flex-1 leading-snug" title={task.prompt}>{task.prompt}</p>
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          {isViewing && !isActive && <Eye className="w-3 h-3 text-primary/50" />}
                          <TaskStatusCluster status={task.status} size="xs" />
                          {hasDetail && (isExpanded ? <ChevronDownIcon className="w-3 h-3 text-muted-foreground/60" /> : <ChevronRight className="w-3 h-3 text-muted-foreground/60" />)}
                          {task.status !== 'running' && (
                            <button onClick={e => handleDelete(task.id, e)} disabled={deletingId === task.id} className="p-0.5 text-muted-foreground/30 hover:text-destructive rounded transition-colors disabled:opacity-40" title="Delete">
                              {deletingId === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] text-muted-foreground/50">{formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span>
                        <div className="flex items-center gap-1.5">
                          {(task.imageCount ?? 0) > 0 && <span className="text-[10px] text-violet-400/70 bg-violet-400/8 px-1.5 py-0.5 rounded flex items-center gap-0.5"><ImageIcon className="w-2.5 h-2.5" />{task.imageCount}</span>}
                          {fileCount > 0 && <span className="text-[10px] text-emerald-400/70 bg-emerald-400/8 px-1.5 py-0.5 rounded flex items-center gap-0.5"><FileCheck className="w-2.5 h-2.5" />{fileCount}</span>}
                          {cmdCount > 0 && <span className="text-[10px] text-cyan-400/70 bg-cyan-400/8 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Terminal className="w-2.5 h-2.5" />{cmdCount}</span>}
                          {task.durationMs != null && task.status !== 'running' && <span className="text-[11px] text-muted-foreground/40">{formatMs(task.durationMs)}</span>}
                          <span className={`text-[10px] font-semibold capitalize ${task.status === 'done' ? 'text-green-400/80' : task.status === 'error' ? 'text-red-400/80' : task.status === 'running' ? 'text-primary/80' : task.status === 'cancelled' ? 'text-yellow-500/70' : 'text-muted-foreground/60'}`}>{task.status}</span>
                        </div>
                      </div>
                    </div>
                    {isExpanded && hasDetail && (
                      <div className="px-2.5 pb-2.5 border-t border-panel-border/40 pt-2">
                        {task.status === 'error' && task.failureDetail?.title && <p className="text-xs text-red-300 leading-relaxed">{task.failureDetail.title}</p>}
                        {task.status !== 'error' && task.completion?.summary && <p className="text-xs text-muted-foreground leading-relaxed">{task.completion.summary}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface WorkspaceHeaderProps {
  historyOpen: boolean;
  onOpenHistory: () => void;
  onCloseHistory: () => void;
}

export function WorkspaceHeader({ historyOpen, onOpenHistory, onCloseHistory }: WorkspaceHeaderProps) {
  const { data: workspace } = useGetWorkspace();
  const openFiles = useIdeStore(s => s.openFiles);
  const activeFilePath = useIdeStore(s => s.activeFilePath);
  const setActiveFile = useIdeStore(s => s.setActiveFile);
  const closeFile = useIdeStore(s => s.closeFile);
  const explorerOpen = useIdeStore(s => s.explorerOpen);
  const toggleExplorer = useIdeStore(s => s.toggleExplorer);

  return (
    <>
      <header
        className="workspace-header border-b border-panel-border flex items-center px-2 gap-1.5 overflow-hidden shrink-0"
        style={{
          height: 40,
          background: 'rgba(10, 6, 16, 0.85)',
        }}
      >
        {/* Workspace chip */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-primary/6 border border-primary/12 px-2 py-1 rounded-md shrink-0">
          <FolderOpen className="w-3 h-3 text-primary/50 shrink-0" />
          <span className="font-mono truncate max-w-[100px]" title={workspace?.root || 'not set'}>
            {workspace?.root ? getProjectName(workspace.root) : 'No workspace'}
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-panel-border/50 mx-0.5 shrink-0" />

        {/* File tabs */}
        <div className="flex-1 flex items-center overflow-x-auto hide-scrollbar gap-0.5 min-w-0">
          {openFiles.map(file => {
            const isActive = activeFilePath === file.path;
            const name = file.path.split('/').pop() ?? file.path;
            return (
              <div
                key={file.path}
                onClick={() => setActiveFile(file.path)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer select-none shrink-0 min-w-0 max-w-[140px] transition-colors ${
                  isActive
                    ? 'bg-background text-foreground border border-panel-border shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                <span className="text-xs font-mono truncate" title={file.path}>{name}</span>
                {file.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Unsaved" />}
                <button
                  onClick={e => { e.stopPropagation(); closeFile(file.path); }}
                  className="shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-panel-border transition-all text-muted-foreground hover:text-foreground"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Runtime status */}
        <div className="shrink-0">
          <RuntimeStatusBar />
        </div>

        {/* Explorer toggle */}
        <button
          onClick={toggleExplorer}
          title={explorerOpen ? 'Close explorer' : 'Open explorer'}
          className={`w-7 h-7 flex items-center justify-center rounded border transition-colors shrink-0 ${explorerOpen ? 'bg-primary/15 border-primary/30 text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-panel-border hover:bg-background'}`}
        >
          <PanelRight className="w-4 h-4" />
        </button>

        {/* History */}
        <button
          onClick={onOpenHistory}
          title="Task history"
          className={`w-7 h-7 flex items-center justify-center rounded border transition-colors shrink-0 ${historyOpen ? 'bg-primary/15 border-primary/30 text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-panel-border hover:bg-background'}`}
        >
          <History className="w-4 h-4" />
        </button>
      </header>

      <TaskHistoryDrawer open={historyOpen} onClose={onCloseHistory} />
    </>
  );
}
