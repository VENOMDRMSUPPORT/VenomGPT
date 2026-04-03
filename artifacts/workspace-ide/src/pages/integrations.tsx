import { useLocation } from 'wouter';
import {
  Plug,
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  Zap,
  Settings2,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { SubpageShell } from '@/components/layout/subpage-shell';
import { Badge } from '@/components/ui/badge';
import {
  useGetProviders,
  useClearProviderIssue,
  type ProviderStatusView,
  type ProviderIssueCategory,
} from '@/hooks/use-providers';
import { useQueryClient } from '@tanstack/react-query';
import { PROVIDERS_QUERY_KEY } from '@/hooks/use-providers';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ─── Issue notice component ───────────────────────────────────────────────────

const ISSUE_LABELS: Record<ProviderIssueCategory, string> = {
  auth_failed:           'Authentication Failed',
  session_expired:       'Session Expired',
  token_refresh_failed:  'Token Refresh Failed',
  subscription_invalid:  'Account Issue',
  model_unavailable:     'Model Unavailable',
  usage_limit:           'API Quota / No Credits',
  entitlement_mismatch:  'Entitlement Mismatch',
  wrong_api_path:        'API Path Error',
};

function IssueNotice({ provider, onReconnect }: {
  provider: ProviderStatusView;
  onReconnect: () => void;
}) {
  const { issue } = provider;
  if (!issue) return null;

  const label = ISSUE_LABELS[issue.category] ?? 'Provider Issue';
  const needsReconnect = ['auth_failed', 'session_expired', 'token_refresh_failed'].includes(issue.category);

  return (
    <div className="mx-6 my-3 rounded-lg border border-destructive/30 bg-destructive/8 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-destructive">{label}</p>
          <p className="text-xs text-destructive/80 mt-0.5 leading-relaxed">{issue.message}</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            <span className="font-medium">Recommended action:</span> {issue.action}
          </p>
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {needsReconnect && (
              <button
                onClick={onReconnect}
                className="text-[11px] px-2.5 py-1 bg-destructive/15 border border-destructive/30 text-destructive rounded-md hover:bg-destructive/25 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Clear Issue
              </button>
            )}
            <span className="text-[10px] text-muted-foreground/50 ml-auto">
              Detected {new Date(issue.detectedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Provider card (Z.AI only) ────────────────────────────────────────────────

function ProviderCard({ provider }: { provider: ProviderStatusView }) {
  const isActive = provider.connectionState === 'connected';
  const qc = useQueryClient();
  const clearIssue = useClearProviderIssue();

  const handleClearIssue = async () => {
    await clearIssue.mutateAsync({ id: provider.id });
    void qc.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
  };

  return (
    <div className={`bg-panel border rounded-xl overflow-hidden transition-colors ${
      isActive ? 'border-primary/40' : 'border-panel-border'
    }`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-panel-border/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isActive ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30 border border-panel-border/60'
          }`}>
            <Zap className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">Z.AI</h3>
              {isActive && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary/80">
                  Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Primary AI provider — dual-lane (PAAS + Anthropic)
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Always available</span>
          </div>
        </div>
      </div>

      {/* Issue notice */}
      {provider.issue && (
        <IssueNotice provider={provider} onReconnect={handleClearIssue} />
      )}

      {/* Card body */}
      <div className="divide-y divide-panel-border/40">
        {/* API key info */}
        {provider.zaiMeta && (
          <div className="px-6 py-4">
            <p className="text-xs font-medium text-muted-foreground/70 mb-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              API Key
            </p>
            <div className="flex items-center gap-2">
              {provider.zaiMeta.hasApiKey
                ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className="text-sm text-foreground">
                {provider.zaiMeta.hasApiKey ? 'ZAI_API_KEY is set' : 'ZAI_API_KEY not set'}
              </span>
            </div>
          </div>
        )}
        {/* Description */}
        <div className="px-6 py-4">
          <div className="rounded-lg border border-panel-border/40 bg-muted/5 px-3 py-2.5 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              Z.AI is VenomGPT's primary provider. Configured via{' '}
              <code className="font-mono text-[10px] bg-muted/40 px-1 rounded">ZAI_API_KEY</code>{' '}
              in the environment. Supports dual-lane routing (PAAS + Anthropic) and vision tasks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [, navigate] = useLocation();
  const { data: providersData, isLoading, isError, refetch } = useGetProviders();
  const providers = providersData?.providers;

  const rightSlot = (
    <>
      <button
        onClick={() => void refetch()}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Refresh"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings2 className="w-3.5 h-3.5" />
        <span>Settings</span>
      </button>
    </>
  );

  return (
    <SubpageShell pageIcon={Plug} pageLabel="Integrations" rightSlot={rightSlot}>
      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto vg-scroll">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

          {/* Page title */}
          <div>
            <h1 className="text-lg font-bold text-foreground">Integrations</h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI provider status and configuration. Z.AI is the only active provider.
            </p>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Failed to load provider status — is the API server running?
            </div>
          )}

          {/* Provider cards */}
          {!isLoading && providers && (
            <div className="space-y-4">
              {providers.map(p => (
                <ProviderCard key={p.id} provider={p} />
              ))}
            </div>
          )}

          {/* Footer note */}
          {!isLoading && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground/60 px-1">
              <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p className="leading-relaxed">
                Z.AI is the only active provider. Additional providers are planned for future releases.
              </p>
            </div>
          )}

          <div className="h-8" />
        </div>
      </div>
    </SubpageShell>
  );
}
