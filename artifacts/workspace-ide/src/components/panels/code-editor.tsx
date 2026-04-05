import { useRef, useEffect, useState, useMemo } from 'react';
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react';
import { useIdeStore } from '@/store/use-ide-store';
import type { OpenFile } from '@/store/use-ide-store';
import { FileCode2, ArrowLeftRight, Check, X, Loader2 } from 'lucide-react';
import { useWriteFile } from '@workspace/api-client-react';
import { toast } from '@/hooks/use-toast';
import { applyUnifiedDiff } from '@/lib/applyDiff';

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

interface StagedInfo {
  taskId: string;
  stagedContent: string;
  otherTaskCount: number;
}

interface CheckpointEventData {
  taskId?: string;
  status?: string;
  staged?: boolean;
  liveUnchanged?: boolean;
  files?: Array<{ path: string; diff?: string; existed?: boolean }>;
}

export function CodeEditor() {
  const { openFiles, activeFilePath, updateFileContent, markFileClean, openFile } = useIdeStore();
  const activeFile = openFiles.find(f => f.path === activeFilePath);
  const taskLogs = useIdeStore(s => s.taskLogs);
  const viewingTaskId = useIdeStore(s => s.viewingTaskId);
  const monaco = useMonaco();
  const { mutate: saveFile } = useWriteFile();
  const editorRef = useRef<unknown>(null);

  const activeFileRef = useRef<OpenFile | undefined>(activeFile);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  const [dismissedFiles, setDismissedFiles] = useState<Set<string>>(new Set());
  const [applyLoading, setApplyLoading] = useState(false);
  const [discardLoading, setDiscardLoading] = useState(false);

  useEffect(() => {
    if (monaco) {
      monaco.editor.defineTheme('venomgpt-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#09090b',
          'editor.lineHighlightBackground': '#18181b',
          'editorLineNumber.foreground': '#3f3f46',
          'editorLineNumber.activeForeground': '#71717a',
        },
      });
      monaco.editor.setTheme('venomgpt-dark');
    }
  }, [monaco]);

  const stagedInfo = useMemo<StagedInfo | null>(() => {
    if (!activeFile || !viewingTaskId) return null;
    if (dismissedFiles.has(activeFile.path)) return null;

    const logs = taskLogs[viewingTaskId] ?? [];
    const checkpointLog = [...logs].reverse().find(l => l.type === 'checkpoint');
    if (!checkpointLog?.data) return null;

    const data = checkpointLog.data as unknown as CheckpointEventData;
    if (!data.staged && data.status !== 'pending') return null;

    const fileEntry = data.files?.find(f => f.path === activeFile.path);
    if (!fileEntry || !fileEntry.diff) return null;

    const stagedContent = applyUnifiedDiff(activeFile.content, fileEntry.diff);
    return {
      taskId: data.taskId ?? viewingTaskId,
      stagedContent,
      otherTaskCount: 0,
    };
  }, [taskLogs, viewingTaskId, activeFile, dismissedFiles]);

  const handleSave = () => {
    const current = activeFileRef.current;
    if (current && current.isDirty) {
      saveFile(
        { data: { path: current.path, content: current.content } },
        {
          onSuccess: () => markFileClean(current.path),
          onError: (err) => {
            toast({
              title: 'Save failed',
              description: err instanceof Error ? err.message : 'Could not write file',
              variant: 'destructive',
            });
          },
        }
      );
    }
  };

  const handleEditorDidMount = (editor: unknown) => {
    editorRef.current = editor;
    if (!monaco) return;
    (editor as { addCommand: (keybinding: number, handler: () => void) => void }).addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => handleSave()
    );
  };

  const handleApplyFile = async () => {
    if (!stagedInfo || !activeFile) return;
    setApplyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/tasks/${stagedInfo.taskId}/apply-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: activeFile.path }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        toast({ title: 'Apply failed', description: err.message ?? 'Unknown error', variant: 'destructive' });
        return;
      }
      const fileRes = await fetch(`${API_BASE}/api/files/read?path=${encodeURIComponent(activeFile.path)}`);
      if (fileRes.ok) {
        const fileData = await fileRes.json() as { path: string; content: string; language: string };
        openFile({ path: fileData.path, content: fileData.content, language: fileData.language, isDirty: false });
      }
      setDismissedFiles(prev => new Set([...prev, activeFile.path]));
      toast({ title: 'File applied', description: `${activeFile.path.split('/').pop()} promoted to workspace` });
    } catch (e) {
      toast({ title: 'Apply failed', description: String(e), variant: 'destructive' });
    } finally {
      setApplyLoading(false);
    }
  };

  const handleDiscardFile = async () => {
    if (!stagedInfo || !activeFile) return;
    setDiscardLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agent/tasks/${stagedInfo.taskId}/discard-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: activeFile.path }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        toast({ title: 'Discard failed', description: err.message ?? 'Unknown error', variant: 'destructive' });
        return;
      }
      setDismissedFiles(prev => new Set([...prev, activeFile.path]));
      toast({ title: 'Changes discarded', description: `Staged changes for ${activeFile.path.split('/').pop()} removed` });
    } catch (e) {
      toast({ title: 'Discard failed', description: String(e), variant: 'destructive' });
    } finally {
      setDiscardLoading(false);
    }
  };

  if (openFiles.length === 0) {
    return (
      <div className="ide-editor-area bg-background flex flex-col items-center justify-center text-muted-foreground select-none">
        <FileCode2 className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-sm text-muted-foreground/60">Select a file from the explorer to start editing</p>
        <p className="text-xs text-muted-foreground/30 mt-1">Open a file from the explorer on the right</p>
      </div>
    );
  }

  return (
    <div className="ide-editor-area bg-background flex flex-col overflow-hidden">
      {stagedInfo && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 border-b border-panel-border shrink-0">
            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-400 font-medium">Staged changes — live workspace unchanged</span>
            <div className="flex-1" />
            <button
              onClick={handleDiscardFile}
              disabled={discardLoading || applyLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-colors disabled:opacity-50"
            >
              {discardLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              Discard
            </button>
            <button
              onClick={handleApplyFile}
              disabled={applyLoading || discardLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-zinc-900 bg-amber-400 hover:bg-amber-300 transition-colors disabled:opacity-50"
            >
              {applyLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Apply
            </button>
          </div>
          {stagedInfo.otherTaskCount > 0 && (
            <div className="px-3 py-1 bg-amber-900/20 border-b border-amber-700/30 shrink-0">
              <span className="text-xs text-amber-300">
                {stagedInfo.otherTaskCount} other task{stagedInfo.otherTaskCount !== 1 ? 's' : ''} also staged changes to this file
              </span>
            </div>
          )}
        </>
      )}

      <div className="flex-1 relative overflow-hidden">
        {activeFile && stagedInfo ? (
          <DiffEditor
            height="100%"
            originalLanguage={activeFile.language || 'plaintext'}
            modifiedLanguage={activeFile.language || 'plaintext'}
            original={activeFile.content}
            modified={stagedInfo.stagedContent}
            theme="venomgpt-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              renderLineHighlight: 'line',
              wordWrap: 'off',
              renderSideBySide: true,
            }}
          />
        ) : (
          activeFile && (
            <Editor
              height="100%"
              path={activeFile.path}
              language={activeFile.language || 'plaintext'}
              value={activeFile.content}
              theme="venomgpt-dark"
              onChange={(value) => updateFileContent(activeFile.path, value ?? '')}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                bracketPairColorization: { enabled: true },
                wordWrap: 'off',
              }}
            />
          )
        )}
      </div>
    </div>
  );
}
