import { useState, useCallback, useRef, useEffect } from 'react';
import { useIdeStore } from '@/store/use-ide-store';
import {
  ArrowLeft, Plus, Loader2, Sparkles, X,
} from 'lucide-react';

export function NewTaskSurface() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const createChildTask = useIdeStore(s => s.createChildTask);
  const setMainView     = useIdeStore(s => s.setMainView);
  const setActiveBoardTaskId = useIdeStore(s => s.setActiveBoardTaskId);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    setMainView('editor');
  }, [setMainView]);

  const handleSubmit = useCallback(async () => {
    const prompt = [title.trim(), description.trim()].filter(Boolean).join('\n\n');
    if (!prompt || submitting) return;
    setSubmitting(true);
    try {
      const task = await createChildTask(prompt);
      if (task) {
        setActiveBoardTaskId(task.id);
        setMainView('editor');
      }
    } catch { } finally {
      setSubmitting(false);
    }
  }, [title, description, submitting, createChildTask, setMainView, setActiveBoardTaskId]);

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClose();
    }
    if (e.key === 'Enter') {
      textareaRef.current?.focus();
    }
  };

  const canSubmit = (title.trim() || description.trim()) && !submitting;

  return (
    <div className="ide-editor-area bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-11 flex items-center gap-2 px-4 border-b border-panel-border shrink-0 bg-panel/50">
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 text-muted-foreground/50 hover:text-foreground/80 transition-colors text-xs"
          title="Cancel (Esc)"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="w-px h-4 bg-panel-border mx-1" />
        <Sparkles className="w-3.5 h-3.5 text-primary/60 shrink-0" />
        <span className="text-sm font-semibold text-foreground">New Task</span>
        <button
          onClick={handleClose}
          className="ml-auto p-1 text-muted-foreground/30 hover:text-foreground/60 rounded transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Planning surface body */}
      <div className="flex-1 overflow-y-auto vg-scroll min-h-0 flex flex-col">
        <div className="flex-1 max-w-2xl w-full mx-auto px-6 pt-10 pb-4">
          {/* Title input */}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="Task title…"
            autoFocus
            className="w-full bg-transparent text-2xl font-semibold text-foreground placeholder:text-muted-foreground/25 focus:outline-none mb-4 border-none resize-none leading-tight"
          />

          {/* Divider */}
          <div className="border-t border-panel-border/40 mb-4" />

          {/* Description / detail area */}
          <textarea
            ref={textareaRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Describe the task in detail… (Enter to submit, Shift+Enter for new line)"
            rows={8}
            className="w-full bg-transparent text-sm text-foreground/80 placeholder:text-muted-foreground/25 focus:outline-none resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* Bottom composer bar */}
      <div className="border-t border-panel-border shrink-0 bg-panel/30 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="flex-1 text-xs text-muted-foreground/30">
            {canSubmit
              ? 'Press Enter to create task, or click the button →'
              : 'Enter a title or description to continue'}
          </div>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 rounded text-xs text-muted-foreground/50 hover:text-foreground/70 border border-transparent hover:border-panel-border/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary text-background text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {submitting
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Plus className="w-3 h-3" />
            }
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}
