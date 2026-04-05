import { useLocation } from 'wouter';
import { ArrowLeft, TerminalSquare } from 'lucide-react';
import { motion } from 'framer-motion';

interface SubpageShellProps {
  pageIcon: React.ElementType;
  pageLabel: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function SubpageShell({ pageIcon: PageIcon, pageLabel, rightSlot, children }: SubpageShellProps) {
  const [, navigate] = useLocation();

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col">
      <header className="h-12 bg-panel border-b border-panel-border flex items-center gap-0 px-4 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mr-4 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back</span>
        </button>

        <div className="w-px h-5 bg-panel-border mr-4" />

        <div className="flex items-center gap-2 text-sm">
          <TerminalSquare className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground">VenomGPT</span>
          <span className="text-muted-foreground/50 mx-1">/</span>
          <PageIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{pageLabel}</span>
        </div>

        {rightSlot && (
          <div className="ml-auto flex items-center gap-2">
            {rightSlot}
          </div>
        )}
      </header>

      <motion.div
        className="flex-1 min-h-0 overflow-hidden flex flex-col"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
