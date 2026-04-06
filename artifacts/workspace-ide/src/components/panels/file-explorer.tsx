import { useState, useMemo, useEffect, useRef } from 'react';
import { useListFiles, FileEntry } from '@workspace/api-client-react';
import { useIdeStore, AgentLogEvent } from '@/store/use-ide-store';
import {
  ChevronRight, ChevronDown, FileCode, Folder, FolderOpen, RefreshCw,
  FileEdit, Cpu, CheckCircle2, Wrench, Search, Settings, Zap, Clock,
  ChevronsUpDown, X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListFilesQueryKey } from '@workspace/api-client-react';

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

// ─── Stage parsing (shared with output-panel) ─────────────────────────────────

const STAGE_TAGS = ['PLANNING', 'INSPECTING', 'EDITING', 'VERIFYING', 'REPAIRING', 'WRAPPING UP'] as const;
type StageTag = typeof STAGE_TAGS[number];

function parseStage(message: string): StageTag | null {
  const match = message.match(/^\[(PLANNING|INSPECTING|EDITING|VERIFYING|REPAIRING|WRAPPING UP)\]/i);
  return match ? (match[1].toUpperCase() as StageTag) : null;
}

const STAGE_STYLE: Record<StageTag, { color: string; bg: string; border: string; icon: React.FC<{ className?: string }> }> = {
  PLANNING:      { color: 'text-blue-400',    bg: 'bg-blue-400/10',    border: 'border-blue-400/20',    icon: Settings },
  INSPECTING:    { color: 'text-purple-400',  bg: 'bg-purple-400/10',  border: 'border-purple-400/20',  icon: Search },
  EDITING:       { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', icon: FileEdit },
  VERIFYING:     { color: 'text-cyan-400',    bg: 'bg-cyan-400/10',    border: 'border-cyan-400/20',    icon: CheckCircle2 },
  REPAIRING:     { color: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/20',   icon: Wrench },
  'WRAPPING UP': { color: 'text-green-400',   bg: 'bg-green-400/10',   border: 'border-green-400/20',   icon: CheckCircle2 },
};

// ─── Agent context derived from logs ─────────────────────────────────────────

function useAgentContext(logs: AgentLogEvent[]) {
  return useMemo(() => {
    const stage = logs.reduceRight<StageTag | null>((acc, l) => {
      if (acc !== null) return acc;
      if (l.type === 'thought') return parseStage(l.message);
      return null;
    }, null);

    const touchedFiles: string[] = [];
    const seen = new Set<string>();
    for (const l of logs) {
      if (l.type === 'file_write' && !seen.has(l.message)) {
        seen.add(l.message);
        touchedFiles.push(l.message);
      }
    }

    const isDone   = logs.some(l => l.type === 'done');
    const isError  = !isDone && logs.some(l => l.type === 'error' && l.data?.category);

    return { stage, touchedFiles, isDone, isError };
  }, [logs]);
}

// ─── Agent context sidebar section ───────────────────────────────────────────

function AgentContextSection({ logs, isLive }: { logs: AgentLogEvent[]; isLive: boolean }) {
  const { stage, touchedFiles, isDone, isError } = useAgentContext(logs);

  if (logs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/40 text-center py-3 px-3">
        No active task
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 py-2">
      {/* Stage badge */}
      {isLive && stage && (() => {
        const s = STAGE_STYLE[stage];
        const Icon = s.icon;
        return (
          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs ${s.bg} ${s.border}`}>
            <Icon className={`w-3 h-3 shrink-0 ${s.color}`} />
            <span className={`font-semibold uppercase tracking-widest text-[10px] ${s.color}`}>{stage}</span>
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current animate-pulse opacity-70" />
          </div>
        );
      })()}

      {/* Terminal state when done */}
      {!isLive && isDone && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs bg-green-400/10 border-green-400/20">
          <CheckCircle2 className="w-3 h-3 shrink-0 text-green-400" />
          <span className="font-semibold uppercase tracking-widest text-[10px] text-green-400">Complete</span>
        </div>
      )}
      {!isLive && isError && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs bg-red-400/10 border-red-400/20">
          <Zap className="w-3 h-3 shrink-0 text-red-400" />
          <span className="font-semibold uppercase tracking-widest text-[10px] text-red-400">Failed</span>
        </div>
      )}
      {!isLive && !isDone && !isError && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs bg-muted/20 border-panel-border">
          <Clock className="w-3 h-3 shrink-0 text-muted-foreground" />
          <span className="font-semibold uppercase tracking-widest text-[10px] text-muted-foreground">Replaying</span>
        </div>
      )}

      {/* Touched files */}
      {touchedFiles.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5 px-1 flex items-center gap-1.5">
            <FileEdit className="w-3 h-3" />
            Files Written ({touchedFiles.length})
          </p>
          <ul className="space-y-0.5">
            {touchedFiles.map((f, i) => (
              <li key={i} className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-emerald-400/5 group">
                <FileCode className="w-3 h-3 shrink-0 text-emerald-400/60 group-hover:text-emerald-400" />
                <span className="text-[11px] font-mono text-emerald-300/70 group-hover:text-emerald-300 truncate" title={f}>
                  {f.includes('/') ? f.split('/').pop() : f}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Staging badge hook ────────────────────────────────────────────────────────

interface StagedFileInfo {
  /** 'M' for modified (file existed before task), '+' for new (file created by task). */
  badge: 'M' | '+';
}

/**
 * Fetch the checkpoint data for the given task and extract staged file paths with badge type.
 * Returns a Map of relative workspace path → badge info for currently staged files.
 * Returns empty Map when there is no pending checkpoint or no active task.
 *
 * Re-fetches on taskId change, and on a short poll interval so per-file apply/discard
 * actions made from the checkpoint panel are reflected promptly.
 */
function useStagedFiles(taskId: string | null): Map<string, StagedFileInfo> {
  const [stagedMap, setStagedMap] = useState<Map<string, StagedFileInfo>>(new Map());
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!taskId) {
      setStagedMap(new Map());
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agent/tasks/${taskId}/checkpoint`);
        if (cancelled) return;
        if (!res.ok) {
          setStagedMap(new Map());
          return;
        }
        const data = await res.json() as {
          status?: string;
          stagedFiles?: string[];
          files?: Array<{ path: string; existed: boolean }>;
        };
        if (cancelled) return;
        if (data.status === 'pending' && Array.isArray(data.stagedFiles)) {
          // Build a Map from path → badge, using files[].existed for '+' vs 'M' semantics.
          const existedByPath = new Map<string, boolean>();
          if (Array.isArray(data.files)) {
            for (const f of data.files) existedByPath.set(f.path, f.existed);
          }
          const next = new Map<string, StagedFileInfo>();
          for (const p of data.stagedFiles) {
            const existed = existedByPath.get(p);
            next.set(p, { badge: existed === false ? '+' : 'M' });
          }
          setStagedMap(next);
        } else {
          setStagedMap(new Map());
        }
      } catch {
        if (!cancelled) setStagedMap(new Map());
      }
    };
    load();
    // Poll every 5 seconds to pick up per-file apply/discard from the checkpoint panel
    const timer = setInterval(() => setRefreshTick(t => t + 1), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, refreshTick]);

  return stagedMap;
}

// ─── Main left panel ──────────────────────────────────────────────────────────

export function FileExplorer() {
  const { data, isLoading } = useListFiles();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [collapseKey, setCollapseKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const activeTaskId   = useIdeStore(s => s.activeTaskId);
  const viewingTaskId  = useIdeStore(s => s.viewingTaskId);
  const taskLogs       = useIdeStore(s => s.taskLogs);

  const contextTaskId  = viewingTaskId ?? activeTaskId;
  const contextLogs: AgentLogEvent[]    = (contextTaskId ? taskLogs[contextTaskId] : undefined) ?? [];
  const isLive         = activeTaskId !== null && activeTaskId === contextTaskId;

  // Staging badges: fetch staged files for the context task
  const stagedFiles = useStagedFiles(contextTaskId ?? null);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
  };

  const toggleSearch = () => {
    setShowSearch(s => {
      if (s) setSearchQuery('');
      return !s;
    });
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const hasSearch = searchQuery.trim().length > 0;

  const entries = data?.entries ?? [];
  const filteredEntries = useMemo(() => {
    if (!hasSearch) return entries;
    return entries.filter((e: FileEntry) => {
      const check = (entry: FileEntry): boolean => {
        if (entry.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
        if (entry.type === 'directory') {
          return (entry.children ?? []).some(check);
        }
        return false;
      };
      return check(e);
    });
  }, [entries, searchQuery, hasSearch]);

  return (
    <div className="bg-panel border-l border-panel-border flex flex-col overflow-hidden" style={{ gridArea: 'sidebar' }}>

      {/* ── Files section ─────────────────────────────────────────────── */}
      <div className="h-9 border-b border-panel-border flex items-center gap-1 px-3 shrink-0">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-auto">Explorer</h2>
        {stagedFiles.size > 0 && (
          <span className="text-[10px] text-amber-400/70 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full mr-1">
            {stagedFiles.size} staged
          </span>
        )}
        <button
          onClick={toggleSearch}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${showSearch ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-background'}`}
          title="Search files"
        >
          <Search className="w-3 h-3" />
        </button>
        <button
          onClick={() => setCollapseKey(k => k + 1)}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          title="Collapse all"
        >
          <ChevronsUpDown className="w-3 h-3" />
        </button>
        <button onClick={handleRefresh} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-background" title="Refresh files">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* ── Search input ────────────────────────────────────────────────── */}
      {showSearch && (
        <div className="px-2 py-1.5 border-b border-panel-border/60 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter files…"
              className="w-full pl-6 pr-6 py-1 bg-background border border-panel-border/60 rounded text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto vg-scroll p-1.5 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-16 text-muted-foreground gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Loading...</span>
          </div>
        ) : filteredEntries.length > 0 ? (
          <div key={collapseKey} className="space-y-0.5">
            {filteredEntries.map((entry, idx) => (
              <TreeNode key={idx} entry={entry} depth={0} stagedFiles={stagedFiles} searchQuery={searchQuery} forceOpen={hasSearch} />
            ))}
          </div>
        ) : hasSearch ? (
          <div className="text-xs text-muted-foreground p-3 text-center">No files match "{searchQuery}"</div>
        ) : (
          <div className="text-xs text-muted-foreground p-3 text-center">No files found</div>
        )}
      </div>

      {/* ── Agent Context section ─────────────────────────────────────── */}
      <div className="border-t border-panel-border shrink-0">
        <div className="h-8 flex items-center px-4 gap-2">
          <Cpu className={`w-3 h-3 ${isLive ? 'text-primary animate-pulse' : 'text-muted-foreground/50'}`} />
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Agent
          </h2>
          {isLive && (
            <span className="ml-auto text-[10px] text-primary/70 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Live
            </span>
          )}
        </div>
        <AgentContextSection logs={contextLogs} isLive={isLive} />
      </div>
    </div>
  );
}

// ─── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({
  entry,
  depth,
  stagedFiles,
  searchQuery = '',
  forceOpen = false,
}: {
  entry: FileEntry;
  depth: number;
  stagedFiles?: Map<string, StagedFileInfo>;
  searchQuery?: string;
  forceOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const openFile = useIdeStore(s => s.openFile);
  const activeFilePath = useIdeStore(s => s.activeFilePath);
  const isDirectory = entry.type === 'directory';
  const isActive = activeFilePath === entry.path;
  const isExpanded = forceOpen || isOpen;

  // Staging badge: check if this file is in the staged map.
  let stagedInfo: StagedFileInfo | undefined;
  if (!isDirectory && stagedFiles && stagedFiles.size > 0) {
    stagedInfo = stagedFiles.get(entry.path);
    if (!stagedInfo) {
      for (const [stagedPath, info] of stagedFiles) {
        if (entry.path.endsWith('/' + stagedPath) || entry.path === stagedPath) {
          stagedInfo = info;
          break;
        }
      }
    }
  }
  const isStaged = stagedInfo !== undefined;
  const stageBadge = stagedInfo?.badge ?? null;

  const matchesSearch = !searchQuery || entry.name.toLowerCase().includes(searchQuery.toLowerCase());
  const childrenMatchSearch = !searchQuery || (isDirectory && (entry.children ?? []).some(function check(c: FileEntry): boolean {
    return c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.type === 'directory' && (c.children ?? []).some(check));
  }));
  if (searchQuery && !matchesSearch && !childrenMatchSearch) return null;

  const highlight = searchQuery && matchesSearch;

  const handleClick = async () => {
    if (isDirectory) {
      setIsOpen(!isOpen);
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/files/read?path=${encodeURIComponent(entry.path)}`);
        if (res.ok) {
          const data = await res.json();
          openFile({ path: data.path, content: data.content, language: data.language, isDirty: false });
        }
      } catch (err) {
        console.error('Failed to read file', err);
      }
    }
  };

  const filteredChildren = searchQuery
    ? (entry.children ?? []).filter(function check(c: FileEntry): boolean {
        return c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.type === 'directory' && (c.children ?? []).some(check));
      })
    : (entry.children ?? []);

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-[3px] rounded cursor-pointer select-none text-sm transition-colors
          ${isActive ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-background'}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {isDirectory ? (
          <>
            {isExpanded ? <ChevronDown className="w-3 h-3 opacity-50 shrink-0" /> : <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />}
            {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" /> : <Folder className="w-3.5 h-3.5 text-primary/80 shrink-0" />}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileCode className={`w-3.5 h-3.5 shrink-0 ${isStaged ? 'text-amber-400/70' : 'opacity-50'}`} />
          </>
        )}
        <span className={`truncate text-[13px] ${isStaged ? 'text-amber-300/90' : ''} ${highlight ? 'text-primary font-medium' : ''}`}>
          {entry.name}
        </span>
        {stageBadge && (
          <span className="ml-auto shrink-0 text-[10px] font-bold text-amber-400 bg-amber-400/15 border border-amber-400/20 px-1 rounded leading-tight">
            {stageBadge}
          </span>
        )}
      </div>

      {isDirectory && isExpanded && filteredChildren.length > 0 && (
        <div className="flex flex-col">
          {filteredChildren.map((child, idx) => (
            <TreeNode key={idx} entry={child} depth={depth + 1} stagedFiles={stagedFiles} searchQuery={searchQuery} forceOpen={forceOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
