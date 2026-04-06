import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Plug, Zap, CheckCircle2, AlertCircle, Info, AlertTriangle,
  RefreshCw, Loader2, ExternalLink, Settings2, Shield, Cpu, Eye,
  Activity, Server,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Provider diagnostics types ─────────────────────────────────────────────

interface LaneDiagResult {
  lane: string;
  model: string;
  status: "ok" | "error";
  httpStatus: number | null;
  latencyMs: number;
  errorMessage: string | null;
}

interface ProviderDiagnosticsResponse {
  ok: boolean;
  providerName: string;
  keyConfigured: boolean;
  results: LaneDiagResult[];
}

// ─── Provider diagnostics panel ─────────────────────────────────────────────

function ProviderDiagnosticsPanel({ tm, refreshKey }: { tm: VGTheme; refreshKey: number }) {
  const [data, setData]       = useState<ProviderDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchDiag = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/provider-diagnostics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as ProviderDiagnosticsResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchDiag(); }, [fetchDiag, refreshKey]);

  const activeModel = data?.results?.[0]?.model ?? null;
  const laneCount   = data?.results?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        borderRadius: 14,
        background: tm.glassPanelBg,
        border: `1px solid ${tm.glassPanelBorder}`,
        backdropFilter: "blur(12px)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${tm.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Activity style={{ width: 16, height: 16, color: tm.accent }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: tm.textPrimary }}>Provider Diagnostics</span>
        </div>
        {loading && <Loader2 style={{ width: 14, height: 14, color: tm.textDimmed, animation: "spin 1s linear infinite" }} />}
        {!loading && data && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: data.ok ? "#22c55e" : "#ef4444" }}>
            {data.ok
              ? <CheckCircle2 style={{ width: 13, height: 13 }} />
              : <AlertCircle style={{ width: 13, height: 13 }} />}
            <span>{data.ok ? "All lanes healthy" : "Issues detected"}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)", borderRadius: 8, padding: "8px 12px" }}>
            <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
            Diagnostics unavailable — {error}
          </div>
        )}

        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Active provider */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                <Server style={{ width: 11, height: 11 }} />
                Active Provider
              </div>
              <span style={{ fontSize: 13, color: tm.textSecondary, fontWeight: 600 }}>{data.providerName}</span>
            </div>

            {/* Lane count */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                <Cpu style={{ width: 11, height: 11 }} />
                Lanes
              </div>
              <span style={{ fontSize: 13, color: tm.textSecondary, fontWeight: 600 }}>{laneCount} active</span>
            </div>

            {/* Active model */}
            {activeModel && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  <Zap style={{ width: 11, height: 11 }} />
                  Active Model
                </div>
                <code style={{ fontSize: 11, color: tm.textSecondary, background: tm.accentBg, padding: "2px 7px", borderRadius: 5 }}>{activeModel}</code>
              </div>
            )}

            {/* Connection health */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                <Eye style={{ width: 11, height: 11 }} />
                Connection Health
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: data.ok ? "#22c55e" : "#ef4444" }}>
                {data.ok ? "Confirmed" : "Degraded"}
              </span>
            </div>
          </div>
        )}

        {/* Per-lane results */}
        {data && data.results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
            {data.results.map(lane => (
              <div
                key={lane.lane}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: tm.textMuted, background: tm.accentBg, border: `1px solid ${tm.border}`, borderRadius: 7, padding: "6px 10px" }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: lane.status === "ok" ? "#22c55e" : "#ef4444", flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: tm.textSecondary, minWidth: 64 }}>{lane.lane}</span>
                <code style={{ fontSize: 10, background: "transparent", color: tm.textDimmed }}>{lane.model}</code>
                <span style={{ marginLeft: "auto", fontSize: 10, color: tm.textDimmed }}>{lane.latencyMs}ms</span>
                {lane.errorMessage && (
                  <span style={{ fontSize: 10, color: "#ef4444", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lane.errorMessage}>
                    {lane.errorMessage}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
import { type VGTheme } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import PageLayout from "@/components/layout/page-layout";
import {
  useGetProviders, useClearProviderIssue,
  type ProviderStatusView, type ProviderIssueCategory,
} from "@/hooks/use-providers";
import { useQueryClient } from "@tanstack/react-query";
import { PROVIDERS_QUERY_KEY } from "@/hooks/use-providers";

// ─── Issue category labels ──────────────────────────────────────────────────────

const ISSUE_LABELS: Record<ProviderIssueCategory, string> = {
  auth_failed: "Authentication Failed",
  session_expired: "Session Expired",
  token_refresh_failed: "Token Refresh Failed",
  subscription_invalid: "Account Issue",
  model_unavailable: "Model Unavailable",
  usage_limit: "API Quota / No Credits",
  entitlement_mismatch: "Entitlement Mismatch",
  wrong_api_path: "API Path Error",
};

// ─── Issue notice ───────────────────────────────────────────────────────────────

function IssueNotice({ tm, provider, onReconnect }: {
  tm: VGTheme; provider: ProviderStatusView; onReconnect: () => void;
}) {
  const { issue } = provider;
  if (!issue) return null;

  const label = ISSUE_LABELS[issue.category] ?? "Provider Issue";
  const needsReconnect = ["auth_failed", "session_expired", "token_refresh_failed"].includes(issue.category);
  const [reconnectHovered, setReconnectHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      style={{ margin: "0 0 16px", borderRadius: 11, border: "1px solid rgba(239,68,68,0.30)", background: "rgba(239,68,68,0.06)", overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px" }}>
        <AlertCircle style={{ width: 16, height: 16, color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", margin: 0 }}>{label}</p>
          <p style={{ fontSize: 11, color: "rgba(239,68,68,0.75)", marginTop: 4, lineHeight: 1.5, margin: 0 }}>{issue.message}</p>
          <p style={{ fontSize: 11, color: tm.textMuted, marginTop: 6, lineHeight: 1.5, margin: 0 }}>
            <span style={{ fontWeight: 600 }}>Recommended:</span> {issue.action}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {needsReconnect && (
              <button
                onClick={onReconnect}
                onMouseEnter={() => setReconnectHovered(true)}
                onMouseLeave={() => setReconnectHovered(false)}
                style={{ fontSize: 11, padding: "4px 10px", background: reconnectHovered ? "rgba(239,68,68,0.20)" : "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", color: "#ef4444", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "background 0.15s" }}
              >
                <RefreshCw style={{ width: 11, height: 11 }} />
                Clear Issue
              </button>
            )}
            <span style={{ fontSize: 10, color: tm.textDimmed, marginLeft: "auto" }}>
              Detected {new Date(issue.detectedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Provider card ──────────────────────────────────────────────────────────────

function ProviderCard({ tm, provider }: { tm: VGTheme; provider: ProviderStatusView }) {
  const isActive = provider.connectionState === "connected";
  const qc = useQueryClient();
  const clearIssue = useClearProviderIssue();
  const [hovered, setHovered] = useState(false);

  const handleClearIssue = async () => {
    await clearIssue.mutateAsync({ id: provider.id });
    void qc.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 14,
        background: hovered ? tm.accentBg : tm.glassPanelBg,
        border: `1px solid ${isActive ? tm.accentBorder : hovered ? tm.accentBorder : tm.glassPanelBorder}`,
        backdropFilter: "blur(12px)",
        overflow: "hidden",
        transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s",
        boxShadow: hovered ? `0 4px 22px ${tm.accentShadow}` : "none",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${tm.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: tm.accentBg, border: `1px solid ${isActive ? tm.accentBorder : "transparent"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.18s, border-color 0.18s" }}>
            <Zap style={{ width: 16, height: 16, color: tm.accent }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: tm.textPrimary, margin: 0 }}>{provider.displayName}</h3>
              {isActive && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText, fontWeight: 600, letterSpacing: "0.02em" }}>
                  Active
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: tm.textMuted, marginTop: 3, margin: 0 }}>
              Primary AI provider — dual-lane (PAAS + Anthropic)
            </p>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {isActive ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#22c55e" }}>
              <CheckCircle2 style={{ width: 14, height: 14 }} />
              <span>Connected</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: tm.textDimmed }}>
              <AlertCircle style={{ width: 14, height: 14 }} />
              <span>{provider.connectionState}</span>
            </div>
          )}
        </div>
      </div>

      {/* Issue */}
      {provider.issue && <IssueNotice tm={tm} provider={provider} onReconnect={handleClearIssue} />}

      {/* Card body */}
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* API Key */}
        {provider.zaiMeta && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <Shield style={{ width: 12, height: 12 }} />
              API Key
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {provider.zaiMeta.hasApiKey
                ? <CheckCircle2 style={{ width: 14, height: 14, color: "#22c55e" }} />
                : <AlertCircle style={{ width: 14, height: 14, color: tm.textDimmed }} />}
              <span style={{ fontSize: 13, color: tm.textSecondary }}>
                {provider.zaiMeta.hasApiKey ? "ZAI_API_KEY is configured" : "ZAI_API_KEY not set"}
              </span>
            </div>
          </div>
        )}

        {/* Models */}
        {provider.zaiMeta && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <Cpu style={{ width: 12, height: 12 }} />
              Models
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText }}>
                {provider.zaiMeta.anthropicModelCount} Agentic
              </span>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText }}>
                {provider.zaiMeta.paasModelCount} Vision
              </span>
            </div>
          </div>
        )}

        {/* Routing */}
        {provider.zaiMeta && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: tm.textDimmed, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <Eye style={{ width: 12, height: 12 }} />
              Routing
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: tm.textSecondary }}>
                  PAAS: <code style={{ fontFamily: "monospace", fontSize: 10, background: tm.accentBg, padding: "1px 5px", borderRadius: 4 }}>glm-4.6v</code>
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: tm.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: tm.textSecondary }}>
                  Anthropic: <code style={{ fontFamily: "monospace", fontSize: 10, background: tm.accentBg, padding: "1px 5px", borderRadius: 4 }}>glm-5.1</code>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Info note */}
        <div style={{ borderRadius: 8, border: `1px solid ${tm.border}`, background: tm.accentBg, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Info style={{ width: 13, height: 13, color: tm.textDimmed, flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: tm.textMuted, lineHeight: 1.6, margin: 0 }}>
            Configured via <code style={{ fontFamily: "monospace", fontSize: 10, background: tm.accentBg, padding: "1px 5px", borderRadius: 4 }}>ZAI_API_KEY</code> in the environment. Supports dual-lane routing (PAAS + Anthropic) and vision tasks.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { tm } = useTheme();
  const [, navigate] = useLocation();
  const { data: providersData, isLoading, isError, refetch } = useGetProviders();
  const providers = providersData?.providers;
  const [refreshHovered, setRefreshHovered]   = useState(false);
  const [settingsHovered, setSettingsHovered] = useState(false);
  const [diagRefreshKey, setDiagRefreshKey]   = useState(0);

  const handleRefresh = () => {
    void refetch();
    setDiagRefreshKey(k => k + 1);
  };

  return (
    <PageLayout
      activePage="integrations"
      header={
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Plug style={{ width: 17, height: 17, color: tm.accent, flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: tm.textPrimary, lineHeight: 1.2 }}>Integrations</span>
            <span style={{ fontSize: 10.5, color: tm.textMuted, lineHeight: 1.2 }}>AI provider status and configuration</span>
          </div>
        </div>
      }
      headerRight={
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={handleRefresh}
            onMouseEnter={() => setRefreshHovered(true)}
            onMouseLeave={() => setRefreshHovered(false)}
            title="Refresh"
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, background: refreshHovered ? tm.accentBg : "transparent", border: `1px solid ${refreshHovered ? tm.accentBorder : "transparent"}`, color: refreshHovered ? tm.textSecondary : tm.textMuted, cursor: "pointer", fontSize: 12, transition: "background 0.15s, border-color 0.15s, color 0.15s" }}
          >
            <RefreshCw style={{ width: 13, height: 13 }} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => navigate("/settings")}
            onMouseEnter={() => setSettingsHovered(true)}
            onMouseLeave={() => setSettingsHovered(false)}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, background: settingsHovered ? tm.accentBg : "transparent", border: `1px solid ${settingsHovered ? tm.accentBorder : "transparent"}`, color: settingsHovered ? tm.textSecondary : tm.textMuted, cursor: "pointer", fontSize: 12, transition: "background 0.15s, border-color 0.15s, color 0.15s" }}
          >
            <Settings2 style={{ width: 13, height: 13 }} />
            <span>Settings</span>
          </button>
        </div>
      }
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 36px 44px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Loading */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: tm.textMuted, padding: "16px 0" }}
          >
            <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
            Loading providers...
          </motion.div>
        )}

        {/* Error */}
        {isError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)", borderRadius: 12, padding: "12px 16px" }}
          >
            <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
            Failed to load provider status — is the API server running?
          </motion.div>
        )}

        {/* Provider cards */}
        {!isLoading && providers && providers.map((p) => (
          <ProviderCard key={p.id} tm={tm} provider={p} />
        ))}

        {/* Provider diagnostics panel — live lane-level health from GET /api/provider-diagnostics */}
        <ProviderDiagnosticsPanel tm={tm} refreshKey={diagRefreshKey} />

        {/* Footer note */}
        {!isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: tm.textDimmed, padding: "0 4px" }}
          >
            <ExternalLink style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              Z.AI is the only active provider. Additional providers (OpenAI Codex, Anthropic, Gemini) are planned for future releases.
            </p>
          </motion.div>
        )}

        <div style={{ height: 32 }} />
      </div>
    </PageLayout>
  );
}
