import React from "react";
import { 
  Bot, 
  CheckCircle2, 
  CircleDashed, 
  FileCode2, 
  FileJson, 
  Folder, 
  FolderOpen, 
  Menu, 
  Play, 
  Terminal, 
  Send 
} from "lucide-react";

export function AIFirst() {
  return (
    <div 
      style={{ width: '1360px', height: '820px', overflow: 'hidden' }} 
      className="bg-[#09090b] text-[#fafafa] font-sans flex flex-col relative"
    >
      {/* Top Bar (44px) */}
      <div className="h-[44px] flex items-center justify-between px-4 border-b border-[#27272a] bg-[#18181b] shrink-0">
        <div className="flex items-center space-x-4">
          <Menu className="w-5 h-5 text-[#a1a1aa] cursor-pointer" />
          <div className="font-semibold text-[14px]">VenomGPT</div>
          <div className="px-2 py-0.5 rounded-full bg-[#27272a] text-[11px] font-mono text-[#a1a1aa]">
            workspace
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-[#16a34a] shadow-[0_0_8px_#16a34a]"></div>
          <span className="text-[12px] text-[#a1a1aa]">Connected</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Agent Panel (Left Anchor, 320px) */}
        <div className="w-[320px] bg-[#18181b] border-r border-[#27272a] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#27272a] flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-[#8b5cf6]" />
              <span className="font-medium text-[14px]">Agent</span>
            </div>
            <div className="px-2 py-0.5 rounded bg-[#27272a] text-[10px] font-mono text-[#a1a1aa]">
              GLM-5.1
            </div>
          </div>
          
          {/* Task History */}
          <div className="p-4 flex-1 overflow-y-auto space-y-3">
            <div className="text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">Tasks</div>
            
            <div className="flex items-start space-x-3 text-[13px]">
              <CheckCircle2 className="w-4 h-4 text-[#16a34a] mt-0.5 shrink-0" />
              <div className="text-[#a1a1aa]">Setup project scaffolding and initialize Vite config</div>
            </div>
            
            <div className="flex items-start space-x-3 text-[13px]">
              <CheckCircle2 className="w-4 h-4 text-[#16a34a] mt-0.5 shrink-0" />
              <div className="text-[#a1a1aa]">Create database schema for user profiles</div>
            </div>
            
            <div className="flex items-start space-x-3 text-[13px] bg-[#27272a]/50 p-2 -mx-2 rounded">
              <CircleDashed className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0 animate-[spin_3s_linear_infinite]" />
              <div className="text-[#fafafa]">Implement AIFirst layout component with right-side file explorer</div>
            </div>
          </div>

          {/* Execution Output (Inline) */}
          <div className="h-[150px] border-t border-[#27272a] flex flex-col shrink-0 bg-[#09090b]">
            <div className="px-4 py-2 text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center space-x-2">
              <Terminal className="w-3 h-3" />
              <span>Execution Output</span>
            </div>
            <div className="flex-1 px-4 py-2 font-mono text-[11px] text-[#a1a1aa] overflow-hidden leading-relaxed">
              <div className="text-[#8b5cf6]">&gt; npm run build</div>
              <div>vite v5.0.0 building for production...</div>
              <div className="text-[#16a34a]">✓ 43 modules transformed.</div>
              <div>dist/index.html   0.45 kB</div>
              <div>dist/assets/index-b4f2c.js   145.2 kB</div>
              <div className="text-[#16a34a]">✓ built in 1.2s</div>
            </div>
          </div>

          {/* Agent Input */}
          <div className="p-4 border-t border-[#27272a] shrink-0">
            <div className="relative">
              <textarea 
                placeholder="Message VenomGPT..."
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-3 pr-10 text-[13px] text-[#fafafa] placeholder:text-[#a1a1aa] resize-none focus:outline-none focus:border-[#8b5cf6]"
                rows={3}
                defaultValue="Make the file explorer items slightly smaller."
              />
              <button className="absolute right-3 bottom-3 p-1.5 rounded-md bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition-colors">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Code Editor (Center, flex-1) */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
          {/* Editor Tabs */}
          <div className="flex bg-[#18181b] border-b border-[#27272a] shrink-0 overflow-x-auto no-scrollbar">
            <div className="flex items-center px-4 py-2 bg-[#09090b] border-t-2 border-t-[#8b5cf6] border-r border-r-[#27272a] text-[13px] text-[#fafafa] min-w-[140px]">
              <FileCode2 className="w-4 h-4 mr-2 text-[#8b5cf6]" />
              AIFirst.tsx
              <span className="ml-auto pl-4 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer">×</span>
            </div>
            <div className="flex items-center px-4 py-2 border-r border-r-[#27272a] text-[13px] text-[#a1a1aa] min-w-[140px] hover:bg-[#27272a]/30 cursor-pointer">
              <FileCode2 className="w-4 h-4 mr-2 text-[#a1a1aa]" />
              ActivityBar.tsx
            </div>
          </div>

          {/* Code Area */}
          <div className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed">
            <div className="flex">
              <div className="w-10 text-right pr-4 text-[#27272a] select-none flex flex-col">
                {Array.from({length: 20}).map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <div className="flex-1 text-[#a1a1aa]">
                <div><span className="text-[#f43f5e]">import</span> React <span className="text-[#f43f5e]">from</span> <span className="text-[#10b981]">'react'</span>;</div>
                <div><span className="text-[#f43f5e]">import</span> {'{'} Bot, Terminal, Send {'}'} <span className="text-[#f43f5e]">from</span> <span className="text-[#10b981]">'lucide-react'</span>;</div>
                <br />
                <div><span className="text-[#f43f5e]">export function</span> <span className="text-[#3b82f6]">AIFirst</span>() {'{'}</div>
                <div className="pl-4"><span className="text-[#f43f5e]">return</span> (</div>
                <div className="pl-8">&lt;<span className="text-[#3b82f6]">div</span> className=<span className="text-[#10b981]">"w-full h-full flex"</span>&gt;</div>
                <div className="pl-12">&lt;<span className="text-[#3b82f6]">div</span> className=<span className="text-[#10b981]">"w-[320px] bg-panel"</span>&gt;</div>
                <div className="pl-16">&lt;<span className="text-[#3b82f6]">Bot</span> className=<span className="text-[#10b981]">"w-5 h-5"</span> /&gt;</div>
                <div className="pl-16">&lt;<span className="text-[#3b82f6]">span</span>&gt;Agent Panel&lt;/<span className="text-[#3b82f6]">span</span>&gt;</div>
                <div className="pl-12">&lt;/<span className="text-[#3b82f6]">div</span>&gt;</div>
                <div className="pl-12">&lt;<span className="text-[#3b82f6]">div</span> className=<span className="text-[#10b981]">"flex-1 bg-editor"</span>&gt;</div>
                <div className="pl-16">{'/* Editor Content */'}</div>
                <div className="pl-12">&lt;/<span className="text-[#3b82f6]">div</span>&gt;</div>
                <div className="pl-12">&lt;<span className="text-[#3b82f6]">div</span> className=<span className="text-[#10b981]">"w-[160px] bg-explorer"</span>&gt;</div>
                <div className="pl-16">{'/* File Tree */'}</div>
                <div className="pl-12">&lt;/<span className="text-[#3b82f6]">div</span>&gt;</div>
                <div className="pl-8">&lt;/<span className="text-[#3b82f6]">div</span>&gt;</div>
                <div className="pl-4">);</div>
                <div>{'}'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* File Explorer (Right, 160px) */}
        <div className="w-[160px] bg-[#18181b] border-l border-[#27272a] flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-[#27272a] text-[10px] font-semibold text-[#a1a1aa] uppercase tracking-wider shrink-0">
            Files
          </div>
          
          <div className="p-2 flex-1 overflow-y-auto space-y-0.5 font-mono text-[11px]">
            {/* Root */}
            <div className="flex items-center px-1 py-1 text-[#fafafa] hover:bg-[#27272a] rounded cursor-pointer">
              <FolderOpen className="w-3 h-3 mr-1.5 text-[#a1a1aa]" />
              <span className="truncate">venomgpt</span>
            </div>
            
            {/* Folder: src */}
            <div className="flex items-center pl-4 pr-1 py-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] rounded cursor-pointer">
              <FolderOpen className="w-3 h-3 mr-1.5 text-[#8b5cf6]" />
              <span className="truncate">src</span>
            </div>
            
            {/* Folder: components */}
            <div className="flex items-center pl-7 pr-1 py-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] rounded cursor-pointer">
              <FolderOpen className="w-3 h-3 mr-1.5 text-[#8b5cf6]" />
              <span className="truncate">components</span>
            </div>
            
            {/* Folder: mockups */}
            <div className="flex items-center pl-10 pr-1 py-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] rounded cursor-pointer">
              <FolderOpen className="w-3 h-3 mr-1.5 text-[#8b5cf6]" />
              <span className="truncate">mockups</span>
            </div>
            
            {/* File: ActivityBar.tsx */}
            <div className="flex items-center pl-12 pr-1 py-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] rounded cursor-pointer">
              <FileCode2 className="w-3 h-3 mr-1.5 text-[#3b82f6]" />
              <span className="truncate">Activity...</span>
            </div>
            
            {/* File: AIFirst.tsx */}
            <div className="flex items-center pl-12 pr-1 py-1 text-[#8b5cf6] bg-[#8b5cf6]/10 rounded cursor-pointer">
              <FileCode2 className="w-3 h-3 mr-1.5 text-[#8b5cf6]" />
              <span className="truncate">AIFirst.tsx</span>
            </div>
            
            {/* File: UnifiedBottom.tsx */}
            <div className="flex items-center pl-12 pr-1 py-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] rounded cursor-pointer">
              <FileCode2 className="w-3 h-3 mr-1.5 text-[#3b82f6]" />
              <span className="truncate">UnifiedB...</span>
            </div>
            
            {/* Folder: lib */}
            <div className="flex items-center pl-4 pr-1 py-1 mt-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] rounded cursor-pointer">
              <Folder className="w-3 h-3 mr-1.5 text-[#a1a1aa]" />
              <span className="truncate">lib</span>
            </div>
            
            {/* File: package.json */}
            <div className="flex items-center pl-4 pr-1 py-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] rounded cursor-pointer">
              <FileJson className="w-3 h-3 mr-1.5 text-[#eab308]" />
              <span className="truncate">package.json</span>
            </div>
            
            {/* File: tsconfig.json */}
            <div className="flex items-center pl-4 pr-1 py-1 text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] rounded cursor-pointer">
              <FileJson className="w-3 h-3 mr-1.5 text-[#3b82f6]" />
              <span className="truncate">tsconfig.json</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default AIFirst;