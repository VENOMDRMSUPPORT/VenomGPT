import { PanelLeftOpen } from 'lucide-react';
import { useIdeStore } from '@/store/use-ide-store';
import { APP_RAIL_HEADER_HEIGHT } from './app-rail';

export function CollapsedRailHeader() {
  const appRailOpen = useIdeStore(s => s.appRailOpen);
  const toggleAppRail = useIdeStore(s => s.toggleAppRail);

  if (appRailOpen) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center border-b border-white/[0.06]"
      style={{
        height: APP_RAIL_HEADER_HEIGHT,
        background: 'linear-gradient(180deg, #0a0610 0%, #05080d 100%)',
      }}
    >
      <div className="flex-1" />
      <button
        onClick={toggleAppRail}
        title="Open sidebar"
        className="mr-2 w-7 h-7 flex items-center justify-center rounded text-[#6b6f84] hover:text-[#c0c4d6] hover:bg-white/5 transition-colors"
      >
        <PanelLeftOpen className="w-4 h-4" />
      </button>
    </div>
  );
}
