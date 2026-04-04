import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun, Moon, Lock, LayoutGrid, Settings, Plug, FolderOpen, BookTemplate,
  ChevronRight, Zap, CheckCircle2, AlertCircle, Info, Cpu, Database,
  Activity, RotateCcw, Trash2, Eye, EyeOff, Server, Loader2, Play,
  ExternalLink,
} from "lucide-react";
import { VenomLogo } from "@/components/ui/venom-logo";
import { type VGTheme, darkTheme, lightTheme } from "@/lib/theme";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  useGetSettings, useUpdateSetting, useResetSettings, useClearHistory,
  type VenomGPTSettings, type ProviderInfo, type HistoryStats,
  type AgentModelInfo,
} from "@/hooks/use-settings";

// ─── Nav sections ─────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: "execution", label: "Execution", icon: Zap },
  { id: "ai-model", label: "AI Model", icon: Cpu },
  { id: "history", label: "History", icon: Database },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
];

const LOCKED_NAV = [
  { icon: FolderOpen, label: "Projects" },
  { icon: BookTemplate, label: "Templates" },
];

// ─── Sidebar components (shared design) ───────────────────────────────────────

function SidebarActiveBtn({ tm, onClick }: { tm: VGTheme; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title="Open IDE"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px 9px 16px",
        borderRadius: 8,
        background: hovered ? tm.accentBgHover : tm.accentBg,
        border: `1px solid ${tm.accentBorder}`,
        color: tm.accentText,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.01em",
        textAlign: "left",
        width: "100%",
        overflow: "hidden",
        transition: "background 0.15s, box-shadow 0.15s",
        boxShadow: hovered ? `0 2px 14px ${tm.accentShadow}` : "none",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 20, borderRadius: "0 3px 3px 0", background: tm.accent }} />
      <LayoutGrid size={15} style={{ opacity: 0.9, flexShrink: 0 }} />
      <span className="vg-sidebar-label" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Open IDE</span>
      <ChevronRight size={12} className="vg-sidebar-label" style={{ opacity: 0.55, flexShrink: 0, transition: "transform 0.15s", transform: hovered ? "translateX(2px)" : "none" }} />
    </button>
  );
}

function NavigableNavItem({ tm, icon: Icon, label, active, onClick }: { tm: VGTheme; icon: React.ElementType; label: string; active?: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isActive = active || hovered;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8,
        background: active ? tm.accentBg : hovered ? tm.navHover : "transparent",
        border: `1px solid ${isActive ? tm.accentBorder : "transparent"}`,
        color: active ? tm.accentText : hovered ? tm.textSecondary : tm.textMuted,
        cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 500, textAlign: "left",
        width: "100%", overflow: "hidden", transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      <Icon size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
      <span className="vg-sidebar-label" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <ChevronRight size={12} className="vg-sidebar-label" style={{ opacity: isActive ? 0.7 : 0, flexShrink: 0, transition: "opacity 0.15s, transform 0.15s", transform: hovered ? "translateX(2px)" : "none" }} />
    </button>
  );
}

function LockedNavItem({ tm, icon: Icon, label }: { tm: VGTheme; icon: React.ElementType; label: string }) {
  return (
    <div title={`${label} — coming soon`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, color: tm.lockedNavColor, cursor: "not-allowed", fontSize: 13, fontWeight: 500, userSelect: "none", overflow: "hidden", transition: "color 0.3s" }}>
      <Icon size={15} style={{ flexShrink: 0, opacity: 0.72 }} />
      <span className="vg-sidebar-label" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <Lock size={12} className="vg-sidebar-label" style={{ flexShrink: 0, color: tm.accentText, opacity: 0.55 }} />
    </div>
  );
}

