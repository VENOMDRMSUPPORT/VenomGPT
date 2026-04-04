import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Lock, LayoutGrid, Home, BookTemplate, Plug, Users, Rocket, ChevronDown, Menu, X } from "lucide-react";
import { VenomLogo } from "@/components/ui/venom-logo";
import { type VGTheme } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

const SUPERAGENTS_ITEM = { id: "superagents", icon: Rocket, label: "Superagents", deferred: true };

const LOWER_NAV = [
  { id: "home", icon: Home, label: "Home", path: "/" },
  { id: "projects", icon: LayoutGrid, label: "All apps", path: "/projects" },
  { id: "templates", icon: BookTemplate, label: "Templates", path: "/templates" },
  { id: "integrations", icon: Plug, label: "Integrations", path: "/integrations" },
  { id: "community", icon: Users, label: "Community", deferred: true },
];

interface PageLayoutProps {
  activePage: string;
  header?: React.ReactNode;
  headerRight?: React.ReactNode;
  centered?: boolean;
  fullHeight?: boolean;
  children: React.ReactNode;
}

function WorkspaceSelector({ tm }: { tm: VGTheme }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "8px 12px",
      margin: "12px 10px 10px",
      borderRadius: 10,
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
      cursor: "default",
      userSelect: "none",
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #8A2BE2 0%, #5b21b6 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <VenomLogo size={18} />
      </div>
      <span className="pg-sidebar-text" style={{
        flex: 1,
        fontSize: 13,
        fontWeight: 600,
        color: tm.textPrimary,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        VenomGPT Workspace
      </span>
      <ChevronDown size={14} className="pg-sidebar-text" style={{ flexShrink: 0, color: tm.textMuted, opacity: 0.7 }} />
    </div>
  );
}

function AppsNavItem({ tm, onClick }: { tm: VGTheme; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        background: hov ? "rgba(138,43,226,0.36)" : "rgba(138,43,226,0.28)",
        border: "1px solid rgba(138,43,226,0.45)",
        color: "#d4b4fe",
        cursor: "pointer",
        fontSize: 13.5,
        fontWeight: 700,
        textAlign: "left",
        width: "100%",
        transition: "background 0.15s",
      }}
    >
      <LayoutGrid size={16} style={{ flexShrink: 0, color: "#c084fc" }} />
      <span className="pg-sidebar-text" style={{ flex: 1 }}>Apps</span>
    </button>
  );
}

function DeferredNavItem({ icon: Icon, label, tm }: { icon: React.ElementType; label: string; tm: VGTheme }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        color: tm.textDimmed,
        cursor: "not-allowed",
        fontSize: 13.5,
        fontWeight: 500,
        userSelect: "none",
        opacity: 0.55,
      }}
      title={`${label} — coming soon`}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      <span className="pg-sidebar-text" style={{ flex: 1 }}>{label}</span>
    </div>
  );
}

function LowerNavItem({ icon: Icon, label, path, locked, deferred, isActive, tm, onClick }: {
  icon: React.ElementType;
  label: string;
  path?: string;
  locked?: boolean;
  deferred?: boolean;
  isActive: boolean;
  tm: VGTheme;
  onClick?: () => void;
}) {
  const [hov, setHov] = useState(false);

  if (locked || deferred) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 8,
          color: tm.textDimmed,
          cursor: "not-allowed",
          fontSize: 13,
          fontWeight: 500,
          userSelect: "none",
          opacity: 0.5,
        }}
        title={locked ? `${label} — coming soon` : `${label} — unavailable`}
      >
        <Icon size={16} style={{ flexShrink: 0 }} />
        <span className="pg-sidebar-text" style={{ flex: 1 }}>{label}</span>
        {locked && <Lock size={11} className="pg-sidebar-text" style={{ flexShrink: 0, opacity: 0.7 }} />}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        background: isActive ? "rgba(138,43,226,0.15)" : hov ? "rgba(255,255,255,0.05)" : "transparent",
        border: `1px solid ${isActive ? "rgba(138,43,226,0.3)" : "transparent"}`,
        color: isActive ? tm.textSecondary : hov ? tm.textSecondary : tm.textMuted,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: isActive ? 600 : 400,
        textAlign: "left",
        width: "100%",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      <span className="pg-sidebar-text" style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

