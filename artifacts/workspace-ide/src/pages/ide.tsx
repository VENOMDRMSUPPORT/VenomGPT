import { useState, useEffect, useRef } from 'react';
import { useGetWorkspace } from '@workspace/api-client-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AppRail } from '@/components/layout/app-rail';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkspaceComposer } from '@/components/layout/workspace-composer';
import { TaskConsole } from '@/components/panels/task-console';
import { CodeEditor } from '@/components/panels/code-editor';
import { FileExplorerPanel } from '@/components/panels/file-explorer-panel';
import { TaskListPanel } from '@/components/panels/task-list-panel';
import { TaskBoard } from '@/components/panels/task-board';
import { HomeScreen } from '@/components/home-screen';
import { useWebSocket } from '@/hooks/use-websocket';
import { useQueryClient } from '@tanstack/react-query';
import { getGetWorkspaceQueryKey, getListFilesQueryKey } from '@workspace/api-client-react';
import { useIdeStore } from '@/store/use-ide-store';
import { Loader2 } from 'lucide-react';

// TaskConsole default panel size as % of the ide-body width.
// Maps to ~290px in a 1280px viewport. Clamped between min/max below.
const CONSOLE_DEFAULT_PCT = 22;
const CONSOLE_MIN_PCT = 16;  // ~205px at 1280px wide
const CONSOLE_MAX_PCT = 38;  // ~487px at 1280px wide

// Breakpoint that matches the CSS @media (max-width: 900px) rule in index.css.
const NARROW_BREAKPOINT = 900;

export default function IDEPage() {
  const { data: workspace, isLoading } = useGetWorkspace();
  const queryClient = useQueryClient();
  const [showHome, setShowHome] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const fetchBoard      = useIdeStore(s => s.fetchBoard);
  const mainView        = useIdeStore(s => s.mainView);
  const sidebarOpen     = useIdeStore(s => s.sidebarOpen);
  const explorerOpen    = useIdeStore(s => s.explorerOpen);
  const setExplorerOpen = useIdeStore(s => s.setExplorerOpen);

  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= NARROW_BREAKPOINT);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', handler);
    setIsNarrow(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const explorerOpenBeforeBoard = useRef<boolean>(explorerOpen);
  const prevMainViewRef = useRef(mainView);

  useEffect(() => {
    const prev = prevMainViewRef.current;
    prevMainViewRef.current = mainView;
    const enteringBoard = mainView === 'board' && prev === 'editor';
    const leavingBoard  = mainView === 'editor' && prev === 'board';
    if (enteringBoard) {
      explorerOpenBeforeBoard.current = explorerOpen;
    } else if (leavingBoard) {
      setExplorerOpen(explorerOpenBeforeBoard.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainView]);

  useWebSocket();

  useEffect(() => {
    void fetchBoard();
  }, [fetchBoard]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center text-primary">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <p className="text-muted-foreground font-mono">Initializing VenomGPT...</p>
      </div>
    );
  }

  const needsSetup = !workspace?.isSet;

  if (needsSetup || showHome) {
    return (
      <HomeScreen
        onProjectSelected={() => {
          queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
          setShowHome(false);
        }}
      />
    );
  }

  // PanelGroup is only used when the console is expanded AND we're above the narrow-screen breakpoint.
  const useResizableLayout = sidebarOpen && !isNarrow;

  return (
    <div className="ide-shell">
      {/* ── Application Rail (narrow left icon rail) ── */}
      <AppRail
        onNavigateHome={() => setShowHome(true)}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      {/* ── Main workspace column (fills remaining width) ── */}
      <div className="ide-workspace">
        {/* Workspace header strip: file tabs + explorer toggle */}
        <WorkspaceHeader
          historyOpen={historyOpen}
          onOpenHistory={() => setHistoryOpen(true)}
          onCloseHistory={() => setHistoryOpen(false)}
        />

        {/* ── Workspace body: TaskConsole | Center | Explorer ── */}
        {useResizableLayout ? (
          <PanelGroup direction="horizontal" className="ide-body" style={{ overflow: 'hidden' }}>
            <Panel
              defaultSize={CONSOLE_DEFAULT_PCT}
              minSize={CONSOLE_MIN_PCT}
              maxSize={CONSOLE_MAX_PCT}
              style={{ overflow: 'hidden' }}
            >
              <TaskConsole resizable />
            </Panel>

            <PanelResizeHandle className="vg-resize-handle" />

            <Panel style={{ overflow: 'hidden', minWidth: 0 }}>
              <div className="h-full flex" style={{ minWidth: 0 }}>
                <TaskListPanel />
                {mainView === 'board' ? <TaskBoard /> : <CodeEditor />}
                {mainView === 'editor' && <FileExplorerPanel />}
              </div>
            </Panel>
          </PanelGroup>
        ) : (
          <div className="ide-body">
            <TaskConsole />
            <TaskListPanel />
            {mainView === 'board' ? <TaskBoard /> : <CodeEditor />}
            {mainView === 'editor' && <FileExplorerPanel />}
          </div>
        )}

        {/* ── Workspace Composer — elevated to bottom of workspace surface ── */}
        <WorkspaceComposer />
      </div>
    </div>
  );
}