function ThemeToggleBtn({ isDark, tm, onToggle }: { isDark: boolean; tm: VGTheme; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onToggle} title={isDark ? "Switch to light mode" : "Switch to dark mode"} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 8, background: hovered ? tm.navHover : "transparent", border: `1px solid ${hovered ? tm.accentBorder : tm.border}`, color: hovered ? tm.textSecondary : tm.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 500, width: "100%", overflow: "hidden", transition: "background 0.15s, border-color 0.15s, color 0.15s" }}>
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span key="sun" initial={{ opacity: 0, rotate: -30, scale: 0.7 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 30, scale: 0.7 }} transition={{ duration: 0.2 }} style={{ display: "flex", flexShrink: 0 }}><Sun size={14} /></motion.span>
        ) : (
          <motion.span key="moon" initial={{ opacity: 0, rotate: 30, scale: 0.7 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: -30, scale: 0.7 }} transition={{ duration: 0.2 }} style={{ display: "flex", flexShrink: 0 }}><Moon size={14} /></motion.span>
        )}
      </AnimatePresence>
      <span className="vg-sidebar-label" style={{ whiteSpace: "nowrap" }}>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

// ─── Settings primitives (theme-aware) ────────────────────────────────────────

function SectionCard({ id, title, icon: Icon, description, tm, children }: {
  id: string; title: string; icon: React.ElementType; description?: string; tm: VGTheme; children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 14,
        background: hovered ? tm.accentBg : tm.glassPanelBg,
        border: `1px solid ${hovered ? tm.accentBorder : tm.glassPanelBorder}`,
        backdropFilter: "blur(12px)",
        overflow: "hidden",
        transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s",
        boxShadow: hovered ? `0 4px 22px ${tm.accentShadow}` : "none",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${tm.border}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon style={{ width: 14, height: 14, color: tm.accent }} />
        </div>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: tm.textPrimary, margin: 0 }}>{title}</h2>
          {description && <p style={{ fontSize: 11, color: tm.textMuted, marginTop: 4, lineHeight: 1.6, margin: 0 }}>{description}</p>}
        </div>
      </div>
      <div>{children}</div>
    </motion.section>
  );
}

function SettingRow({ label, description, badge, tm, children }: {
  label: string; description?: string; badge?: string; tm: VGTheme; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, padding: "14px 20px", borderBottom: `1px solid ${tm.border}`, }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: tm.textPrimary }}>{label}</span>
          {badge && (
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 9999, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText, fontWeight: 600, letterSpacing: "0.02em" }}>
              {badge}
            </span>
          )}
        </div>
        {description && <p style={{ fontSize: 11, color: tm.textMuted, marginTop: 4, lineHeight: 1.6, margin: 0, maxWidth: 420 }}>{description}</p>}
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", paddingTop: 2 }}>{children}</div>
    </div>
  );
}

function StatusValue({ ok, label, tm }: { ok: boolean; label: string; tm: VGTheme }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {ok ? <CheckCircle2 style={{ width: 14, height: 14, color: "#22c55e", flexShrink: 0 }} /> : <AlertCircle style={{ width: 14, height: 14, color: tm.textDimmed, flexShrink: 0 }} />}
      <span style={{ fontSize: 13, fontWeight: 500, color: ok ? "#22c55e" : tm.textMuted }}>{label}</span>
    </div>
  );
}

function ReadOnlyValue({ value, mono, tm }: { value: string; mono?: boolean; tm: VGTheme }) {
  if (mono) {
    return (
      <code style={{ fontSize: 11, color: tm.textMuted, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, padding: "2px 8px", borderRadius: 5, fontFamily: "monospace", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", textAlign: "right" }}>
        {value}
      </code>
    );
  }
  return <span style={{ fontSize: 13, color: tm.textMuted }}>{value}</span>;
}

function SliderSetting({ value, min, max, step = 1, onChange, format, tm }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; tm: VGTheme;
}) {
  const label = format ? format(value) : String(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: 200 }}>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]: number[]) => onChange(v)} style={{ flex: 1 }} />
      <span style={{ fontSize: 13, fontFamily: "monospace", color: tm.textPrimary, width: 60, textAlign: "right", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{label}</span>
    </div>
  );
}

