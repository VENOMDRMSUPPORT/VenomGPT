import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Send, Code2, Bot, Database, FolderOpen, Clock, GitBranch, ChevronRight } from "lucide-react";
import { VenomLogo } from "@/components/ui/venom-logo";
import { type VGTheme } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import PageLayout from "@/components/layout/page-layout";

const SUGGESTIONS = [
  { icon: Code2, label: "Build a full-stack app", prompt: "Build a full-stack web app with auth, database, and a REST API" },
  { icon: Bot, label: "Create an AI agent", prompt: "Create an AI agent that can browse the web and summarize pages" },
  { icon: Database, label: "Design a data pipeline", prompt: "Design and implement a data pipeline that ingests, transforms, and stores records" },
];

const RECENT_PROJECTS = [
  { name: "venom-api", branch: "main", updated: "2 hours ago" },
  { name: "dashboard-ui", branch: "feat/auth", updated: "Yesterday" },
  { name: "ml-pipeline", branch: "main", updated: "3 days ago" },
];

function HeroLogo({ tm, size = 100 }: { tm: VGTheme; size?: number }) {
  return (
    <motion.div className="flex flex-col items-center" style={{ gap: 18 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.55 }}>
      <VenomLogo size={size} />
      <div className="flex flex-col items-center" style={{ gap: 8 }}>
        <div className="flex items-baseline">
          <motion.span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.10em", color: tm.textPrimary, lineHeight: 1 }} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}>VENOM</motion.span>
          <motion.span style={{ fontSize: 30, fontWeight: 300, letterSpacing: "0.10em", color: tm.accent, marginLeft: 6, lineHeight: 1 }} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, type: "spring", stiffness: 200 }}>GPT</motion.span>
        </div>
        <motion.div style={{ height: 2, borderRadius: 9999, background: `linear-gradient(to right, ${tm.accent}, rgba(0,220,255,0.65), transparent)` }} initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ delay: 0.6, duration: 0.5 }} />
        <motion.div className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.92 }}>
          <motion.div style={{ width: 5, height: 5, borderRadius: "50%", background: tm.accent }} animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
          <span style={{ fontSize: 10, fontFamily: "monospace", color: tm.textMuted, letterSpacing: "0.42em", textTransform: "uppercase" }}>Cyber Intelligence</span>
          <motion.div style={{ width: 5, height: 5, borderRadius: "50%", background: tm.accent }} animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }} />
        </motion.div>
      </div>
    </motion.div>
  );
}

function PromptCard({ icon: Icon, label, tm, delay, onClick }: { icon: React.ElementType; label: string; tm: VGTheme; delay: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.3 }} whileTap={{ scale: 0.97 }}
      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 15px", borderRadius: 11, background: hovered ? tm.accentBg : tm.glassPanelBg, border: `1px solid ${hovered ? tm.accentBorder : tm.glassPanelBorder}`, color: hovered ? tm.textSecondary : tm.textMuted, cursor: "pointer", fontSize: 13, fontWeight: 500, textAlign: "left", backdropFilter: "blur(8px)", transition: "background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s, transform 0.15s", transform: hovered ? "translateY(-2px)" : "none", boxShadow: hovered ? `0 4px 22px ${tm.accentShadow}` : "none" }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: hovered ? tm.accentBgHover : tm.accentBg, border: `1px solid ${hovered ? tm.accentBorder : "transparent"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.18s, border-color 0.18s" }}>
        <Icon size={14} style={{ color: tm.accent }} />
      </div>
      <span style={{ lineHeight: 1.5, paddingTop: 6 }}>{label}</span>
    </motion.button>
  );
}

