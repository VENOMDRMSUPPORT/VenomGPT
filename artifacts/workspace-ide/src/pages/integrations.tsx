import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun,
  Moon,
  Lock,
  LayoutGrid,
  Settings,
  Plug,
  FolderOpen,
  BookTemplate,
  ChevronRight,
  Zap,
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ExternalLink,
  Settings2,
  Shield,
  Cpu,
  Eye,
} from "lucide-react";
import { VenomLogo } from "@/components/ui/venom-logo";
import { type VGTheme, darkTheme, lightTheme } from "@/lib/theme";
import {
  useGetProviders,
  useClearProviderIssue,
  type ProviderStatusView,
  type ProviderIssueCategory,
} from "@/hooks/use-providers";
import { useQueryClient } from "@tanstack/react-query";
import { PROVIDERS_QUERY_KEY } from "@/hooks/use-providers";

// ─── Issue category labels ───────────────────────────────────────────────────

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

const LOCKED_NAV = [
  { icon: FolderOpen, label: "Projects" },
  { icon: BookTemplate, label: "Templates" },
];

// ─── Sidebar components (shared with Home) ───────────────────────────────────

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
      <span
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          transform: "translateY(-50%)",
          width: 3,
          height: 20,
          borderRadius: "0 3px 3px 0",
          background: tm.accent,
        }}
      />
      <LayoutGrid size={15} style={{ opacity: 0.9, flexShrink: 0 }} />
      <span
        className="vg-sidebar-label"
        style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        Open IDE
      </span>
      <ChevronRight
        size={12}
        className="vg-sidebar-label"
        style={{
          opacity: 0.55,
          flexShrink: 0,
          transition: "transform 0.15s",
          transform: hovered ? "translateX(2px)" : "none",
        }}
      />
    </button>
  );
}

function NavigableNavItem({
  tm,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  tm: VGTheme;
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isActive = active || hovered;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 8,
        background: active
          ? tm.accentBg
          : hovered ? tm.navHover : "transparent",
        border: `1px solid ${isActive ? tm.accentBorder : "transparent"}`,
        color: active
          ? tm.accentText
          : hovered ? tm.textSecondary : tm.textMuted,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        textAlign: "left",
        width: "100%",
        overflow: "hidden",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      <Icon size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
      <span
        className="vg-sidebar-label"
        style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {label}
      </span>
      <ChevronRight
        size={12}
        className="vg-sidebar-label"
        style={{
          opacity: isActive ? 0.7 : 0,
          flexShrink: 0,
          transition: "opacity 0.15s, transform 0.15s",
          transform: hovered ? "translateX(2px)" : "none",
        }}
      />
    </button>
  );
}

function LockedNavItem({ tm, icon: Icon, label }: { tm: VGTheme; icon: React.ElementType; label: string }) {
  return (
    <div
      title={`${label} — coming soon`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 8,
        color: tm.lockedNavColor,
        cursor: "not-allowed",
        fontSize: 13,
        fontWeight: 500,
        userSelect: "none",
        overflow: "hidden",
        transition: "color 0.3s",
      }}
    >
      <Icon size={15} style={{ flexShrink: 0, opacity: 0.72 }} />
      <span
        className="vg-sidebar-label"
        style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {label}
      </span>
      <Lock
        size={12}
        className="vg-sidebar-label"
        style={{ flexShrink: 0, color: tm.accentText, opacity: 0.55 }}
      />
    </div>
  );
}

function ThemeToggleBtn({ isDark, tm, onToggle }: { isDark: boolean; tm: VGTheme; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 12px",
        borderRadius: 8,
        background: hovered ? tm.navHover : "transparent",
        border: `1px solid ${hovered ? tm.accentBorder : tm.border}`,
        color: hovered ? tm.textSecondary : tm.textMuted,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500,
        width: "100%",
        overflow: "hidden",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="sun"
            initial={{ opacity: 0, rotate: -30, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 30, scale: 0.7 }}
            transition={{ duration: 0.2 }}
            style={{ display: "flex", flexShrink: 0 }}
          >
            <Sun size={14} />
          </motion.span>
        ) : (
          <motion.span
            key="moon"
            initial={{ opacity: 0, rotate: 30, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -30, scale: 0.7 }}
            transition={{ duration: 0.2 }}
            style={{ display: "flex", flexShrink: 0 }}
          >
            <Moon size={14} />
          </motion.span>
        )}
      </AnimatePresence>
      <span className="vg-sidebar-label" style={{ whiteSpace: "nowrap" }}>
        {isDark ? "Light mode" : "Dark mode"}
      </span>
    </button>
  );
}

// ─── Integration-specific components ─────────────────────────────────────────

