import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  FolderOpen, RefreshCw, X, ChevronRight, ChevronDown, FileEdit, Copy,
  Trash2, FilePlus, FolderPlus, Download, Pencil, Search, ChevronsUpDown,
  FileCode, Folder,
} from 'lucide-react';
import { useListFiles, FileEntry, getListFilesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useIdeStore } from '@/store/use-ide-store';

// ─── Context menu ────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry;
}

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onRefresh: () => void;
}

function ContextMenu({ menu, onClose, onRefresh }: ContextMenuProps) {
  const { entry } = menu;
  const isDir = entry.type === 'directory';
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    left: menu.x,
    top: menu.y,
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(entry.path).catch(() => {});
    onClose();
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete "${entry.name}"?`);
    if (!confirmed) { onClose(); return; }
    try {
      const res = await fetch(`/api/files/delete?path=${encodeURIComponent(entry.path)}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Delete failed: ${body.message ?? 'Unknown error'}`);
      }
    } catch {
      alert('Delete failed: network error');
    }
    onClose();
  };

  const handleRename = async () => {
    const currentName = entry.name;
    const dir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/') + 1) : '';
    const newName = window.prompt('Rename to:', currentName);
    if (!newName || newName.trim() === '' || newName.trim() === currentName) { onClose(); return; }
    const newPath = dir + newName.trim();
    try {
      const res = await fetch('/api/files/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: entry.path, newPath }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Rename failed: ${body.message ?? 'Unknown error'}`);
      }
    } catch {
      alert('Rename failed: network error');
    }
    onClose();
  };

  const handleAddFile = async () => {
    const name = window.prompt('New file name:');
    if (!name || name.trim() === '') { onClose(); return; }
    const filePath = isDir ? `${entry.path}/${name.trim()}` : `${entry.path.slice(0, entry.path.lastIndexOf('/') + 1)}${name.trim()}`;
    try {
      const res = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: '' }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Create failed: ${body.message ?? 'Unknown error'}`);
      }
    } catch {
      alert('Create failed: network error');
    }
    onClose();
  };

  const handleAddFolder = async () => {
    const name = window.prompt('New folder name:');
    if (!name || name.trim() === '') { onClose(); return; }
    const parentDir = isDir ? entry.path : entry.path.slice(0, entry.path.lastIndexOf('/')) || '.';
    const folderPath = `${parentDir}/${name.trim()}`;
    try {
      const res = await fetch('/api/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Create folder failed: ${body.message ?? 'Unknown error'}`);
      }
    } catch {
      alert('Create folder failed: network error');
    }
    onClose();
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/files/download?path=${encodeURIComponent(entry.path)}`);
      if (!res.ok) { alert('Download failed: could not read file'); onClose(); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed: network error');
    }
    onClose();
  };

  const itemCls = 'flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-primary/15 hover:text-primary cursor-pointer rounded transition-colors select-none w-full text-left';
  const sepCls = 'my-1 border-t border-panel-border/60';

  return (
    <div
      ref={menuRef}
      style={style}
      className="bg-panel border border-panel-border rounded-lg shadow-xl shadow-black/40 py-1 min-w-[168px] overflow-hidden"
      onContextMenu={e => e.preventDefault()}
    >
      <button className={itemCls} onClick={handleRename}>
        <Pencil className="w-3 h-3 opacity-60" />
        Rename
      </button>
      <button className={itemCls} onClick={handleCopyPath}>
        <Copy className="w-3 h-3 opacity-60" />
        Copy path
      </button>
      {!isDir && (
        <button className={itemCls} onClick={handleDownload}>
          <Download className="w-3 h-3 opacity-60" />
          Download
        </button>
      )}
      {isDir && (
        <>
          <div className={sepCls} />
          <button className={itemCls} onClick={handleAddFile}>
            <FilePlus className="w-3 h-3 opacity-60" />
            New file
          </button>
          <button className={itemCls} onClick={handleAddFolder}>
            <FolderPlus className="w-3 h-3 opacity-60" />
            New folder
          </button>
        </>
      )}
      <div className={sepCls} />
      <button
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/15 cursor-pointer rounded transition-colors select-none w-full text-left"
        onClick={handleDelete}
      >
        <Trash2 className="w-3 h-3 opacity-70" />
        Delete
      </button>
    </div>
  );
}

// ─── Tree node ────────────────────────────────────────────────────────────────

interface ExplorerTreeNodeProps {
  entry: FileEntry;
  depth: number;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  searchQuery: string;
  forceOpen?: boolean;
}

function flattenPaths(entry: FileEntry): string[] {
  if (entry.type !== 'directory') return [entry.path];
  const children = (entry.children as FileEntry[] | undefined) ?? [];
  return [entry.path, ...children.flatMap(flattenPaths)];
}

function entryMatchesSearch(entry: FileEntry, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  if (entry.name.toLowerCase().includes(lower)) return true;
  if (entry.type === 'directory') {
    const children = (entry.children as FileEntry[] | undefined) ?? [];
    return children.some(child => entryMatchesSearch(child, q));
  }
  return false;
}

function ExplorerTreeNode({ entry, depth, onContextMenu, searchQuery, forceOpen }: ExplorerTreeNodeProps) {
  const [open, setOpen] = useState(false);
  const openFile = useIdeStore(s => s.openFile);
  const activeFilePath = useIdeStore(s => s.activeFilePath);
  const isDir = entry.type === 'directory';
  const isActive = activeFilePath === entry.path;

  const isExpanded = forceOpen || open;

  const handleClick = async () => {
    if (isDir) { setOpen(o => !o); return; }
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(entry.path)}`);
      if (res.ok) {
        const data = await res.json();
        openFile({ path: data.path, content: data.content, language: data.language, isDirty: false });
      }
    } catch { /* silent */ }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, entry);
  };

  const children = (entry.children as FileEntry[] | undefined) ?? [];

  const filteredChildren = searchQuery
    ? children.filter(child => entryMatchesSearch(child, searchQuery))
    : children;

  if (!entryMatchesSearch(entry, searchQuery)) return null;

  const highlight = searchQuery && entry.name.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 px-2 py-[3px] rounded cursor-pointer select-none text-sm transition-colors ${
          isActive
            ? 'bg-primary/20 text-primary'
            : 'text-foreground hover:bg-background'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {isDir ? (
          <>
            {isExpanded ? <ChevronDown className="w-3 h-3 opacity-50 shrink-0" /> : <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />}
            {isExpanded
              ? <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
              : <Folder className="w-3.5 h-3.5 text-primary/70 shrink-0" />}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileCode className="w-3.5 h-3.5 opacity-40 shrink-0" />
          </>
        )}
        <span className={`truncate text-[13px] ${highlight ? 'text-primary font-medium' : ''}`}>
          {entry.name}
        </span>
      </div>
      {isDir && isExpanded && filteredChildren.map((child: FileEntry, i: number) => (
        <ExplorerTreeNode
          key={i}
          entry={child}
          depth={depth + 1}
          onContextMenu={onContextMenu}
          searchQuery={searchQuery}
          forceOpen={!!searchQuery}
        />
      ))}
    </div>
  );
}

