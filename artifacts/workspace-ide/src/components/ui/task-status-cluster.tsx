import type { CSSProperties } from 'react';

// ─── Status color palettes ────────────────────────────────────────────────────
// Each status has 4 dot colors arranged in a 2×2 grid.
// Colors are intentionally vivid to distinguish states at a glance.

type TaskStatus = 'running' | 'done' | 'error' | 'cancelled' | 'interrupted' | 'stalled' | 'queued';

const STATUS: Record<TaskStatus | 'default', { colors: [string, string, string, string]; label: string }> = {
  running:     { colors: ['#818cf8', '#6366f1', '#a78bfa', '#8b5cf6'], label: 'Running' },
  done:        { colors: ['#4ade80', '#22d3ee', '#34d399', '#6ee7b7'], label: 'Done' },
  error:       { colors: ['#f87171', '#ef4444', '#fca5a5', '#fb923c'], label: 'Error' },
  cancelled:   { colors: ['#facc15', '#f59e0b', '#fbbf24', '#fde68a'], label: 'Cancelled' },
  interrupted: { colors: ['#fb923c', '#f97316', '#f43f5e', '#fda4af'], label: 'Interrupted' },
  stalled:     { colors: ['#fbbf24', '#d97706', '#f59e0b', '#fcd34d'], label: 'Stalled' },
  queued:      { colors: ['#94a3b8', '#64748b', '#cbd5e1', '#94a3b8'], label: 'Queued' },
  default:     { colors: ['#52525b', '#3f3f46', '#71717a', '#52525b'], label: '' },
};

const SIZE_MAP = {
  xs:  { dot: 4, gap: 2 },
  sm:  { dot: 5, gap: 2 },
  md:  { dot: 7, gap: 3 },
  lg:  { dot: 10, gap: 4 },
};

interface TaskStatusClusterProps {
  status: string;
  size?: keyof typeof SIZE_MAP;
  className?: string;
}

export function TaskStatusCluster({ status, size = 'sm', className = '' }: TaskStatusClusterProps) {
  const key = (status in STATUS ? status : 'default') as TaskStatus | 'default';
  const { colors, label } = STATUS[key];
  const { dot, gap } = SIZE_MAP[size];
  const isAnimated = status === 'running' || status === 'queued';
  const totalSize = dot * 2 + gap;

  return (
    <div
      role="img"
      aria-label={label || status}
      className={`inline-grid grid-cols-2 shrink-0 ${className}`}
      style={{ width: totalSize, height: totalSize, gap }}
    >
      {colors.map((color, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: dot,
            height: dot,
            backgroundColor: color,
            ...(isAnimated
              ? {
                  animation: 'dot-breathe 1.4s ease-in-out infinite',
                  animationDelay: `${i * 175}ms`,
                }
              : {}),
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