function SelectSetting({ value, options, onChange, tm }: {
  value: string; options: { label: string; value: string }[]; onChange: (v: string) => void; tm: VGTheme;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 13, background: tm.bgInput, border: `1px solid ${tm.accentBorder}`, borderRadius: 8,
        padding: "6px 12px", color: tm.textPrimary, outline: "none", width: 200,
        cursor: "pointer", transition: "border-color 0.15s",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ConfirmButton({ label, confirmLabel, variant = "danger", icon: Icon, onConfirm, disabled, tm }: {
  label: string; confirmLabel: string; variant?: "danger" | "warning"; icon: React.ElementType;
  onConfirm: () => Promise<void>; disabled?: boolean; tm: VGTheme;
}) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  const dangerColor = variant === "danger" ? "#ef4444" : "#eab308";

  if (confirming) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={running}
          onClick={async () => { setRunning(true); try { await onConfirm(); } finally { setRunning(false); setConfirming(false); } }}
          style={{
            fontSize: 11, padding: "5px 12px", borderRadius: 7, cursor: running ? "wait" : "pointer",
            background: `${dangerColor}15`, border: `1px solid ${dangerColor}50`, color: dangerColor,
            display: "flex", alignItems: "center", gap: 5, transition: "background 0.15s",
          }}
        >
          {running ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : <Icon style={{ width: 12, height: 12 }} />}
          {running ? "Working..." : confirmLabel}
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, background: "transparent", border: `1px solid ${tm.border}`, color: tm.textMuted, cursor: "pointer", transition: "color 0.15s" }}
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
      style={{
        fontSize: 11, padding: "5px 12px", borderRadius: 7,
        background: "transparent", border: `1px solid ${dangerColor}50`, color: dangerColor,
        cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5,
        transition: "background 0.15s", opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon style={{ width: 12, height: 12 }} />
      {label}
    </button>
  );
}

function ModelTable({ models, tm }: { models: AgentModelInfo[]; tm: VGTheme }) {
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${tm.border}`, overflow: "hidden", fontSize: 11, background: tm.accentBg }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${tm.border}` }}>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: tm.textDimmed, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>Model</th>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: tm.textDimmed, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>Lane</th>
            <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: tm.textDimmed, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>Tier</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.modelId} style={{ borderBottom: `1px solid ${tm.border}` }}>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", color: tm.textSecondary, fontSize: 11 }}>{m.modelId}</td>
              <td style={{ padding: "8px 12px", color: tm.textMuted, textTransform: "capitalize", fontSize: 11 }}>{m.lane}</td>
              <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 11 }}>
                {m.free ? <span style={{ color: "#22c55e", fontWeight: 600 }}>free</span> : <span style={{ color: tm.textDimmed }}>paid</span>}
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
  lane: string; endpoint: string; model: string;
  status: "ok" | "error"; httpStatus: number | null;
  latencyMs: number; errorCategory: string | null; errorMessage: string | null;
}

