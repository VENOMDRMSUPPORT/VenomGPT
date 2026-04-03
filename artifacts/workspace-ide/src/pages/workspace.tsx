import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import cobraTechLogo from "../assets/design2-cobra-tech.png";
import {
  LayoutGrid,
  Settings,
  Search,
  ChevronRight,
  ChevronDown,
  Info,
  DollarSign,
  Plus,
  MoreHorizontal,
  MoreVertical,
  Zap,
  Clock,
  Paperclip,
  Play,
  Square,
  Sparkles,
  Camera,
  ToggleLeft,
  PanelRight,
  ExternalLink,
  Users,
  History,
  Globe,
  Database,
  Package,
  Lock,
  Cpu,
  BarChart3,
  Webhook,
  Shield,
  Key,
  Wand2,
  FlaskConical,
  Bot,
  Sun,
  Moon,
  PanelLeft,
  Terminal,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  File,
  FilePlus,
  FolderPlus,
  Upload,
  Download,
  EyeOff,
  ChevronsDownUp,
  XSquare,
  ListTree,
  Server,
  Monitor,
  HardDrive,
  Bell,
  X,
  Pencil,
  Copy,
  Link2,
  Trash2,
} from "lucide-react";

function VenomLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <motion.div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      animate={{
        filter: [
          "drop-shadow(0 0 4px rgba(138,43,226,0.25))",
          "drop-shadow(0 0 14px rgba(138,43,226,0.65)) drop-shadow(0 0 28px rgba(138,43,226,0.25))",
          "drop-shadow(0 0 4px rgba(138,43,226,0.25))",
        ],
      }}
      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      whileHover={{
        rotate: [0, -3, 3, 0],
        filter: "drop-shadow(0 0 24px rgba(138,43,226,0.9))",
      }}
    >
      <motion.img
        src={cobraTechLogo}
        alt="VenomGPT Cobra Tech"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

function VenomLogoFull({ size = 120, isDark = true }: { size?: number; isDark?: boolean }) {
  const tm = isDark ? darkTheme : lightTheme;
  const accentColor = tm.accent;
  const textColor = tm.textPrimary;
  const mutedColor = tm.textMuted;
  return (
    <motion.div
      className="relative flex flex-col items-center gap-3 py-4 px-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <VenomLogo size={size} />
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative">
          <motion.span
            style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.08em", color: textColor }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            VENOM
          </motion.span>
          <motion.span
            style={{ fontSize: 22, fontWeight: 300, letterSpacing: "0.08em", color: accentColor, marginLeft: 4 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
          >
            GPT
          </motion.span>
        </div>
        <motion.div
          style={{ height: 3, borderRadius: 9999, background: `linear-gradient(to right, ${accentColor}, #00FFFF99, transparent)` }}
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
            style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span style={{ fontSize: 11, fontFamily: "monospace", color: mutedColor, letterSpacing: "0.35em", textTransform: "uppercase" }}>
            Cyber Intelligence
          </span>
          <motion.div
            style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

type TaskStatus = "draft" | "active" | "review" | "done" | "archived" | "cancelled";
interface Task { id: string; title: string; status: TaskStatus; age: string; num: string; }

const tasks: Task[] = [
  { id: "1", title: "Task Board UX Cor...", status: "review", age: "6h · 47m", num: "#6" },
  { id: "2", title: "Auth flow refactor", status: "active", age: "2h · 15m", num: "#7" },
  { id: "3", title: "Dashboard analytics v2", status: "draft", age: "1d · 3h", num: "#4" },
  { id: "4", title: "API rate limiting", status: "done", age: "3d · 2h", num: "#3" },
  { id: "5", title: "Mobile responsive nav", status: "archived", age: "1w · 4d", num: "#2" },
  { id: "6", title: "Payment integration", status: "cancelled", age: "5d · 1h", num: "#1" },
];

function TaskDotIcon({ color, variant = "square", animated = false, pulse = false }: {
  color: string; variant?: "square" | "diamond"; animated?: boolean; pulse?: boolean;
}) {
  const squareDots = [{ cx: 5, cy: 5 }, { cx: 11, cy: 5 }, { cx: 5, cy: 11 }, { cx: 11, cy: 11 }];
  const diamondDots = [{ cx: 8, cy: 2.5 }, { cx: 13.5, cy: 8 }, { cx: 8, cy: 13.5 }, { cx: 2.5, cy: 8 }];
  const dots = variant === "diamond" ? diamondDots : squareDots;
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <motion.g
        animate={animated ? { rotate: 360 } : {}}
        transition={animated ? { duration: 3.5, repeat: Infinity, ease: "linear" } : {}}
        style={{ transformOrigin: "8px 8px" }}
      >
        {dots.map((dot, i) => (
          <motion.g
            key={i}
            style={{ transformOrigin: `${dot.cx}px ${dot.cy}px` }}
            animate={pulse ? { scale: [1, 1.35, 1], opacity: [0.65, 1, 0.65] } : animated ? { opacity: [0.75, 1, 0.75] } : {}}
            transition={pulse || animated ? { duration: 1.3, repeat: Infinity, delay: i * 0.22, ease: "easeInOut" } : {}}
          >
            <circle cx={dot.cx} cy={dot.cy} r="2.6" fill={color} />
          </motion.g>
        ))}
      </motion.g>
    </svg>
  );
}

const statusConfig: Record<TaskStatus, { label: string; color: string; dotColor: string; icon: React.FC<{ className?: string }> }> = {
  draft:     { label: "Draft",       color: "text-amber-400",   dotColor: "#f59e0b", icon: () => <TaskDotIcon color="#f59e0b" variant="square" /> },
  active:    { label: "In Progress", color: "text-blue-400",    dotColor: "#3b82f6", icon: () => <TaskDotIcon color="#3b82f6" variant="square" animated /> },
  review:    { label: "Ready",       color: "text-violet-400",  dotColor: "#8A2BE2", icon: () => <TaskDotIcon color="#8A2BE2" variant="diamond" pulse /> },
  done:      { label: "Done",        color: "text-emerald-400", dotColor: "#10b981", icon: () => <TaskDotIcon color="#10b981" variant="square" /> },
  archived:  { label: "Archived",    color: "text-slate-500",   dotColor: "#64748b", icon: () => <TaskDotIcon color="#64748b" variant="square" /> },
  cancelled: { label: "Cancelled",   color: "text-red-400",     dotColor: "#ef4444", icon: () => <TaskDotIcon color="#ef4444" variant="diamond" /> },
};

const toolResults = [
  { icon: Database, name: "Database", desc: "Stores structured data such as user profiles, game scores, and product catalogs." },
  { icon: Globe, name: "Preview", desc: "Preview your App", section: "Jump to existing tab" },
  { icon: Package, name: "Publishing", desc: "Publish a live, stable, public version of your App, unaffected by the changes you make in the workspace.", section: "Suggested" },
  { icon: Webhook, name: "Integrations", desc: "Connect to Replit-native and external services" },
  { icon: Lock, name: "App Storage", desc: "App Storage is Replit's built-in object storage that lets your app easily host and save uploads like images, videos, and documents." },
  { icon: Key, name: "Auth", desc: "Let users log in to your App using a prebuilt login page" },
  { icon: Shield, name: "Security Scanner", desc: "Scan your app for vulnerabilities" },
  { icon: Lock, name: "Secrets", desc: "Store sensitive information (like API keys) securely in your App" },
  { icon: Cpu, name: "Agent Skills", desc: "Manage skills that extend Agent capabilities" },
  { icon: BarChart3, name: "Analytics", desc: "View traffic, request metrics, and usage analytics for your deployed App" },
  { icon: Bot, name: "Automations", desc: "View and test agents and automations created by Replit Agent." },
  { icon: Wand2, name: "Canvas", desc: "Agent-controlled canvas for mockups and wireframes" },
  { icon: Settings, name: "User Settings", desc: "Configure personal editor preferences and settings updates that apply to all Apps" },
];

type FNode = { name: string; type: "folder" | "file"; ext?: string; open?: boolean; indent: number };

const extColor: Record<string, string> = {
  ts: "#3178c6", tsx: "#3178c6",
  js: "#f7df1e", jsx: "#f7df1e",
  json: "#e44d26", css: "#563d7c",
  html: "#e44d26", md: "#519aba",
  yaml: "#cb171e", yml: "#cb171e",
  toml: "#9c4221", lock: "#e44d26",
  env: "#ecd53f", gitignore: "#f05032",
  npmrc: "#cb3837", svg: "#ffb13b",
  png: "#a4c639", jpg: "#a4c639",
  sh: "#4eaa25",
};

function FileTypeIcon({ name, ext, size = 14 }: { name: string; ext?: string; size?: number }) {
  const e = ext || name.split(".").pop() || "";
  const color = extColor[e] || "#8b949e";

  if (e === "ts" || e === "tsx") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#3178c6"/>
      <text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="7.5" fontWeight="bold" fontFamily="monospace">{e === "tsx" ? "TX" : "TS"}</text>
    </svg>
  );
  if (e === "js" || e === "jsx") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#f7df1e"/>
      <text x="8" y="11.5" textAnchor="middle" fill="#323330" fontSize="7.5" fontWeight="bold" fontFamily="monospace">{e === "jsx" ? "JX" : "JS"}</text>
    </svg>
  );
  if (e === "json") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#e44d26" strokeWidth="1.5"/>
      <text x="8" y="11.5" textAnchor="middle" fill="#e44d26" fontSize="6" fontWeight="bold" fontFamily="monospace">{"{}"}</text>
    </svg>
  );
  if (e === "css") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#264de4"/>
      <text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="6.5" fontWeight="bold" fontFamily="monospace">CSS</text>
    </svg>
  );
  if (e === "html") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#e44d26"/>
      <text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="bold" fontFamily="monospace">{"<>"}</text>
    </svg>
  );
  if (e === "md") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#519aba" strokeWidth="1.5"/>
      <text x="8" y="11.5" textAnchor="middle" fill="#519aba" fontSize="7" fontWeight="bold" fontFamily="monospace">M</text>
    </svg>
  );
  if (e === "yaml" || e === "yml") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#cb171e" strokeWidth="1.5"/>
      <text x="8" y="11.5" textAnchor="middle" fill="#cb171e" fontSize="6" fontWeight="bold" fontFamily="monospace">YML</text>
    </svg>
  );
  if (e === "svg") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#ffb13b"/>
      <text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="bold" fontFamily="monospace">SVG</text>
    </svg>
  );
  if (e === "env" || name.startsWith(".env")) return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#ecd53f"/>
      <text x="8" y="11.5" textAnchor="middle" fill="#323330" fontSize="5.5" fontWeight="bold" fontFamily="monospace">ENV</text>
    </svg>
  );
  if (e === "gitignore" || name === ".gitignore") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#f05032"/>
      <text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="bold" fontFamily="monospace">GIT</text>
    </svg>
  );
  if (e === "npmrc" || name === ".npmrc") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#cb3837"/>
      <text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="monospace">npm</text>
    </svg>
  );
  if (e === "toml") return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#9c4221" strokeWidth="1.5"/>
      <text x="8" y="11.5" textAnchor="middle" fill="#9c4221" fontSize="5" fontWeight="bold" fontFamily="monospace">TML</text>
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4 1h5l4 4v9.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14.5v-12A1.5 1.5 0 014.5 1z" fill="none" stroke={color} strokeWidth="1.2"/>
      <path d="M9 1v4h4" fill="none" stroke={color} strokeWidth="1.2"/>
    </svg>
  );
}

