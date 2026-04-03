import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun,
  Moon,
  Lock,
  Send,
  LayoutGrid,
  Settings,
  Plug,
  FolderOpen,
  BookTemplate,
  ChevronRight,
  Code2,
  Bot,
  Database,
  Globe,
  Zap,
  Sparkles,
} from "lucide-react";
import { VenomLogo } from "@/components/ui/venom-logo";
import { type VGTheme, darkTheme, lightTheme } from "@/lib/theme";

const SUGGESTIONS = [
  {
    icon: Code2,
    label: "Build a full-stack app",
    prompt: "Build a full-stack web app with auth, database, and a REST API",
  },
  {
    icon: Bot,
    label: "Create an AI agent",
    prompt: "Create an AI agent that can browse the web and summarize pages",
  },
  {
    icon: Database,
    label: "Design a data pipeline",
    prompt:
      "Design and implement a data pipeline that ingests, transforms, and stores records",
  },
  {
    icon: Globe,
    label: "Launch a SaaS product",
    prompt:
      "Scaffold a SaaS product with subscriptions, user management, and a dashboard",
  },
  {
    icon: Zap,
    label: "Automate a workflow",
    prompt:
      "Build an automation that watches a webhook and triggers actions based on events",
  },
  {
    icon: Sparkles,
    label: "Refactor existing code",
    prompt:
      "Refactor my existing codebase to improve performance, readability, and test coverage",
  },
];

const LOCKED_NAV = [
  { icon: Plug, label: "Integrations" },
  { icon: Settings, label: "Settings" },
  { icon: FolderOpen, label: "Projects" },
  { icon: BookTemplate, label: "Templates" },
];