// ─── New file / folder inline prompt ─────────────────────────────────────────

interface InlinePromptProps {
  mode: 'file' | 'folder';
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function InlinePrompt({ mode, onConfirm, onCancel }: InlinePromptProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onConfirm(value.trim());
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1" style={{ paddingLeft: '20px' }}>
      {mode === 'file' ? (
        <FileCode className="w-3.5 h-3.5 opacity-40 shrink-0" />
      ) : (
        <Folder className="w-3.5 h-3.5 text-primary/70 shrink-0" />
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        onBlur={onCancel}
        placeholder={mode === 'file' ? 'filename.ext' : 'folder-name'}
        className="flex-1 bg-background border border-primary/50 rounded px-1.5 py-0.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/40 font-mono"
      />
    </div>
  );
}

// ─── Inline explorer panel ────────────────────────────────────────────────────

const EXPLORER_WIDTH = 260;

interface FileExplorerPanelProps {
  /** When true, the panel stays mounted in the DOM but is visually hidden via display:none. */
  forceHidden?: boolean;
}

export function FileExplorerPanel({ forceHidden = false }: FileExplorerPanelProps = {}) {
  const explorerOpen    = useIdeStore(s => s.explorerOpen);
  const setExplorerOpen = useIdeStore(s => s.setExplorerOpen);
  const { data, isLoading } = useListFiles();
  const queryClient = useQueryClient();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [inlinePrompt, setInlinePrompt] = useState<'file' | 'folder' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
  }, [queryClient]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleCloseMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const toggleSearch = () => {
    setShowSearch(s => {
      if (s) setSearchQuery('');
      return !s;
    });
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleCollapseAll = useCallback(() => {
    // Re-mount tree nodes by toggling a key — simplest collapse-all approach
    setCollapseKey(k => k + 1);
  }, []);

  const [collapseKey, setCollapseKey] = useState(0);

  const handleNewFile = async () => {
    setInlinePrompt('file');
  };

  const handleNewFolder = async () => {
    setInlinePrompt('folder');
  };

  const handleInlineConfirm = async (name: string) => {
    const mode = inlinePrompt;
    setInlinePrompt(null);
    if (!mode) return;
    if (mode === 'file') {
      try {
        const res = await fetch('/api/files/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: name, content: '' }),
        });
        if (res.ok) {
          handleRefresh();
        } else {
          const body = await res.json().catch(() => ({}));
          alert(`Create failed: ${body.message ?? 'Unknown error'}`);
        }
      } catch {
        alert('Create failed: network error');
      }
    } else {
      try {
        const res = await fetch('/api/files/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: name }),
        });
        if (res.ok) {
          handleRefresh();
        } else {
          const body = await res.json().catch(() => ({}));
          alert(`Create folder failed: ${body.message ?? 'Unknown error'}`);
        }
      } catch {
        alert('Create folder failed: network error');
      }
    }
  };

