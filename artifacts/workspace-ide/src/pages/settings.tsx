import { useState, useCallback, useRef } from 'react';
import {
  Settings2, Cpu, Database, Activity, RotateCcw,
  Trash2, CheckCircle2, AlertCircle, Info, Zap, Eye, EyeOff,
  Server, Lock, Loader2, Play, ExternalLink,
} from 'lucide-react';
import { SubpageShell } from '@/components/layout/subpage-shell';
import {
  useGetSettings, useUpdateSetting, useResetSettings, useClearHistory,
  type VenomGPTSettings,
} from '@/hooks/use-settings';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

// ─── Nav sections ─────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: 'execution', label: 'Execution', icon: Zap },
  { id: 'ai-model',  label: 'AI Model',  icon: Cpu },
  { id: 'history',   label: 'History',   icon: Database },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
];

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionCard({
  id, title, icon: Icon, description, children,
}: {
  id: string;
  title: string;
  icon: React.ElementType;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="bg-panel border border-panel-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-panel-border/60 flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      <div className="divide-y divide-panel-border/40">
        {children}
      </div>
    </section>
  );
}

function SettingRow({
  label, description, children, badge,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-8 px-6 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {badge && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary/80">
              {badge}
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-md">{description}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center pt-0.5">
        {children}
      </div>
    </div>
  );
}

function ReadOnlyValue({ value, mono = false }: { value: string; mono?: boolean }) {
  if (mono) {
    return (
      <code className="text-xs text-muted-foreground bg-muted/40 border border-panel-border/60 px-2 py-1 rounded font-mono max-w-[240px] truncate block text-right">
        {value}
      </code>
    );
  }
  return <span className="text-sm text-muted-foreground">{value}</span>;
}

function StatusValue({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        : <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
      <span className={`text-sm font-medium ${ok ? 'text-success' : 'text-destructive'}`}>{label}</span>
    </div>
  );
}

function SliderSetting({
  value, min, max, step = 1, onChange, format,
}: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const label = format ? format(value) : String(value);
  return (
    <div className="flex items-center gap-3 w-52">
      <Slider
        min={min} max={max} step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
      <span className="text-sm font-mono text-foreground w-16 text-right tabular-nums shrink-0">{label}</span>
    </div>
  );
}

function SelectSetting({
  value, options, onChange,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-sm bg-background border border-panel-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-52 transition-colors hover:border-primary/40"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ConfirmButton({
  label, confirmLabel, variant = 'danger', icon: Icon, onConfirm, disabled,
}: {
  label: string; confirmLabel: string;
  variant?: 'danger' | 'warning';
  icon: React.ElementType;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  const dangerCls = 'border-destructive/50 text-destructive hover:bg-destructive/10';
  const warnCls   = 'border-warning/50 text-warning hover:bg-warning/10';
  const base      = variant === 'danger' ? dangerCls : warnCls;

  const confirmCls = variant === 'danger'
    ? 'border-destructive text-destructive bg-destructive/15'
    : 'border-warning text-warning bg-warning/15';

  if (confirming) {
    return (
      <div className="flex gap-2">
        <button
          disabled={running}
          onClick={async () => {
            setRunning(true);
            try { await onConfirm(); } finally { setRunning(false); setConfirming(false); }
          }}
          className={`text-xs px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-colors ${confirmCls}`}
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
          {running ? 'Working…' : confirmLabel}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs px-3 py-1.5 border border-panel-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className={`text-xs px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${base}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function ModelTable({ models }: { models: { modelId: string; displayName: string; lane: string; free: boolean }[] }) {
  return (
    <div className="rounded-lg border border-panel-border/60 overflow-hidden text-xs bg-background/40">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/20 border-b border-panel-border/60">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground/70">Model</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground/70">Lane</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground/70">Tier</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-panel-border/30">
          {models.map((m) => (
            <tr key={m.modelId} className="hover:bg-muted/10 transition-colors">
              <td className="px-3 py-2 font-mono text-foreground/90">{m.modelId}</td>
              <td className="px-3 py-2 text-muted-foreground capitalize">{m.lane}</td>
              <td className="px-3 py-2 text-right">
                {m.free
                  ? <span className="text-success/80 font-medium">free</span>
                  : <span className="text-muted-foreground/50">paid</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Diagnostics section ──────────────────────────────────────────────────────

interface DiagResult {
  lane: string;
  baseURL: string;
  endpoint: string;
  model: string;
  status: 'ok' | 'error';
  httpStatus: number | null;
  latencyMs: number;
  errorCategory: string | null;
  errorMessage: string | null;
}

interface DiagResponse {
  ok: boolean;
  providerName: string;
  isCodingPlan: boolean;
  standardPaasURL: string;
  codingPaasURL: string;
  anthropicURL: string;
  endpointNote: string;
  results: DiagResult[];
  error?: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function DiagnosticsSection({
  provider,
  history,
}: {
  provider: import('@/hooks/use-settings').ProviderInfo | undefined;
  history: import('@/hooks/use-settings').HistoryStats | undefined;
}) {
  const [running, setRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResponse | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setRunning(true);
    setDiagResult(null);
    setDiagError(null);
    try {
      const r = await fetch(`${BASE}/api/provider-diagnostics`);
      const data = await r.json() as DiagResponse;
      setDiagResult(data);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <SectionCard
      id="diagnostics"
      title="Diagnostics"
      icon={Activity}
      description="Runtime environment, endpoint configuration, and provider connectivity."
    >
      <SettingRow
        label="API Key"
        description="Whether a valid API key is configured in the environment."
      >
        <StatusValue ok={provider?.keySet ?? false} label={provider?.keySet ? 'Configured' : 'Not configured'} />
      </SettingRow>

      <SettingRow
        label="Data Directory"
        description="Root directory for all VenomGPT state files (settings.json, history.json)."
      >
        <ReadOnlyValue value={history?.dataDir ?? '~/.venomgpt'} mono />
      </SettingRow>

      <SettingRow
        label="Lane Architecture"
        description="Z.AI uses two API lanes: PAAS (OpenAI-compatible, vision + free models) and Anthropic (GLM-5 family, coding/agentic tasks)."
      >
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-muted-foreground" />
          <ReadOnlyValue value={provider?.hasZai ? 'PAAS + Anthropic' : 'Single lane'} />
        </div>
      </SettingRow>

      {provider?.hasZai && (
        <>
          <SettingRow
            label="PAAS Endpoint"
            description={
              provider.isCodingPlan
                ? 'GLM Coding Plan endpoint — required for coding-plan subscribers.'
                : `Standard PAAS endpoint. If you have a GLM Coding Plan key and see 1113 errors, set ZAI_BASE_URL=${provider.codingPaasURL}`
            }
          >
            <div className="flex flex-col items-end gap-1">
              <ReadOnlyValue value={provider.paasBaseURL ?? '—'} mono />
              {provider.isCodingPlan && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary/80">
                  Coding Plan
                </Badge>
              )}
            </div>
          </SettingRow>

          <SettingRow
            label="Anthropic Endpoint"
            description="Used for GLM-5 family models (agentic/coding). Same host as PAAS, different path."
          >
            <ReadOnlyValue value={provider.anthropicBaseURL ?? '—'} mono />
          </SettingRow>

          {provider.endpointNote && (
            <div className="px-6 py-3 bg-background/20">
              <div className="rounded-lg border border-panel-border/50 bg-muted/10 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-muted-foreground/70 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground/80 leading-relaxed">{provider.endpointNote}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Provider ping */}
      <div className="px-6 py-4 bg-background/20 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Provider Connectivity Test</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Send a minimal ping to each configured lane and report the result.
            </p>
          </div>
          <button
            onClick={runDiagnostics}
            disabled={running || !provider?.keySet}
            className="text-xs px-3 py-1.5 border border-primary/50 text-primary rounded-lg flex items-center gap-1.5 transition-colors hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {running ? 'Running…' : 'Run test'}
          </button>
        </div>

        {diagError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{diagError}</p>
          </div>
        )}

        {diagResult && (
          <div className="space-y-2">
            {diagResult.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <p className="text-xs text-destructive">{diagResult.error}</p>
              </div>
            )}
            {diagResult.results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${r.status === 'ok' ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {r.status === 'ok'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      : <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                    <span className="text-xs font-medium text-foreground capitalize">{r.lane} lane</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-mono">{r.model}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium ${r.status === 'ok' ? 'text-success' : 'text-destructive'}`}>
                      {r.httpStatus ? `HTTP ${r.httpStatus}` : 'no response'}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">{r.latencyMs}ms</span>
                  </div>
                </div>
                <code className="text-[10px] text-muted-foreground/70 font-mono block truncate">{r.endpoint}</code>
                {r.status === 'error' && r.errorMessage && (
                  <div className="rounded bg-destructive/10 px-2 py-1">
                    <p className="text-[10px] text-destructive leading-relaxed break-all">{r.errorMessage}</p>
                  </div>
                )}
              </div>
            ))}

            {diagResult.endpointNote && (
              <div className="rounded-lg border border-panel-border/50 bg-muted/10 px-3 py-2 flex items-start gap-2">
                <ExternalLink className="w-3 h-3 text-muted-foreground/60 mt-0.5 shrink-0" />
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{diagResult.endpointNote}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('execution');
  const contentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useGetSettings();
  const { mutate: update, isPending: isSaving } = useUpdateSetting();
  const { mutateAsync: reset } = useResetSettings();
  const { mutateAsync: clearHist } = useClearHistory();

  const s = data?.settings;
  const provider = data?.provider;
  const history = data?.history;

  const set = useCallback(<K extends keyof VenomGPTSettings>(key: K, value: VenomGPTSettings[K]) => {
    update({ [key]: value } as Partial<VenomGPTSettings>);
  }, [update]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el && contentRef.current) {
      const top = el.offsetTop - 24;
      contentRef.current.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const agentModelOptions = [
    { label: 'Auto (recommended)', value: '' },
    ...(provider?.agentModels ?? []).map(m => ({
      label: `${m.modelId}${m.free ? ' (free)' : ''}`,
      value: m.modelId,
    })),
  ];

  const visionModelOptions = [
    { label: 'Auto (recommended)', value: '' },
    ...(provider?.visionModels ?? []).map(m => ({
      label: `${m.modelId}${m.free ? ' (free)' : ''}`,
      value: m.modelId,
    })),
  ];

  const historyCapOptions = [25, 50, 100, 200].map(n => ({ label: `${n} tasks`, value: String(n) }));

  const savingSlot = isSaving ? (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="w-3 h-3 animate-spin" />
      <span>Saving…</span>
    </div>
  ) : null;

  return (
    <SubpageShell pageIcon={Settings2} pageLabel="Settings" rightSlot={savingSlot}>
      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Sidebar nav */}
        <aside className="w-52 bg-panel border-r border-panel-border flex flex-col shrink-0 py-4 px-2">
          <p className="px-3 mb-2 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Sections</p>
          <nav className="space-y-0.5">
            {NAV_SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => scrollToSection(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  activeSection === id
                    ? 'bg-primary/10 border border-primary/20 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Scrollable content */}
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto min-h-0 vg-scroll"
          onScroll={() => {
            // Update active nav item based on scroll position
            const offsets = NAV_SECTIONS.map(s => {
              const el = document.getElementById(s.id);
              return el ? { id: s.id, top: el.offsetTop } : null;
            }).filter(Boolean) as { id: string; top: number }[];

            const scrollTop = contentRef.current?.scrollTop ?? 0;
            const visible = offsets.filter(o => o.top <= scrollTop + 80);
            if (visible.length > 0) {
              setActiveSection(visible[visible.length - 1].id);
            }
          }}
        >
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

            {/* Loading / Error states */}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading settings…
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Failed to load settings — is the API server running?
              </div>
            )}

            {s && (
              <>
                {/* ── 1. Agent Execution ──────────────────────────────────── */}
                <SectionCard
                  id="execution"
                  title="Agent Execution"
                  icon={Zap}
                  description="Controls how the agent plans and runs tasks."
                >
                  <SettingRow
                    label="Max Steps"
                    description="Maximum action turns per task. Higher values allow more complex tasks but increase runtime and cost."
                    badge="functional"
                  >
                    <SliderSetting
                      value={s.maxSteps}
                      min={5} max={50}
                      onChange={v => set('maxSteps', v)}
                      format={v => `${v} steps`}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Command Timeout"
                    description="Time ceiling for each shell command. The agent may request less; this is the hard upper limit."
                    badge="functional"
                  >
                    <SliderSetting
                      value={s.commandTimeoutSecs}
                      min={30} max={300} step={15}
                      onChange={v => set('commandTimeoutSecs', v)}
                      format={v => `${v}s`}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Show Thought Events"
                    description="Display [PLANNING], [INSPECTING], and [EDITING] reasoning steps in the task console. Disable for a cleaner log showing only actions and results."
                    badge="functional"
                  >
                    <div className="flex items-center gap-2.5">
                      {s.showThinkEvents
                        ? <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                      <Switch
                        checked={s.showThinkEvents}
                        onCheckedChange={v => set('showThinkEvents', v)}
                      />
                    </div>
                  </SettingRow>
                </SectionCard>

                {/* ── 2. AI Model ─────────────────────────────────────────── */}
                <SectionCard
                  id="ai-model"
                  title="AI Model"
                  icon={Cpu}
                  description="Configure which models the agent uses for coding and vision tasks."
                >
                  <SettingRow
                    label="Provider"
                    description="Determined by environment. Set ZAI_API_KEY for Z.AI or configure the Replit AI integration for OpenAI."
                  >
                    <StatusValue ok={provider?.keySet ?? false} label={provider?.name ?? '—'} />
                  </SettingRow>

                  <SettingRow
                    label="Primary Model"
                    description="Used for coding and agentic tasks. Auto follows the GLM-5.1 → GLM-5 → GLM-4.7 fallback chain."
                    badge="functional"
                  >
                    <SelectSetting
                      value={s.agentModelOverride ?? ''}
                      options={agentModelOptions}
                      onChange={v => set('agentModelOverride', v || null)}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Vision Model"
                    description="Used to analyze screenshots. Auto tries GLM-4.6V then falls back to GLM-4.6V-Flash (free)."
                    badge="functional"
                  >
                    <SelectSetting
                      value={s.visionModelOverride ?? ''}
                      options={visionModelOptions}
                      onChange={v => set('visionModelOverride', v || null)}
                    />
                  </SettingRow>

                  {/* Model registry */}
                  {provider && (
                    <div className="px-6 py-4 space-y-4 bg-background/20">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground/70 flex items-center gap-1.5 mb-2">
                          <Info className="w-3.5 h-3.5" /> Coding models
                        </p>
                        <ModelTable models={provider.agentModels} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground/70 flex items-center gap-1.5 mb-2">
                          <Info className="w-3.5 h-3.5" /> Vision models
                        </p>
                        <ModelTable models={provider.visionModels} />
                      </div>
                    </div>
                  )}

                  {/* Deferred settings note */}
                  <div className="px-6 py-4 bg-background/20">
                    <div className="rounded-lg border border-panel-border/50 bg-muted/10 px-4 py-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                        <Lock className="w-3.5 h-3.5" />
                        <span className="font-medium">Deferred settings</span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 leading-relaxed">
                        Temperature, context-window size, and per-request token budgets are calibrated
                        per intent type and not yet exposed. They will be configurable in a future pass.
                      </p>
                    </div>
                  </div>
                </SectionCard>

                {/* ── 3. History & Data ───────────────────────────────────── */}
                <SectionCard
                  id="history"
                  title="History & Data"
                  icon={Database}
                  description="Manage task history retention and storage."
                >
                  <SettingRow
                    label="History Capacity"
                    description="Maximum completed tasks retained. Older records are trimmed on the next task completion."
                    badge="functional"
                  >
                    <SelectSetting
                      value={String(s.historyCapacity)}
                      options={historyCapOptions}
                      onChange={v => set('historyCapacity', Number(v))}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Tasks Stored"
                    description="Current number of task records in history."
                  >
                    <ReadOnlyValue value={String(history?.count ?? '—')} />
                  </SettingRow>

                  <SettingRow
                    label="Storage Location"
                    description="Path to the history file on disk."
                  >
                    <ReadOnlyValue value={history?.filePath ?? '—'} mono />
                  </SettingRow>

                  <SettingRow
                    label="Clear History"
                    description="Permanently delete all task history. Running tasks are unaffected."
                    badge="functional"
                  >
                    <ConfirmButton
                      label="Clear History"
                      confirmLabel="Yes, clear all"
                      icon={Trash2}
                      onConfirm={clearHist}
                      disabled={history?.count === 0}
                    />
                  </SettingRow>
                </SectionCard>

                {/* ── 4. Diagnostics ──────────────────────────────────────── */}
                <DiagnosticsSection provider={provider} history={history} />

                {/* ── Reset all ───────────────────────────────────────────── */}
                <div className="bg-panel border border-warning/20 rounded-xl px-6 py-4 flex items-center justify-between gap-6">
                  <div>
                    <p className="text-sm font-medium text-foreground">Reset all settings</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Restore every setting to factory defaults. Task history is not affected.
                    </p>
                  </div>
                  <ConfirmButton
                    label="Reset to defaults"
                    confirmLabel="Yes, reset all"
                    variant="warning"
                    icon={RotateCcw}
                    onConfirm={async () => { await reset(); }}
                  />
                </div>

                {/* Bottom padding */}
                <div className="h-8" />
              </>
            )}
          </div>
        </main>
      </div>
    </SubpageShell>
  );
}
