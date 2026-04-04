import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Lock, LayoutGrid, Home, BookTemplate, Plug, Users, Rocket, Menu, X, PanelLeftClose, PanelLeftOpen, Bell, User } from "lucide-react";
import venomLogoMain from "@/assets/venom-logo-main.png";
import { type VGTheme } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  path?: string;
  locked?: boolean;
  deferred?: boolean;
}

const SUPERAGENTS_ITEM: NavItem = { id: "superagents", icon: Rocket, label: "Superagents", deferred: true };

const LOWER_NAV: NavItem[] = [
  { id: "home", icon: Home, label: "Home", path: "/" },
  { id: "apps", icon: LayoutGrid, label: "Apps", path: "/apps" },
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

function SidebarHeader({ tm, collapsed }: { tm: VGTheme; collapsed: boolean }) {
  const [hov, setHov] = useState(false);
  const [, navigate] = useLocation();

  return (
    <button
      onClick={() => navigate("/")}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Go to Home"
      style={{
        display: "flex",
        alignItems: "center",
        padding: collapsed ? "10px 8px" : "10px 14px",
        borderBottom: `1px solid ${tm.sidebarDivider}`,
        flexShrink: 0,
        justifyContent: collapsed ? "center" : "flex-start",
        gap: 11,
        width: "100%",
        background: hov ? "rgba(138,43,226,0.10)" : "transparent",
        border: "none",
        borderBottom: `1px solid ${tm.sidebarDivider}`,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.18s, padding 0.2s",
        minWidth: 0,
      }}
    >
      {/* Logo circle */}
      <motion.div
        animate={{
          filter: hov
            ? "drop-shadow(0 0 10px rgba(138,43,226,0.85))"
            : "drop-shadow(0 0 4px rgba(138,43,226,0.3))",
        }}
        transition={{ duration: 0.25 }}
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(138,43,226,0.25) 0%, rgba(91,33,182,0.35) 100%)",
          border: `1.5px solid ${hov ? "rgba(138,43,226,0.65)" : "rgba(138,43,226,0.35)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
          transition: "border-color 0.18s",
        }}
      >
        <img
          src={venomLogoMain}
          alt="VenomGPT"
          style={{ width: 28, height: 28, objectFit: "contain" }}
        />
      </motion.div>

      {/* Name + slogan */}
      {!collapsed && (
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{
              fontSize: 14,
              fontWeight: 800,
              color: tm.textPrimary,
              whiteSpace: "nowrap",
              lineHeight: 1.2,
              letterSpacing: "0.01em",
            }}>
              Venom
            </span>
            <span style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#a855f7",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
              letterSpacing: "0.01em",
            }}>
              GPT
            </span>
          </div>
          <div style={{
            fontSize: 10,
            color: tm.textMuted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.3,
            letterSpacing: "0.02em",
            marginTop: 1,
            opacity: 0.75,
          }}>
            AI-powered workspace
          </div>
        </div>
      )}
    </button>
  );
}

function SidebarToggleBtn({ tm, collapsed, onToggle }: { tm: VGTheme; collapsed: boolean; onToggle: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onToggle}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 7,
        background: hov ? "rgba(138,43,226,0.15)" : "transparent",
        border: `1px solid ${hov ? "rgba(138,43,226,0.35)" : tm.border}`,
        color: hov ? tm.textSecondary : tm.textMuted,
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        padding: 0,
      }}
    >
      {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
    </button>
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
        justifyContent: "center",
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
        justifyContent: "center",
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
          justifyContent: "center",
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
        justifyContent: "center",
      }}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      <span className="pg-sidebar-text" style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

function SidebarNav({ tm, active, onNav }: { tm: VGTheme; active: string; onNav: () => void }) {
  const [, navigate] = useLocation();
  const go = (p: string) => { onNav(); navigate(p); };

  return (
    <nav style={{ flex: 1, padding: "4px 8px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
      <AppsNavItem tm={tm} onClick={() => go("/ide")} />
      <DeferredNavItem icon={SUPERAGENTS_ITEM.icon} label={SUPERAGENTS_ITEM.label} tm={tm} />

      <div style={{
        margin: "8px 4px",
        height: 1,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 1,
      }} />

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
  );
}

function PageHeaderActions({ isDark, tm, onToggleTheme }: { isDark: boolean; tm: VGTheme; onToggleTheme: () => void }) {
  const [notifHov, setNotifHov] = useState(false);
  const [themeHov, setThemeHov] = useState(false);

  const iconBtnStyle = (hov: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 7,
    background: hov ? tm.accentBg : "transparent",
    border: `1px solid ${hov ? tm.accentBorder : "transparent"}`,
    color: hov ? tm.textSecondary : tm.textMuted,
    cursor: "pointer",
    transition: "background 0.15s, border-color 0.15s, color 0.15s",
    padding: 0,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {/* Notifications */}
      <button
        title="Notifications"
        onMouseEnter={() => setNotifHov(true)}
        onMouseLeave={() => setNotifHov(false)}
        style={iconBtnStyle(notifHov)}
      >
        <Bell size={15} />
      </button>

      {/* Theme toggle */}
      <button
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={onToggleTheme}
        onMouseEnter={() => setThemeHov(true)}
        onMouseLeave={() => setThemeHov(false)}
        style={iconBtnStyle(themeHov)}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isDark
            ? <motion.span key="s" initial={{ opacity: 0, rotate: -30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 30 }} transition={{ duration: 0.2 }} style={{ display: "flex" }}><Sun size={15} /></motion.span>
            : <motion.span key="m" initial={{ opacity: 0, rotate: 30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -30 }} transition={{ duration: 0.2 }} style={{ display: "flex" }}><Moon size={15} /></motion.span>
          }
        </AnimatePresence>
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: tm.border, margin: "0 4px", flexShrink: 0 }} />

      {/* Profile */}
      <div
        title="My Account"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "4px 8px 4px 4px",
          borderRadius: 7,
          cursor: "default",
          userSelect: "none",
        }}
      >
        <div style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #8A2BE2 0%, #5b21b6 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <User size={12} style={{ color: "#fff" }} />
        </div>
        <span style={{
          fontSize: 12.5,
          fontWeight: 500,
          color: tm.textMuted,
          whiteSpace: "nowrap",
        }}>
          My Account
        </span>
      </div>
    </div>
  );
}

function SidebarFooter() {
  return null;
}

export default function PageLayout({ activePage, header, headerRight, centered, fullHeight, children }: PageLayoutProps) {
  const { isDark, tm, setIsDark } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const sidebarWidth = collapsed ? 58 : 230;

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: tm.bgBase, color: tm.textPrimary, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif", position: "relative", transition: "background 0.3s, color 0.3s" }}>
      <div style={{ position: "absolute", inset: 0, background: tm.glassMesh, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: tm.atmosphericGlow, pointerEvents: "none", zIndex: 0 }} />

      {/* Desktop sidebar */}
      <aside
        className="pg-sidebar"
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          width: sidebarWidth,
          minWidth: sidebarWidth,
          maxWidth: sidebarWidth,
          height: "100%",
          borderRight: `1px solid ${tm.sidebarDivider}`,
          background: tm.sidebarBg,
          flexShrink: 0,
          overflowX: "hidden",
          transition: "width 0.22s ease, min-width 0.22s ease, max-width 0.22s ease, background 0.3s, border-color 0.3s",
        }}
        data-collapsed={collapsed ? "true" : "false"}
      >
        <SidebarHeader tm={tm} collapsed={collapsed} />
        <SidebarNav tm={tm} active={activePage} onNav={() => {}} />
        <SidebarFooter />
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
              <SidebarHeader tm={tm} collapsed={false} />
              <SidebarNav tm={tm} active={activePage} onNav={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main area */}
      <main style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {header && (
          <div className="pg-header" style={{ height: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 0 12px", borderBottom: `1px solid ${tm.border}`, background: tm.glassPanelBg, backdropFilter: "blur(8px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Mobile gap for hamburger, desktop sidebar toggle */}
              <div className="pg-header-gap" style={{ width: 0 }} />
              <span className="pg-sidebar-toggle">
                <SidebarToggleBtn tm={tm} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
              </span>
              <div style={{ width: 1, height: 16, background: tm.border, flexShrink: 0 }} />
              {header}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {headerRight}
              <PageHeaderActions isDark={isDark} tm={tm} onToggleTheme={() => setIsDark((d) => !d)} />
            </div>
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
        .pg-sidebar[data-collapsed="true"] .pg-sidebar-text { display: none !important; }
        @media (max-width: 1024px) { .pg-sidebar { width: 58px !important; min-width: 58px !important; max-width: 58px !important; } .pg-sidebar .pg-sidebar-text { display: none !important; } }
        @media (max-width: 768px) { .pg-sidebar { display: none !important; } .pg-mobile-toggle { display: flex !important; } .pg-header-gap { width: 44px !important; } .pg-sidebar-toggle { display: none !important; } .pg-main-centered { padding: 20px !important; } }
        @media (min-width: 769px) { .pg-sidebar-toggle { display: inline-flex !important; } }
        @media (max-width: 480px) { .pg-main-centered { padding: 14px !important; } }
        .pg-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(138,43,226,0.3) transparent; }
        .pg-scroll::-webkit-scrollbar { width: 6px; } .pg-scroll::-webkit-scrollbar-track { background: transparent; } .pg-scroll::-webkit-scrollbar-thumb { background: rgba(138,43,226,0.3); border-radius: 3px; }
        textarea::placeholder { color: inherit; opacity: 0.38; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
