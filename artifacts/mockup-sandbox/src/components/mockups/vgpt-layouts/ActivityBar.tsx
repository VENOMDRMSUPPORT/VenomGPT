import React from "react";
import {
  Files,
  Search,
  Bot,
  Settings,
  Terminal,
  FileCode,
  Folder,
  ChevronRight,
  ChevronDown,
  X,
  Play,
  CheckCircle2,
  Package,
} from "lucide-react";

export function ActivityBar() {
  return (
    <div
      className="flex flex-col bg-[#09090b] text-[#fafafa] font-sans"
      style={{ width: "1360px", height: "820px", overflow: "hidden" }}
    >
      {/* Top Bar (44px) */}
      <div className="flex items-center justify-between h-[44px] px-4 border-b border-[#27272a] bg-[#09090b] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[hsl(252,87%,68%)] flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">V</span>
            </div>
            <span className="font-semibold text-sm tracking-wide">VenomGPT</span>
          </div>
          <div className="h-4 w-[1px] bg-[#27272a] mx-1"></div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#18181b] border border-[#27272a]">
            <span className="text-xs text-[#a1a1aa]">workspace</span>
            <span className="text-xs font-medium">project-alpha</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(142,71%,45%,0.1)] border border-[hsl(142,71%,45%,0.2)]">
            <div className="w-2 h-2 rounded-full bg-[hsl(142,71%,45%)] animate-pulse"></div>
            <span className="text-xs font-medium text-[hsl(142,71%,45%)]">Connected</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar / Icon Rail (52px) */}
        <div className="w-[52px] flex flex-col items-center py-3 border-r border-[#27272a] bg-[#09090b] shrink-0 justify-between">
          <div className="flex flex-col gap-4 w-full items-center">
            {/* Active Explorer Icon */}
            <div className="relative group cursor-pointer flex justify-center w-full">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-8 bg-[hsl(252,87%,68%)]"></div>
              <div className="p-2.5 text-[#fafafa] bg-[#18181b] rounded-lg">
                <Files size={22} strokeWidth={1.5} />
              </div>
            </div>
            {/* Inactive Icons */}
            <div className="relative group cursor-pointer flex justify-center w-full">
              <div className="p-2.5 text-[#a1a1aa] hover:text-[#fafafa] transition-colors">
                <Search size={22} strokeWidth={1.5} />
              </div>
            </div>
            <div className="relative group cursor-pointer flex justify-center w-full">
              <div className="p-2.5 text-[#a1a1aa] hover:text-[#fafafa] transition-colors">
                <Bot size={22} strokeWidth={1.5} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full items-center">
            <div className="w-6 h-[1px] bg-[#27272a]"></div>
            <div className="relative group cursor-pointer flex justify-center w-full mb-2">
              <div className="p-2.5 text-[#a1a1aa] hover:text-[#fafafa] transition-colors">
                <Settings size={22} strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </div>

        {/* Contextual Panel - Explorer (280px) */}
        <div className="w-[280px] flex flex-col border-r border-[#27272a] bg-[#18181b] shrink-0">
          <div className="h-10 flex items-center px-4 shrink-0">
            <span className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Explorer</span>
          </div>
          
          <div className="flex-1 overflow-y-auto pb-4">
            <div className="px-2">
              {/* Folder: artifacts */}
              <div className="flex items-center gap-1 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer group text-[#a1a1aa]">
                <ChevronDown size={14} className="opacity-70 group-hover:opacity-100" />
                <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                <span className="text-sm truncate select-none">artifacts</span>
              </div>
              
              <div className="pl-6 flex flex-col">
                <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer group text-[#a1a1aa]">
                  <ChevronRight size={14} className="opacity-70 group-hover:opacity-100" />
                  <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                  <span className="text-sm truncate select-none">api-server</span>
                </div>
                <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer group text-[#a1a1aa]">
                  <ChevronRight size={14} className="opacity-70 group-hover:opacity-100" />
                  <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                  <span className="text-sm truncate select-none">mockup-sandbox</span>
                </div>
              </div>

              {/* Folder: lib */}
              <div className="flex items-center gap-1 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer group text-[#a1a1aa] mt-1">
                <ChevronDown size={14} className="opacity-70 group-hover:opacity-100" />
                <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                <span className="text-sm truncate select-none">lib</span>
              </div>

              <div className="pl-6 flex flex-col">
                <div className="flex items-center gap-1.5 py-1 px-2 bg-[#27272a]/60 text-[#fafafa] rounded cursor-pointer">
                  <ChevronDown size={14} className="opacity-70" />
                  <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
                  <span className="text-sm truncate select-none">orchestrator</span>
                </div>
                
                <div className="pl-5 flex flex-col">
                  <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer text-[#a1a1aa] hover:text-[#fafafa]">
                    <FileCode size={14} className="text-yellow-400" />
                    <span className="text-sm truncate select-none">actionRouter.ts</span>
                  </div>
                  <div className="flex items-center gap-1.5 py-1 px-2 bg-[hsl(252,87%,68%,0.15)] text-[hsl(252,87%,68%)] rounded cursor-pointer border border-[hsl(252,87%,68%,0.2)]">
                    <FileCode size={14} className="text-[hsl(252,87%,68%)]" />
                    <span className="text-sm truncate select-none font-medium">agentLoop.ts</span>
                  </div>
                  <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer text-[#a1a1aa] hover:text-[#fafafa]">
                    <FileCode size={14} className="text-yellow-400" />
                    <span className="text-sm truncate select-none">planner.ts</span>
                  </div>
                </div>
              </div>

              {/* Root files */}
              <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer text-[#a1a1aa] hover:text-[#fafafa] mt-1 ml-4">
                <Package size={14} className="text-red-400" />
                <span className="text-sm truncate select-none">package.json</span>
              </div>
              <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer text-[#a1a1aa] hover:text-[#fafafa] ml-4">
                <FileCode size={14} className="text-blue-400" />
                <span className="text-sm truncate select-none">tsconfig.json</span>
              </div>
              <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#27272a]/50 rounded cursor-pointer text-[#a1a1aa] hover:text-[#fafafa] ml-4">
                <FileCode size={14} className="text-gray-400" />
                <span className="text-sm truncate select-none">README.md</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center/Right Content Area (Flex 1) */}
        <div className="flex flex-col flex-1 min-w-0">
          
          {/* Editor Area */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#09090b]">
            {/* Editor Tabs */}
            <div className="flex h-10 border-b border-[#27272a] bg-[#18181b] overflow-hidden shrink-0">
              <div className="flex items-center gap-2 px-4 border-r border-[#27272a] bg-[#09090b] text-[#fafafa] relative min-w-[140px] border-t-2 border-t-[hsl(252,87%,68%)]">
                <FileCode size={14} className="text-[hsl(252,87%,68%)]" />
                <span className="text-sm text-[#fafafa]">agentLoop.ts</span>
                <button className="ml-auto opacity-60 hover:opacity-100 hover:bg-[#27272a] p-0.5 rounded">
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 px-4 border-r border-[#27272a] text-[#a1a1aa] hover:bg-[#27272a]/30 cursor-pointer min-w-[140px] border-t-2 border-t-transparent">
                <FileCode size={14} className="text-yellow-400" />
                <span className="text-sm">planner.ts</span>
                <button className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-[#27272a] p-0.5 rounded">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed text-[#a1a1aa] flex">
              {/* Line Numbers */}
              <div className="flex flex-col text-right pr-4 border-r border-[#27272a] opacity-40 select-none shrink-0">
                {Array.from({ length: 22 }).map((_, i) => (
                  <span key={i} className="h-6">{i + 1}</span>
                ))}
              </div>
              
              {/* Code */}
              <div className="pl-4 flex-1">
                <pre className="m-0">
                  <div className="h-6"><span className="text-[#c678dd]">import</span> <span className="text-[#e5c07b]">{"{"}</span> <span className="text-[#e06c75]">ActionExecutor</span> <span className="text-[#e5c07b]">{"}"}</span> <span className="text-[#c678dd]">from</span> <span className="text-[#98c379]">'./actionExecutor'</span><span className="text-[#abb2bf]">;</span></div>
                  <div className="h-6"><span className="text-[#c678dd]">import</span> <span className="text-[#e5c07b]">{"{"}</span> <span className="text-[#e06c75]">Logger</span> <span className="text-[#e5c07b]">{"}"}</span> <span className="text-[#c678dd]">from</span> <span className="text-[#98c379]">'../logger'</span><span className="text-[#abb2bf]">;</span></div>
                  <div className="h-6"></div>
                  <div className="h-6"><span className="text-[#c678dd]">export class</span> <span className="text-[#e5c07b]">AgentLoop</span> <span className="text-[#abb2bf]">{"{"}</span></div>
                  <div className="h-6">  <span className="text-[#c678dd]">private</span> <span className="text-[#e06c75]">executor</span><span className="text-[#abb2bf]">: </span><span className="text-[#e5c07b]">ActionExecutor</span><span className="text-[#abb2bf]">;</span></div>
                  <div className="h-6">  <span className="text-[#c678dd]">private</span> <span className="text-[#e06c75]">logger</span><span className="text-[#abb2bf]">: </span><span className="text-[#e5c07b]">Logger</span><span className="text-[#abb2bf]">;</span></div>
                  <div className="h-6"></div>
                  <div className="h-6">  <span className="text-[#c678dd]">constructor</span><span className="text-[#abb2bf]">() {"{"}</span></div>
                  <div className="h-6">    <span className="text-[#d19a66]">this</span><span className="text-[#abb2bf]">.</span><span className="text-[#e06c75]">executor</span> <span className="text-[#56b6c2]">=</span> <span className="text-[#c678dd]">new</span> <span className="text-[#e5c07b]">ActionExecutor</span><span className="text-[#abb2bf]">();</span></div>
                  <div className="h-6">    <span className="text-[#d19a66]">this</span><span className="text-[#abb2bf]">.</span><span className="text-[#e06c75]">logger</span> <span className="text-[#56b6c2]">=</span> <span className="text-[#c678dd]">new</span> <span className="text-[#e5c07b]">Logger</span><span className="text-[#abb2bf]">(</span><span className="text-[#98c379]">'AgentLoop'</span><span className="text-[#abb2bf]">);</span></div>
                  <div className="h-6">  <span className="text-[#abb2bf]">{"}"}</span></div>
                  <div className="h-6"></div>
                  <div className="h-6">  <span className="text-[#c678dd]">public async</span> <span className="text-[#61afef]">runCycle</span><span className="text-[#abb2bf]">(</span><span className="text-[#e06c75]">taskId</span><span className="text-[#abb2bf]">: </span><span className="text-[#e5c07b]">string</span><span className="text-[#abb2bf]">): </span><span className="text-[#e5c07b]">Promise</span><span className="text-[#abb2bf]">&lt;</span><span className="text-[#e5c07b]">void</span><span className="text-[#abb2bf]">&gt; {"{"}</span></div>
                  <div className="h-6 bg-[#27272a]/40 -ml-4 pl-4 border-l-2 border-[hsl(252,87%,68%)]">    <span className="text-[#d19a66]">this</span><span className="text-[#abb2bf]">.</span><span className="text-[#e06c75]">logger</span><span className="text-[#abb2bf]">.</span><span className="text-[#56b6c2]">info</span><span className="text-[#abb2bf]">(</span><span className="text-[#98c379]">'Starting cycle for task abc-123'</span><span className="text-[#abb2bf]">);</span></div>
                  <div className="h-6">    </div>
                  <div className="h-6">    <span className="text-[#c678dd]">try</span> <span className="text-[#abb2bf]">{"{"}</span></div>
                  <div className="h-6">      <span className="text-[#c678dd]">const</span> <span className="text-[#e06c75]">plan</span> <span className="text-[#56b6c2]">=</span> <span className="text-[#c678dd]">await</span> <span className="text-[#d19a66]">this</span><span className="text-[#abb2bf]">.</span><span className="text-[#61afef]">generatePlan</span><span className="text-[#abb2bf]">(</span><span className="text-[#e06c75]">taskId</span><span className="text-[#abb2bf]">);</span></div>
                  <div className="h-6">      <span className="text-[#c678dd]">await</span> <span className="text-[#d19a66]">this</span><span className="text-[#abb2bf]">.</span><span className="text-[#e06c75]">executor</span><span className="text-[#abb2bf]">.</span><span className="text-[#61afef]">executePlan</span><span className="text-[#abb2bf]">(</span><span className="text-[#e06c75]">plan</span><span className="text-[#abb2bf]">);</span></div>
                  <div className="h-6">    <span className="text-[#abb2bf]">{"}"}</span> <span className="text-[#c678dd]">catch</span> <span className="text-[#abb2bf]">(</span><span className="text-[#e06c75]">error</span><span className="text-[#abb2bf]">) {"{"}</span></div>
                  <div className="h-6">      <span className="text-[#d19a66]">this</span><span className="text-[#abb2bf]">.</span><span className="text-[#e06c75]">logger</span><span className="text-[#abb2bf]">.</span><span className="text-[#e06c75]">error</span><span className="text-[#abb2bf]">(</span><span className="text-[#98c379]">'Cycle failed'</span><span className="text-[#abb2bf]">, </span><span className="text-[#e06c75]">error</span><span className="text-[#abb2bf]">);</span></div>
                  <div className="h-6">    <span className="text-[#abb2bf]">{"}"}</span></div>
                  <div className="h-6">  <span className="text-[#abb2bf]">{"}"}</span></div>
                  <div className="h-6"><span className="text-[#abb2bf]">{"}"}</span></div>
                </pre>
              </div>
            </div>
          </div>

          {/* Terminal / Output Panel (120px collapsed strip) */}
          <div className="h-[140px] border-t border-[#27272a] bg-[#18181b] flex flex-col shrink-0">
            {/* Panel Tabs */}
            <div className="flex items-center px-4 h-9 border-b border-[#27272a] shrink-0">
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer">
                  TASKS
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#fafafa] border-b-2 border-[hsl(252,87%,68%)] pb-[10px] pt-[10px] cursor-pointer">
                  OUTPUT
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#a1a1aa] hover:text-[#fafafa] cursor-pointer">
                  TERMINAL
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button className="text-[#a1a1aa] hover:text-[#fafafa]">
                  <Play size={14} />
                </button>
                <button className="text-[#a1a1aa] hover:text-[#fafafa]">
                  <X size={14} />
                </button>
              </div>
            </div>
            
            {/* Terminal Content */}
            <div className="flex-1 p-3 font-mono text-[12px] overflow-hidden text-[#a1a1aa] space-y-1 bg-[#09090b]">
              <div className="flex gap-2">
                <span className="text-[#56b6c2]">[14:22:01]</span>
                <span className="text-[#98c379]">info</span>
                <span className="text-[#fafafa]">Starting build process...</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#56b6c2]">[14:22:03]</span>
                <span className="text-[#98c379]">info</span>
                <span className="text-[#fafafa]">Compiling TypeScript...</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#56b6c2]">[14:22:08]</span>
                <span className="text-[hsl(252,87%,68%)]">vite</span>
                <span className="text-[#fafafa]">hmr update /src/components/layout/ActivityBar.tsx</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[#56b6c2]">[14:22:10]</span>
                <span className="text-[hsl(142,71%,45%)] flex items-center gap-1">
                  <CheckCircle2 size={12} /> success
                </span>
                <span className="text-[#fafafa]">Build completed in 9.2s</span>
              </div>
              <div className="flex gap-2 mt-1">
                <span className="text-[hsl(142,71%,45%)]">➜</span>
                <span className="text-[#fafafa]">Local:   http://localhost:5173/</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