function RecentProjectRow({ name, branch, updated, tm, delay }: { name: string; branch: string; updated: string; tm: VGTheme; delay: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
        borderRadius: 9, background: hovered ? tm.accentBg : "transparent",
        border: `1px solid ${hovered ? tm.accentBorder : "transparent"}`,
        cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 8, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FolderOpen size={13} style={{ color: tm.accent }} />
      </div>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: tm.textSecondary, fontFamily: "monospace" }}>{name}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: tm.textDimmed }}>
        <GitBranch size={10} />
        <span>{branch}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: tm.textDimmed }}>
        <Clock size={10} />
        <span>{updated}</span>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const { tm } = useTheme();
  const [prompt, setPrompt] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [sendHovered, setSendHovered] = useState(false);
  const [viewAllHovered, setViewAllHovered] = useState(false);
  const [, navigate] = useLocation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isFilled = !!prompt.trim();

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (prompt.trim()) navigate("/ide"); };
  const handleSuggestion = (p: string) => { setPrompt(p); textareaRef.current?.focus(); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (prompt.trim()) navigate("/ide"); } };

  return (
    <PageLayout activePage="home" centered>
      <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <HeroLogo tm={tm} size={108} />
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.5 }} style={{ fontSize: 15.5, color: tm.textMuted, textAlign: "center", maxWidth: 440, lineHeight: 1.65, letterSpacing: "0.01em" }}>
            Your AI-powered coding partner. Describe what you want to build and let VenomGPT handle the rest.
          </motion.p>
        </motion.div>

        {/* Chat input */}
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} style={{ width: "100%" }}>
          <form onSubmit={handleSubmit} style={{ width: "100%" }}>
            <div style={{ width: "100%", borderRadius: 16, background: tm.inputPanelBg, border: `1.5px solid ${inputFocused ? tm.inputPanelBorder : tm.accentBorder}`, boxShadow: inputFocused ? `${tm.inputPanelShadow}, 0 0 0 3px ${tm.accentShadow}` : tm.inputPanelShadow, backdropFilter: "blur(16px)", overflow: "hidden", transition: "border-color 0.2s, box-shadow 0.2s" }}>
              <textarea ref={textareaRef} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} placeholder="Describe your project or ask VenomGPT to build something..." rows={4} style={{ width: "100%", padding: "20px 22px 14px", background: "transparent", border: "none", outline: "none", resize: "none", color: tm.textPrimary, fontSize: 14.5, lineHeight: 1.65, fontFamily: "inherit" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 12px", borderTop: `1px solid ${tm.border}`, background: tm.accentBg }}>
                <span style={{ fontSize: 11, color: tm.textDimmed, letterSpacing: "0.02em" }}>Enter to send. Shift+Enter for new line</span>
                <button type="submit" disabled={!isFilled} onMouseEnter={() => setSendHovered(true)} onMouseLeave={() => setSendHovered(false)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 9, background: isFilled ? sendHovered ? tm.sendBtnHover : tm.accent : "transparent", border: `1.5px solid ${isFilled ? "transparent" : tm.accentBorder}`, color: isFilled ? "#fff" : tm.textDimmed, cursor: isFilled ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, transition: "background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s, box-shadow 0.15s", transform: isFilled && sendHovered ? "translateY(-1px)" : "none", boxShadow: isFilled ? sendHovered ? `0 4px 20px ${tm.accentShadow}` : `0 2px 12px ${tm.logoContainerShadow}` : "none" }}>
                  <Send size={13} style={{ marginRight: 1 }} />Send
                </button>
              </div>
            </div>
          </form>
        </motion.div>

        {/* Suggested prompts — 3 only */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.34 }} style={{ width: "100%" }}>
          <p style={{ fontSize: 10.5, color: tm.sectionLabel, marginBottom: 14, letterSpacing: "0.12em", textTransform: "uppercase", textAlign: "center", fontWeight: 600 }}>Suggested prompts</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {SUGGESTIONS.map(({ icon, label, prompt: p }, i) => (
              <PromptCard key={label} icon={icon} label={label} tm={tm} delay={0.38 + i * 0.05} onClick={() => handleSuggestion(p)} />
            ))}
          </div>
        </motion.div>

        {/* Recent Projects */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.52 }} style={{ width: "100%" }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontSize: 10.5, color: tm.sectionLabel, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, margin: 0 }}>Your recent projects</p>
            <button
              onClick={() => navigate("/projects")}
              onMouseEnter={() => setViewAllHovered(true)}
              onMouseLeave={() => setViewAllHovered(false)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 600,
                color: viewAllHovered ? tm.accentText : tm.textDimmed,
                transition: "color 0.15s",
                padding: 0,
              }}
            >
              View All
              <ChevronRight size={13} style={{ transition: "transform 0.15s", transform: viewAllHovered ? "translateX(2px)" : "none" }} />
            </button>
          </div>

          {/* Project rows */}
          <div style={{ borderRadius: 12, background: tm.glassPanelBg, border: `1px solid ${tm.glassPanelBorder}`, backdropFilter: "blur(8px)", overflow: "hidden", padding: "4px 0" }}>
            {RECENT_PROJECTS.map((p, i) => (
              <RecentProjectRow key={p.name} {...p} tm={tm} delay={0.55 + i * 0.06} />
            ))}
          </div>
        </motion.div>
      </div>
    </PageLayout>
  );
}
