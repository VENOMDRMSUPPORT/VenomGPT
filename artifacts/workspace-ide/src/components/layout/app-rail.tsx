import { useLocation } from 'wouter';
import {
  TerminalSquare,
  FolderOpen,
  History,
  Settings2,
  Wifi,
  WifiOff,
  Plug,
  LayoutGrid,
  Home,
} from 'lucide-react';
import { useIdeStore } from '@/store/use-ide-store';
import { VenomLogo } from '@/components/ui/venom-logo';

interface AppRailProps {
  onNavigateHome: () => void;
  onOpenHistory: () => void;
}

function RailIcon({
  icon: Icon,
  label,
  onClick,
  active = false,
  accent = false,
  title,
}: {
  icon: React.FC<{ className?: string }>;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  accent?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className={`group relative flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-colors shrink-0
        ${active
          ? 'bg-primary/20 text-primary'
          : accent
            ? 'text-primary/70 hover:bg-primary/15 hover:text-primary'
            : 'text-muted-foreground/50 hover:bg-background hover:text-foreground'
        }`}
    >
      <Icon className="w-4 h-4" />
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
      )}
    </button>
  );
}

export function AppRail({ onNavigateHome, onOpenHistory }: AppRailProps) {
  const [, navigate] = useLocation();
  const isConnected  = useIdeStore(s => s.isConnected);
  const mainView     = useIdeStore(s => s.mainView);
  const setMainView  = useIdeStore(s => s.setMainView);
  const sidebarOpen  = useIdeStore(s => s.sidebarOpen);
  const toggleSidebar = useIdeStore(s => s.toggleSidebar);

  return (
    <div
      className="app-rail h-full flex flex-col items-center py-2 gap-1 shrink-0 border-r border-panel-border"
      style={{
        width: 52,
        minWidth: 52,
        maxWidth: 52,
        background: 'linear-gradient(180deg, #0a0610 0%, #05080d 100%)',
        position: 'relative',
      }}
    >
      {/* Purple left-side ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 200% 40% at 50% 0%, rgba(138,43,226,0.10) 0%, transparent 70%)',
        }}
      />

      {/* Logo — top */}
      <button
        onClick={onNavigateHome}
        title="VenomGPT — Go to Projects"
        className="relative z-10 flex items-center justify-center w-10 h-10 rounded-lg hover:bg-primary/10 transition-colors mb-1"
      >
        <VenomLogo size={26} />
      </button>

      {/* Divider */}
      <div className="w-6 h-px bg-panel-border/50 relative z-10 mb-1" />

      {/* Task Console toggle */}
      <div className="relative z-10">
        <RailIcon
          icon={TerminalSquare}
          title={sidebarOpen ? 'Collapse task console' : 'Expand task console'}
          active={sidebarOpen}
          onClick={toggleSidebar}
        />
      </div>

      {/* Board */}
      <div className="relative z-10">
        <RailIcon
          icon={LayoutGrid}
          title="Task board"
          active={mainView === 'board'}
          onClick={() => setMainView(mainView === 'board' ? 'editor' : 'board')}
        />
      </div>

      {/* Task history */}
      <div className="relative z-10">
        <RailIcon
          icon={History}
          title="Task history"
          onClick={onOpenHistory}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Integrations */}
      <div className="relative z-10">
        <RailIcon
          icon={Plug}
          title="Integrations"
          onClick={() => navigate('/integrations')}
        />
      </div>

      {/* Settings */}
      <div className="relative z-10">
        <RailIcon
          icon={Settings2}
          title="Settings"
          onClick={() => navigate('/settings')}
        />
      </div>

      {/* Connection indicator */}
      <div
        className="relative z-10 flex items-center justify-center w-10 h-6 mb-1"
        title={isConnected ? 'Connected' : 'Disconnected'}
      >
        {isConnected ? (
          <Wifi className="w-3.5 h-3.5 text-green-400/70" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-red-400/60" />
        )}
      </div>
    </div>
  );
}
