import { create } from 'zustand';
import type { ActionRecord } from '@/lib/actionSelectors';

export type RunPhase =
  | "initializing"
  | "planning"
  | "inspecting"
  | "executing"
  | "verifying"
  | "repairing"
  | "wrapping_up"
  | "complete"
  | "blocked"
  | "failed"
  // task-9: operator-steering phases
  | "awaiting_approval"
  | "approval_denied"
  | "selectively_blocked"
  | "operator_overridden";

export type InterventionKind = "pause" | "blocked" | "partial_proceed" | "awaiting_approval" | "approval_denied" | null;

export interface LivePhaseState {
  phase:                RunPhase;
  step:                 number;
  maxSteps:             number;
  unverifiedWriteCount: number;
  consecutiveFailures:  number;
  recoverable:          boolean;
  interventionKind:     InterventionKind;
  blockedContext:       string | null;
  gateTriggers:         Record<string, number> | null;
  verificationQuality:  string | null;
}

export interface OpenFile {
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export interface AgentLogEvent {
  id: number;
  type: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type BoardView = 'list' | 'board';
export type MainView = 'editor' | 'board';

export type BoardTaskStatus =
  | 'draft' | 'pending' | 'running' | 'done' | 'archived'
  | 'error' | 'cancelled' | 'interrupted' | 'stalled' | 'blocked' | 'partial';

export interface MasterSession {
  type: 'master';
  id: 'master';
  name: string;
  workspaceRoot: string;
  createdAt: string;
}

export interface ChildTask {
  type: 'task';
  id: string;
  index: number;
  name: string;
  prompt: string;
  status: BoardTaskStatus;
  createdAt: string;
  updatedAt: string;
  agentTaskId?: string;
}

interface IdeState {
  // ── Editor ──────────────────────────────────────────────────────────────────
  openFiles: OpenFile[];
  activeFilePath: string | null;

  // ── Terminal ─────────────────────────────────────────────────────────────────
  terminalOutput: string[];

  // ── Task lifecycle ───────────────────────────────────────────────────────────
  activeTaskId: string | null;
  viewingTaskId: string | null;
  taskLogs: Record<string, AgentLogEvent[]>;
  taskLogsLoaded: Set<string>;
  taskStartedAt: string | null;
  /** Maps taskId → the original user prompt submitted for that task */
  taskPrompts: Record<string, string>;

  // ── Action records (per task) ─────────────────────────────────────────────
  taskActions: Record<string, ActionRecord[]>;

  // ── Board state ─────────────────────────────────────────────────────────────
  /** Master project session for the current workspace. */
  masterSession: MasterSession | null;
  /** All child tasks from /api/board — includes done/archived for the history board. */
  childTasks: ChildTask[];
  /** Whether board data is currently loading. */
  boardLoading: boolean;
  /** Currently selected board task ID (in the task list panel) */
  activeBoardTaskId: string | null;
  /** Which board surface to show: 'list' = active sidebar, 'board' = history/kanban */
  boardView: BoardView;

  // ── Layout ───────────────────────────────────────────────────────────────────
  sidebarOpen: boolean;
  explorerOpen: boolean;
  /** Main content area view: 'editor' = normal editor, 'board' = full-width kanban */
  mainView: MainView;
  /** Prompt text pre-filled into the Task Console composer (set when navigating from board) */
  pendingNewTaskPrompt: string | null;
  /** Prompt text that has been submitted but task hasn't started yet (for immediate bubble display) */
  pendingSubmitPrompt: string | null;

  // ── Connection ───────────────────────────────────────────────────────────────
  isConnected: boolean;

  // ── Live phase (active run state broadcast) ──────────────────────────────────
  livePhase: LivePhaseState | null;

  // ── Live phase actions ────────────────────────────────────────────────────────
  setLivePhase: (data: LivePhaseState) => void;
  clearLivePhase: () => void;

  // ── Editor actions ───────────────────────────────────────────────────────────
  openFile: (file: OpenFile) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, newContent: string) => void;
  markFileClean: (path: string) => void;

  // ── Terminal actions ─────────────────────────────────────────────────────────
  appendTerminalOutput: (data: string) => void;
  clearTerminal: () => void;

  // ── Task actions ─────────────────────────────────────────────────────────────
  startActiveTask: (taskId: string, prompt?: string) => void;
  clearActiveTask: () => void;
  setViewingTask: (taskId: string) => void;
  appendAgentLog: (taskId: string, event: Omit<AgentLogEvent, 'id'>) => void;
  hydrateTaskEvents: (taskId: string, events: Omit<AgentLogEvent, 'id'>[]) => void;
  clearAgentLogs: () => void;

  // ── Action record actions ────────────────────────────────────────────────────
  setTaskActions: (taskId: string, actions: ActionRecord[]) => void;
  mergeTaskActions: (taskId: string, actions: ActionRecord[]) => void;
  upsertTaskAction: (taskId: string, action: ActionRecord) => void;
  clearTaskActions: (taskId: string) => void;

  // ── Board API actions ────────────────────────────────────────────────────────
  /** Fetch /api/board and hydrate masterSession + childTasks. */
  fetchBoard: () => Promise<void>;
  /** Create a new child task via POST /api/board/tasks. */
  createChildTask: (prompt: string) => Promise<ChildTask | null>;
  /** Delete a board task via DELETE /api/board/tasks/:id. */
  deleteBoardTask: (taskId: string) => Promise<boolean>;
  /** Update board task status via PATCH /api/board/tasks/:id. */
  updateBoardTaskStatus: (taskId: string, status: BoardTaskStatus) => Promise<boolean>;
  setActiveBoardTaskId: (id: string | null) => void;
  setBoardView: (view: BoardView) => void;

  // ── Layout actions ───────────────────────────────────────────────────────────
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setExplorerOpen: (open: boolean) => void;
  toggleExplorer: () => void;
  setMainView: (view: MainView) => void;
  setPendingNewTaskPrompt: (prompt: string | null) => void;
  setPendingSubmitPrompt: (prompt: string | null) => void;

  setConnected: (connected: boolean) => void;
}

let logIdCounter = 0;

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

export const useIdeStore = create<IdeState>((set) => ({
  openFiles: [],
  activeFilePath: null,
  terminalOutput: [],
  activeTaskId: null,
  viewingTaskId: null,
  taskLogs: {},
  taskLogsLoaded: new Set(),
  taskStartedAt: null,
  taskPrompts: {},
  taskActions: {},
  masterSession: null,
  childTasks: [],
  boardLoading: false,
  activeBoardTaskId: null,
  boardView: 'list',
  sidebarOpen: true,
  explorerOpen: true,
  mainView: 'editor',
  pendingNewTaskPrompt: null,
  pendingSubmitPrompt: null,
  isConnected: false,
  livePhase: null,

  // ── Live phase ────────────────────────────────────────────────────────────────

  setLivePhase: (data) => set({ livePhase: data }),
  clearLivePhase: () => set({ livePhase: null }),

  // ── Editor ──────────────────────────────────────────────────────────────────

  openFile: (file) => set((state) => {
    const existing = state.openFiles.find(f => f.path === file.path);
    if (existing) {
      return {
        activeFilePath: file.path,
        openFiles: state.openFiles.map(f =>
          f.path === file.path ? { ...f, content: file.content, language: file.language } : f
        ),
      };
    }
    return { openFiles: [...state.openFiles, file], activeFilePath: file.path };
  }),

  closeFile: (path) => set((state) => {
    const newFiles = state.openFiles.filter(f => f.path !== path);
    let newActive = state.activeFilePath;
    if (newActive === path) {
      newActive = newFiles.length > 0 ? newFiles[newFiles.length - 1].path : null;
    }
    return { openFiles: newFiles, activeFilePath: newActive };
  }),

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateFileContent: (path, newContent) => set((state) => ({
    openFiles: state.openFiles.map(f =>
      f.path === path ? { ...f, content: newContent, isDirty: true } : f
    ),
  })),

  markFileClean: (path) => set((state) => ({
    openFiles: state.openFiles.map(f =>
      f.path === path ? { ...f, isDirty: false } : f
    ),
  })),

  // ── Terminal ─────────────────────────────────────────────────────────────────

  appendTerminalOutput: (data) => set((state) => ({
    terminalOutput: [...state.terminalOutput, data].slice(-500),
  })),

  clearTerminal: () => set({ terminalOutput: [] }),

  // ── Task lifecycle ───────────────────────────────────────────────────────────

  startActiveTask: (taskId, prompt) => set((state) => {
    const loaded = new Set(state.taskLogsLoaded);
    loaded.add(taskId);
    // Clear actions for this taskId so stale data from a prior run of the same id
    // (e.g. after a reset) doesn't bleed into the new run.
    const nextActions = { ...state.taskActions };
    delete nextActions[taskId];
    const nextPrompts = prompt
      ? { ...state.taskPrompts, [taskId]: prompt }
      : state.taskPrompts;
    return {
      activeTaskId: taskId,
      viewingTaskId: taskId,
      taskLogs: { ...state.taskLogs, [taskId]: [] },
      taskLogsLoaded: loaded,
      taskStartedAt: new Date().toISOString(),
      taskActions: nextActions,
      taskPrompts: nextPrompts,
    };
  }),

  clearActiveTask: () => set({ activeTaskId: null, taskStartedAt: null }),

  setViewingTask: (taskId) => set({ viewingTaskId: taskId }),

  appendAgentLog: (taskId, event) => set((state) => ({
    taskLogs: {
      ...state.taskLogs,
      [taskId]: [
        ...(state.taskLogs[taskId] ?? []),
        { ...event, id: ++logIdCounter },
      ],
    },
  })),

  hydrateTaskEvents: (taskId, events) => set((state) => {
    if (state.taskLogsLoaded.has(taskId)) return state;
    const loaded = new Set(state.taskLogsLoaded);
    loaded.add(taskId);
    return {
      taskLogsLoaded: loaded,
      taskLogs: {
        ...state.taskLogs,
        [taskId]: events.map(ev => ({ ...ev, id: ++logIdCounter })),
      },
    };
  }),

  clearAgentLogs: () => set((state) =>
    state.viewingTaskId
      ? { taskLogs: { ...state.taskLogs, [state.viewingTaskId]: [] } }
      : state
  ),

  // ── Action records ───────────────────────────────────────────────────────────

  setTaskActions: (taskId, actions) => set((state) => ({
    taskActions: { ...state.taskActions, [taskId]: actions },
  })),

  mergeTaskActions: (taskId, incoming) => set((state) => {
    const existing = state.taskActions[taskId] ?? [];
    const byId = new Map(existing.map(a => [a.id, a]));
    for (const a of incoming) {
      byId.set(a.id, a);
    }
    const merged = Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
    return { taskActions: { ...state.taskActions, [taskId]: merged } };
  }),

  upsertTaskAction: (taskId, action) => set((state) => {
    const existing = state.taskActions[taskId] ?? [];
    const idx = existing.findIndex(a => a.id === action.id);
    const replaced = idx === -1
      ? [...existing, action]
      : existing.map((a, i) => i === idx ? action : a);
    const sorted = replaced.slice().sort((a, b) => a.createdAt - b.createdAt);
    return { taskActions: { ...state.taskActions, [taskId]: sorted } };
  }),

  clearTaskActions: (taskId) => set((state) => {
    const next = { ...state.taskActions };
    delete next[taskId];
    return { taskActions: next };
  }),

  // ── Board API ─────────────────────────────────────────────────────────────────

  fetchBoard: async () => {
    set({ boardLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/board`);
      if (!res.ok) return;
      const data = await res.json() as { master: MasterSession; tasks: ChildTask[] };
      set({ masterSession: data.master, childTasks: data.tasks });
    } catch {
      // silently ignore network errors
    } finally {
      set({ boardLoading: false });
    }
  },

  createChildTask: async (prompt) => {
    try {
      const res = await fetch(`${API_BASE}/api/board/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) return null;
      const { task } = await res.json() as { task: ChildTask };
      set((state) => ({ childTasks: [...state.childTasks, task] }));
      return task;
    } catch {
      return null;
    }
  },

  deleteBoardTask: async (taskId) => {
    try {
      const res = await fetch(`${API_BASE}/api/board/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) return false;
      set((state) => ({ childTasks: state.childTasks.filter((t) => t.id !== taskId) }));
      return true;
    } catch {
      return false;
    }
  },

  updateBoardTaskStatus: async (taskId, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/board/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return false;
      set((state) => ({
        childTasks: state.childTasks.map((t) =>
          t.id === taskId ? { ...t, status } : t
        ),
      }));
      return true;
    } catch {
      return false;
    }
  },

  setActiveBoardTaskId: (id) => set({ activeBoardTaskId: id }),
  setBoardView: (view) => set({ boardView: view }),

  // ── Layout ───────────────────────────────────────────────────────────────────

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setExplorerOpen: (open) => set({ explorerOpen: open }),
  toggleExplorer: () => set((state) => ({ explorerOpen: !state.explorerOpen })),
  setMainView: (view) => set({ mainView: view }),
  setPendingNewTaskPrompt: (prompt) => set({ pendingNewTaskPrompt: prompt }),
  setPendingSubmitPrompt: (prompt) => set({ pendingSubmitPrompt: prompt }),

  setConnected: (connected) => set({ isConnected: connected }),
}));