const fileTreeData: FNode[] = [
  { name: "api-server", type: "folder", open: false, indent: 0 },
  { name: "mockup-sandbox", type: "folder", open: true, indent: 0 },
  { name: ".replit-artifact", type: "folder", open: false, indent: 1 },
  { name: "node_modules", type: "folder", open: false, indent: 1 },
  { name: "src", type: "folder", open: true, indent: 1 },
  { name: "components.json", type: "file", ext: "json", indent: 2 },
  { name: "index.html", type: "file", ext: "html", indent: 2 },
  { name: "mockupPreviewPlugin.ts", type: "file", ext: "ts", indent: 2 },
  { name: "package.json", type: "file", ext: "json", indent: 2 },
  { name: "tsconfig.json", type: "file", ext: "json", indent: 2 },
  { name: "vite.config.ts", type: "file", ext: "ts", indent: 2 },
  { name: "attached_assets", type: "folder", open: false, indent: 0 },
  { name: "lib", type: "folder", open: false, indent: 0 },
  { name: "scripts", type: "folder", open: false, indent: 0 },
  { name: ".gitignore", type: "file", ext: "gitignore", indent: 0 },
  { name: ".npmrc", type: "file", ext: "npmrc", indent: 0 },
  { name: "replit.md", type: "file", ext: "md", indent: 0 },
  { name: "tsconfig.base.json", type: "file", ext: "json", indent: 0 },
  { name: "tsconfig.json", type: "file", ext: "json", indent: 0 },
];

const packageFiles: FNode[] = [
  { name: "node_modules", type: "folder", open: false, indent: 0 },
  { name: "package.json", type: "file", ext: "json", indent: 0 },
  { name: "pnpm-lock.yaml", type: "file", ext: "yaml", indent: 0 },
  { name: "pnpm-workspace.yaml", type: "file", ext: "yaml", indent: 0 },
];

const contextMenuItems = [
  { icon: FilePlus, label: "New file" },
  { icon: FolderPlus, label: "New folder" },
  { icon: Upload, label: "Upload folder" },
  { icon: Download, label: "Download as zip" },
  { icon: EyeOff, label: "Hide hidden files" },
  { icon: ChevronsDownUp, label: "Collapse all" },
  { icon: XSquare, label: "Close files" },
];

const fileRightClickItems = [
  { icon: Pencil,         label: "Rename",                 danger: false },
  { icon: Search,         label: "Search this directory",  danger: false },
  { icon: FilePlus,       label: "Add file",               danger: false },
  { icon: FolderPlus,     label: "Add folder",             danger: false },
  { icon: ChevronsDownUp, label: "Collapse child folders", danger: false },
  { icon: Terminal,       label: "Open shell here",        danger: false },
  { icon: Copy,           label: "Copy file path",         danger: false },
  { icon: Link2,          label: "Copy link",              danger: false },
  { icon: Download,       label: "Download folder",        danger: false },
  { icon: Trash2,         label: "Delete",                 danger: true  },
];

type Theme = {
  bgBase: string; bgSurface: string; bgPanel: string; bgInput: string;
  border: string; borderLight: string;
  textPrimary: string; textSecondary: string; textMuted: string; textDimmed: string;
  accent: string; accentBg: string; accentBorder: string; accentText: string;
  gridColor: string; glowColor: string;
  navHover: string; itemHover: string;
  connectedBg: string; connectedBorder: string;
  sectionLabel: string;
  glassMesh: string;
  glassPanelBg: string; glassPanelBorder: string;
  inputPanelShadow: string;
  logoContainerBg: string; logoContainerBorder: string; logoContainerShadow: string;
  sidebarHeaderBg: string; sidebarHeaderGlow: string;
};

