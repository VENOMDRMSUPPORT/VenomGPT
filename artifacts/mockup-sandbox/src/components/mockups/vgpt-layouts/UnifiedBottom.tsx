import React from "react";
import { 
  Bot, 
  ChevronRight, 
  Circle, 
  FileCode2, 
  FileJson, 
  Folder, 
  FolderOpen, 
  Play, 
  TerminalSquare, 
  X 
} from "lucide-react";

export function UnifiedBottom() {
  return (
    <div 
      className="flex flex-col bg-[#09090b] text-[#fafafa] font-sans text-sm"
      style={{ width: '1360px', height: '820px', overflow: 'hidden' }}
    >
      {/* Top Bar - 44px */}
      <div className="flex items-center h-[44px] px-4 border-b border-[#27272a] bg-[#18181b] shrink-0 justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[hsl(252,87%,68%)] flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <span className="font-semibold tracking-wide">VenomGPT</span>
          </div>
          <div className="h-4 w-[1px] bg-[#27272a] mx-2"></div>
          <div className="px-2 py-0.5 rounded-full bg-[#27272a] text-[#a1a1aa] text-xs font-medium">
            workspace
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
          <div className="w-2 h-2 rounded-full bg-[hsl(142,71%,45%)] shadow-[0_0_8px_hsl(142,71%,45%)]"></div>
          Connected
        </div>
      </div>

      {/* Code Editor Area - Flex 1 */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Editor Tab Bar */}
        <div className="flex items-center h-[36px] bg-[#09090b] border-b border-[#27272a] shrink-0 px-2">
          <div className="flex items-center h-full px-4 border-t-2 border-t-[hsl(252,87%,68%)] bg-[#18181b] gap-2 border-r border-l border-[#27272a]">
            <FileCode2 size={14} className="text-[#a1a1aa]" />
            <span className="text-[#fafafa]">agentLoop.ts</span>
            <X size={14} className="text-[#a1a1aa] hover:text-[#fafafa] ml-2 cursor-pointer" />
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 flex bg-[#09090b] overflow-hidden font-mono text-[13px] leading-relaxed relative">
          {/* Line Numbers */}
          <div className="w-12 shrink-0 border-r border-[#27272a] bg-[#09090b] flex flex-col items-end pr-3 py-4 text-[#a1a1aa] select-none opacity-50">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="h-6">{i + 1}</div>
            ))}
          </div>
          
          {/* Code */}
          <div className="flex-1 p-4 overflow-hidden">
            <div className="h-6"><span className="text-[hsl(252,87%,68%)]">import</span> &#123; Orchestrator &#125; <span className="text-[hsl(252,87%,68%)]">from</span> <span className="text-[#a1a1aa]">'./orchestrator'</span>;</div>
            <div className="h-6"><span className="text-[hsl(252,87%,68%)]">import</span> &#123; FileTools &#125; <span className="text-[hsl(252,87%,68%)]">from</span> <span className="text-[#a1a1aa]">'./fileTools'</span>;</div>
            <div className="h-6"></div>
            <div className="h-6"><span className="text-[hsl(252,87%,68%)]">export class</span> AgentLoop &#123;</div>
            <div className="h-6">  <span className="text-[hsl(252,87%,68%)]">private</span> orchestrator: Orchestrator;</div>
            <div className="h-6">  <span className="text-[hsl(252,87%,68%)]">private</span> isRunning: <span className="text-[hsl(142,71%,45%)]">boolean</span> = <span className="text-[hsl(252,87%,68%)]">false</span>;</div>
            <div className="h-6"></div>
            <div className="h-6">  <span className="text-[hsl(252,87%,68%)]">constructor</span>() &#123;</div>
            <div className="h-6">    <span className="text-[hsl(252,87%,68%)]">this</span>.orchestrator = <span className="text-[hsl(252,87%,68%)]">new</span> Orchestrator();</div>
            <div className="h-6">  &#125;</div>
            <div className="h-6"></div>
            <div className="h-6">  <span className="text-[hsl(252,87%,68%)]">public async</span> start(task: <span className="text-[hsl(142,71%,45%)]">string</span>): <span className="text-[hsl(142,71%,45%)]">Promise</span>&lt;<span className="text-[hsl(142,71%,45%)]">void</span>&gt; &#123;</div>
            <div className="h-6">    <span className="text-[hsl(252,87%,68%)]">if</span> (<span className="text-[hsl(252,87%,68%)]">this</span>.isRunning) <span className="text-[hsl(252,87%,68%)]">return</span>;</div>
            <div className="h-6">    <span className="text-[hsl(252,87%,68%)]">this</span>.isRunning = <span className="text-[hsl(252,87%,68%)]">true</span>;</div>
            <div className="h-6">    </div>
            <div className="h-6">    <span className="text-[hsl(252,87%,68%)]">try</span> &#123;</div>
            <div className="h-6">      <span className="text-[#a1a1aa]">// Initialize context</span></div>
            <div className="h-6">      <span className="text-[hsl(252,87%,68%)]">await this</span>.orchestrator.plan(task);</div>
            <div className="h-6">      <span className="text-[hsl(252,87%,68%)]">await this</span>.execute();</div>
            <div className="h-6">    &#125; <span className="text-[hsl(252,87%,68%)]">finally</span> &#123;</div>
            <div className="h-6">      <span className="text-[hsl(252,87%,68%)]">this</span>.isRunning = <span className="text-[hsl(252,87%,68%)]">false</span>;</div>
            <div className="h-6">    &#125;</div>
            <div className="h-6">  &#125;</div>
            <div className="h-6">&#125;</div>
          </div>
        </div>
      </div>

      {/* Bottom Panel Area - Fixed Height */}
      <div className="h-[240px] flex flex-col shrink-0 border-t border-[#27272a] bg-[#18181b]">
        {/* Tab Strip */}
        <div className="h-[36px] flex items-center px-4 border-b border-[#27272a] gap-6 shrink-0 bg-[#09090b]">
          <div className="h-full flex items-center border-b-2 border-b-[hsl(252,87%,68%)] text-[#fafafa] font-medium tracking-wide text-xs">
            FILES
          </div>
          <div className="h-full flex items-center text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer text-xs tracking-wide">
            TASKS
          </div>
          <div className="h-full flex items-center text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer text-xs tracking-wide">
            OUTPUT
          </div>
          <div className="h-full flex items-center text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer text-xs tracking-wide">
            TERMINAL
          </div>
        </div>

        {/* Tab Content - Files (2 Column Grid) */}
        <div className="flex-1 p-4 overflow-hidden">
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 h-full">
            {/* Column 1 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer px-2 py-1 rounded hover:bg-[#27272a]">
                <ChevronRight size={14} />
                <Folder size={14} className="text-[#a1a1aa]" />
                <span>artifacts</span>
              </div>
              <div className="flex items-center gap-2 text-[#fafafa] bg-[#27272a] cursor-pointer px-2 py-1 rounded">
                <ChevronRight size={14} className="rotate-90" />
                <FolderOpen size={14} className="text-[hsl(252,87%,68%)]" />
                <span>lib</span>
              </div>
              <div className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer px-2 py-1 rounded hover:bg-[#27272a] pl-8">
                <ChevronRight size={14} />
                <Folder size={14} className="text-[#a1a1aa]" />
                <span>api-client-react</span>
              </div>
              <div className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer px-2 py-1 rounded hover:bg-[#27272a] pl-8">
                <ChevronRight size={14} />
                <Folder size={14} className="text-[#a1a1aa]" />
                <span>db</span>
              </div>
            </div>

            {/* Column 2 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer px-2 py-1 rounded hover:bg-[#27272a]">
                <ChevronRight size={14} className="rotate-90" />
                <FolderOpen size={14} className="text-[hsl(252,87%,68%)]" />
                <span>src</span>
              </div>
              <div className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer px-2 py-1 rounded hover:bg-[#27272a] pl-8">
                <FileCode2 size={14} className="text-[#a1a1aa]" />
                <span className="text-[#fafafa]">agentLoop.ts</span>
              </div>
              <div className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer px-2 py-1 rounded hover:bg-[#27272a] pl-8">
                <FileCode2 size={14} className="text-[#a1a1aa]" />
                <span>fileTools.ts</span>
              </div>
              <div className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer px-2 py-1 rounded hover:bg-[#27272a]">
                <div className="w-3.5" />
                <FileJson size={14} className="text-[#a1a1aa]" />
                <span>package.json</span>
              </div>
              <div className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer px-2 py-1 rounded hover:bg-[#27272a]">
                <div className="w-3.5" />
                <FileJson size={14} className="text-[#a1a1aa]" />
                <span>tsconfig.json</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
