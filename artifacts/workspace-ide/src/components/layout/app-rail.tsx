import { useLocation } from 'wouter';
import {
  LayoutGrid,
  Rocket,
  Home,
  AppWindow,
  FileStack,
  Plug,
  Users,
  ChevronDown,
} from 'lucide-react';

interface AppRailProps {
  onNavigateHome: () => void;
}

interface NavItemProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function PrimaryNavItem({ icon: Icon, label, active = false, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
        ${active
          ? 'bg-[#6d28d9]/30 text-white'
          : 'text-[#8b8fa8] hover:bg-white/5 hover:text-[#c0c4d6]'
        }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#a78bfa]' : ''}`} />
      <span>{label}</span>
    </button>
  );
}

function SecondaryNavItem({ icon: Icon, label, active = false, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
        ${active
          ? 'text-white bg-white/10'
          : 'text-[#6b6f84] hover:bg-white/5 hover:text-[#9ca3b8]'
        }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

export function AppRail({ onNavigateHome }: AppRailProps) {
  const [, navigate] = useLocation();

  return (
    <div
      className="app-rail h-full flex flex-col shrink-0 border-r border-panel-border overflow-hidden"
      style={{
        width: 220,
        minWidth: 220,
        maxWidth: 220,
        background: 'linear-gradient(180deg, #0a0610 0%, #05080d 100%)',
      }}
    >
      {/* Purple top ambient glow */}
      <div
        className="absolute left-0 top-0 pointer-events-none"
        style={{
          width: 220,
          height: 120,
          background: 'radial-gradient(ellipse 180% 60% at 50% 0%, rgba(109,40,217,0.13) 0%, transparent 70%)',
        }}
      />

      {/* Workspace header */}
      <div className="relative z-10 flex items-center gap-2.5 px-3 py-3 border-b border-white/[0.06]">
        {/* Avatar */}
        <div
          className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' }}
        >
          I
        </div>
        <span className="flex-1 text-sm font-medium text-[#c0c4d6] truncate">
          Islam's Workspace
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[#6b6f84] shrink-0" />
      </div>

      {/* Primary nav */}
      <div className="relative z-10 flex flex-col gap-0.5 px-2 pt-3 pb-1">
        <PrimaryNavItem
          icon={LayoutGrid}
          label="Apps"
          active
        />
        <PrimaryNavItem
          icon={Rocket}
          label="Superagents"
        />
      </div>

      {/* Divider */}
      <div className="relative z-10 mx-3 my-2 h-px bg-white/[0.07]" />

      {/* Secondary nav */}
      <div className="relative z-10 flex flex-col gap-0.5 px-2">
        <SecondaryNavItem
          icon={Home}
          label="Home"
          onClick={onNavigateHome}
        />
        <SecondaryNavItem
          icon={AppWindow}
          label="All apps"
        />
        <SecondaryNavItem
          icon={FileStack}
          label="Templates"
        />
        <SecondaryNavItem
          icon={Plug}
          label="Integrations"
          onClick={() => navigate('/integrations')}
        />
        <SecondaryNavItem
          icon={Users}
          label="Community"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}