const darkTheme: Theme = {
  bgBase: "#05080d", bgSurface: "#080c14", bgPanel: "#0b1019", bgInput: "#070a12",
  border: "#1a1428", borderLight: "#231a38",
  textPrimary: "#FFFFFF", textSecondary: "#c4b8e0", textMuted: "#9080c0", textDimmed: "#6b5890",
  accent: "#8A2BE2", accentBg: "rgba(138,43,226,0.12)", accentBorder: "rgba(138,43,226,0.32)", accentText: "#c084fc",
  gridColor: "rgba(138,43,226,0.03)", glowColor: "rgba(138,43,226,0.07)",
  navHover: "rgba(255,255,255,0.05)", itemHover: "rgba(255,255,255,0.04)",
  connectedBg: "rgba(138,43,226,0.1)", connectedBorder: "rgba(138,43,226,0.35)",
  sectionLabel: "#8070b0",
  glassMesh: `radial-gradient(ellipse 900px 600px at 15% 10%, rgba(138,43,226,0.16) 0%, transparent 60%),radial-gradient(ellipse 700px 500px at 85% 20%, rgba(168,85,247,0.09) 0%, transparent 55%),radial-gradient(ellipse 600px 700px at 70% 80%, rgba(138,43,226,0.12) 0%, transparent 60%),radial-gradient(ellipse 500px 400px at 10% 85%, rgba(110,30,190,0.08) 0%, transparent 55%)`,
  glassPanelBg: "rgba(8,12,20,0.75)", glassPanelBorder: "rgba(138,43,226,0.25)",
  inputPanelShadow: "0 0 0 1px rgba(138,43,226,0.08), 0 4px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
  logoContainerBg: "rgba(138,43,226,0.12)", logoContainerBorder: "rgba(138,43,226,0.32)", logoContainerShadow: "0 0 14px rgba(138,43,226,0.25)",
  sidebarHeaderBg: "linear-gradient(90deg, #0a0610 0%, #05080d 100%)", sidebarHeaderGlow: "radial-gradient(ellipse 60% 100% at 0% 50%, rgba(138,43,226,0.12) 0%, transparent 70%)",
};

const lightTheme: Theme = {
  bgBase: "#f5f2fb", bgSurface: "#f9f7fe", bgPanel: "#ffffff", bgInput: "#ede9fc",
  border: "#ccc0e8", borderLight: "#ddd6f5",
  textPrimary: "#0d0520", textSecondary: "#2d1a5a", textMuted: "#6b5b9e", textDimmed: "#7b6aaa",
  accent: "#7c3aed", accentBg: "rgba(124,58,237,0.09)", accentBorder: "rgba(124,58,237,0.28)", accentText: "#6d28d9",
  gridColor: "rgba(124,58,237,0.05)", glowColor: "rgba(124,58,237,0.04)",
  navHover: "rgba(0,0,0,0.04)", itemHover: "rgba(0,0,0,0.03)",
  connectedBg: "rgba(124,58,237,0.1)", connectedBorder: "rgba(124,58,237,0.3)",
  sectionLabel: "#6b5b9e",
  glassMesh: `radial-gradient(ellipse 900px 600px at 15% 10%, rgba(124,58,237,0.12) 0%, transparent 60%),radial-gradient(ellipse 700px 500px at 85% 20%, rgba(168,85,247,0.08) 0%, transparent 55%),radial-gradient(ellipse 600px 700px at 70% 80%, rgba(124,58,237,0.10) 0%, transparent 60%),radial-gradient(ellipse 500px 400px at 10% 85%, rgba(100,40,200,0.07) 0%, transparent 55%)`,
  glassPanelBg: "rgba(255,255,255,0.75)", glassPanelBorder: "rgba(124,58,237,0.18)",
  inputPanelShadow: "0 2px 20px rgba(124,58,237,0.1), inset 0 1px 0 rgba(255,255,255,0.9)",
  logoContainerBg: "rgba(124,58,237,0.08)", logoContainerBorder: "rgba(124,58,237,0.22)", logoContainerShadow: "0 0 8px rgba(124,58,237,0.12)",
  sidebarHeaderBg: "linear-gradient(90deg, #f0ebfc 0%, #f5f2fb 100%)", sidebarHeaderGlow: "radial-gradient(ellipse 60% 100% at 0% 50%, rgba(124,58,237,0.08) 0%, transparent 70%)",
};

const MIN_W = 48;
const MAX_W = 280;
const SNAP_THRESHOLD = 100;
const CONSOLE_MIN_W = 260;
const CONSOLE_MAX_W = 620;
const FILES_MAX = 480;
const FILES_SNAP = 120;

const extraBoardTasks: Task[] = [
  { id: "x1", title: "Task Board UX Parity — Replit Reference", status: "done", age: "7h", num: "#5" },
  { id: "x2", title: "Remove duplicate Start application workfl...", status: "done", age: "9h", num: "#4" },
  { id: "x3", title: "Replit Preview Recovery", status: "done", age: "9h", num: "#2" },
  { id: "x4", title: "VenomGPT Tasks Board + Session Persist...", status: "done", age: "8h", num: "#1" },
  { id: "x5", title: "Tasks board video demonstration", status: "archived", age: "7h", num: "#A1" },
  { id: "x6", title: "User sets information manually", status: "archived", age: "8h", num: "#A2" },
  { id: "x7", title: "VenomGPT plan revision before build", status: "archived", age: "9h", num: "#A3" },
  { id: "x8", title: "Replit preview unreachable fix", status: "archived", age: "9h", num: "#A4" },
  { id: "x9", title: "API rate limiting overhaul", status: "cancelled", age: "2d", num: "#C1" },
];

