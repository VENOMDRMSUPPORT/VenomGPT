export type VGTheme = {
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
  accentBgHover: string;
  accentShadow: string;
  sendBtnHover: string;
  gridColor: string;
  glowColor: string;
  navHover: string;
  itemHover: string;
  connectedBg: string;
  connectedBorder: string;
  sectionLabel: string;
  glassMesh: string;
  glassPanelBg: string;
  glassPanelBorder: string;
  inputPanelBg: string;
  inputPanelBorder: string;
  inputPanelShadow: string;
  logoContainerBg: string;
  logoContainerBorder: string;
  logoContainerShadow: string;
  sidebarBg: string;
  sidebarHeaderBg: string;
  sidebarHeaderGlow: string;
  sidebarDivider: string;
  lockedNavColor: string;
  atmosphericGlow: string;
};

export const darkTheme: VGTheme = {
  bgBase: "#06070f",
  bgSurface: "#0b0c1c",
  bgPanel: "#10112a",
  bgInput: "#07081a",
  border: "#1c1638",
  borderLight: "#261d48",
  textPrimary: "#FFFFFF",
  textSecondary: "#cbbef0",
  textMuted: "#9080c8",
  textDimmed: "#6b5898",
  accent: "#8A2BE2",
  accentBg: "rgba(138,43,226,0.13)",
  accentBorder: "rgba(138,43,226,0.34)",
  accentText: "#c084fc",
  accentBgHover: "rgba(138,43,226,0.22)",
  accentShadow: "rgba(138,43,226,0.22)",
  sendBtnHover: "#9b35f5",
  gridColor: "rgba(138,43,226,0.04)",
  glowColor: "rgba(138,43,226,0.08)",
  navHover: "rgba(138,43,226,0.09)",
  itemHover: "rgba(255,255,255,0.04)",
  connectedBg: "rgba(138,43,226,0.12)",
  connectedBorder: "rgba(138,43,226,0.36)",
  sectionLabel: "#6a5d9a",
  glassMesh: [
    "radial-gradient(ellipse 900px 600px at 15% 10%, rgba(138,43,226,0.18) 0%, transparent 60%)",
    "radial-gradient(ellipse 700px 500px at 85% 20%, rgba(168,85,247,0.10) 0%, transparent 55%)",
    "radial-gradient(ellipse 600px 700px at 70% 80%, rgba(138,43,226,0.13) 0%, transparent 60%)",
    "radial-gradient(ellipse 500px 400px at 10% 85%, rgba(110,30,200,0.09) 0%, transparent 55%)",
  ].join(","),
  glassPanelBg: "rgba(10,10,30,0.80)",
  glassPanelBorder: "rgba(138,43,226,0.20)",
  inputPanelBg: "rgba(6,7,22,0.92)",
  inputPanelBorder: "rgba(138,43,226,0.38)",
  inputPanelShadow:
    "0 0 0 1px rgba(138,43,226,0.14), 0 8px 48px rgba(0,0,0,0.60), 0 2px 16px rgba(138,43,226,0.10), inset 0 1px 0 rgba(255,255,255,0.04)",
  logoContainerBg: "rgba(138,43,226,0.14)",
  logoContainerBorder: "rgba(138,43,226,0.34)",
  logoContainerShadow: "0 0 18px rgba(138,43,226,0.28)",
  // Sidebar surface — uniform indigo-navy, no harsh gradient
  sidebarBg: "#07081a",
  // Header block — elevated panel, clearly distinct from sidebarBg
  sidebarHeaderBg: "rgba(14,13,34,0.98)",
  // Corner glow — top-left only, doesn't bleed into nav area
  sidebarHeaderGlow:
    "radial-gradient(ellipse 240% 110% at -10% -5%, rgba(138,43,226,0.18) 0%, transparent 52%)",
  // Subtle accent-tinted divider between header and nav
  sidebarDivider: "rgba(138,43,226,0.14)",
  // Locked nav text — visible but clearly muted; not flat-opacity'd
  lockedNavColor: "#6e60a0",
  atmosphericGlow:
    "radial-gradient(ellipse 700px 520px at 50% 38%, rgba(138,43,226,0.11) 0%, transparent 70%)",
};

export const lightTheme: VGTheme = {
  bgBase: "#f4f1fb",
  bgSurface: "#f9f7fe",
  bgPanel: "#ffffff",
  bgInput: "#ede9fc",
  border: "#d4c8f0",
  borderLight: "#e2d9f7",
  textPrimary: "#0d0520",
  textSecondary: "#2d1a5a",
  textMuted: "#5a4a8a",
  textDimmed: "#7b6aaa",
  accent: "#7c3aed",
  accentBg: "rgba(124,58,237,0.09)",
  accentBorder: "rgba(124,58,237,0.30)",
  accentText: "#6d28d9",
  accentBgHover: "rgba(124,58,237,0.18)",
  accentShadow: "rgba(124,58,237,0.16)",
  sendBtnHover: "#6d28d9",
  gridColor: "rgba(124,58,237,0.05)",
  glowColor: "rgba(124,58,237,0.04)",
  navHover: "rgba(124,58,237,0.07)",
  itemHover: "rgba(0,0,0,0.04)",
  connectedBg: "rgba(124,58,237,0.10)",
  connectedBorder: "rgba(124,58,237,0.30)",
  sectionLabel: "#6b5b9e",
  glassMesh: [
    "radial-gradient(ellipse 900px 600px at 15% 10%, rgba(124,58,237,0.10) 0%, transparent 60%)",
    "radial-gradient(ellipse 700px 500px at 85% 20%, rgba(168,85,247,0.07) 0%, transparent 55%)",
    "radial-gradient(ellipse 600px 700px at 70% 80%, rgba(124,58,237,0.08) 0%, transparent 60%)",
    "radial-gradient(ellipse 500px 400px at 10% 85%, rgba(100,40,200,0.06) 0%, transparent 55%)",
  ].join(","),
  glassPanelBg: "rgba(255,255,255,0.80)",
  glassPanelBorder: "rgba(124,58,237,0.16)",
  inputPanelBg: "rgba(255,255,255,0.96)",
  inputPanelBorder: "rgba(124,58,237,0.35)",
  inputPanelShadow:
    "0 0 0 1px rgba(124,58,237,0.16), 0 8px 40px rgba(124,58,237,0.12), 0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)",
  logoContainerBg: "rgba(124,58,237,0.08)",
  logoContainerBorder: "rgba(124,58,237,0.22)",
  logoContainerShadow: "0 0 8px rgba(124,58,237,0.12)",
  // Sidebar surface — unified lavender surface
  sidebarBg: "#ede8fb",
  // Header block — slightly more elevated/saturated
  sidebarHeaderBg: "rgba(228,220,252,0.98)",
  // Corner glow — top-left only
  sidebarHeaderGlow:
    "radial-gradient(ellipse 240% 110% at -10% -5%, rgba(124,58,237,0.12) 0%, transparent 52%)",
  // Subtle accent-tinted divider between header and nav
  sidebarDivider: "rgba(124,58,237,0.12)",
  // Locked nav text — visible but clearly muted
  lockedNavColor: "#8b79c0",
  atmosphericGlow:
    "radial-gradient(ellipse 700px 520px at 50% 38%, rgba(124,58,237,0.09) 0%, transparent 70%)",
};