function HeroLogo({ tm, size = 100 }: { tm: VGTheme; size?: number }) {
  return (
    <motion.div
      className="flex flex-col items-center"
      style={{ gap: 18 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.55 }}
    >
      <VenomLogo size={size} />
      <div className="flex flex-col items-center" style={{ gap: 8 }}>
        <div className="flex items-baseline">
          <motion.span
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "0.10em",
              color: tm.textPrimary,
              lineHeight: 1,
              transition: "color 0.3s",
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            VENOM
          </motion.span>
          <motion.span
            style={{
              fontSize: 30,
              fontWeight: 300,
              letterSpacing: "0.10em",
              color: tm.accent,
              marginLeft: 6,
              lineHeight: 1,
              transition: "color 0.3s",
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, type: "spring", stiffness: 200 }}
          >
            GPT
          </motion.span>
        </div>
        <motion.div
          style={{
            height: 2,
            borderRadius: 9999,
            background: `linear-gradient(to right, ${tm.accent}, rgba(0,220,255,0.65), transparent)`,
          }}
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ delay: 0.6, duration: 0.5 }}
        />
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.92 }}
        >
          <motion.div
            style={{ width: 5, height: 5, borderRadius: "50%", background: tm.accent }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: tm.textMuted,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              transition: "color 0.3s",
            }}
          >
            Cyber Intelligence
          </span>
          <motion.div
            style={{ width: 5, height: 5, borderRadius: "50%", background: tm.accent }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

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

function PromptCard({
  icon: Icon,
  label,
  tm,
  delay,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  tm: VGTheme;
  delay: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      whileTap={{ scale: 0.97 }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "13px 15px",
        borderRadius: 11,
        background: hovered ? tm.accentBg : tm.glassPanelBg,
        border: `1px solid ${hovered ? tm.accentBorder : tm.glassPanelBorder}`,
        color: hovered ? tm.textSecondary : tm.textMuted,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        textAlign: "left",
        backdropFilter: "blur(8px)",
        transition: "background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s, transform 0.15s",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? `0 4px 22px ${tm.accentShadow}` : "none",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: hovered ? tm.accentBgHover : tm.accentBg,
          border: `1px solid ${hovered ? tm.accentBorder : "transparent"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "background 0.18s, border-color 0.18s",
        }}
      >
        <Icon size={14} style={{ color: tm.accent }} />
      </div>
      <span style={{ lineHeight: 1.5, paddingTop: 6 }}>{label}</span>
    </motion.button>
  );
}

export default function HomePage() {
  const [isDark, setIsDark] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [sendHovered, setSendHovered] = useState(false);
  const [, navigate] = useLocation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tm = isDark ? darkTheme : lightTheme;
  const isPromptFilled = !!prompt.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    navigate("/ide");
  };

  const handleSuggestion = (p: string) => {
    setPrompt(p);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim()) navigate("/ide");
    }
  };

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
      {/* Center atmospheric glow */}
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
        {/* ── Branding block ── */}
        <div
          style={{
            padding: "22px 16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 13,
            borderBottom: `1px solid ${tm.sidebarDivider}`,
            position: "relative",
            overflow: "hidden",
            background: tm.sidebarHeaderBg,
            transition: "background 0.3s, border-color 0.3s",
          }}
        >
          {/* Header corner glow — stays inside branding block */}
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
                ? "drop-shadow(0 0 6px rgba(255,255,255,0.55)) drop-shadow(0 0 14px rgba(255,255,255,0.25))"
                : "none",
              transition: "filter 0.3s",
            }}
          >
            <VenomLogo size={38} />
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
            <div
              style={{
                fontSize: 9.5,
                fontFamily: "monospace",
                color: tm.textMuted,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                marginTop: 4,
                whiteSpace: "nowrap",
                transition: "color 0.3s",
              }}
            >
              Cyber Intelligence
            </div>
          </div>
        </div>

        {/* ── Nav ── */}
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

          <div
            style={{
              padding: "10px 4px 4px",
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {/* Section label */}
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

        {/* ── Theme toggle ── */}
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
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 36px 44px",
          overflowY: "auto",
        }}
        className="vg-scroll"
      >
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 40,
          }}
        >
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 22,
            }}
          >
            <HeroLogo tm={tm} size={108} />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              style={{
                fontSize: 15.5,
                color: tm.textMuted,
                textAlign: "center",
                maxWidth: 440,
                lineHeight: 1.65,
                letterSpacing: "0.01em",
                transition: "color 0.3s",
              }}
            >
              Your AI-powered coding partner. Describe what you want to build
              and let VenomGPT handle the rest.
            </motion.p>
          </motion.div>

          {/* Chat input */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            style={{ width: "100%" }}
          >
            <form onSubmit={handleSubmit} style={{ width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  borderRadius: 16,
                  background: tm.inputPanelBg,
                  border: `1.5px solid ${inputFocused ? tm.inputPanelBorder : tm.accentBorder}`,
                  boxShadow: inputFocused
                    ? `${tm.inputPanelShadow}, 0 0 0 3px ${tm.accentShadow}`
                    : tm.inputPanelShadow,
                  backdropFilter: "blur(16px)",
                  overflow: "hidden",
                  transition: "border-color 0.2s, box-shadow 0.2s, background 0.3s",
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="Describe your project or ask VenomGPT to build something…"
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "20px 22px 14px",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    color: tm.textPrimary,
                    fontSize: 14.5,
                    lineHeight: 1.65,
                    fontFamily: "inherit",
                    transition: "color 0.3s",
                  }}
                />
                {/* Action rail */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px 12px",
                    borderTop: `1px solid ${tm.border}`,
                    background: tm.accentBg,
                    transition: "border-color 0.3s, background 0.3s",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: tm.textDimmed,
                      letterSpacing: "0.02em",
                      transition: "color 0.3s",
                    }}
                  >
                    ↵ Enter to send · Shift+Enter for new line
                  </span>
                  <button
                    type="submit"
                    disabled={!isPromptFilled}
                    onMouseEnter={() => setSendHovered(true)}
                    onMouseLeave={() => setSendHovered(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 18px",
                      borderRadius: 9,
                      background: isPromptFilled
                        ? sendHovered ? tm.sendBtnHover : tm.accent
                        : "transparent",
                      border: `1.5px solid ${isPromptFilled ? "transparent" : tm.accentBorder}`,
                      color: isPromptFilled ? "#fff" : tm.textDimmed,
                      cursor: isPromptFilled ? "pointer" : "not-allowed",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      transition: "background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s, box-shadow 0.15s",
                      transform: isPromptFilled && sendHovered ? "translateY(-1px)" : "none",
                      boxShadow: isPromptFilled
                        ? sendHovered
                          ? `0 4px 20px ${tm.accentShadow}`
                          : `0 2px 12px ${tm.logoContainerShadow}`
                        : "none",
                    }}
                  >
                    <Send size={13} style={{ marginRight: 1 }} />
                    Send
                  </button>
                </div>
              </div>
            </form>
          </motion.div>

          {/* Suggestion cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.34 }}
            style={{ width: "100%" }}
          >
            <p
              style={{
                fontSize: 10.5,
                color: tm.sectionLabel,
                marginBottom: 14,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textAlign: "center",
                fontWeight: 600,
                transition: "color 0.3s",
              }}
            >
              Suggested prompts
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(208px, 1fr))",
                gap: 10,
              }}
            >
              {SUGGESTIONS.map(({ icon, label, prompt: p }, i) => (
                <PromptCard
                  key={label}
                  icon={icon}
                  label={label}
                  tm={tm}
                  delay={0.38 + i * 0.05}
                  onClick={() => handleSuggestion(p)}
                />
              ))}
            </div>
          </motion.div>
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
        textarea::placeholder { color: inherit; opacity: 0.38; }
      `}</style>
    </div>
  );
}
