import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetWorkspace,
  useListAgentTasks,
  useHealthCheck,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWorkspaceQueryKey,
  getListAgentTasksQueryKey,
  getHealthCheckQueryKey,
} from "@workspace/api-client-react";
import {
  TerminalSquare,
  FolderOpen,
  X,
  Wifi,
  WifiOff,
  Settings2,
  PanelLeft,
  PanelRight,
  Plus,
  History,
  Loader2,
  AlertTriangle,
  Trash2,
  Eye,
  FileCheck,
  Terminal,
  ChevronRight,
  ChevronDown as ChevronDownIcon,
  ImageIcon,
  Plug,
} from "lucide-react";
import { useIdeStore, AgentLogEvent } from "@/store/use-ide-store";
import {
  formatDistanceToNow,
  intervalToDuration,
  formatDuration,
} from "date-fns";
import { TaskStatusCluster } from "@/components/ui/task-status-cluster";
import { VenomLogo } from "@/components/ui/venom-logo";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProjectName(root: string): string {
  if (!root) return "";
  const parts = root.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || root;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const d = intervalToDuration({ start: 0, end: ms });
  return formatDuration(d, { format: ["minutes", "seconds"] });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskFailureDetail {
  title?: string;
  detail?: string;
  step?: string;
  category?: string;
}
interface TaskCompletion {
  summary?: string;
  final_status?: string;
  changed_files?: string[];
  commands_run?: string[];
  remaining?: string;
}
interface TaskShape {
  id: string;
  prompt: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
  failureDetail?: TaskFailureDetail;
  completion?: TaskCompletion;
  imageCount?: number;
  visionStatus?: "success" | "degraded" | "unavailable";
}
interface BackendEvent {
  type: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ─── Task History Drawer ──────────────────────────────────────────────────────

function TaskHistoryDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: historyData, isLoading } = useListAgentTasks();
  const activeTaskId = useIdeStore((s) => s.activeTaskId);
  const viewingTaskId = useIdeStore((s) => s.viewingTaskId);
  const taskLogsLoaded = useIdeStore((s) => s.taskLogsLoaded);
  const setViewingTask = useIdeStore((s) => s.setViewingTask);
  const hydrateTaskEvents = useIdeStore((s) => s.hydrateTaskEvents);
  const clearActiveTask = useIdeStore((s) => s.clearActiveTask);
  const queryClient = useQueryClient();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const tasks = (historyData?.tasks ?? []) as TaskShape[];

  const handleTaskClick = useCallback(
    async (task: TaskShape) => {
      setViewingTask(task.id);
      setExpandedId((prev) => (prev === task.id ? null : task.id));
      if (task.status !== "running" && !taskLogsLoaded.has(task.id)) {
        try {
          const res = await fetch(`/api/agent/tasks/${task.id}/events`);
          if (res.ok) {
            const data = (await res.json()) as { events: BackendEvent[] };
            hydrateTaskEvents(task.id, data.events ?? []);
          }
        } catch {
          /* silent */
        }
      }
    },
    [setViewingTask, taskLogsLoaded, hydrateTaskEvents],
  );

  const handleDelete = useCallback(
    async (taskId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeletingId(taskId);
      try {
        const res = await fetch(`/api/agent/tasks/${taskId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          if (activeTaskId === taskId) clearActiveTask();
          if (expandedId === taskId) setExpandedId(null);
          queryClient.invalidateQueries({
            queryKey: getListAgentTasksQueryKey(),
          });
        }
      } catch {
        /* silent */
      } finally {
        setDeletingId(null);
      }
    },
    [activeTaskId, expandedId, clearActiveTask, queryClient],
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed right-0 top-0 z-50 h-full w-[340px] bg-panel border-l border-panel-border flex flex-col shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.5), -1px 0 0 rgba(138,43,226,0.1)' : undefined }}
      >
        <div className="vg-panel-header-glow">
          <History className="w-4 h-4 text-muted-foreground/70 relative z-10" />
          <span className="text-sm font-semibold text-foreground relative z-10">
            Task History
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground/40 relative z-10">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={onClose}
            className="ml-1 w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors relative z-10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto vg-scroll p-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <TaskStatusCluster status="running" size="md" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-10 px-4">
              <div className="flex justify-center mb-3">
                <TaskStatusCluster
                  status="default"
                  size="md"
                  className="opacity-30"
                />
              </div>
              No tasks yet.
            </div>
          ) : (
            <div className="space-y-1">
              {tasks.map((task) => {
                const isExpanded = expandedId === task.id;
                const isActive = activeTaskId === task.id;
                const isViewing = viewingTaskId === task.id;
                const hasDetail =
                  task.status === "error"
                    ? !!(task.failureDetail?.title || task.summary)
                    : !!(task.completion?.summary || task.summary);
                const fileCount = task.completion?.changed_files?.length ?? 0;
                const cmdCount = task.completion?.commands_run?.length ?? 0;

                return (
                  <div
                    key={task.id}
                    className={`rounded-lg border transition-all ${
                      isActive
                        ? "bg-primary/10 border-primary/30"
                        : isViewing && !isActive
                          ? "bg-background border-primary/20 ring-1 ring-primary/10"
                          : "bg-background/60 hover:bg-background border-panel-border"
                    }`}
                  >
                    <div
                      className="p-2.5 cursor-pointer"
                      onClick={() => handleTaskClick(task)}
                    >
                      <div className="flex items-start justify-between gap-1.5 mb-1">
                        <p
                          className="text-[12px] font-medium text-foreground truncate flex-1 leading-snug"
                          title={task.prompt}
                        >
                          {task.prompt}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          {isViewing && !isActive && (
                            <Eye className="w-3 h-3 text-primary/50" />
                          )}
                          <TaskStatusCluster status={task.status} size="xs" />
                          {hasDetail &&
                            (isExpanded ? (
                              <ChevronDownIcon className="w-3 h-3 text-muted-foreground/60" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
                            ))}
                          {task.status !== "running" && (
                            <button
                              onClick={(e) => handleDelete(task.id, e)}
                              disabled={deletingId === task.id}
                              className="p-0.5 text-muted-foreground/30 hover:text-destructive rounded transition-colors disabled:opacity-40"
                              title="Delete"
                            >
                              {deletingId === task.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] text-muted-foreground/50">
                          {formatDistanceToNow(new Date(task.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {(task.imageCount ?? 0) > 0 && (
                            <span className="text-[10px] text-violet-400/70 bg-violet-400/8 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <ImageIcon className="w-2.5 h-2.5" />
                              {task.imageCount}
                            </span>
                          )}
                          {fileCount > 0 && (
                            <span className="text-[10px] text-emerald-400/70 bg-emerald-400/8 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <FileCheck className="w-2.5 h-2.5" />
                              {fileCount}
                            </span>
                          )}
                          {cmdCount > 0 && (
                            <span className="text-[10px] text-cyan-400/70 bg-cyan-400/8 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <Terminal className="w-2.5 h-2.5" />
                              {cmdCount}
                            </span>
                          )}
                          {task.durationMs != null &&
                            task.status !== "running" && (
                              <span className="text-[11px] text-muted-foreground/40">
                                {formatMs(task.durationMs)}
                              </span>
                            )}
                          <span
                            className={`text-[10px] font-semibold capitalize ${
                              task.status === "done"
                                ? "text-green-400/80"
                                : task.status === "error"
                                  ? "text-red-400/80"
                                  : task.status === "running"
                                    ? "text-primary/80"
                                    : task.status === "cancelled"
                                      ? "text-yellow-500/70"
                                      : "text-muted-foreground/60"
                            }`}
                          >
                            {task.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && hasDetail && (
                      <div className="px-2.5 pb-2.5 border-t border-panel-border/40 pt-2">
                        {task.status === "error" &&
                          task.failureDetail?.title && (
                            <p className="text-xs text-red-300 leading-relaxed">
                              {task.failureDetail.title}
                            </p>
                          )}
                        {task.status !== "error" &&
                          task.completion?.summary && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {task.completion.summary}
                            </p>
                          )}
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

// ─── Plus menu ────────────────────────────────────────────────────────────────

interface PlusMenuProps {
  onOpenHistory: () => void;
  onOpenExplorer: () => void;
  onNavigateSettings: () => void;
  onNavigateIntegrations: () => void;
  onNavigateHome: () => void;
  onNewTask: () => void;
}

function PlusMenu({
  onOpenHistory,
  onOpenExplorer,
  onNavigateSettings,
  onNavigateIntegrations,
  onNavigateHome,
  onNewTask,
}: PlusMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const item = (
    icon: React.ReactNode,
    label: string,
    action: () => void,
    sub?: string,
  ) => (
    <button
      onClick={() => {
        action();
        setOpen(false);
      }}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors text-left"
    >
      <span className="text-muted-foreground w-4 flex items-center justify-center">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {sub && (
        <span className="text-[10px] text-muted-foreground/40">{sub}</span>
      )}
    </button>
  );

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Open or add…"
        className={`flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground border transition-colors shrink-0 ${
          open
            ? "bg-primary/15 border-primary/30 text-primary"
            : "border-transparent hover:border-panel-border hover:bg-muted/30"
        }`}
      >
        <Plus className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-52 bg-panel border border-panel-border rounded-xl shadow-2xl z-50 overflow-hidden py-1">
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground/50 uppercase tracking-widest">
            Add / Open
          </div>
          {item(
            <TerminalSquare className="w-3.5 h-3.5" />,
            "New Task",
            onNewTask,
          )}
          {item(
            <FolderOpen className="w-3.5 h-3.5" />,
            "Explorer",
            onOpenExplorer,
          )}
          {item(
            <History className="w-3.5 h-3.5" />,
            "Task History",
            onOpenHistory,
          )}
          <div className="my-1 border-t border-panel-border/60" />
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground/50 uppercase tracking-widest">
            Workspace
          </div>
          {item(
            <FolderOpen className="w-3.5 h-3.5" />,
            "Change Project",
            onNavigateHome,
          )}
          {item(
            <Plug className="w-3.5 h-3.5" />,
            "Integrations",
            onNavigateIntegrations,
          )}
          {item(
            <Settings2 className="w-3.5 h-3.5" />,
            "Settings",
            onNavigateSettings,
          )}
        </div>
      )}
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  onNavigateHome?: () => void;
}

export function TopBar({ onNavigateHome }: TopBarProps) {
  const [, navigate] = useLocation();
  const { data: workspace } = useGetWorkspace();

  const activeTaskId = useIdeStore((s) => s.activeTaskId);
  const isConnected = useIdeStore((s) => s.isConnected);

  // HTTP health check — confirms the API server is reachable at the HTTP level
  // (WS isConnected confirms WebSocket layer; healthz confirms HTTP layer).
  const { isError: isHealthzError } = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30_000, retry: false },
  });
  const toggleSidebar = useIdeStore((s) => s.toggleSidebar);
  const sidebarOpen = useIdeStore((s) => s.sidebarOpen);
  const openFiles = useIdeStore((s) => s.openFiles);
  const activeFilePath = useIdeStore((s) => s.activeFilePath);
  const setActiveFile = useIdeStore((s) => s.setActiveFile);
  const closeFile = useIdeStore((s) => s.closeFile);
  const explorerOpen = useIdeStore((s) => s.explorerOpen);
  const toggleExplorer = useIdeStore((s) => s.toggleExplorer);
  const stagedFilePaths = useIdeStore((s) => s.stagedFilePaths);

  const [historyOpen, setHistoryOpen] = useState(false);

  const focusSidebar = () => {
    if (!sidebarOpen) toggleSidebar();
  };

  return (
    <>
      <header
        className="ide-topbar border-b border-panel-border flex items-center px-2 gap-1 overflow-hidden relative"
        style={{
          gridArea: "header",
          background: "linear-gradient(90deg, #0a0610 0%, #05080d 100%)",
        }}
      >
        {/* Purple glow overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 60% 100% at 0% 50%, rgba(138,43,226,0.12) 0%, transparent 70%)",
          }}
        />
        {/* ── Sidebar toggle ──────────────────────────────────────────── */}
        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? "Collapse task console" : "Expand task console"}
          className="relative z-10 w-8 h-8 flex items-center justify-center rounded bg-background border border-panel-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors shrink-0"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* ── VenomGPT brand → clicks to projects page ────────────────── */}
        <button
          onClick={() => onNavigateHome?.()}
          title="Go to Projects"
          className="flex items-center gap-2 font-bold tracking-tight shrink-0 px-1 hover:opacity-80 transition-opacity relative z-10"
        >
          <VenomLogo size={22} />
          <span className="text-sm text-foreground">VenomGPT</span>
        </button>

        {/* ── Workspace name (read-only chip) ─────────────────────────── */}
        <div className="relative z-10 w-px h-4 bg-panel-border mx-1 shrink-0" />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-primary/8 border border-primary/15 px-2 py-1 rounded-md shrink-0">
          <FolderOpen className="w-3 h-3 text-primary/60 shrink-0" />
          <span
            className="font-mono truncate max-w-[120px]"
            title={workspace?.root || "not set"}
          >
            {workspace?.root ? getProjectName(workspace.root) : "No workspace"}
          </span>
        </div>

        {/* ── File tabs ───────────────────────────────────────────────── */}
        <div className="relative z-10 flex-1 flex items-center overflow-x-auto hide-scrollbar gap-0.5 mx-1 min-w-0">
          {openFiles.map((file) => {
            const isActive = activeFilePath === file.path;
            const name = file.path.split("/").pop() ?? file.path;
            return (
              <div
                key={file.path}
                onClick={() => setActiveFile(file.path)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer select-none shrink-0 min-w-0 max-w-[140px] transition-colors ${
                  isActive
                    ? "bg-background text-foreground border border-panel-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                }`}
              >
                <span className="text-xs font-mono truncate" title={file.path}>
                  {name}
                </span>
                {file.isDirty && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                    title="Unsaved"
                  />
                )}
                {!file.isDirty && stagedFilePaths.has(file.path) && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"
                    title="Staged changes"
                  />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(file.path);
                  }}
                  className="shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-panel-border transition-all text-muted-foreground hover:text-foreground"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}

          {/* Plus menu */}
          <PlusMenu
            onNewTask={focusSidebar}
            onOpenHistory={() => setHistoryOpen(true)}
            onOpenExplorer={() => {
              const { setExplorerOpen: setExp } = useIdeStore.getState();
              setExp(true);
            }}
            onNavigateHome={() => onNavigateHome?.()}
            onNavigateSettings={() => navigate("/settings")}
            onNavigateIntegrations={() => navigate("/integrations")}
          />
        </div>

        {/* ── Right side ──────────────────────────────────────────────── */}
        <div className="relative z-10 flex items-center gap-1 shrink-0 ml-1">
          {/* Task History button */}
          <button
            onClick={() => setHistoryOpen(true)}
            title="Task History"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-md transition-colors border border-transparent hover:border-panel-border"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Agent Active badge — uses running cluster */}
          {activeTaskId && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary/90 bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
              <TaskStatusCluster status="running" size="xs" />
              <span className="hidden sm:inline">Active</span>
            </div>
          )}

          {/* Connection status — WS layer + HTTP /healthz layer */}
          <div
            className={`flex items-center gap-1 text-xs ${isConnected && !isHealthzError ? "text-muted-foreground" : "text-red-400"}`}
            title={
              !isConnected
                ? "WebSocket disconnected"
                : isHealthzError
                ? "API server unreachable (HTTP)"
                : "Backend connected (WS + HTTP)"
            }
          >
            {isConnected && !isHealthzError ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">
              {isConnected && !isHealthzError ? "Connected" : "Disconnected"}
            </span>
          </div>

          {/* Integrations */}
          <button
            onClick={() => navigate("/integrations")}
            title="Integrations"
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <Plug className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            onClick={() => navigate("/settings")}
            title="Settings"
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {/* ── Explorer toggle ──────────────────────────────────────────── */}
          <button
            onClick={toggleExplorer}
            title={
              explorerOpen ? "Collapse file explorer" : "Expand file explorer"
            }
            className="w-8 h-8 flex items-center justify-center rounded bg-background border border-panel-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors shrink-0"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Drawers */}
      <TaskHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