function TaskBoard({ tm, isDark, onClose }: { tm: Theme; isDark: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(true);
  const [cancelledOpen, setCancelledOpen] = useState(false);

  const allBoardTasks = [...tasks, ...extraBoardTasks];
  const filtered = search.trim()
    ? allBoardTasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : allBoardTasks;

  const drafts   = filtered.filter(t => t.status === "draft");
  const active   = filtered.filter(t => t.status === "active");
  const ready    = filtered.filter(t => t.status === "review");
  const done     = filtered.filter(t => t.status === "done");
  const archived = filtered.filter(t => t.status === "archived");
  const cancelled = filtered.filter(t => t.status === "cancelled");

  const colDivider = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  const cardBg = tm.bgPanel;
  const cardBorder = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";

  const Column = ({ label, count, children, border = true }: { label: string; count: number; children: React.ReactNode; border?: boolean }) => (
    <div className="flex flex-col min-w-0" style={{ flex: "0 0 25%", borderRight: border ? `1px solid ${colDivider}` : "none", overflow: "hidden" }}>
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b" style={{ borderColor: colDivider }}>
        <span className="text-sm font-semibold" style={{ color: tm.textPrimary }}>{label}</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", color: tm.textMuted }}>{count}</span>
      </div>
      <div className="vg-scroll flex-1 overflow-y-auto px-2 py-2">
        {children}
      </div>
    </div>
  );

  const EmptyCol = () => (
    <div className="flex items-center justify-center py-8">
      <span className="text-xs" style={{ color: tm.textDimmed }}>No tasks</span>
    </div>
  );

  const TaskCard = ({ t }: { t: Task }) => {
    const cfg = statusConfig[t.status];
    return (
      <div className="rounded-lg p-3 mb-2 relative" style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.08)" }}>
        <div className="flex items-start gap-2">
          <div className="shrink-0 mt-0.5">
            <TaskDotIcon color={cfg.dotColor} variant="square" animated={t.status === "active"} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium leading-snug" style={{ color: tm.textPrimary }}>{t.title}</div>
            <div className="text-[10px] mt-0.5" style={{ color: tm.textDimmed }}>{cfg.label} · {t.num} · {t.age}</div>
          </div>
          <button className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-50 hover:opacity-100" style={{ color: tm.textMuted }}>
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const ReadyCard = ({ t }: { t: Task }) => (
    <div className="rounded-lg p-3 mb-2 relative" style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.08)" }}>
      <div className="flex items-start gap-2 mb-2">
        <div className="shrink-0 mt-0.5">
          <TaskDotIcon color={statusConfig.review.dotColor} variant="diamond" pulse />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium leading-snug" style={{ color: tm.textPrimary }}>{t.title}</div>
          <div className="text-[10px] mt-0.5" style={{ color: tm.textDimmed }}>{statusConfig.review.label} · {t.num} · {t.age}</div>
        </div>
        <button className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-50 hover:opacity-100" style={{ color: tm.textMuted }}>
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-1.5">
        <button className="flex-1 py-1 text-[11px] font-medium rounded" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: tm.textSecondary, border: `1px solid ${cardBorder}` }}>Apply</button>
        <button className="flex-1 py-1 text-[11px] font-medium rounded" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", color: tm.textSecondary, border: `1px solid ${cardBorder}` }}>Review</button>
      </div>
    </div>
  );

  const DoneCard = ({ t }: { t: Task }) => (
    <div className="flex items-start gap-2 px-1 py-1.5 rounded group cursor-pointer" style={{ borderBottom: `1px solid ${colDivider}` }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = tm.itemHover}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
      <div className="shrink-0 mt-0.5">
        <TaskDotIcon color={statusConfig.done.dotColor} variant="square" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium leading-snug" style={{ color: tm.textPrimary }}>{t.title}</div>
        <div className="text-[10px] mt-0.5" style={{ color: tm.textDimmed }}>{statusConfig.done.label} · {t.num} · {t.age}</div>
      </div>
      <button className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-60" style={{ color: tm.textMuted }}>
        <MoreHorizontal className="w-3 h-3" />
      </button>
    </div>
  );

  const ArchiveCard = ({ t }: { t: Task }) => (
    <div className="flex items-center gap-2 px-1 py-1.5 rounded group cursor-pointer"
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = tm.itemHover}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
      <div className="shrink-0">
        <TaskDotIcon color={statusConfig[t.status].dotColor} variant="square" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs leading-snug truncate" style={{ color: tm.textMuted }}>{t.title}</div>
        <div className="text-[10px]" style={{ color: tm.textDimmed }}>{statusConfig[t.status].label} · {t.num} · {t.age}</div>
      </div>
      <button className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-60" style={{ color: tm.textMuted }}>
        <MoreHorizontal className="w-3 h-3" />
      </button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0" style={{ background: tm.bgBase }}>
      <div className="shrink-0 flex items-center px-4 border-b" style={{ height: 44, borderColor: tm.border, background: tm.bgSurface }}>
        <span className="text-sm font-semibold" style={{ color: tm.textPrimary }}>VenomGPT</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 px-3 py-1 rounded-lg" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, width: 220 }}>
          <Search className="w-3 h-3 shrink-0" style={{ color: tm.textDimmed }} />
          <input className="flex-1 bg-transparent text-[11px] outline-none" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} style={{ color: tm.textSecondary }} />
        </div>
        <button className="ml-3 w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: tm.textMuted }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = tm.textPrimary}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = tm.textMuted}
          onClick={onClose} title="Back to workspace">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <Column label="Drafts" count={drafts.length}>
          {drafts.length === 0 ? <EmptyCol /> : drafts.map(t => <TaskCard key={t.id} t={t} />)}
        </Column>

        <Column label="Active" count={active.length}>
          {active.length === 0 ? <EmptyCol /> : active.map(t => <TaskCard key={t.id} t={t} />)}
        </Column>

        <Column label="Ready" count={ready.length}>
          {ready.length === 0 ? <EmptyCol /> : ready.map(t => <ReadyCard key={t.id} t={t} />)}
        </Column>

        <Column label="Done" count={done.length + archived.length + cancelled.length} border={false}>
          {done.map(t => <DoneCard key={t.id} t={t} />)}

          <button className="flex items-center gap-1.5 w-full px-1 py-2 text-[11px] font-medium mt-1"
            style={{ color: tm.textMuted }}
            onClick={() => setArchivedOpen(o => !o)}>
            <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: archivedOpen ? "rotate(0deg)" : "rotate(-90deg)" }} />
            Archived
          </button>
          {archivedOpen && archived.map(t => <ArchiveCard key={t.id} t={t} />)}

          <button className="flex items-center gap-1.5 w-full px-1 py-2 text-[11px] font-medium mt-1"
            style={{ color: tm.textMuted }}
            onClick={() => setCancelledOpen(o => !o)}>
            <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: cancelledOpen ? "rotate(0deg)" : "rotate(-90deg)" }} />
            Cancelled
          </button>
          {cancelledOpen && cancelled.map(t => <ArchiveCard key={t.id} t={t} />)}
        </Column>
      </div>
    </div>
  );
}

