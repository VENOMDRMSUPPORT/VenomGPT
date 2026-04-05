/**
 * verifyQuality.ts — Shared verification-quality badge configuration.
 *
 * Consumed by both evidence-panel.tsx (ExecutionStatsBlock) and
 * task-console.tsx (ExecutionSummaryMini) to avoid divergence.
 */

export const VERIFY_QUALITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  none:               { label: 'None',               color: 'text-muted-foreground/50', bg: 'bg-panel-border/20',  border: 'border-panel-border/30'  },
  static_only:        { label: 'Static only',         color: 'text-blue-400',            bg: 'bg-blue-400/8',       border: 'border-blue-400/15'      },
  command_success:    { label: 'Command success',     color: 'text-amber-400',           bg: 'bg-amber-400/8',      border: 'border-amber-400/15'     },
  runtime_confirmed:  { label: 'Runtime confirmed',   color: 'text-green-400',           bg: 'bg-green-400/8',      border: 'border-green-400/15'     },
};

export function getVerifyQualityConfig(quality?: string | null) {
  return VERIFY_QUALITY_CONFIG[quality ?? 'none'] ?? VERIFY_QUALITY_CONFIG['none'];
}