  const entries = data?.entries ?? [];
  const hasSearch = searchQuery.trim().length > 0;

  const filteredEntries = useMemo(() => {
    if (!hasSearch) return entries;
    return entries.filter((e: FileEntry) => {
      const flatPaths = flattenPaths(e);
      return flatPaths.some(p => {
        const filename = p.includes('/') ? p.split('/').pop()! : p;
        return filename.toLowerCase().includes(searchQuery.toLowerCase());
      });
    });
  }, [entries, searchQuery, hasSearch]);

  // When forceHidden, render but hide via style rather than unmounting.
  // When not forceHidden and explorerOpen is false, don't render at all.
  if (!explorerOpen && !forceHidden) return null;

  const isHidden = !explorerOpen && forceHidden;

  return (
    <div style={isHidden ? { display: 'none' } : { display: 'contents' }}>
      <div
        className="h-full flex flex-col bg-panel border-l border-panel-border overflow-hidden"
        style={{ width: EXPLORER_WIDTH, minWidth: EXPLORER_WIDTH, maxWidth: EXPLORER_WIDTH, flexShrink: 0 }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="vg-panel-header-glow">
          <FolderOpen className="w-3.5 h-3.5 text-primary/50 relative z-10" />
          <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest relative z-10">Files</span>
          <div className="ml-auto flex items-center gap-0.5 relative z-10">
            <button
              onClick={toggleSearch}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${showSearch ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-background'}`}
              title="Search files"
            >
              <Search className="w-3 h-3" />
            </button>
            <button
              onClick={handleNewFile}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              title="New file"
            >
              <FilePlus className="w-3 h-3" />
            </button>
            <button
              onClick={handleNewFolder}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              title="New folder"
            >
              <FolderPlus className="w-3 h-3" />
            </button>
            <button
              onClick={handleCollapseAll}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              title="Collapse all"
            >
              <ChevronsUpDown className="w-3 h-3" />
            </button>
            <button
              onClick={handleRefresh}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={() => setExplorerOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              title="Close explorer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search input */}
        {showSearch && (
          <div className="px-2 py-1.5 border-b border-panel-border/60 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter files…"
                className="w-full pl-6 pr-2 py-1 bg-background border border-panel-border/60 rounded text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
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

        {/* Inline prompt for new file/folder at root */}
        {inlinePrompt && (
          <div className="border-b border-panel-border/40">
            <InlinePrompt
              mode={inlinePrompt}
              onConfirm={handleInlineConfirm}
              onCancel={() => setInlinePrompt(null)}
            />
          </div>
        )}

        {/* File tree */}
        <div className="flex-1 overflow-y-auto vg-scroll p-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-16 gap-2 text-muted-foreground">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">Loading…</span>
            </div>
          ) : filteredEntries.length ? (
            <div key={collapseKey}>
              {filteredEntries.map((entry: FileEntry, idx: number) => (
                <ExplorerTreeNode
                  key={idx}
                  entry={entry}
                  depth={0}
                  onContextMenu={handleContextMenu}
                  searchQuery={searchQuery}
                  forceOpen={hasSearch}
                />
              ))}
            </div>
          ) : hasSearch ? (
            <p className="text-xs text-muted-foreground text-center p-4">No files match "{searchQuery}"</p>
          ) : (
            <p className="text-xs text-muted-foreground text-center p-4">No files found</p>
          )}
        </div>
      </div>

      {/* Context menu — rendered in a portal-like fixed position */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={handleCloseMenu}
          onRefresh={() => { handleRefresh(); handleCloseMenu(); }}
        />
      )}
    </div>
  );
}
