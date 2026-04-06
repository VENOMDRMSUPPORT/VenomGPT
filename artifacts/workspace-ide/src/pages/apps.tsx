import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useCreateProject,
  useSelectProject,
  useGetWorkspace,
  getListProjectsQueryKey,
  getGetWorkspaceQueryKey,
  getListFilesQueryKey,
  type Project,
} from "@workspace/api-client-react";
import {
  LayoutGrid, FolderPlus, Check, Trash2, Pencil, ChevronRight,
  Loader2, AlertCircle, FolderOpen, X, Plus,
} from "lucide-react";
import PageLayout from "@/components/layout/page-layout";
import { useTheme } from "@/lib/theme-context";
import { format } from "date-fns";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try { return format(new Date(iso), 'MMM d, yyyy'); } catch { return '—'; }
}

// ─── Create project form ───────────────────────────────────────────────────────

function CreateProjectForm({ onCancel }: { onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const { mutate: createProject, isPending } = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        onCancel();
      },
      onError: (err: unknown) => {
        const body = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
        if (body?.error === 'invalid_name') {
          setFieldError(body.message ?? 'Invalid project name. Use letters, numbers, hyphens, underscores, or dots.');
        } else if (body?.error === 'already_exists') {
          setFieldError(`A project named "${name.trim()}" already exists.`);
        } else {
          setFieldError('Failed to create project. Please try again.');
        }
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    const trimmed = name.trim();
    if (!trimmed) { setFieldError('Project name is required.'); return; }
    createProject({ data: { name: trimmed, description: description.trim() || undefined } });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-panel-border/60 bg-panel-bg p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-foreground">New Project</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">Name *</label>
        <input
          autoFocus
          value={name}
          onChange={e => { setName(e.target.value); setFieldError(null); }}
          placeholder="my-project"
          disabled={isPending}
          className="w-full px-3 py-2 rounded-lg border border-panel-border/60 bg-background text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 disabled:opacity-50 transition-colors"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">Description (optional)</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What is this project for?"
          disabled={isPending}
          className="w-full px-3 py-2 rounded-lg border border-panel-border/60 bg-background text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 disabled:opacity-50 transition-colors"
        />
      </div>

      {fieldError && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-[12px] text-red-400/80">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{fieldError}</span>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="px-3 py-1.5 rounded-lg border border-panel-border/60 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-sm text-primary hover:bg-primary/15 transition-colors disabled:opacity-40"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Create
        </button>
      </div>
    </form>
  );
}

// ─── Inline description editor ─────────────────────────────────────────────────

function DescriptionEditor({
  project,
  onDone,
}: {
  project: Project;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(project.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(project.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: value.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? 'Failed to save.');
        setSaving(false);
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      onDone();
    } catch {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 space-y-1.5">
      <input
        autoFocus
        value={value}
        onChange={e => { setValue(e.target.value); setError(null); }}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone(); }}
        placeholder="Add a description…"
        disabled={saving}
        className="w-full px-2.5 py-1.5 rounded-lg border border-panel-border/60 bg-background text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 disabled:opacity-50 transition-colors"
      />
      {error && <p className="text-[11px] text-red-400/70">{error}</p>}
      <div className="flex gap-1.5">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-[11px] text-primary hover:bg-primary/15 transition-colors disabled:opacity-40"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          Save
        </button>
        <button
          onClick={onDone}
          disabled={saving}
          className="px-2.5 py-1 rounded-lg border border-panel-border/60 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Delete confirmation dialog ────────────────────────────────────────────────

function DeleteDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(project.name)}`, {
        method: 'DELETE',
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? 'Cannot delete the currently active project. Switch to a different workspace first.');
        setDeleting(false);
        return;
      }
      if (res.status === 404 || res.ok) {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        onClose();
        return;
      }
      const body = await res.json().catch(() => ({})) as { message?: string };
      setError(body.message ?? 'Failed to delete project.');
      setDeleting(false);
    } catch {
      setError('Network error. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-xl border border-red-500/30 bg-panel-bg shadow-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-red-400/70" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Delete project?</p>
            <p className="text-[12px] text-muted-foreground/70 mt-0.5">
              <span className="font-mono text-foreground/80">{project.name}</span> and all its files will be permanently removed.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-[12px] text-red-400/80">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-3 py-1.5 rounded-lg border border-panel-border/60 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-40"
          >
            {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  isActive,
  isSelecting,
  onSelect,
  onDeleted,
}: {
  project: Project;
  isActive: boolean;
  isSelecting: boolean;
  onSelect: (name: string) => void;
  onDeleted: () => void;
}) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  return (
    <>
      {showDelete && (
        <DeleteDialog
          project={project}
          onClose={() => { setShowDelete(false); onDeleted(); }}
        />
      )}
      <div className={`rounded-xl border transition-all ${
        isActive
          ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
          : 'border-panel-border/60 bg-panel-bg hover:border-panel-border'
      }`}>
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isActive ? 'bg-primary/15 border border-primary/30' : 'bg-muted/30 border border-panel-border/50'
              }`}>
                <FolderOpen className={`w-4 h-4 ${isActive ? 'text-primary/80' : 'text-muted-foreground/50'}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground truncate">{project.name}</span>
                  {isActive && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-[10px] text-primary/80 font-semibold shrink-0">
                      <Check className="w-2.5 h-2.5" />
                      Active
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground/40">{formatDate(project.createdAt)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setEditingDesc(v => !v)}
                title="Edit description"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowDelete(true)}
                title="Delete project"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-red-400/70 hover:bg-red-500/8 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Description row */}
          {!editingDesc && (
            <p
              className={`mt-2 text-[12px] cursor-pointer ${
                project.description
                  ? 'text-muted-foreground/60'
                  : 'text-muted-foreground/30 italic'
              } hover:text-muted-foreground/80 transition-colors`}
              onClick={() => setEditingDesc(true)}
            >
              {project.description ?? 'Add a description…'}
            </p>
          )}

          {editingDesc && (
            <DescriptionEditor project={project} onDone={() => setEditingDesc(false)} />
          )}

          {/* Activate button */}
          {!isActive && (
            <div className="mt-3 pt-3 border-t border-panel-border/40">
              <button
                onClick={() => onSelect(project.name)}
                disabled={isSelecting}
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60 hover:text-primary/80 transition-colors disabled:opacity-40"
              >
                {isSelecting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
                Use this workspace
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted/20 border border-panel-border/50 flex items-center justify-center">
        <FolderPlus className="w-6 h-6 text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground/80">No projects yet</p>
        <p className="text-[12px] text-muted-foreground/50 mt-1 max-w-xs leading-relaxed">
          Create your first project to organize your workspace and switch between codebases.
        </p>
      </div>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-sm text-primary hover:bg-primary/15 transition-colors"
      >
        <FolderPlus className="w-4 h-4" />
        Create first project
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AppsPage() {
  const { tm } = useTheme();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [selectingProject, setSelectingProject] = useState<string | null>(null);

  // Sub-group A: project list
  const { data, isLoading, error } = useListProjects();
  const projects = data?.projects ?? [];

  // Sub-group B: active workspace (read from verified source — useGetWorkspace)
  const { data: workspaceData } = useGetWorkspace();
  const activeRoot = workspaceData?.root ?? null;

  // Sub-group B: workspace select
  const { mutate: selectProject } = useSelectProject({
    mutation: {
      onSuccess: () => {
        // Confirmed invalidation pattern from home-screen.tsx:852-853
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
        setSelectingProject(null);
      },
      onError: () => {
        setSelectingProject(null);
      },
    },
  });

  const handleSelect = (name: string) => {
    setSelectingProject(name);
    selectProject({ name });
  };

  return (
    <PageLayout
      activePage="apps"
      header={
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <LayoutGrid style={{ width: 17, height: 17, color: tm.accent, flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: tm.textPrimary, lineHeight: 1.2 }}>Projects</span>
            <span style={{ fontSize: 10.5, color: tm.textMuted, lineHeight: 1.2 }}>Manage your workspaces and coding projects</span>
          </div>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto px-6 py-8 w-full space-y-4">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-foreground">Projects</h1>
            {projects.length > 0 && (
              <p className="text-[12px] text-muted-foreground/50 mt-0.5">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
                {activeRoot && ` · 1 active`}
              </p>
            )}
          </div>
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-sm text-primary hover:bg-primary/15 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New project
            </button>
          )}
        </div>

        {/* Create form */}
        {showCreate && (
          <CreateProjectForm onCancel={() => setShowCreate(false)} />
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center gap-3 py-12 justify-center text-muted-foreground/40">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading projects…</span>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm text-red-400/80">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Failed to load projects. Check your connection and try again.</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && projects.length === 0 && !showCreate && (
          <EmptyState onNew={() => setShowCreate(true)} />
        )}

        {/* Project list */}
        {!isLoading && !error && projects.length > 0 && (
          <div className="space-y-3">
            {projects.map(project => (
              <ProjectCard
                key={project.name}
                project={project}
                isActive={!!(activeRoot && project.path && activeRoot === project.path)}
                isSelecting={selectingProject === project.name}
                onSelect={handleSelect}
                onDeleted={() => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })}
              />
            ))}
          </div>
        )}

      </div>
    </PageLayout>
  );
}