function IssueNotice({
  tm,
  provider,
  onReconnect,
}: {
  tm: VGTheme;
  provider: ProviderStatusView;
  onReconnect: () => void;
}) {
  const { issue } = provider;
  if (!issue) return null;

  const label = ISSUE_LABELS[issue.category] ?? "Provider Issue";
  const needsReconnect = ["auth_failed", "session_expired", "token_refresh_failed"].includes(
    issue.category,
  );
  const [reconnectHovered, setReconnectHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      style={{
        margin: "0 0 16px",
        borderRadius: 11,
        border: `1px solid rgba(239,68,68,0.30)`,
        background: "rgba(239,68,68,0.06)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px" }}>
        <AlertCircle style={{ width: 16, height: 16, color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", margin: 0 }}>{label}</p>
          <p style={{ fontSize: 11, color: "rgba(239,68,68,0.75)", marginTop: 4, lineHeight: 1.5, margin: 0 }}>
            {issue.message}
          </p>
          <p style={{ fontSize: 11, color: tm.textMuted, marginTop: 6, lineHeight: 1.5, margin: 0 }}>
            <span style={{ fontWeight: 600 }}>Recommended:</span> {issue.action}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {needsReconnect && (
              <button
                onClick={onReconnect}
                onMouseEnter={() => setReconnectHovered(true)}
                onMouseLeave={() => setReconnectHovered(false)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  background: reconnectHovered ? "rgba(239,68,68,0.20)" : "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.30)",
                  color: "#ef4444",
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "background 0.15s",
                }}
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
      <div
        style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${tm.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: isActive ? tm.accentBg : tm.accentBg,
              border: `1px solid ${isActive ? tm.accentBorder : "transparent"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.18s, border-color 0.18s",
            }}
          >
            <Zap style={{ width: 16, height: 16, color: tm.accent }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: tm.textPrimary, margin: 0 }}>
                {provider.displayName}
              </h3>
              {isActive && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    background: tm.accentBg,
                    border: `1px solid ${tm.accentBorder}`,
                    color: tm.accentText,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                  }}
                >
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
              <span className="vg-sidebar-label">Connected</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: tm.textDimmed }}>
              <AlertCircle style={{ width: 14, height: 14 }} />
              <span className="vg-sidebar-label">{provider.connectionState}</span>
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
              {provider.zaiMeta.hasApiKey ? (
                <CheckCircle2 style={{ width: 14, height: 14, color: "#22c55e" }} />
              ) : (
                <AlertCircle style={{ width: 14, height: 14, color: tm.textDimmed }} />
              )}
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
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 6,
                  background: tm.accentBg,
                  border: `1px solid ${tm.accentBorder}`,
                  color: tm.accentText,
                }}
              >
                {provider.zaiMeta.anthropicModelCount} Agentic
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 6,
                  background: tm.accentBg,
                  border: `1px solid ${tm.accentBorder}`,
                  color: tm.accentText,
                }}
              >
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
        <div
          style={{
            borderRadius: 8,
            border: `1px solid ${tm.border}`,
            background: tm.accentBg,
            padding: "10px 12px",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <Info style={{ width: 13, height: 13, color: tm.textDimmed, flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: tm.textMuted, lineHeight: 1.6, margin: 0 }}>
            Configured via <code style={{ fontFamily: "monospace", fontSize: 10, background: tm.accentBg, padding: "1px 5px", borderRadius: 4 }}>ZAI_API_KEY</code> in the
            environment. Supports dual-lane routing (PAAS + Anthropic) and vision tasks.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [isDark, setIsDark] = useState(true);
  const [, navigate] = useLocation();
  const { data: providersData, isLoading, isError, refetch } = useGetProviders();
  const providers = providersData?.providers;
  const tm = isDark ? darkTheme : lightTheme;
  const [refreshHovered, setRefreshHovered] = useState(false);
  const [settingsHovered, setSettingsHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: tm.bgBase,
        color: tm.textPrimary,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        position: "relative",
        transition: "background 0.3s, color 0.3s",
      }}
    >
      {/* Background mesh */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: tm.glassMesh,
          pointerEvents: "none",
          zIndex: 0,
          transition: "background 0.4s",
        }}
      />
      {/* Atmospheric glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: tm.atmosphericGlow,
          pointerEvents: "none",
          zIndex: 0,
          transition: "background 0.4s",
        }}
      />

      {/* ── Sidebar ── */}
      <aside
        className="vg-home-sidebar"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          width: 240,
          minWidth: 240,
          maxWidth: 240,
          height: "100%",
          borderRight: `1px solid ${tm.sidebarDivider}`,
          background: tm.sidebarBg,
          flexShrink: 0,
          overflowX: "hidden",
          transition: "background 0.3s, border-color 0.3s",
        }}
      >
        {/* Branding */}
        <div
          style={{
            height: 46,
            flexShrink: 0,
            padding: "0 14px",
            display: "flex",
            alignItems: "center",
            gap: 11,
            borderBottom: `1px solid ${tm.sidebarDivider}`,
            position: "relative",
            overflow: "hidden",
            background: tm.sidebarHeaderBg,
            transition: "background 0.3s, border-color 0.3s",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: tm.sidebarHeaderGlow,
              pointerEvents: "none",
              transition: "background 0.4s",
            }}
          />
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              filter: isDark
                ? "drop-shadow(0 0 4px rgba(255,255,255,0.35)) drop-shadow(0 0 10px rgba(255,255,255,0.12))"
                : "none",
              transition: "filter 0.3s",
            }}
          >
            <VenomLogo size={30} />
          </div>
          <div className="vg-sidebar-label" style={{ minWidth: 0, position: "relative" }}>
            <div
              style={{
                fontSize: 15.5,
                fontWeight: 800,
                letterSpacing: "0.08em",
                lineHeight: 1.15,
                whiteSpace: "nowrap",
                transition: "color 0.3s",
              }}
            >
              <span style={{ color: tm.textPrimary }}>VENOM</span>
              <span style={{ color: tm.accent, fontWeight: 300, transition: "color 0.3s" }}>GPT</span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            padding: "10px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 1,
            position: "relative",
          }}
        >
          <SidebarActiveBtn tm={tm} onClick={() => navigate("/ide")} />
          <NavigableNavItem tm={tm} icon={Plug} label="Integrations" active onClick={() => navigate("/integrations")} />
          <NavigableNavItem tm={tm} icon={Settings} label="Settings" onClick={() => navigate("/settings")} />

          <div style={{ padding: "10px 4px 4px", display: "flex", flexDirection: "column", gap: 1 }}>
            <div
              className="vg-sidebar-label"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: tm.sectionLabel,
                padding: "0 8px",
                marginBottom: 3,
                transition: "color 0.3s",
              }}
            >
              Coming Soon
            </div>
            {LOCKED_NAV.map(({ icon, label }) => (
              <LockedNavItem key={label} tm={tm} icon={icon} label={label} />
            ))}
          </div>
        </nav>

        {/* Theme toggle */}
        <div
          style={{
            padding: "10px 8px 16px",
            borderTop: `1px solid ${tm.sidebarDivider}`,
            position: "relative",
            transition: "border-color 0.3s",
          }}
        >
          <ThemeToggleBtn isDark={isDark} tm={tm} onToggle={() => setIsDark((d) => !d)} />
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
        className="vg-scroll"
      >
        {/* Top bar */}
        <div
          style={{
            height: 46,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: `1px solid ${tm.border}`,
            background: tm.glassPanelBg,
            backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Plug style={{ width: 16, height: 16, color: tm.accent }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: tm.textPrimary }}>Integrations</span>
            <span style={{ fontSize: 11, color: tm.textMuted, marginLeft: 4 }}>AI provider status and configuration</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => void refetch()}
              onMouseEnter={() => setRefreshHovered(true)}
              onMouseLeave={() => setRefreshHovered(false)}
              title="Refresh"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 10px",
                borderRadius: 7,
                background: refreshHovered ? tm.accentBg : "transparent",
                border: `1px solid ${refreshHovered ? tm.accentBorder : "transparent"}`,
                color: refreshHovered ? tm.textSecondary : tm.textMuted,
                cursor: "pointer",
                fontSize: 12,
                transition: "background 0.15s, border-color 0.15s, color 0.15s",
              }}
            >
              <RefreshCw style={{ width: 13, height: 13 }} />
              <span className="vg-sidebar-label">Refresh</span>
            </button>
            <button
              onClick={() => navigate("/settings")}
              onMouseEnter={() => setSettingsHovered(true)}
              onMouseLeave={() => setSettingsHovered(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 10px",
                borderRadius: 7,
                background: settingsHovered ? tm.accentBg : "transparent",
                border: `1px solid ${settingsHovered ? tm.accentBorder : "transparent"}`,
                color: settingsHovered ? tm.textSecondary : tm.textMuted,
                cursor: "pointer",
                fontSize: 12,
                transition: "background 0.15s, border-color 0.15s, color 0.15s",
              }}
            >
              <Settings2 style={{ width: 13, height: 13 }} />
              <span className="vg-sidebar-label">Settings</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }} className="vg-scroll">
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto",
              padding: "32px 36px 44px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* Loading */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: tm.textMuted,
                  padding: "16px 0",
                }}
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: "#ef4444",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.20)",
                  borderRadius: 12,
                  padding: "12px 16px",
                }}
              >
                <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                Failed to load provider status — is the API server running?
              </motion.div>
            )}

            {/* Provider cards */}
            {!isLoading &&
              providers &&
              providers.map((p, i) => <ProviderCard key={p.id} tm={tm} provider={p} />)}

            {/* Footer note */}
            {!isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 11,
                  color: tm.textDimmed,
                  padding: "0 4px",
                }}
              >
                <ExternalLink style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, lineHeight: 1.6 }}>
                  Z.AI is the only active provider. Additional providers (OpenAI Codex, Anthropic, Gemini) are planned for future releases.
                </p>
              </motion.div>
            )}

            <div style={{ height: 32 }} />
          </div>
        </div>
      </main>

      {/* Responsive sidebar */}
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
