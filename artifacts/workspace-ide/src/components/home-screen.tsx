import { useState, useRef, useEffect, useMemo } from 'react';
import {
  useListProjects,
  useCreateProject,
  useSelectProject,
  useSetWorkspace,
  getListProjectsQueryKey,
  getGetWorkspaceQueryKey,
  getListFilesQueryKey,
  type Project,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  TerminalSquare,
  FolderOpen,
  Plus,
  Loader2,
  AlertCircle,
  FolderGit2,
  X,
  ChevronRight,
  Clock,
  Settings2,
  Search,
  Zap,
  GitBranch,
  Terminal,
  RefreshCw,
  Plug,
  MoreHorizontal,
  Star,
  StarOff,
  Pencil,
  Trash2,
  ArrowUpDown,
  FolderPlus,
  ChevronDown,
} from 'lucide-react';
import { useLocation } from 'wouter';

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined });
  } catch {
    return '';
  }
}

const PROJECT_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-blue-600',
  'from-lime-500 to-green-600',
  'from-fuchsia-500 to-violet-600',
];

function getProjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

function getProjectInitials(name: string): string {
  const clean = name.replace(/[-_.](.)/g, (_, c: string) => c.toUpperCase());
  const words = clean.replace(/([A-Z])/g, ' $1').trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Local state: pinned + groups ─────────────────────────────────────────────

const PINNED_KEY = 'venom_pinned_projects';
const GROUPS_KEY = 'venom_project_groups';

function loadPinned(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]')); } catch { return new Set(); }
}

function savePinned(s: Set<string>) {
  localStorage.setItem(PINNED_KEY, JSON.stringify([...s]));
}

function loadGroups(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}'); } catch { return {}; }
}

function saveGroups(g: Record<string, string>) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(g));
}

// ─── Confirmation dialog ──────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-panel border border-panel-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-base font-semibold text-foreground mb-1">{title}</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-panel-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${danger ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20' : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit description dialog ──────────────────────────────────────────────────

