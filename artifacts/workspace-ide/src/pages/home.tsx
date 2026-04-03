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

type Theme = {
  bgBase: string;
  bgSurface: string;
  bgPanel: string;
  bgInput: string;
  border: string;
  borderLight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDimmed: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  glassMesh: string;
  glassPanelBg: string;
  glassPanelBorder: string;
  inputPanelShadow: string;
  sidebarHeaderBg: string;
  sidebarHeaderGlow: string;
  navHover: string;
  itemHover: string;
};

const darkTheme: Theme = {
  bgBase: "#05080d",
  bgSurface: "#080c14",
  bgPanel: "#0b1019",
  bgInput: "#070a12",
  border: "#1a1428",
  borderLight: "#231a38",
  textPrimary: "#FFFFFF",
  textSecondary: "#c4b8e0",
  textMuted: "#9080c0",
  textDimmed: "#6b5890",
  accent: "#8A2BE2",
  accentBg: "rgba(138,43,226,0.12)",
  accentBorder: "rgba(138,43,226,0.32)",
  accentText: "#c084fc",
  glassMesh: `radial-gradient(ellipse 900px 600px at 15% 10%, rgba(138,43,226,0.16) 0%, transparent 60%),radial-gradient(ellipse 700px 500px at 85% 20%, rgba(168,85,247,0.09) 0%, transparent 55%),radial-gradient(ellipse 600px 700px at 70% 80%, rgba(138,43,226,0.12) 0%, transparent 60%),radial-gradient(ellipse 500px 400px at 10% 85%, rgba(110,30,190,0.08) 0%, transparent 55%)`,
  glassPanelBg: "rgba(8,12,20,0.75)",
  glassPanelBorder: "rgba(138,43,226,0.25)",
  inputPanelShadow:
    "0 0 0 1px rgba(138,43,226,0.08), 0 4px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
  sidebarHeaderBg: "linear-gradient(90deg, #0a0610 0%, #05080d 100%)",
  sidebarHeaderGlow:
    "radial-gradient(ellipse 60% 100% at 0% 50%, rgba(138,43,226,0.12) 0%, transparent 70%)",
  navHover: "rgba(255,255,255,0.05)",
  itemHover: "rgba(255,255,255,0.04)",
};

const lightTheme: Theme = {
  bgBase: "#f5f2fb",
  bgSurface: "#f9f7fe",
  bgPanel: "#ffffff",
  bgInput: "#ede9fc",
  border: "#ccc0e8",
  borderLight: "#ddd6f5",
  textPrimary: "#0d0520",
  textSecondary: "#2d1a5a",
  textMuted: "#6b5b9e",
  textDimmed: "#7b6aaa",
  accent: "#7c3aed",
  accentBg: "rgba(124,58,237,0.09)",
  accentBorder: "rgba(124,58,237,0.28)",
  accentText: "#6d28d9",
  glassMesh: `radial-gradient(ellipse 900px 600px at 15% 10%, rgba(124,58,237,0.12) 0%, transparent 60%),radial-gradient(ellipse 700px 500px at 85% 20%, rgba(168,85,247,0.08) 0%, transparent 55%),radial-gradient(ellipse 600px 700px at 70% 80%, rgba(124,58,237,0.10) 0%, transparent 60%),radial-gradient(ellipse 500px 400px at 10% 85%, rgba(100,40,200,0.07) 0%, transparent 55%)`,
  glassPanelBg: "rgba(255,255,255,0.75)",
  glassPanelBorder: "rgba(124,58,237,0.18)",
  inputPanelShadow:
    "0 2px 20px rgba(124,58,237,0.1), inset 0 1px 0 rgba(255,255,255,0.9)",
  sidebarHeaderBg: "linear-gradient(90deg, #f0ebfc 0%, #f5f2fb 100%)",
  sidebarHeaderGlow:
    "radial-gradient(ellipse 60% 100% at 0% 50%, rgba(124,58,237,0.08) 0%, transparent 70%)",
  navHover: "rgba(0,0,0,0.04)",
  itemHover: "rgba(0,0,0,0.03)",
};

