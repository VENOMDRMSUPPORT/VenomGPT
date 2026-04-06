import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Square, X, Sparkles, AlertCircle, Plus, Paperclip, Circle, Camera, ChevronDown, Loader2, Check } from 'lucide-react';
import { useStartAgentTask } from '@workspace/api-client-react';
import { getListAgentTasksQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useIdeStore } from '@/store/use-ide-store';
import { compressImage } from '@/lib/imageUtils';
import { useOptimizePrompt } from '@/hooks/use-optimize-prompt';

const MAX_IMAGES = 5;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_PROMPT_CHIPS = 3;

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

export function WorkspaceComposer() {
  const queryClient = useQueryClient();

  const activeTaskId           = useIdeStore(s => s.activeTaskId);
  const startActiveTask        = useIdeStore(s => s.startActiveTask);
  const clearActiveTask        = useIdeStore(s => s.clearActiveTask);
  const pendingNewTaskPrompt   = useIdeStore(s => s.pendingNewTaskPrompt);
  const setPendingNewTaskPrompt = useIdeStore(s => s.setPendingNewTaskPrompt);
  const setPendingSubmitPrompt = useIdeStore(s => s.setPendingSubmitPrompt);

  const isRunning = activeTaskId !== null;

  const [prompt, setPrompt]               = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [imageError, setImageError]       = useState<string | null>(null);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const [isFocused, setIsFocused]         = useState(false);
  const [planMode, setPlanMode]           = useState(false);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);

  // Fetch board prompts when idle (no active task) to populate suggestion chips
  useEffect(() => {
    if (activeTaskId !== null) return;
    let cancelled = false;
    async function fetchSuggestions() {
      try {
        const res = await fetch(`${API_BASE}/api/board/prompts`);
        if (!res.ok || cancelled) return;
        const body = await res.json() as { prompts: { index: number; prompt: string }[] };
        const unique = Array.from(
          new Map((body.prompts ?? []).map(p => [p.prompt.slice(0, 80), p.prompt])).values()
        );
        if (!cancelled) setPromptSuggestions(unique.slice(-MAX_PROMPT_CHIPS).reverse());
      } catch { }
    }
    void fetchSuggestions();
    return () => { cancelled = true; };
  }, [activeTaskId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPromptRef = useRef<string>('');

  const { optimize, isOptimizing, optimizedResult, clearResult, error: optimizeError } = useOptimizePrompt();

  const { mutate: startTask, isPending } = useStartAgentTask({
    mutation: {
      onSuccess: (data: { taskId: string }) => {
        startActiveTask(data.taskId, pendingPromptRef.current);
        setPendingSubmitPrompt(null);
        setPrompt('');
        clearResult();
        setAttachedImages([]);
        setImageError(null);
        setSubmitError(null);
        queryClient.invalidateQueries({ queryKey: getListAgentTasksQueryKey() });
      },
      onError: (err: unknown) => {
        setPendingSubmitPrompt(null);
        const body = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
        setSubmitError(body?.message ?? 'Task submission failed. Please try again.');
      },
    },
  });

  const disabled = isPending || isRunning || isOptimizing;
  const canSubmit = prompt.trim().length > 0 && !disabled;

  const persistAsset = useCallback(async (content: string, filename: string) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const isDataUrl = content.startsWith('data:');
    try {
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `attached_assets/${ts}_${filename}`, content, ...(isDataUrl ? { encoding: 'dataurl' } : {}) }),
      });
    } catch { /* silent */ }
  }, []);

  const persistPrompt = useCallback(async (promptText: string) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    try {
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `attached_assets/${ts}_prompt.md`, content: promptText }),
      });
    } catch { /* silent */ }
  }, []);

  const handleSubmit = useCallback((promptText: string, images: string[], plan: boolean) => {
    const planPrefix = plan ? 'Think step-by-step and write a thorough plan before implementing anything. Show the plan first, then proceed.\n\n' : '';
    const fullPrompt = planPrefix + promptText;
    pendingPromptRef.current = promptText;
    setPendingSubmitPrompt(promptText);
    const payload: { prompt: string; images?: string[] } = { prompt: fullPrompt };
    if (images.length > 0) payload.images = images;
    void persistPrompt(fullPrompt);
    startTask({ data: payload });
  }, [startTask, persistPrompt, setPendingSubmitPrompt]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const totalBytes = attachedImages.reduce((s, i) => s + i.length, 0);
    if (attachedImages.length > 0 && totalBytes > 25 * 1024 * 1024) {
      setImageError('Total image payload is too large. Remove some images and try again.');
      return;
    }
    handleSubmit(prompt.trim(), attachedImages, planMode);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) handleFormSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleOptimize = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled || isOptimizing) return;
    void optimize(trimmed);
  }, [prompt, disabled, isOptimizing, optimize]);

  const handleAcceptOptimized = useCallback(() => {
    if (optimizedResult) {
      setPrompt(optimizedResult);
    }
    clearResult();
  }, [optimizedResult, clearResult]);

  const handleDismissOptimized = useCallback(() => {
    clearResult();
  }, [clearResult]);

  const handleCancel = useCallback(async () => {
    if (!activeTaskId) return;
    try {
      await fetch(`/api/agent/tasks/${activeTaskId}/cancel`, { method: 'POST' });
      clearActiveTask();
      queryClient.invalidateQueries({ queryKey: getListAgentTasksQueryKey() });
    } catch { /* silent */ }
  }, [activeTaskId, clearActiveTask, queryClient]);

  const addImages = useCallback(async (files: File[]) => {
    setImageError(null);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    const remaining = MAX_IMAGES - attachedImages.length;
    const toProcess = imageFiles.slice(0, remaining);
    if (imageFiles.length > remaining) setImageError(`Max ${MAX_IMAGES} images. ${imageFiles.length - remaining} skipped.`);
    const results: string[] = [];
    for (const file of toProcess) {
      if (file.size > MAX_SOURCE_BYTES) { setImageError(`"${file.name}" too large.`); continue; }
      try {
        const compressed = await compressImage(file);
        results.push(compressed);
        const originalName = file.name && file.name !== 'image.png' && file.name !== 'blob'
          ? file.name : 'pasted_image.jpg';
        void persistAsset(compressed, originalName);
      } catch (err) { setImageError(err instanceof Error ? err.message : 'Could not process image.'); }
    }
    if (results.length > 0) setAttachedImages(prev => [...prev, ...results]);
  }, [attachedImages.length, persistAsset]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    await addImages(imageItems.map(i => i.getAsFile()).filter(Boolean) as File[]);
  }, [addImages]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addImages(Array.from(e.target.files ?? []));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addImages]);

  const removeImage = (idx: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== idx));
    setImageError(null);
  };

  const handleSuggestedPrompt = (text: string) => {
    setPrompt(text);
    clearResult();
  };

  useEffect(() => {
    if (!pendingNewTaskPrompt || disabled) return;
    handleSubmit(pendingNewTaskPrompt, [], false);
    setPendingNewTaskPrompt(null);
  }, [pendingNewTaskPrompt, disabled, handleSubmit, setPendingNewTaskPrompt]);

  return (
    <div
      className="workspace-composer shrink-0 border-t border-panel-border px-3 pt-2.5 pb-3"
      style={{ background: 'rgba(10, 6, 16, 0.92)' }}
    >
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />

      <form onSubmit={handleFormSubmit}>
        {/* Glassmorphism card */}
        <div
          className={`rounded-xl border transition-all duration-150 overflow-hidden ${
            isFocused ? 'border-primary/40 ring-1 ring-primary/10' : 'border-white/10 hover:border-white/15'
          } ${disabled ? 'opacity-60' : ''}`}
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Image chips */}
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2.5 pt-2 pb-1">
              {attachedImages.map((src, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-1.5 py-0.5 text-[11px] group">
                  <img src={src} alt="" className="w-3.5 h-3.5 rounded object-cover" />
                  <span className="text-muted-foreground font-mono max-w-[60px] truncate">img-{i + 1}</span>
                  <button type="button" onClick={() => removeImage(i)} className="text-muted-foreground/40 hover:text-foreground">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            value={prompt}
            onChange={e => { setPrompt(e.target.value); clearResult(); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isRunning ? 'Agent is working…' : 'Ask questions, plan your work...'}
            className="w-full min-h-[72px] max-h-[140px] bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none leading-relaxed"
            disabled={disabled || isOptimizing}
          />

          {/* Optimize preview panel */}
          {(optimizedResult || optimizeError) && (
            <div className="mx-2.5 mb-2 rounded-lg border border-white/10 overflow-hidden">
              {optimizedResult && (
                <>
                  <div className="px-3 py-1.5 bg-white/4 border-b border-white/8 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-[11px] font-medium text-primary">Optimized prompt</span>
                  </div>
                  <div className="px-3 py-2 text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {optimizedResult}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 border-t border-white/8 bg-white/2">
                    <button
                      type="button"
                      onClick={handleAcceptOptimized}
                      className="flex items-center gap-1 h-6 px-2.5 rounded-md text-[11px] font-medium bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all"
                    >
                      <Check className="w-3 h-3" />
                      Use this
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissOptimized}
                      className="flex items-center gap-1 h-6 px-2.5 rounded-md text-[11px] font-medium text-muted-foreground/60 border border-white/10 hover:text-foreground hover:bg-white/8 transition-all"
                    >
                      Keep original
                    </button>
                  </div>
                </>
              )}
              {optimizeError && (
                <div className="flex items-start gap-2 px-3 py-2">
                  <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-[11px] text-red-400 leading-relaxed flex-1">{optimizeError}</span>
                  <button
                    type="button"
                    onClick={handleDismissOptimized}
                    className="text-red-400/50 hover:text-red-400 transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Suggested prompts — shown when idle and input is empty, fetched from /board/prompts */}
          {!isRunning && !prompt.trim() && promptSuggestions.length > 0 ? (
            <>
              <div className="h-px mx-3 bg-white/8" />
              <div className="flex flex-wrap gap-1.5 px-3 py-2">
                {promptSuggestions.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => handleSuggestedPrompt(text)}
                    disabled={disabled}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground/70 border border-white/8 bg-white/4 hover:bg-white/10 hover:text-foreground hover:border-white/15 transition-all duration-100 disabled:opacity-30 max-w-[180px] truncate"
                    title={text}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <div className="h-px mx-3 bg-white/8" />
            </>
          ) : (
            <div className="h-px mx-3 bg-white/8" />
          )}

          {/* Control bar */}
          <div className="flex items-center gap-0.5 px-2 pb-1.5 pt-0.5">
            <button
              type="button"
              disabled={disabled}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/8 disabled:opacity-30 transition-all"
              title="Add"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || attachedImages.length >= MAX_IMAGES}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/8 disabled:opacity-30 transition-all"
              title="Attach file"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleOptimize}
              disabled={!prompt.trim() || disabled || isOptimizing}
              className={`h-7 px-2 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all border ${
                optimizedResult
                  ? 'text-primary bg-primary/15 border-primary/30'
                  : 'text-muted-foreground/50 hover:text-foreground hover:bg-white/8 border-transparent'
              } disabled:opacity-30`}
              title="Optimize prompt"
            >
              {isOptimizing
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Sparkles className="w-3 h-3" />
              }
              {isOptimizing ? 'Optimizing…' : 'Optimize'}
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setPlanMode(p => !p)}
              disabled={disabled}
              className={`h-7 px-2 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all border ${
                planMode
                  ? 'text-primary bg-primary/15 border-primary/30'
                  : 'text-muted-foreground/50 hover:text-foreground hover:bg-white/8 border-transparent'
              } disabled:opacity-40`}
              title="Plan mode"
            >
              <Circle className="w-3 h-3" />
              Plan
            </button>

            <div className="w-px h-4 bg-white/10 mx-1.5" />

            {isRunning && (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-all"
                title="Stop task"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            )}

            {!isRunning && (
              <>
                <button
                  type="button"
                  className="flex items-center gap-0.5 px-1.5 h-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/8 transition-all"
                  title="Camera / screenshot"
                  tabIndex={-1}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <ChevronDown className="w-3 h-3" />
                </button>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/85 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Run task (Enter) · Shift+Enter for new line"
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
              </>
            )}
          </div>
        </div>

        {imageError && (
          <p className="mt-1.5 text-[11px] text-amber-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />{imageError}
          </p>
        )}

        {submitError && (
          <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
            <span className="text-[11px] text-red-400 leading-relaxed flex-1">{submitError}</span>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="text-red-400/50 hover:text-red-400 transition-colors shrink-0"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