interface DiagResponse {
  ok: boolean; providerName: string; isCodingPlan: boolean;
  standardPaasURL: string; codingPaasURL: string; anthropicURL: string;
  endpointNote: string; results: DiagResult[]; error?: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function DiagnosticsSection({ provider, history, tm }: {
  provider: ProviderInfo | undefined; history: HistoryStats | undefined; tm: VGTheme;
}) {
  const [running, setRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResponse | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setRunning(true); setDiagResult(null); setDiagError(null);
    try {
      const r = await fetch(`${BASE}/api/provider-diagnostics`);
      setDiagResult(await r.json());
    } catch (err) { setDiagError(err instanceof Error ? err.message : String(err)); }
    finally { setRunning(false); }
  };

  return (
    <SectionCard id="diagnostics" title="Diagnostics" icon={Activity} description="Runtime environment, endpoint configuration, and provider connectivity." tm={tm}>
      <SettingRow label="API Key" description="Whether a valid API key is configured in the environment." tm={tm}>
        <StatusValue ok={provider?.keySet ?? false} label={provider?.keySet ? "Configured" : "Not configured"} tm={tm} />
      </SettingRow>

      <SettingRow label="Data Directory" description="Root directory for all VenomGPT state files." tm={tm}>
        <ReadOnlyValue value={history?.dataDir ?? "~/.venomgpt"} mono tm={tm} />
      </SettingRow>

      <SettingRow label="Lane Architecture" description="Z.AI uses two API lanes: PAAS and Anthropic." tm={tm}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Server style={{ width: 13, height: 13, color: tm.textMuted }} />
          <ReadOnlyValue value={provider?.hasZai ? "PAAS + Anthropic" : "Single lane"} tm={tm} />
        </div>
      </SettingRow>

      {provider?.hasZai && (
        <>
          <SettingRow label="PAAS Endpoint" description={provider.isCodingPlan ? "GLM Coding Plan endpoint." : `Standard PAAS endpoint.`} tm={tm}>
            <ReadOnlyValue value={provider.paasBaseURL ?? "—"} mono tm={tm} />
          </SettingRow>
          <SettingRow label="Anthropic Endpoint" description="Used for GLM-5 family models." tm={tm}>
            <ReadOnlyValue value={provider.anthropicBaseURL ?? "—"} mono tm={tm} />
          </SettingRow>
        </>
      )}

      {/* Connectivity test */}
      <div style={{ padding: "16px 20px", background: tm.accentBg }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: tm.textPrimary, margin: 0 }}>Provider Connectivity Test</p>
            <p style={{ fontSize: 11, color: tm.textMuted, marginTop: 3, margin: 0 }}>Ping each configured lane.</p>
          </div>
          <button
            onClick={runDiagnostics}
            disabled={running || !provider?.keySet}
            style={{
              fontSize: 12, padding: "6px 14px", borderRadius: 8,
              background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText,
              cursor: running || !provider?.keySet ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 5, transition: "background 0.15s",
              opacity: running || !provider?.keySet ? 0.5 : 1,
            }}
          >
            {running ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Play style={{ width: 12, height: 12 }} />}
            {running ? "Running..." : "Run test"}
          </button>
        </div>

        {diagError && (
          <div style={{ borderRadius: 8, border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.06)", padding: "8px 12px", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <AlertCircle style={{ width: 13, height: 13, color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{diagError}</p>
          </div>
        )}

        {diagResult && diagResult.results.map((r, i) => (
          <div key={i} style={{ borderRadius: 8, border: `1px solid ${r.status === "ok" ? "rgba(34,197,94,0.30)" : "rgba(239,68,68,0.30)"}`, background: r.status === "ok" ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)", padding: "10px 12px", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {r.status === "ok" ? <CheckCircle2 style={{ width: 13, height: 13, color: "#22c55e" }} /> : <AlertCircle style={{ width: 13, height: 13, color: "#ef4444" }} />}
                <span style={{ fontSize: 11, fontWeight: 600, color: tm.textPrimary, textTransform: "capitalize" }}>{r.lane} lane</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", padding: "1px 6px", borderRadius: 4, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText }}>{r.model}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: r.status === "ok" ? "#22c55e" : "#ef4444" }}>{r.httpStatus ? `HTTP ${r.httpStatus}` : "no response"}</span>
                <span style={{ fontSize: 10, color: tm.textDimmed }}>{r.latencyMs}ms</span>
              </div>
            </div>
            {r.status === "error" && r.errorMessage && (
              <p style={{ fontSize: 10, color: "#ef4444", margin: "6px 0 0", lineHeight: 1.5, wordBreak: "break-all" }}>{r.errorMessage}</p>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [isDark, setIsDark] = useState(true);
  const [, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState("execution");
  const contentRef = useRef<HTMLDivElement>(null);
  const tm = isDark ? darkTheme : lightTheme;

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
      contentRef.current.scrollTo({ top: el.offsetTop - 24, behavior: "smooth" });
    }
  };

  const agentModelOptions = [
    { label: "Auto (recommended)", value: "" },
    ...(provider?.agentModels ?? []).map((m) => ({ label: `${m.modelId}${m.free ? " (free)" : ""}`, value: m.modelId })),
  ];

  const visionModelOptions = [
    { label: "Auto (recommended)", value: "" },
    ...(provider?.visionModels ?? []).map((m) => ({ label: `${m.modelId}${m.free ? " (free)" : ""}`, value: m.modelId })),
  ];

  const historyCapOptions = [25, 50, 100, 200].map((n) => ({ label: `${n} tasks`, value: String(n) }));

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: tm.bgBase, color: tm.textPrimary, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif", position: "relative", transition: "background 0.3s, color 0.3s" }}>
      {/* Background mesh */}
      <div style={{ position: "absolute", inset: 0, background: tm.glassMesh, pointerEvents: "none", zIndex: 0, transition: "background 0.4s" }} />
      <div style={{ position: "absolute", inset: 0, background: tm.atmosphericGlow, pointerEvents: "none", zIndex: 0, transition: "background 0.4s" }} />

      {/* ── Sidebar ── */}
      <aside className="vg-home-sidebar" style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", width: 240, minWidth: 240, maxWidth: 240, height: "100%", borderRight: `1px solid ${tm.sidebarDivider}`, background: tm.sidebarBg, flexShrink: 0, overflowX: "hidden", transition: "background 0.3s, border-color 0.3s" }}>
        {/* Branding */}
        <div style={{ height: 46, flexShrink: 0, padding: "0 14px", display: "flex", alignItems: "center", gap: 11, borderBottom: `1px solid ${tm.sidebarDivider}`, position: "relative", overflow: "hidden", background: tm.sidebarHeaderBg, transition: "background 0.3s, border-color 0.3s" }}>
          <div style={{ position: "absolute", inset: 0, background: tm.sidebarHeaderGlow, pointerEvents: "none", transition: "background 0.4s" }} />
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", filter: isDark ? "drop-shadow(0 0 4px rgba(255,255,255,0.35)) drop-shadow(0 0 10px rgba(255,255,255,0.12))" : "none", transition: "filter 0.3s" }}>
            <VenomLogo size={30} />
          </div>
          <div className="vg-sidebar-label" style={{ minWidth: 0, position: "relative" }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "0.08em", lineHeight: 1.15, whiteSpace: "nowrap", transition: "color 0.3s" }}>
              <span style={{ color: tm.textPrimary }}>VENOM</span>
              <span style={{ color: tm.accent, fontWeight: 300, transition: "color 0.3s" }}>GPT</span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1, position: "relative" }}>
          <SidebarActiveBtn tm={tm} onClick={() => navigate("/ide")} />
          <NavigableNavItem tm={tm} icon={Plug} label="Integrations" onClick={() => navigate("/integrations")} />
          <NavigableNavItem tm={tm} icon={Settings} label="Settings" active onClick={() => navigate("/settings")} />

          <div style={{ padding: "10px 4px 4px", display: "flex", flexDirection: "column", gap: 1 }}>
            <div className="vg-sidebar-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: tm.sectionLabel, padding: "0 8px", marginBottom: 3, transition: "color 0.3s" }}>Coming Soon</div>
            {LOCKED_NAV.map(({ icon, label }) => <LockedNavItem key={label} tm={tm} icon={icon} label={label} />)}
          </div>
        </nav>

        <div style={{ padding: "10px 8px 16px", borderTop: `1px solid ${tm.sidebarDivider}`, position: "relative", transition: "border-color 0.3s" }}>
          <ThemeToggleBtn isDark={isDark} tm={tm} onToggle={() => setIsDark((d) => !d)} />
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ height: 46, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", borderBottom: `1px solid ${tm.border}`, background: tm.glassPanelBg, backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Settings style={{ width: 16, height: 16, color: tm.accent }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: tm.textPrimary }}>Settings</span>
            <span style={{ fontSize: 11, color: tm.textMuted, marginLeft: 4 }}>Configure your workspace</span>
          </div>
          {isSaving && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: tm.textMuted }}>
              <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
              <span>Saving...</span>
            </div>
          )}
        </div>

        {/* Body: section nav + scrollable content */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          {/* Section nav */}
          <aside style={{ width: 200, flexShrink: 0, padding: "16px 8px", borderRight: `1px solid ${tm.border}`, background: tm.glassPanelBg, backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", gap: 2 }}>
            <p className="vg-sidebar-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: tm.sectionLabel, padding: "0 12px", marginBottom: 6, transition: "color 0.3s" }}>Sections</p>
            {NAV_SECTIONS.map(({ id, label, icon: Icon }) => {
              const isActive = activeSection === id;
              const [hov, setHov] = useState(false);
              return (
                <button
                  key={id}
                  onClick={() => scrollToSection(id)}
                  onMouseEnter={() => setHov(true)}
                  onMouseLeave={() => setHov(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8,
                    background: isActive ? tm.accentBg : hov ? tm.navHover : "transparent",
                    border: `1px solid ${isActive ? tm.accentBorder : "transparent"}`,
                    color: isActive ? tm.accentText : hov ? tm.textSecondary : tm.textMuted,
                    cursor: "pointer", fontSize: 13, fontWeight: isActive ? 600 : 500, textAlign: "left",
                    width: "100%", transition: "background 0.15s, border-color 0.15s, color 0.15s",
                  }}
                >
                  <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span className="vg-sidebar-label">{label}</span>
                </button>
              );
            })}
          </aside>

          {/* Scrollable content */}
          <div ref={contentRef} className="vg-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
            onScroll={() => {
              const offsets = NAV_SECTIONS.map((sec) => {
                const el = document.getElementById(sec.id);
                return el ? { id: sec.id, top: el.offsetTop } : null;
              }).filter(Boolean) as { id: string; top: number }[];
              const scrollTop = contentRef.current?.scrollTop ?? 0;
              const visible = offsets.filter((o) => o.top <= scrollTop + 80);
              if (visible.length > 0) setActiveSection(visible[visible.length - 1].id);
            }}
          >
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 36px 44px", display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Loading */}
              {isLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: tm.textMuted, padding: "16px 0" }}>
                  <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                  Loading settings...
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)", borderRadius: 12, padding: "12px 16px" }}>
                  <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                  Failed to load settings — is the API server running?
                </div>
              )}

