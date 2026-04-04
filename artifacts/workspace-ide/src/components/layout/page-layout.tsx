import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Lock, LayoutGrid, Settings, Plug, FolderOpen, BookTemplate, ChevronRight, Menu, X } from "lucide-react";
import { VenomLogo } from "@/components/ui/venom-logo";
import { type VGTheme, darkTheme, lightTheme } from "@/lib/theme";
import { ThemeCtx } from "@/lib/theme-context";

const NAV = [
  { id: "ide", icon: LayoutGrid, label: "Open IDE", path: "/ide", primary: true },
  { id: "projects", icon: FolderOpen, label: "Projects", path: "/projects" },
  { id: "integrations", icon: Plug, label: "Integrations", path: "/integrations" },
  { id: "settings", icon: Settings, label: "Settings", path: "/settings" },
];
const LOCKED = [{ icon: BookTemplate, label: "Templates" }];

interface PageLayoutProps {
  activePage: string;
  header?: React.ReactNode;
  headerRight?: React.ReactNode;
  centered?: boolean;
  children: React.ReactNode;
}

function NavItem({ item, tm, isActive, onClick }: { item: (typeof NAV)[number]; tm: VGTheme; isActive: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const show = isActive || hov;
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      position: "relative", display: "flex", alignItems: "center", gap: 10,
      padding: item.primary ? "9px 12px 9px 16px" : "9px 12px", borderRadius: 8,
      background: item.primary ? (hov ? tm.accentBgHover : tm.accentBg) : isActive ? tm.accentBg : hov ? tm.navHover : "transparent",
      border: `1px solid ${show ? tm.accentBorder : "transparent"}`,
      color: item.primary ? tm.accentText : isActive ? tm.accentText : hov ? tm.textSecondary : tm.textMuted,
      cursor: "pointer", fontSize: 13, fontWeight: item.primary || isActive ? 600 : 500,
      textAlign: "left", width: "100%", overflow: "hidden",
      transition: "background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s",
      boxShadow: item.primary && hov ? `0 2px 14px ${tm.accentShadow}` : "none",
    }}>
      {item.primary && <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 20, borderRadius: "0 3px 3px 0", background: tm.accent }} />}
      <item.icon size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
      <span className="pg-sidebar-text" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
      <ChevronRight size={12} className="pg-sidebar-text" style={{ opacity: show ? 0.55 : 0, flexShrink: 0, transition: "opacity 0.15s, transform 0.15s", transform: hov ? "translateX(2px)" : "none" }} />
    </button>
  );
}

function SidebarInner({ tm, active, onNav }: { tm: VGTheme; active: string; onNav: () => void }) {
  const [, navigate] = useLocation();
  const go = (p: string) => { onNav(); navigate(p); };
  return (
    <>
      <div style={{ height: 46, flexShrink: 0, padding: "0 14px", display: "flex", alignItems: "center", gap: 11, borderBottom: `1px solid ${tm.sidebarDivider}`, position: "relative", overflow: "hidden", background: tm.sidebarHeaderBg }}>
        <div style={{ position: "absolute", inset: 0, background: tm.sidebarHeaderGlow, pointerEvents: "none" }} />
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", filter: tm === darkTheme ? "drop-shadow(0 0 4px rgba(255,255,255,0.35))" : "none" }}><VenomLogo size={30} /></div>
        <div className="pg-sidebar-text" style={{ minWidth: 0, position: "relative" }}>
          <span style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "0.08em", color: tm.textPrimary }}>VENOM</span>
          <span style={{ fontSize: 15.5, fontWeight: 300, letterSpacing: "0.08em", color: tm.accent, marginLeft: 2 }}>GPT</span>
        </div>
      </div>
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV.map((item) => <NavItem key={item.id} item={item} tm={tm} isActive={active === item.id} onClick={() => go(item.path)} />)}
        <div style={{ padding: "10px 4px 4px", display: "flex", flexDirection: "column", gap: 1 }}>
          <div className="pg-sidebar-text" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: tm.sectionLabel, padding: "0 8px", marginBottom: 3 }}>Coming Soon</div>
          {LOCKED.map(({ icon: I, label }) => (
            <div key={label} title={`${label} - coming soon`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, color: tm.lockedNavColor, cursor: "not-allowed", fontSize: 13, fontWeight: 500, userSelect: "none" }}>
              <I size={15} style={{ flexShrink: 0, opacity: 0.72 }} />
              <span className="pg-sidebar-text" style={{ flex: 1 }}>{label}</span>
              <Lock size={12} className="pg-sidebar-text" style={{ flexShrink: 0, color: tm.accentText, opacity: 0.55 }} />
            </div>
          ))}
        </div>
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

export default function PageLayout({ activePage, header, headerRight, centered, children }: PageLayoutProps) {
  const [isDark, setIsDark] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const tm = isDark ? darkTheme : lightTheme;

  return (
    <ThemeCtx.Provider value={{ isDark, tm }}>
      <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: tm.bgBase, color: tm.textPrimary, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif", position: "relative", transition: "background 0.3s, color 0.3s" }}>
        <div style={{ position: "absolute", inset: 0, background: tm.glassMesh, pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "absolute", inset: 0, background: tm.atmosphericGlow, pointerEvents: "none", zIndex: 0 }} />

        {/* Desktop sidebar */}
        <aside className="pg-sidebar" style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", width: 240, minWidth: 240, maxWidth: 240, height: "100%", borderRight: `1px solid ${tm.sidebarDivider}`, background: tm.sidebarBg, flexShrink: 0, overflowX: "hidden", transition: "background 0.3s, border-color 0.3s" }}>
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
              <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 95, display: "flex", flexDirection: "column", background: tm.sidebarBg, borderRight: `1px solid ${tm.sidebarDivider}`, overflowY: "auto" }}>
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
          <div className={centered ? "pg-main-centered" : "pg-scroll"} style={{ flex: 1, minHeight: 0, ...(centered ? { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 36px 44px", overflow: "auto" } : { overflow: "auto", display: "flex", flexDirection: "column" }) }}>
            {children}
          </div>
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
    </ThemeCtx.Provider>
  );
}