function EditProjectDialog({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(project.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(project.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? 'Failed to save');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-panel border border-panel-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Edit Project</h2>
              <p className="text-xs text-muted-foreground font-mono">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this project for?"
              className="w-full px-3.5 py-2.5 bg-background border border-panel-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              autoFocus
              disabled={saving}
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-panel-border rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Assign group dialog ──────────────────────────────────────────────────────

function AssignGroupDialog({
  project,
  currentGroup,
  existingGroups,
  onClose,
  onAssign,
}: {
  project: Project;
  currentGroup: string;
  existingGroups: string[];
  onClose: () => void;
  onAssign: (group: string) => void;
}) {
  const [value, setValue] = useState(currentGroup);
  const suggestions = [...new Set([...existingGroups, 'Work', 'Personal', 'Experiments'])].filter(g => g);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-panel border border-panel-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Assign to Group</h2>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Group name (or leave blank)"
            className="w-full px-3 py-2 bg-background border border-panel-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') onAssign(value.trim()); if (e.key === 'Escape') onClose(); }}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => setValue(s)}
                  className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${value === s ? 'bg-primary/20 border-primary/40 text-primary' : 'border-panel-border text-muted-foreground hover:border-primary/30 hover:text-foreground'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-panel-border rounded-lg transition-colors">Cancel</button>
            <button onClick={() => onAssign(value.trim())} className="px-4 py-1.5 text-xs bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-all">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card actions menu ────────────────────────────────────────────────────────

interface CardMenuProps {
  project: Project;
  isPinned: boolean;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onClose: () => void;
}

function CardMenu({ project, isPinned, onPin, onEdit, onDelete, onGroup, onClose }: CardMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [onClose]);

  const itemCls = 'flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-primary/10 hover:text-primary cursor-pointer rounded transition-colors select-none w-full text-left';

  return (
    <div
      ref={menuRef}
      className="absolute right-1 top-8 z-50 bg-panel border border-panel-border rounded-lg shadow-xl shadow-black/40 py-1 min-w-[160px] overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      <button className={itemCls} onClick={() => { onEdit(); onClose(); }}>
        <Pencil className="w-3.5 h-3.5 opacity-60" />
        Edit description
      </button>
      <button className={itemCls} onClick={() => { onPin(); onClose(); }}>
        {isPinned ? <StarOff className="w-3.5 h-3.5 opacity-60" /> : <Star className="w-3.5 h-3.5 opacity-60" />}
        {isPinned ? 'Unpin' : 'Pin to top'}
      </button>
      <button className={itemCls} onClick={() => { onGroup(); onClose(); }}>
        <FolderPlus className="w-3.5 h-3.5 opacity-60" />
        Assign group
      </button>
      <div className="my-1 border-t border-panel-border/60" />
      <button
        className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 cursor-pointer rounded transition-colors select-none w-full text-left"
        onClick={() => { onDelete(); onClose(); }}
      >
        <Trash2 className="w-3.5 h-3.5 opacity-70" />
        Delete project
      </button>
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onSelect,
  isSelecting,
  isPinned,
  onPin,
  onEdit,
  onDelete,
  onGroup,
}: {
  project: Project;
  onSelect: (name: string) => void;
  isSelecting: boolean;
  isPinned: boolean;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGroup: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const colorGradient = getProjectColor(project.name);
  const initials = getProjectInitials(project.name);

  return (
    <div className="group relative flex flex-col gap-0 p-0 bg-panel border border-panel-border rounded-xl text-left hover:border-primary/50 transition-all duration-150 overflow-hidden">
      {/* Card top accent */}
      <div className="h-0.5 w-full bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30 opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => onSelect(project.name)}
            disabled={isSelecting}
            className="flex items-center gap-3 min-w-0 flex-1 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {/* Color avatar */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${colorGradient} flex items-center justify-center shadow-lg`}>
              <span className="text-[13px] font-bold text-white tracking-tight">{initials}</span>
            </div>
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">{project.name}</p>
              {project.description ? (
                <p className="text-xs text-muted-foreground truncate mt-0.5 leading-snug">{project.description}</p>
              ) : (
                <p className="text-xs text-muted-foreground/35 mt-0.5 italic">No description</p>
              )}
            </div>
          </button>

          {/* Actions */}
          <div className="relative shrink-0 flex items-center gap-1 mt-0.5">
            {isPinned && (
              <Star className="w-3 h-3 text-amber-400 fill-amber-400 opacity-80" />
            )}
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-background transition-colors opacity-0 group-hover:opacity-100"
              title="Project actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <CardMenu
                project={project}
                isPinned={isPinned}
                onPin={onPin}
                onEdit={onEdit}
                onDelete={onDelete}
                onGroup={onGroup}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50">
          {project.createdAt && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(project.createdAt)}
            </span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            {isSelecting ? (
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
            ) : (
              <button
                onClick={() => onSelect(project.name)}
                disabled={isSelecting}
                className="flex items-center gap-1 text-muted-foreground/40 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
              >
                Open <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── New project dialog ───────────────────────────────────────────────────────

function getProjectNameError(name: string): string | null {
  if (!name) return null;
  if (name.length > 100) return 'Name must be 100 characters or fewer.';
  if (/\s/.test(name)) return 'Name must not contain spaces.';
  if (!/^[A-Za-z0-9]/.test(name)) return 'Name must start with a letter or number.';
  if (/[^A-Za-z0-9\-_.]/.test(name)) return 'Only letters, numbers, hyphens, underscores, and dots are allowed. No spaces.';
  if (name.includes('..')) return 'Name must not contain consecutive dots.';
  return null;
}

function NewProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  const { mutate: createProject, isPending, error } = useCreateProject({
    mutation: {
      onSuccess: (project) => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        onCreated(project.name);
      },
    },
  });

  const trimmedName = name.trim();
  const nameError = getProjectNameError(name);
  const isNameValid = trimmedName.length > 0 && nameError === null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNameValid) return;
    createProject({ data: { name: trimmedName, description: description.trim() || undefined } });
  };

  const serverErrorMessage = error
    ? ((error.data as { message?: string } | null)?.message ?? error.message)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-panel border border-panel-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FolderGit2 className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground">New Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Project Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              className={`w-full px-3.5 py-2.5 bg-background border rounded-lg text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 transition-all ${nameError ? 'border-destructive focus:border-destructive focus:ring-destructive' : 'border-panel-border focus:border-primary focus:ring-primary'}`}
              autoFocus
              disabled={isPending}
            />
            {nameError ? (
              <p className="mt-1.5 text-xs text-destructive">{nameError}</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Letters, numbers, hyphens, underscores, and dots. No spaces.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project for?"
              className="w-full px-3.5 py-2.5 bg-background border border-panel-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              disabled={isPending}
            />
          </div>

          {serverErrorMessage && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{serverErrorMessage}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-panel-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !isNameValid}
              className="px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Advanced path dialog ─────────────────────────────────────────────────────

function AdvancedPathDialog({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: () => void;
}) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { mutate: setWorkspace, isPending } = useSetWorkspace({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
        onSelect();
      },
      onError: (err) => {
        setError(err.message || 'Invalid path');
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) return;
    setError('');
    setWorkspace({ data: { root: trimmed } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-panel border border-panel-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted/40 border border-panel-border flex items-center justify-center">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Open Custom Path</h2>
              <p className="text-xs text-muted-foreground">Advanced — any directory on disk</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Workspace Root Path
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => { setPath(e.target.value); setError(''); }}
              placeholder="/home/user/projects/my-app"
              className="w-full px-3.5 py-2.5 bg-background border border-panel-border rounded-lg text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              autoFocus
              disabled={isPending}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Absolute path to any project directory on disk.
            </p>
          </div>
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-panel-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !path.trim()}
              className="px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Open
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onNewProject, onCustomPath }: { onNewProject: () => void; onCustomPath: () => void }) {
  const features = [
    { icon: Zap, label: 'AI-driven execution', desc: 'Agent plans, edits files, runs commands end-to-end' },
    { icon: GitBranch, label: 'Checkpoint system', desc: 'Accept or discard every change before it lands' },
    { icon: Terminal, label: 'Shell & test runner', desc: 'Runs real commands in your project environment' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 shadow-lg shadow-primary/5">
        <FolderGit2 className="w-10 h-10 text-primary/70" />
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-2">No projects yet</h2>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
        Create a project to start using VenomGPT. Each project maps to a directory on disk
        that the agent reads, edits, and runs.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-12">
        <button
          onClick={onNewProject}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
        <button
          onClick={onCustomPath}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-panel border border-panel-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 rounded-lg transition-all"
        >
          <FolderOpen className="w-4 h-4" />
          Open Custom Path
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl w-full">
        {features.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex flex-col items-center gap-2 p-4 bg-panel/60 border border-panel-border/60 rounded-xl text-center">
            <Icon className="w-4 h-4 text-primary/70 mb-1" />
            <p className="text-xs font-medium text-foreground">{label}</p>
            <p className="text-[11px] text-muted-foreground/70 leading-snug">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortOption = 'newest' | 'oldest' | 'az' | 'za' | 'pinned';

function sortProjects(projects: Project[], pinned: Set<string>, sort: SortOption): Project[] {
  const sorted = [...projects].sort((a, b) => {
    if (sort === 'pinned') {
      const pa = pinned.has(a.name) ? 0 : 1;
      const pb = pinned.has(b.name) ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    if (sort === 'newest' || sort === 'pinned') {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    }
    if (sort === 'oldest') {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return da - db;
    }
    if (sort === 'az') return a.name.localeCompare(b.name);
    if (sort === 'za') return b.name.localeCompare(a.name);
    return 0;
  });
  return sorted;
}

// ─── Sort dropdown ────────────────────────────────────────────────────────────

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  az: 'A → Z',
  za: 'Z → A',
  pinned: 'Pinned first',
};

function SortDropdown({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick, true);
    return () => document.removeEventListener('mousedown', handleClick, true);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-panel border border-panel-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{SORT_LABELS[value]}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 bg-panel border border-panel-border rounded-lg shadow-xl shadow-black/30 py-1 min-w-[160px] overflow-hidden">
          {(Object.keys(SORT_LABELS) as SortOption[]).map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 text-sm w-full text-left transition-colors ${value === opt ? 'text-primary bg-primary/10' : 'text-foreground hover:bg-primary/10 hover:text-primary'}`}
            >
              {SORT_LABELS[opt]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

interface HomeScreenProps {
  onProjectSelected: () => void;
}

export function HomeScreen({ onProjectSelected }: HomeScreenProps) {
  const [, navigate] = useLocation();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showAdvancedPath, setShowAdvancedPath] = useState(false);
  const [selectingProject, setSelectingProject] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [pinned, setPinned] = useState<Set<string>>(loadPinned);
  const [groups, setGroups] = useState<Record<string, string>>(loadGroups);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [groupingProject, setGroupingProject] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useListProjects();

  const { mutate: selectProject } = useSelectProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
        setSelectingProject(null);
        onProjectSelected();
      },
      onError: () => {
        setSelectingProject(null);
      },
    },
  });

  const handleSelectProject = (name: string) => {
    setSelectingProject(name);
    selectProject({ name });
  };

  const handleCreated = (name: string) => {
    setShowNewProject(false);
    handleSelectProject(name);
  };

  const togglePin = (name: string) => {
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      savePinned(next);
      return next;
    });
  };

  const handleAssignGroup = (name: string, group: string) => {
    setGroups(prev => {
      const next = { ...prev };
      if (group) next[name] = group;
      else delete next[name];
      saveGroups(next);
      return next;
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deletingProject) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(deletingProject.name)}`, { method: 'DELETE' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Delete failed: ${body.message ?? 'Unknown error'}`);
      }
    } catch {
      alert('Delete failed: network error');
    } finally {
      setIsDeleting(false);
      setDeletingProject(null);
    }
  };

  const projects = data?.projects ?? [];

  const processedProjects = useMemo(() => {
    let result = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
      );
    }
    return sortProjects(result, pinned, sort);
  }, [projects, search, sort, pinned]);

  // Group projects for display
  const groupedProjects = useMemo(() => {
    if (!Object.keys(groups).length) return null;
    const grouped: Record<string, Project[]> = {};
    const ungrouped: Project[] = [];
    for (const p of processedProjects) {
      const g = groups[p.name];
      if (g) {
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(p);
      } else {
        ungrouped.push(p);
      }
    }
    return { grouped, ungrouped };
  }, [processedProjects, groups]);

  const existingGroups = [...new Set(Object.values(groups))];

  const renderGrid = (items: Project[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-w-6xl">
      {items.map(project => (
        <ProjectCard
          key={project.name}
          project={project}
          onSelect={handleSelectProject}
          isSelecting={selectingProject === project.name}
          isPinned={pinned.has(project.name)}
          onPin={() => togglePin(project.name)}
          onEdit={() => setEditingProject(project)}
          onDelete={() => setDeletingProject(project)}
          onGroup={() => setGroupingProject(project)}
        />
      ))}
    </div>
  );

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-panel border-r border-panel-border flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 text-primary mb-1">
            <TerminalSquare className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm">VenomGPT</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 leading-snug">AI Coding Workspace</p>
        </div>

        <div className="mx-4 h-px bg-panel-border/80" />

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
            <FolderOpen className="w-4 h-4" />
            <span>Projects</span>
            {projects.length > 0 && (
              <span className="ml-auto text-[10px] font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                {projects.length}
              </span>
            )}
          </div>
        </nav>

        {/* Sidebar footer */}
        <div className="p-2 border-t border-panel-border space-y-0.5">
          <button
            onClick={() => setShowAdvancedPath(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-xs"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open Custom Path</span>
          </button>
          <button
            onClick={() => navigate('/integrations')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-sm"
          >
            <Plug className="w-4 h-4" />
            <span>Integrations</span>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-sm"
          >
            <Settings2 className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Page header */}
        <div className="px-8 pt-8 pb-5 flex items-center justify-between gap-4 border-b border-panel-border/40 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-foreground">Projects</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading
                ? 'Loading…'
                : projects.length === 0
                ? 'No projects yet — create one to get started'
                : `${projects.length} project${projects.length !== 1 ? 's' : ''} — select one to open in the workspace`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Always show search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="pl-8 pr-3 py-2 text-sm bg-panel border border-panel-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 w-48 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <SortDropdown value={sort} onChange={setSort} />
            <button
              onClick={() => setShowNewProject(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center gap-3 text-muted-foreground px-8 py-10">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading projects…</span>
            </div>
          )}

          {error && (
            <div className="mx-8 mt-8 flex items-center gap-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 max-w-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Failed to load projects.{' '}
                <button onClick={() => refetch()} className="underline hover:no-underline inline-flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </span>
            </div>
          )}

          {!isLoading && !error && projects.length === 0 && (
            <EmptyState
              onNewProject={() => setShowNewProject(true)}
              onCustomPath={() => setShowAdvancedPath(true)}
            />
          )}

          {!isLoading && !error && projects.length > 0 && processedProjects.length === 0 && (
            <div className="px-8 py-10 text-center">
              <p className="text-sm text-muted-foreground">No projects match "{search}"</p>
              <button onClick={() => setSearch('')} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
            </div>
          )}

          {!isLoading && !error && processedProjects.length > 0 && (
            <div className="px-8 py-6">
              {groupedProjects ? (
                <div className="space-y-8 max-w-6xl">
                  {Object.entries(groupedProjects.grouped).map(([groupName, items]) => (
                    <div key={groupName}>
                      <div className="flex items-center gap-2 mb-3">
                        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/60" />
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{groupName}</h3>
                        <span className="text-[10px] text-muted-foreground/50 bg-muted/30 px-1.5 py-0.5 rounded-full">{items.length}</span>
                      </div>
                      {renderGrid(items)}
                    </div>
                  ))}
                  {groupedProjects.ungrouped.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-widest">Ungrouped</h3>
                      </div>
                      {renderGrid(groupedProjects.ungrouped)}
                    </div>
                  )}
                </div>
              ) : (
                renderGrid(processedProjects)
              )}
            </div>
          )}
        </div>
      </main>

      {/* Dialogs */}
      {showNewProject && (
        <NewProjectDialog
          onClose={() => setShowNewProject(false)}
          onCreated={handleCreated}
        />
      )}

      {showAdvancedPath && (
        <AdvancedPathDialog
          onClose={() => setShowAdvancedPath(false)}
          onSelect={onProjectSelected}
        />
      )}

      {editingProject && (
        <EditProjectDialog
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })}
        />
      )}

      {deletingProject && (
        <ConfirmDialog
          title="Delete project?"
          message={`"${deletingProject.name}" and all its files will be permanently deleted. This cannot be undone.`}
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingProject(null)}
          danger
        />
      )}

      {groupingProject && (
        <AssignGroupDialog
          project={groupingProject}
          currentGroup={groups[groupingProject.name] ?? ''}
          existingGroups={existingGroups}
          onClose={() => setGroupingProject(null)}
          onAssign={(group) => {
            handleAssignGroup(groupingProject.name, group);
            setGroupingProject(null);
          }}
        />
      )}
    </div>
  );
}