export default function Workspace() {
  const [isDark, setIsDark] = useState(true);
  const [promptVal, setPromptVal] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [planActive, setPlanActive] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [autoApprovePlan, setAutoApprovePlan] = useState(false);
  const [appTesting, setAppTesting] = useState(true);
  const [codeOptimizations, setCodeOptimizations] = useState(true);
  const [agentMenuPos, setAgentMenuPos] = useState({ bottom: 0, right: 0 });
  const agentMenuBtnRef = useRef<HTMLButtonElement>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const [searchTools, setSearchTools] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(MIN_W);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [fileCtxMenu, setFileCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const [menuIconTooltip, setMenuIconTooltip] = useState<{ x: number; y: number } | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const [showFiles, setShowFiles] = useState(true);
  const [showLibraryView, setShowLibraryView] = useState(false);
  const [showTaskBoard, setShowTaskBoard] = useState(false);
  const [filesPanelWidth, setFilesPanelWidth] = useState(240);
  const dragging = useRef(false);
  const filesDragging = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!showAgentMenu) return;
    const handler = (e: MouseEvent) => {
      const clickedMenu = agentMenuRef.current?.contains(e.target as Node);
      const clickedBtn = agentMenuBtnRef.current?.contains(e.target as Node);
      if (!clickedMenu && !clickedBtn) setShowAgentMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAgentMenu]);

  const expanded = sidebarWidth > SNAP_THRESHOLD;
  const tm = isDark ? darkTheme : lightTheme;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX;
      const next = Math.max(MIN_W, Math.min(MAX_W, startW + delta));
      setSidebarWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      setSidebarWidth(prev => prev < SNAP_THRESHOLD ? MIN_W : prev);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  const filesWidthRef = useRef(filesPanelWidth);
  const [consoleWidth, setConsoleWidth] = useState(340);
  const consoleWidthRef = useRef(340);
  const consoleDragging = useRef(false);

  const onConsoleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    consoleDragging.current = true;
    const startX = e.clientX;
    const startW = consoleWidthRef.current;
    const onMove = (ev: MouseEvent) => {
      if (!consoleDragging.current) return;
      const delta = ev.clientX - startX;
      const next = Math.max(CONSOLE_MIN_W, Math.min(CONSOLE_MAX_W, startW + delta));
      consoleWidthRef.current = next;
      setConsoleWidth(next);
    };
    const onUp = () => {
      consoleDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const onFilesMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    filesDragging.current = true;
    const startX = e.clientX;
    const startW = filesWidthRef.current;
    const onMove = (ev: MouseEvent) => {
      if (!filesDragging.current) return;
      const delta = startX - ev.clientX;
      const next = Math.max(30, Math.min(FILES_MAX, startW + delta));
      filesWidthRef.current = next;
      setFilesPanelWidth(next);
    };
    const onUp = () => {
      filesDragging.current = false;
      const finalW = filesWidthRef.current;
      if (finalW < FILES_SNAP) {
        setShowFiles(false);
        setFilesPanelWidth(240);
        filesWidthRef.current = 240;
      } else {
        const clamped = Math.max(160, finalW);
        setFilesPanelWidth(clamped);
        filesWidthRef.current = clamped;
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const filteredTools = toolResults.filter(
    (t) => !searchTools || t.name.toLowerCase().includes(searchTools.toLowerCase()) || t.desc.toLowerCase().includes(searchTools.toLowerCase())
  );
  const grouped: { section?: string; items: typeof toolResults }[] = [];
  let lastSection = "__UNSET__";
  for (const t of filteredTools) {
    const sec = t.section || "";
    if (sec !== lastSection) { grouped.push({ section: sec || undefined, items: [] }); lastSection = sec; }
    grouped[grouped.length - 1].items.push(t);
  }

  const gridBg = {
    backgroundImage: `linear-gradient(${tm.gridColor} 1px, transparent 1px), linear-gradient(90deg, ${tm.gridColor} 1px, transparent 1px)`,
    backgroundSize: "24px 24px",
  };
  const thumbColor = isDark ? "rgba(138,43,226,0.30)" : "rgba(124,58,237,0.25)";
  const thumbHover = isDark ? "rgba(138,43,226,0.55)" : "rgba(124,58,237,0.50)";
  const scrollbarCss = `:root { --vg-scroll-thumb: ${thumbColor}; --vg-scroll-thumb-hover: ${thumbHover}; }`;

  return (
    <>
    <div className="flex flex-col w-screen h-screen overflow-hidden select-none" style={{ background: tm.bgBase, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif", fontSize: 13, color: tm.textPrimary }}>
      <style>{scrollbarCss}</style>
      <div className="flex flex-1 overflow-hidden">

      <div ref={sidebarRef} className="relative flex flex-col shrink-0 border-r" style={{ width: sidebarWidth, background: tm.bgBase, borderColor: tm.border, transition: dragging.current ? "none" : "width 0.2s ease" }}>

        <div className="shrink-0 border-b" style={{ borderColor: tm.border }}>
          {expanded ? (
            <div className="relative overflow-hidden flex items-center gap-2.5 px-2.5" style={{ height: 45, background: tm.sidebarHeaderBg }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: tm.sidebarHeaderGlow }} />
              <div className="rounded-lg flex items-center justify-center shrink-0 relative z-10" style={{ width: 30, height: 30, background: tm.logoContainerBg, border: `1px solid ${tm.logoContainerBorder}`, boxShadow: tm.logoContainerShadow }}>
                <VenomLogo size={22} />
              </div>
              <div className="flex flex-col min-w-0 relative z-10">
                <div className="flex items-baseline gap-1">
                  <span style={{ fontSize: 13, fontWeight: 800, color: tm.textPrimary, letterSpacing: "0.06em" }}>VENOM</span>
                  <span style={{ fontSize: 13, fontWeight: 400, color: tm.accent, letterSpacing: "0.06em" }}>GPT</span>
                </div>
                <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: tm.textDimmed, fontFamily: "monospace" }}>
                  Cyber Intelligence
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center" style={{ height: 45, background: tm.sidebarHeaderBg }}>
              <div className="rounded-lg flex items-center justify-center" style={{ width: 30, height: 30, background: tm.logoContainerBg, border: `1px solid ${tm.logoContainerBorder}`, boxShadow: tm.logoContainerShadow }}>
                <VenomLogo size={22} />
              </div>
            </div>
          )}
        </div>

          <div className="px-2 py-2 border-b shrink-0" style={{ borderColor: tm.border }}>
            {expanded ? (
              <button className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium" style={{ color: tm.textMuted }}>
                <Plus className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">New task</span>
              </button>
            ) : (
              <button className="w-full flex items-center justify-center py-1 rounded" style={{ color: tm.textMuted }}>
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="vg-scroll flex-1 overflow-y-auto overflow-x-hidden py-1">
            <div className="mx-1 mb-1 rounded-lg cursor-pointer transition-colors" style={{ background: tm.itemHover }}>
              {expanded ? (
                <div className="flex items-center gap-2 px-2 py-2">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 overflow-hidden" style={{ background: isDark ? "#0a0e18" : "#f2f0f8" }}>
                    <VenomLogo size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate" style={{ color: tm.textPrimary }}>Main version</div>
                    <div className="text-[11px] truncate" style={{ color: tm.textDimmed }}>VENOM GPT #7 · 5m</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-1.5">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden" style={{ background: isDark ? "#0a0e18" : "#f2f0f8" }}>
                    <VenomLogo size={26} />
                  </div>
                </div>
              )}
            </div>

            {tasks.map((task) => {
              const cfg = statusConfig[task.status];
              const StatusIcon = cfg.icon;
              return expanded ? (
                <div key={task.id} className="flex items-center gap-2 px-2 py-2 mx-1 rounded-lg cursor-pointer group transition-colors" style={task.id === "1" ? { background: tm.itemHover } : {}}
                  onMouseEnter={e => { if (task.id !== "1") (e.currentTarget as HTMLDivElement).style.background = tm.itemHover; }}
                  onMouseLeave={e => { if (task.id !== "1") (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${cfg.dotColor}22`, border: `2px solid ${cfg.dotColor}` }}>
                    <StatusIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: tm.textPrimary }}>{task.title}</div>
                    <div className="text-[11px] truncate" style={{ color: tm.textDimmed }}>{cfg.label} – {task.num} · {task.age}</div>
                  </div>
                </div>
              ) : (
                <div key={task.id} className="flex items-center justify-center py-1 mx-1 cursor-pointer group" title={task.title}>
                  <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: `${cfg.dotColor}22`, border: `2px solid ${cfg.dotColor}` }}>
                    <StatusIcon className="w-3.5 h-3.5" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t shrink-0" style={{ borderColor: tm.border }}>
            {expanded ? (
              <div className="px-2 py-2 flex flex-col gap-1">
                <button className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors" style={{ color: tm.textMuted }}>
                  <Settings className="w-3.5 h-3.5 shrink-0" /> Settings
                </button>
                <div className="flex items-center gap-1.5">
                  <button className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-opacity opacity-70 hover:opacity-100" style={{ color: tm.textMuted, border: `1px solid ${tm.border}`, background: tm.bgPanel }} onClick={() => setSidebarWidth(MIN_W)} title="Collapse sidebar">
                    <PanelLeft className="w-3.5 h-3.5" />
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-xs font-medium" style={{ background: tm.accentBg, color: tm.accentText, border: `1px solid ${tm.accentBorder}` }} onClick={() => setShowTaskBoard(true)}>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Open task board
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-2">
                <button className="w-8 h-8 flex items-center justify-center rounded" style={{ color: tm.textMuted }} title="Settings">
                  <Settings className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ background: tm.accentBg, color: tm.accentText }} title="Open task board" onClick={() => setShowTaskBoard(true)}>
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg transition-opacity opacity-60 hover:opacity-100" style={{ color: tm.textMuted, border: `1px solid ${tm.border}`, background: tm.bgPanel }} title="Expand sidebar" onClick={() => setSidebarWidth(MAX_W)}>
                  <PanelRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

        <div className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10" onMouseDown={onMouseDown}
          style={{ background: "transparent" }}>
          <div className="absolute top-0 right-0 w-px h-full" style={{ background: tm.border }} />
        </div>
      </div>

      {showTaskBoard ? (
        <TaskBoard tm={tm} isDark={isDark} onClose={() => setShowTaskBoard(false)} />
      ) : (
      <div className="flex-1 flex min-h-0 min-w-0">

        <div className="flex flex-col shrink-0 border-r relative overflow-hidden" style={{ width: consoleWidth, minWidth: CONSOLE_MIN_W, maxWidth: CONSOLE_MAX_W, background: tm.bgSurface, borderColor: tm.border }}>
          <div className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-20 group" onMouseDown={onConsoleMouseDown}>
            <div className="absolute top-0 right-0 w-px h-full transition-colors" style={{ background: tm.border }} />
            <div className="absolute top-0 right-0 w-1.5 h-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(138,43,226,0.35)" }} />
          </div>
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: tm.glassMesh }} />
          <div className="absolute inset-0 pointer-events-none" style={gridBg} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: isDark ? "radial-gradient(ellipse 100% 60% at 50% 0%, rgba(6,8,14,0.35) 0%, transparent 80%)" : "radial-gradient(ellipse 100% 60% at 50% 0%, rgba(242,240,248,0.4) 0%, transparent 80%)" }} />

          <div className="flex items-center justify-between px-3 shrink-0 border-b relative z-10" style={{ borderColor: tm.border, height: 44, background: tm.bgBase }}>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: tm.textDimmed }}>Main version</span>
              <span className="text-xs font-semibold truncate" style={{ color: tm.textPrimary }}>VENOM GPT Interface</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: tm.textMuted }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = tm.itemHover}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}
                title="History">
                <History className="w-3.5 h-3.5" />
              </button>
              <button className="w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: tm.accentText, background: tm.accentBg }}
                title="New session">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="vg-scroll flex-1 flex flex-col items-center justify-center px-6 relative z-10 overflow-y-auto">
            <div className="flex flex-col items-center text-center">
              <div className="mb-5">
                <VenomLogoFull size={130} isDark={isDark} />
              </div>
              <h2 className="text-sm font-semibold mb-2" style={{ color: tm.textPrimary }}>VenomGPT Agentic Workspace: Ready.</h2>
              <p className="text-xs max-w-[260px] leading-relaxed" style={{ color: tm.textMuted }}>
                Describe your goal below or choose a task to start.
              </p>
            </div>
          </div>

          <div className="shrink-0 px-3 pb-3 pt-2 relative z-10">
            <div className="rounded-xl" style={{ background: tm.glassPanelBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: `1px solid ${tm.accentBorder}`, boxShadow: tm.inputPanelShadow }}>
              <div className="flex items-start px-3 py-2.5 min-h-[40px]">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="flex-1 bg-transparent text-xs outline-none leading-relaxed"
                  placeholder="Ask questions, plan your work..."
                  value={promptVal}
                  onChange={e => setPromptVal(e.target.value)}
                  onInput={() => {
                    const ta = textareaRef.current;
                    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      if (e.ctrlKey) {
                        e.preventDefault();
                        const ta = e.currentTarget;
                        const s = ta.selectionStart ?? promptVal.length;
                        const end = ta.selectionEnd ?? s;
                        const next = promptVal.slice(0, s) + "\n" + promptVal.slice(end);
                        setPromptVal(next);
                        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 1; });
                      } else {
                        e.preventDefault();
                        if (promptVal.trim()) setIsRunning(true);
                      }
                    }
                  }}
                  style={{ color: tm.textSecondary, resize: "none", overflowY: "hidden", minHeight: 20 }}
                />
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1.5 border-t" style={{ borderColor: tm.border }}>
                <button className="w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: tm.textMuted }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = tm.textSecondary}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = tm.textMuted}>
                  <Plus className="w-3 h-3" />
                </button>
                <button className="w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: tm.textMuted }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = tm.textSecondary}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = tm.textMuted}>
                  <Paperclip className="w-3 h-3" />
                </button>
                <div className="flex-1" />
                <button className="w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-all" title="Enhance prompt"
                  style={{ color: tm.textMuted, border: `1px solid ${tm.border}`, background: "transparent" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = tm.accentText; (e.currentTarget as HTMLButtonElement).style.borderColor = tm.accentBorder; (e.currentTarget as HTMLButtonElement).style.background = tm.accentBg; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = tm.textMuted; (e.currentTarget as HTMLButtonElement).style.borderColor = tm.border; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
                <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium cursor-pointer transition-all ml-0.5"
                  onClick={() => setPlanActive(p => !p)}
                  style={{ color: planActive ? tm.accentText : tm.textMuted, border: `1px solid ${planActive ? tm.accentBorder : tm.border}`, background: planActive ? tm.accentBg : "transparent" }}>
                  <div className="w-3 h-3 rounded-full flex items-center justify-center shrink-0" style={{ border: `1.5px solid ${planActive ? tm.accentText : tm.textDimmed}`, background: planActive ? tm.accentText + "22" : "transparent" }}>
                    {planActive && <div className="w-1.5 h-1.5 rounded-full" style={{ background: tm.accentText }} />}
                  </div>
                  <span>Plan</span>
                </button>
                <button
                  ref={agentMenuBtnRef}
                  className="flex items-center gap-1 px-2 h-7 rounded-full transition-all ml-0.5"
                  onClick={() => {
                    const r = agentMenuBtnRef.current!.getBoundingClientRect();
                    setAgentMenuPos({ bottom: window.innerHeight - r.top + 8, right: window.innerWidth - r.right });
                    setShowAgentMenu(m => !m);
                  }}
                  style={{ color: showAgentMenu ? tm.accentText : tm.textMuted, border: `1px solid ${showAgentMenu ? tm.accentBorder : tm.border}`, background: showAgentMenu ? tm.accentBg : "transparent" }}
                  title="Settings">
                  <Camera className="w-3.5 h-3.5" />
                  <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                </button>
                <button className="w-7 h-7 flex items-center justify-center rounded-full transition-all ml-0.5"
                  onClick={() => setIsRunning(r => !r)}
                  style={{ background: isRunning ? "rgba(239,68,68,0.15)" : "linear-gradient(135deg,#8A2BE2,#c084fc)", border: isRunning ? "1px solid rgba(239,68,68,0.4)" : "none", color: "white", boxShadow: isRunning ? "0 0 12px rgba(239,68,68,0.3)" : "0 0 12px rgba(138,43,226,0.5)" }}
                  title={isRunning ? "Stop" : "Run"}>
                  {isRunning
                    ? <Square className="w-3 h-3 fill-current" style={{ color: "#f87171" }} />
                    : <Play className="w-3 h-3 fill-current translate-x-px" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          <div className="flex items-center px-2 shrink-0 border-b z-30" style={{ background: tm.bgBase, borderColor: tm.border, height: 45 }}>
            <div className="flex items-center gap-0.5 overflow-hidden">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 ml-0.5 rounded-t text-xs cursor-pointer" style={{ color: tm.textMuted }}>
                <Globe className="w-3 h-3" /><span>Preview</span><span style={{ color: tm.textDimmed }}>×</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 ml-0.5 rounded-t text-xs cursor-pointer" style={{ color: tm.textMuted }}>
                <Terminal className="w-3 h-3" /><span>New tab</span><span style={{ color: tm.textDimmed }}>×</span>
              </div>
              <button className="hidden sm:flex items-center justify-center w-6 h-6 ml-1 rounded" style={{ color: tm.textDimmed }}>
                <Plus className="w-3 h-3" />
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1 sm:gap-2 pr-1">

              <button className="hidden md:flex w-6 h-6 items-center justify-center rounded" style={{ color: tm.textMuted }}><History className="w-3.5 h-3.5" /></button>
              <button className="hidden md:flex w-6 h-6 items-center justify-center rounded" style={{ color: tm.textMuted }}><Users className="w-3.5 h-3.5" /></button>
              <button className="w-6 h-6 flex items-center justify-center rounded" style={{ color: tm.textMuted }}><Settings className="w-3.5 h-3.5" /></button>
              <button className="w-7 h-7 flex items-center justify-center rounded-lg transition-all" style={{ background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText }} onClick={() => setIsDark(!isDark)} title={isDark ? "Light mode" : "Dark mode"}>
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              <button className="hidden sm:flex w-6 h-6 items-center justify-center rounded" style={{ color: showFiles ? tm.accentText : tm.textMuted, background: showFiles ? tm.accentBg : "transparent" }} onClick={() => setShowFiles(!showFiles)} title={showFiles ? "Hide files" : "Show files"}>
                <PanelRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex min-h-0">

        <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden" style={{ background: tm.bgSurface }}>
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: tm.glassMesh, opacity: 0.5 }} />
          <div className="absolute inset-0 pointer-events-none" style={gridBg} />

          <div className="vg-scroll flex-1 overflow-y-auto relative z-10">
            <div className="sticky top-0 z-20" style={{ background: tm.bgSurface }}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b" style={{ borderColor: tm.border }}>
                <Search className="w-3 h-3" style={{ color: tm.textMuted }} />
                <input className="flex-1 bg-transparent text-[11px] outline-none" placeholder="Search for tools & files..."
                  value={searchTools} onChange={(e) => setSearchTools(e.target.value)}
                  style={{ color: tm.textSecondary }} />
              </div>
            </div>
            <div className="py-1">
              {grouped.map((group, gi) => (
                <div key={gi}>
                  {group.section && <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: tm.sectionLabel }}>{group.section}</div>}
                  {group.items.map((tool, ti) => {
                    const Icon = tool.icon;
                    return (
                      <div key={ti} className="flex items-start gap-2 px-3 py-1 cursor-pointer transition-colors" style={{ background: "transparent" }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = tm.itemHover}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5" style={{ background: tm.accentBg, border: `1px solid ${tm.accentBorder}` }}>
                          <Icon className="w-3 h-3" style={{ color: tm.accentText }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium" style={{ color: tm.textPrimary }}>{tool.name}</div>
                          <div className="text-[10px] mt-0 leading-snug" style={{ color: tm.textMuted }}>{tool.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {showFiles && <div className="hidden lg:flex flex-col shrink-0 relative overflow-hidden" style={{ width: filesPanelWidth, minWidth: 0, background: tm.bgBase }}>
          <div className="absolute top-0 left-0 w-2 h-full cursor-col-resize z-10" onMouseDown={onFilesMouseDown}
            style={{ background: "transparent" }}>
            <div className="absolute top-0 left-0 w-px h-full" style={{ background: tm.border }} />
          </div>
          <div className="flex items-center px-2 py-2 border-b shrink-0" style={{ borderColor: tm.border }}>
            <button
              onClick={() => setShowLibraryView(true)}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-all"
              style={{ color: showLibraryView ? tm.accentText : tm.textMuted, background: showLibraryView ? tm.accentBg : tm.itemHover, border: `1px solid ${showLibraryView ? tm.accentBorder : "transparent"}` }}>
              <LayoutGrid className="w-3 h-3" /> Library
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setShowLibraryView(false)}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-all"
              style={{ color: !showLibraryView ? tm.accentText : tm.textMuted, background: !showLibraryView ? tm.accentBg : tm.itemHover, border: `1px solid ${!showLibraryView ? tm.accentBorder : "transparent"}` }}>
              <ListTree className="w-3 h-3" /> File tree
            </button>
          </div>
          {!showLibraryView && (
            <div className="px-2 py-1.5 border-b relative" style={{ borderColor: tm.border }}>
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded" style={{ background: tm.bgPanel, border: `1px solid ${tm.border}` }}>
                <Search className="w-3 h-3" style={{ color: tm.textDimmed }} />
                <input className="flex-1 bg-transparent text-[11px] outline-none" placeholder="Search files"
                  value={fileSearch} onChange={(e) => setFileSearch(e.target.value)}
                  style={{ color: tm.textSecondary }} />
                <button className="w-4 h-4 flex items-center justify-center" style={{ color: tm.textDimmed }}
                  onClick={() => setShowContextMenu(!showContextMenu)}>
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
              {showContextMenu && (
                <>
                <div className="fixed inset-0 z-40" onClick={() => setShowContextMenu(false)} />
                <div className="absolute right-2 top-full mt-1 z-50 py-1 rounded-lg shadow-xl min-w-[160px]"
                  style={{ background: tm.bgPanel, border: `1px solid ${tm.border}`, boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.15)" }}>
                  {contextMenuItems.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <button key={i} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors text-left"
                        style={{ color: tm.textSecondary }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = tm.itemHover}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
                        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: tm.accentText }} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          )}
          {showLibraryView ? (
            <div className="vg-scroll flex-1 overflow-y-auto py-2 px-2">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: tm.sectionLabel }}>Running Apps</div>
              {[
                { name: "VenomGPT", desc: "Web · Port 5173", dot: "#22c55e", icon: Globe },
                { name: "API Server", desc: "API · Port 3000", dot: "#22c55e", icon: Server },
                { name: "Preview Server", desc: "Dev · Port 5174", dot: "#22c55e", icon: Monitor },
              ].map(app => {
                const Icon = app.icon;
                return (
                  <div key={app.name} className="flex items-center gap-2 px-2 py-2 rounded-lg mb-1 cursor-pointer transition-colors"
                    style={{ border: `1px solid transparent` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = tm.itemHover; (e.currentTarget as HTMLDivElement).style.borderColor = tm.border; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.borderColor = "transparent"; }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: tm.accentBg, border: `1px solid ${tm.accentBorder}` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: tm.accentText }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium truncate" style={{ color: tm.textPrimary }}>{app.name}</div>
                      <div className="text-[10px]" style={{ color: tm.textDimmed }}>{app.desc}</div>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: app.dot, boxShadow: `0 0 4px ${app.dot}` }} />
                  </div>
                );
              })}
              <div className="px-1 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider mb-1 mt-1 border-t" style={{ color: tm.sectionLabel, borderColor: tm.border }}>Integrations</div>
              {[
                { name: "Database", desc: "PostgreSQL", dot: "#8A2BE2", icon: Database },
                { name: "Object Storage", desc: "App Storage", dot: "#f59e0b", icon: HardDrive },
              ].map(app => {
                const Icon = app.icon;
                return (
                  <div key={app.name} className="flex items-center gap-2 px-2 py-2 rounded-lg mb-1 cursor-pointer transition-colors"
                    style={{ border: `1px solid transparent` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = tm.itemHover; (e.currentTarget as HTMLDivElement).style.borderColor = tm.border; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.borderColor = "transparent"; }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: isDark ? "rgba(255,255,255,0.04)" : tm.bgPanel, border: `1px solid ${tm.border}` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: tm.textMuted }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium truncate" style={{ color: tm.textPrimary }}>{app.name}</div>
                      <div className="text-[10px]" style={{ color: tm.textDimmed }}>{app.desc}</div>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: app.dot, boxShadow: `0 0 4px ${app.dot}` }} />
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="vg-scroll flex-1 overflow-y-auto py-1">
            {fileTreeData.filter(f => !fileSearch || f.name.toLowerCase().includes(fileSearch.toLowerCase())).map((node, i) => {
              const isFolder = node.type === "folder";
              return (
                <div key={i} className="group flex items-center gap-1 py-[3px] cursor-pointer rounded mx-1 transition-colors"
                  style={{ paddingLeft: 8 + node.indent * 14 }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = tm.itemHover}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                  onContextMenu={e => { e.preventDefault(); setFileCtxMenu({ x: e.clientX, y: e.clientY, name: node.name }); }}>
                  {isFolder ? (
                    <>
                      <ChevronRight className={`w-2.5 h-2.5 shrink-0 transition-transform ${node.open ? "rotate-90" : ""}`} style={{ color: tm.textDimmed }} />
                      {node.open ? <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: "#e8a838" }} /> : <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: "#e8a838" }} />}
                    </>
                  ) : (
                    <>
                      <span className="w-2.5" />
                      <span className="shrink-0 flex items-center"><FileTypeIcon name={node.name} ext={node.ext} /></span>
                    </>
                  )}
                  <span className="text-[11px] truncate ml-0.5 flex-1" style={{ color: tm.textSecondary }}>{node.name}</span>
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded mr-0.5 transition-opacity"
                    style={{ color: tm.textMuted }}
                    onMouseEnter={e => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).style.background = tm.navHover; const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect(); const tw = 44; const x = r.right + 6 + tw > window.innerWidth ? r.left - tw - 6 : r.right + 6; setMenuIconTooltip({ x, y: r.top + r.height / 2 }); }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; setMenuIconTooltip(null); }}
                    onClick={e => { e.stopPropagation(); setMenuIconTooltip(null); setFileCtxMenu({ x: e.clientX, y: e.clientY, name: node.name }); }}>
                    <MoreVertical className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: tm.sectionLabel }}>Package files</div>
            {packageFiles.map((node, i) => {
              const isFolder = node.type === "folder";
              return (
                <div key={`pkg-${i}`} className="group flex items-center gap-1 py-[3px] cursor-pointer rounded mx-1 transition-colors"
                  style={{ paddingLeft: 8 + node.indent * 14 }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = tm.itemHover}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                  onContextMenu={e => { e.preventDefault(); setFileCtxMenu({ x: e.clientX, y: e.clientY, name: node.name }); }}>
                  {isFolder ? (
                    <>
                      <ChevronRight className="w-2.5 h-2.5 shrink-0" style={{ color: tm.textDimmed }} />
                      <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: "#e8a838" }} />
                    </>
                  ) : (
                    <>
                      <span className="w-2.5" />
                      <span className="shrink-0 flex items-center"><FileTypeIcon name={node.name} ext={node.ext} /></span>
                    </>
                  )}
                  <span className="text-[11px] truncate ml-0.5 flex-1" style={{ color: tm.textSecondary }}>{node.name}</span>
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded mr-0.5 transition-opacity"
                    style={{ color: tm.textMuted }}
                    onMouseEnter={e => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).style.background = tm.navHover; const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect(); const tw = 44; const x = r.right + 6 + tw > window.innerWidth ? r.left - tw - 6 : r.right + 6; setMenuIconTooltip({ x, y: r.top + r.height / 2 }); }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; setMenuIconTooltip(null); }}
                    onClick={e => { e.stopPropagation(); setMenuIconTooltip(null); setFileCtxMenu({ x: e.clientX, y: e.clientY, name: node.name }); }}>
                    <MoreVertical className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
          )}
        </div>}

          </div>
        </div>
      </div>
      )}
      </div>
      <div className="shrink-0 flex items-center px-3 border-t select-none" style={{ height: 22, background: tm.bgBase, borderColor: tm.border }}>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }} />
          <span className="text-[10px] font-medium" style={{ color: tm.textMuted }}>VenomGPT</span>
        </div>
        <div className="flex-1" />
        <button className="relative flex items-center justify-center w-5 h-5 rounded transition-colors"
          style={{ color: tm.textDimmed }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = tm.textSecondary}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = tm.textDimmed}
          title="Notifications">
          <Bell className="w-3 h-3" />
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: tm.accent, color: "white" }}>3</span>
        </button>
      </div>
    </div>
    {showAgentMenu && createPortal(
      <div
        ref={agentMenuRef}
        style={{ position: "fixed", bottom: agentMenuPos.bottom, right: agentMenuPos.right, zIndex: 9999, width: 280, borderRadius: 16, background: isDark ? "#0e0b18" : "#ffffff", border: `1px solid ${isDark ? "rgba(138,43,226,0.3)" : "#e2d9f3"}`, boxShadow: isDark ? "0 -8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(138,43,226,0.12)" : "0 -8px 32px rgba(0,0,0,0.12)", fontFamily: "'Inter',-apple-system,sans-serif" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${isDark ? "rgba(138,43,226,0.15)" : "#ede8f8"}` }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: isDark ? "#8070b0" : "#6b5b9e" }}>Plan settings</span>
        </div>
        <div style={{ padding: "4px 16px 8px" }}>
          {[
            { label: "Automatically approve plan", val: autoApprovePlan, set: setAutoApprovePlan, icon: null },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 0" }}>
              <span style={{ fontSize: 12, color: isDark ? "#c4b8e0" : "#2d1a5a" }}>{label}</span>
              <button onClick={() => set(p => !p)} style={{ position: "relative", width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: val ? "#8A2BE2" : isDark ? "#1e1830" : "#e0d8f0", transition: "background 0.2s", outline: "none", boxShadow: val ? "0 0 8px rgba(138,43,226,0.4)" : "none" }}>
                <div style={{ position: "absolute", top: 3, left: val ? "calc(100% - 17px)" : 3, width: 14, height: 14, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ margin: "0 16px", borderTop: `1px solid ${isDark ? "rgba(138,43,226,0.15)" : "#ede8f8"}` }} />
        <div style={{ padding: "10px 16px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <DollarSign style={{ width: 13, height: 13, color: isDark ? "#c084fc" : "#7c3aed" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: isDark ? "#8070b0" : "#6b5b9e" }}>Cost-optimized building</span>
          </div>
          {[
            { label: "App testing", val: appTesting, set: setAppTesting, Icon: FlaskConical },
            { label: "Code optimizations", val: codeOptimizations, set: setCodeOptimizations, Icon: Cpu },
          ].map(({ label, val, set, Icon }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon style={{ width: 13, height: 13, color: isDark ? "#9080c0" : "#6b5b9e" }} />
                <span style={{ fontSize: 12, color: isDark ? "#c4b8e0" : "#2d1a5a" }}>{label}</span>
                <Info style={{ width: 12, height: 12, color: isDark ? "#6b5890" : "#9080c0" }} />
              </div>
              <button onClick={() => set(p => !p)} style={{ position: "relative", width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: val ? "#8A2BE2" : isDark ? "#1e1830" : "#e0d8f0", transition: "background 0.2s", outline: "none", boxShadow: val ? "0 0 8px rgba(138,43,226,0.4)" : "none" }}>
                <div style={{ position: "absolute", top: 3, left: val ? "calc(100% - 17px)" : 3, width: 14, height: 14, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 16px 14px" }}>
          <div style={{ borderRadius: 8, padding: "8px 12px", background: isDark ? "rgba(138,43,226,0.08)" : "rgba(124,58,237,0.06)", border: `1px solid ${isDark ? "rgba(138,43,226,0.2)" : "rgba(124,58,237,0.15)"}` }}>
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: isDark ? "#9080c0" : "#6b5b9e" }}>These features may increase token usage but improve plan quality and accuracy.</p>
          </div>
        </div>
      </div>,
      document.body
    )}
    {fileCtxMenu && createPortal(
      <>
        <div className="fixed inset-0 z-[9998]" onClick={() => setFileCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setFileCtxMenu(null); }} />
        <div className="fixed z-[9999] rounded-lg shadow-2xl min-w-[190px] overflow-hidden"
          style={{
            left: Math.min(fileCtxMenu.x, window.innerWidth - 202),
            top: fileCtxMenu.y,
            background: isDark ? "#121020" : "#ffffff",
            border: `1px solid ${isDark ? "rgba(138,43,226,0.22)" : "rgba(0,0,0,0.12)"}`,
            boxShadow: isDark ? "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(138,43,226,0.08)" : "0 8px 32px rgba(0,0,0,0.14)",
          }}>
          <div className="vg-scroll py-1"
            style={{ overflowY: "auto", maxHeight: Math.max(60, window.innerHeight - fileCtxMenu.y - 8) }}>
            {fileRightClickItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <button key={i}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left transition-colors"
                  style={{ color: item.danger ? "#ef4444" : (isDark ? "#c4b8e0" : "#2d1a5a") }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}
                  onClick={() => setFileCtxMenu(null)}>
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: item.danger ? "#ef4444" : (isDark ? "#8a6ab8" : "#7c3aed") }} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </>,
      document.body
    )}
    {menuIconTooltip && createPortal(
      <div style={{
        position: "fixed",
        left: menuIconTooltip.x,
        top: menuIconTooltip.y,
        transform: "translateY(-50%)",
        zIndex: 99999,
        background: isDark ? "#1a1830" : "#ffffff",
        color: isDark ? "#c4b8e0" : "#2d1a5a",
        border: `1px solid ${isDark ? "rgba(138,43,226,0.3)" : "rgba(0,0,0,0.12)"}`,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 10,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.15)",
      }}>menu</div>,
      document.body
    )}
    </>
  );
}