function SidebarInner({ tm, active, onNav }: { tm: VGTheme; active: string; onNav: () => void }) {
  const [, navigate] = useLocation();
  const go = (p: string) => { onNav(); navigate(p); };

  return (
    <>
      <WorkspaceSelector tm={tm} />

      <nav style={{ flex: 1, padding: "4px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
        {/* Primary section: Apps + Superagents */}
        <AppsNavItem tm={tm} onClick={() => go("/ide")} />
        <DeferredNavItem icon={SUPERAGENTS_ITEM.icon} label={SUPERAGENTS_ITEM.label} tm={tm} />

        {/* Divider */}
        <div style={{
          margin: "8px 4px",
          height: 1,
          background: "rgba(255,255,255,0.07)",
          borderRadius: 1,
        }} />

        {/* Lower nav group */}
        {LOWER_NAV.map((item) => (
          <LowerNavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            path={item.path}
            locked={item.locked}
            deferred={item.deferred}
            isActive={active === item.id}
            tm={tm}
            onClick={item.path ? () => go(item.path!) : undefined}
          />
        ))}
      </nav>
    </>
  );
}

function ThemeBtn({ isDark, tm, onToggle }: { isDark: boolean; tm: VGTheme; onToggle: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onToggle} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 8, background: hov ? tm.navHover : "transparent", border: `1px solid ${hov ? tm.accentBorder : tm.border}`, color: hov ? tm.textSecondary : tm.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 500, width: "100%", transition: "background 0.15s, border-color 0.15s, color 0.15s" }}>
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? <motion.span key="s" initial={{ opacity: 0, rotate: -30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 30 }} transition={{ duration: 0.2 }} style={{ display: "flex" }}><Sun size={14} /></motion.span> : <motion.span key="m" initial={{ opacity: 0, rotate: 30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -30 }} transition={{ duration: 0.2 }} style={{ display: "flex" }}><Moon size={14} /></motion.span>}
      </AnimatePresence>
      <span className="pg-sidebar-text">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

export default function PageLayout({ activePage, header, headerRight, centered, fullHeight, children }: PageLayoutProps) {
  const { isDark, tm, setIsDark } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: tm.bgBase, color: tm.textPrimary, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif", position: "relative", transition: "background 0.3s, color 0.3s" }}>
      <div style={{ position: "absolute", inset: 0, background: tm.glassMesh, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: tm.atmosphericGlow, pointerEvents: "none", zIndex: 0 }} />

      {/* Desktop sidebar */}
      <aside className="pg-sidebar" style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", width: 230, minWidth: 230, maxWidth: 230, height: "100%", borderRight: `1px solid ${tm.sidebarDivider}`, background: tm.sidebarBg, flexShrink: 0, overflowX: "hidden", transition: "background 0.3s, border-color 0.3s" }}>
        <SidebarInner tm={tm} active={activePage} onNav={() => {}} />
        <div style={{ padding: "10px 8px 16px", borderTop: `1px solid ${tm.sidebarDivider}`, transition: "border-color 0.3s" }}>
          <ThemeBtn isDark={isDark} tm={tm} onToggle={() => setIsDark((d) => !d)} />
        </div>
      </aside>

      {/* Mobile hamburger */}
      <button className="pg-mobile-toggle" onClick={() => setMobileOpen((o) => !o)} style={{ position: "fixed", top: 10, left: 10, zIndex: 80, width: 40, height: 40, borderRadius: 10, background: tm.glassPanelBg, border: `1px solid ${tm.accentBorder}`, backdropFilter: "blur(12px)", display: "none", alignItems: "center", justifyContent: "center", cursor: "pointer", color: tm.textPrimary, transition: "background 0.15s" }}>
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setMobileOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 90, backdropFilter: "blur(4px)" }} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 230, zIndex: 95, display: "flex", flexDirection: "column", background: tm.sidebarBg, borderRight: `1px solid ${tm.sidebarDivider}`, overflowY: "auto" }}>
              <SidebarInner tm={tm} active={activePage} onNav={() => setMobileOpen(false)} />
              <div style={{ padding: "10px 8px 16px", borderTop: `1px solid ${tm.sidebarDivider}` }}>
                <ThemeBtn isDark={isDark} tm={tm} onToggle={() => setIsDark((d) => !d)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main area */}
      <main style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {header && (
          <div className="pg-header" style={{ height: 46, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", borderBottom: `1px solid ${tm.border}`, background: tm.glassPanelBg, backdropFilter: "blur(8px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="pg-header-gap" style={{ width: 0 }} />
              {header}
            </div>
            {headerRight && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{headerRight}</div>}
          </div>
        )}
        {fullHeight ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {children}
          </div>
        ) : (
          <div className={centered ? "pg-main-centered" : "pg-scroll"} style={{ flex: 1, minHeight: 0, ...(centered ? { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 36px 44px", overflow: "auto" } : { overflow: "auto", display: "flex", flexDirection: "column" }) }}>
            {children}
          </div>
        )}
      </main>

      <style>{`
        @media (max-width: 1024px) { .pg-sidebar { width: 58px !important; min-width: 58px !important; max-width: 58px !important; } .pg-sidebar .pg-sidebar-text { display: none !important; } }
        @media (max-width: 768px) { .pg-sidebar { display: none !important; } .pg-mobile-toggle { display: flex !important; } .pg-header-gap { width: 44px !important; } .pg-main-centered { padding: 20px !important; } }
        @media (max-width: 480px) { .pg-main-centered { padding: 14px !important; } }
        .pg-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(138,43,226,0.3) transparent; }
        .pg-scroll::-webkit-scrollbar { width: 6px; } .pg-scroll::-webkit-scrollbar-track { background: transparent; } .pg-scroll::-webkit-scrollbar-thumb { background: rgba(138,43,226,0.3); border-radius: 3px; }
        textarea::placeholder { color: inherit; opacity: 0.38; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
