import { useRef, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useIdeStore } from '@/store/use-ide-store';
import type { OpenFile } from '@/store/use-ide-store';
import { FileCode2 } from 'lucide-react';
import { useWriteFile } from '@workspace/api-client-react';

export function CodeEditor() {
  const { openFiles, activeFilePath, updateFileContent, markFileClean } = useIdeStore();
  const activeFile = openFiles.find(f => f.path === activeFilePath);
  const monaco = useMonaco();
  const { mutate: saveFile } = useWriteFile();
  const editorRef = useRef<unknown>(null);

  const activeFileRef = useRef<OpenFile | undefined>(activeFile);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

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

  const handleSave = () => {
    const current = activeFileRef.current;
    if (current && current.isDirty) {
      saveFile(
        { data: { path: current.path, content: current.content } },
        { onSuccess: () => markFileClean(current.path) }
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
      <div className="flex-1 relative">
        {activeFile && (
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
        )}
      </div>
    </div>
  );
}