              {s && (
                <>
                  {/* Execution */}
                  <SectionCard id="execution" title="Agent Execution" icon={Zap} description="Controls how the agent plans and runs tasks." tm={tm}>
                    <SettingRow label="Max Steps" description="Maximum action turns per task." badge="functional" tm={tm}>
                      <SliderSetting value={s.maxSteps} min={5} max={50} onChange={(v) => set("maxSteps", v)} format={(v) => `${v} steps`} tm={tm} />
                    </SettingRow>
                    <SettingRow label="Command Timeout" description="Time ceiling for each shell command." badge="functional" tm={tm}>
                      <SliderSetting value={s.commandTimeoutSecs} min={30} max={300} step={15} onChange={(v) => set("commandTimeoutSecs", v)} format={(v) => `${v}s`} tm={tm} />
                    </SettingRow>
                    <SettingRow label="Show Thought Events" description="Display reasoning steps in the task console." badge="functional" tm={tm}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {s.showThinkEvents ? <Eye style={{ width: 14, height: 14, color: tm.textMuted }} /> : <EyeOff style={{ width: 14, height: 14, color: tm.textMuted }} />}
                        <Switch checked={s.showThinkEvents} onCheckedChange={(v) => set("showThinkEvents", v)} />
                      </div>
                    </SettingRow>
                  </SectionCard>

                  {/* AI Model */}
                  <SectionCard id="ai-model" title="AI Model" icon={Cpu} description="Configure which models the agent uses." tm={tm}>
                    <SettingRow label="Provider" description="Determined by environment." tm={tm}>
                      <StatusValue ok={provider?.keySet ?? false} label={provider?.name ?? "—"} tm={tm} />
                    </SettingRow>
                    <SettingRow label="Primary Model" description="Used for coding and agentic tasks." badge="functional" tm={tm}>
                      <SelectSetting value={s.agentModelOverride ?? ""} options={agentModelOptions} onChange={(v) => set("agentModelOverride", v || null)} tm={tm} />
                    </SettingRow>
                    <SettingRow label="Vision Model" description="Used to analyze screenshots." badge="functional" tm={tm}>
                      <SelectSetting value={s.visionModelOverride ?? ""} options={visionModelOptions} onChange={(v) => set("visionModelOverride", v || null)} tm={tm} />
                    </SettingRow>

                    {provider && (
                      <div style={{ padding: "16px 20px", background: tm.accentBg, display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                            <Info style={{ width: 13, height: 13 }} /> Coding models
                          </p>
                          <ModelTable models={provider.agentModels} tm={tm} />
                        </div>
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                            <Info style={{ width: 13, height: 13 }} /> Vision models
                          </p>
                          <ModelTable models={provider.visionModels} tm={tm} />
                        </div>
                      </div>
                    )}

                    {/* Deferred note */}
                    <div style={{ padding: "14px 20px", background: tm.accentBg }}>
                      <div style={{ borderRadius: 8, border: `1px solid ${tm.border}`, background: tm.glassPanelBg, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <Lock style={{ width: 13, height: 13, color: tm.textDimmed, flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: tm.textMuted }}>Deferred settings</span>
                          <p style={{ fontSize: 10, color: tm.textDimmed, margin: "4px 0 0", lineHeight: 1.6 }}>
                            Temperature, context-window size, and per-request token budgets are calibrated per intent type and not yet exposed.
                          </p>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  {/* History */}
                  <SectionCard id="history" title="History & Data" icon={Database} description="Manage task history retention and storage." tm={tm}>
                    <SettingRow label="History Capacity" description="Maximum completed tasks retained." badge="functional" tm={tm}>
                      <SelectSetting value={String(s.historyCapacity)} options={historyCapOptions} onChange={(v) => set("historyCapacity", Number(v))} tm={tm} />
                    </SettingRow>
                    <SettingRow label="Tasks Stored" description="Current number of task records." tm={tm}>
                      <ReadOnlyValue value={String(history?.count ?? "—")} tm={tm} />
                    </SettingRow>
                    <SettingRow label="Storage Location" description="Path to the history file on disk." tm={tm}>
                      <ReadOnlyValue value={history?.filePath ?? "—"} mono tm={tm} />
                    </SettingRow>
                    <SettingRow label="Clear History" description="Permanently delete all task history." badge="functional" tm={tm}>
                      <ConfirmButton label="Clear History" confirmLabel="Yes, clear all" icon={Trash2} onConfirm={clearHist} disabled={history?.count === 0} tm={tm} />
                    </SettingRow>
                  </SectionCard>

                  {/* Diagnostics */}
                  <DiagnosticsSection provider={provider} history={history} tm={tm} />

                  {/* Reset all */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      borderRadius: 14, background: tm.glassPanelBg, border: "1px solid rgba(234,179,8,0.20)",
                      backdropFilter: "blur(12px)", padding: "16px 20px",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: tm.textPrimary, margin: 0 }}>Reset all settings</p>
                      <p style={{ fontSize: 11, color: tm.textMuted, marginTop: 3, margin: 0 }}>Restore every setting to factory defaults.</p>
                    </div>
                    <ConfirmButton label="Reset to defaults" confirmLabel="Yes, reset all" variant="warning" icon={RotateCcw} onConfirm={async () => { await reset(); }} tm={tm} />
                  </motion.div>

                  <div style={{ height: 32 }} />
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Responsive + animations */}
      <style>{`
        @media (max-width: 960px) {
          .vg-home-sidebar {
            width: 58px !important;
            min-width: 58px !important;
            max-width: 58px !important;
          }
          .vg-home-sidebar .vg-sidebar-label { display: none !important; }
        }
        @media (max-width: 480px) {
          .vg-home-sidebar { display: none !important; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