function ThemedLogoFull({ tm, size = 96 }: { tm: Theme; size?: number }) {
  return (
    <motion.div
      className="relative flex flex-col items-center gap-3 py-4 px-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <VenomLogo size={size} />
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative flex items-center">
          <motion.span
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: tm.textPrimary,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            VENOM
          </motion.span>
          <motion.span
            style={{
              fontSize: 22,
              fontWeight: 300,
              letterSpacing: "0.08em",
              color: tm.accent,
              marginLeft: 4,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
          >
            GPT
          </motion.span>
        </div>
        <motion.div
          style={{
            height: 3,
            borderRadius: 9999,
            background: `linear-gradient(to right, ${tm.accent}, rgba(0,255,255,0.6), transparent)`,
          }}
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ delay: 0.7, duration: 0.6 }}
        />
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <motion.div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: tm.accent,
            }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: tm.textMuted,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
            }}
          >
            Cyber Intelligence
          </span>
          <motion.div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: tm.accent,
            }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

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

export default function HomePage() {
  const [isDark, setIsDark] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [, navigate] = useLocation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tm = isDark ? darkTheme : lightTheme;

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
          width: 220,
          minWidth: 220,
          maxWidth: 220,
          height: "100%",
          borderRight: `1px solid ${tm.border}`,
          background: tm.sidebarHeaderBg,
          flexShrink: 0,
          overflowX: "hidden",
        }}
      >
        {/* Sidebar glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: tm.sidebarHeaderGlow,
            pointerEvents: "none",
          }}
        />

        {/* Logo area */}
        <div
          style={{
            padding: "20px 16px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: `1px solid ${tm.border}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <VenomLogo size={28} />
          </div>
          <div className="vg-sidebar-label" style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: tm.textPrimary,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              <span>VENOM</span>
              <span style={{ color: tm.accent, fontWeight: 300 }}>GPT</span>
            </div>
            <div
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: tm.textDimmed,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                marginTop: 1,
                whiteSpace: "nowrap",
              }}
            >
              Cyber Intelligence
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            position: "relative",
          }}
        >
          {/* Open IDE — active nav entry */}
          <button
            onClick={() => navigate("/ide")}
            title="Open IDE"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 7,
              background: tm.accentBg,
              border: `1px solid ${tm.accentBorder}`,
              color: tm.accentText,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              textAlign: "left",
              width: "100%",
              transition: "background 0.15s, border-color 0.15s",
              overflow: "hidden",
            }}
          >
            <LayoutGrid size={14} style={{ opacity: 0.85, flexShrink: 0 }} />
            <span
              className="vg-sidebar-label"
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Open IDE
            </span>
            <ChevronRight
              size={12}
              className="vg-sidebar-label"
              style={{ opacity: 0.5, flexShrink: 0 }}
            />
          </button>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: tm.border,
              margin: "6px 4px",
            }}
          />

          {/* Locked nav items */}
          {LOCKED_NAV.map(({ icon: Icon, label }) => (
            <div
              key={label}
              title={`${label} — coming soon`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 7,
                color: tm.textDimmed,
                cursor: "not-allowed",
                fontSize: 13,
                fontWeight: 400,
                opacity: 0.55,
                userSelect: "none",
                overflow: "hidden",
              }}
            >
              <Icon size={14} style={{ flexShrink: 0 }} />
              <span
                className="vg-sidebar-label"
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
              <Lock
                size={10}
                className="vg-sidebar-label"
                style={{ flexShrink: 0, opacity: 0.6 }}
              />
            </div>
          ))}
        </nav>

        {/* Theme toggle */}
        <div
          style={{
            padding: "12px 8px",
            borderTop: `1px solid ${tm.border}`,
            position: "relative",
          }}
        >
          <button
            onClick={() => setIsDark((d) => !d)}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 7,
              background: "transparent",
              border: `1px solid ${tm.border}`,
              color: tm.textMuted,
              cursor: "pointer",
              fontSize: 12,
              width: "100%",
              transition: "background 0.15s, border-color 0.15s, color 0.15s",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                tm.navHover;
              (e.currentTarget as HTMLButtonElement).style.color =
                tm.textSecondary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = tm.textMuted;
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isDark ? (
                <motion.span
                  key="sun"
                  initial={{ opacity: 0, rotate: -30 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 30 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: "flex", flexShrink: 0 }}
                >
                  <Sun size={13} />
                </motion.span>
              ) : (
                <motion.span
                  key="moon"
                  initial={{ opacity: 0, rotate: 30 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: -30 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: "flex", flexShrink: 0 }}
                >
                  <Moon size={13} />
                </motion.span>
              )}
            </AnimatePresence>
            <span
              className="vg-sidebar-label"
              style={{ whiteSpace: "nowrap" }}
            >
              {isDark ? "Light mode" : "Dark mode"}
            </span>
          </button>
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
          padding: "24px 24px 32px",
          overflowY: "auto",
          gap: 0,
        }}
        className="vg-scroll"
      >
        {/* Center column */}
        <div
          style={{
            width: "100%",
            maxWidth: 700,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
          }}
        >
          {/* Logo + tagline */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <ThemedLogoFull tm={tm} size={96} />
            <p
              style={{
                fontSize: 15,
                color: tm.textMuted,
                textAlign: "center",
                maxWidth: 420,
                lineHeight: 1.6,
                letterSpacing: "0.01em",
              }}
            >
              Your AI-powered coding partner. Describe what you want to build
              and let VenomGPT handle the rest.
            </p>
          </motion.div>

          {/* Chat input */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            style={{ width: "100%" }}
          >
            <form onSubmit={handleSubmit} style={{ width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  borderRadius: 14,
                  background: tm.glassPanelBg,
                  border: `1px solid ${tm.glassPanelBorder}`,
                  boxShadow: tm.inputPanelShadow,
                  backdropFilter: "blur(12px)",
                  overflow: "hidden",
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your project or ask VenomGPT to build something…"
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "16px 18px 12px",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    color: tm.textPrimary,
                    fontSize: 14,
                    lineHeight: 1.6,
                    fontFamily: "inherit",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderTop: `1px solid ${tm.border}`,
                  }}
                >
                  <span style={{ fontSize: 11, color: tm.textDimmed }}>
                    ↵ Enter to send · Shift+Enter for new line
                  </span>
                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      borderRadius: 8,
                      background: prompt.trim() ? tm.accent : "transparent",
                      border: `1px solid ${prompt.trim() ? tm.accent : tm.accentBorder}`,
                      color: prompt.trim() ? "#fff" : tm.textDimmed,
                      cursor: prompt.trim() ? "pointer" : "not-allowed",
                      fontSize: 13,
                      fontWeight: 500,
                      transition:
                        "background 0.15s, border-color 0.15s, color 0.15s",
                    }}
                  >
                    <Send size={13} />
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
            transition={{ duration: 0.5, delay: 0.28 }}
            style={{ width: "100%" }}
          >
            <p
              style={{
                fontSize: 11,
                color: tm.textDimmed,
                marginBottom: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textAlign: "center",
              }}
            >
              Suggested prompts
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              {SUGGESTIONS.map(({ icon: Icon, label, prompt: p }, i) => (
                <motion.button
                  key={label}
                  onClick={() => handleSuggestion(p)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.32 + i * 0.05, duration: 0.3 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: tm.glassPanelBg,
                    border: `1px solid ${tm.border}`,
                    color: tm.textSecondary,
                    cursor: "pointer",
                    fontSize: 13,
                    textAlign: "left",
                    backdropFilter: "blur(8px)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      tm.accentBorder;
                    (e.currentTarget as HTMLButtonElement).style.background =
                      tm.accentBg;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      tm.border;
                    (e.currentTarget as HTMLButtonElement).style.background =
                      tm.glassPanelBg;
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: tm.accentBg,
                      border: `1px solid ${tm.accentBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={13} style={{ color: tm.accent }} />
                  </div>
                  <span style={{ lineHeight: 1.45, paddingTop: 4 }}>
                    {label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Responsive sidebar styles */}
      <style>{`
        /* Tablet: collapse sidebar to icon-only rail */
        @media (max-width: 900px) {
          .vg-home-sidebar {
            width: 56px !important;
            min-width: 56px !important;
            max-width: 56px !important;
          }
          .vg-home-sidebar .vg-sidebar-label {
            display: none !important;
          }
        }
        /* Mobile: hide sidebar entirely */
        @media (max-width: 480px) {
          .vg-home-sidebar {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
