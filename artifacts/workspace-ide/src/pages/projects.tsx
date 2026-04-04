import { motion } from "framer-motion";
import { FolderOpen, FolderPlus, Zap, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import PageLayout from "@/components/layout/page-layout";
import { useTheme } from "@/lib/theme-context";

export default function ProjectsPage() {
  const { tm } = useTheme();
  const [, navigate] = useLocation();

  return (
    <PageLayout activePage="projects">
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 36px 44px", width: "100%" }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ marginBottom: 28 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FolderOpen style={{ width: 17, height: 17, color: tm.accent }} />
              </div>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 800, color: tm.textPrimary, margin: 0, letterSpacing: "0.01em" }}>Projects</h1>
                <p style={{ fontSize: 12, color: tm.textMuted, margin: 0, marginTop: 2 }}>Manage your workspaces and coding projects</p>
              </div>
            </div>
            <div
              title="Coming soon"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.textDimmed, fontSize: 12, fontWeight: 600, cursor: "not-allowed", opacity: 0.5, userSelect: "none" }}
            >
              <FolderPlus style={{ width: 14, height: 14 }} />
              New Project
            </div>
          </div>
        </motion.div>

        {/* Coming soon banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          style={{ borderRadius: 14, background: tm.glassPanelBg, border: `1px solid ${tm.accentBorder}`, backdropFilter: "blur(12px)", padding: "24px 28px", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 18 }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 12, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Zap style={{ width: 20, height: 20, color: tm.accent }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: tm.textPrimary, margin: 0 }}>Projects are coming soon</h2>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText, fontWeight: 600, letterSpacing: "0.04em" }}>
                COMING SOON
              </span>
            </div>
            <p style={{ fontSize: 13, color: tm.textMuted, margin: 0, lineHeight: 1.65, maxWidth: 520 }}>
              Projects will let you organize your workspaces, track history across sessions, and switch between codebases seamlessly. In the meantime, use the IDE to start building.
            </p>
          </div>
        </motion.div>

        {/* Empty state */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          style={{ borderRadius: 14, background: tm.glassPanelBg, border: `1px solid ${tm.glassPanelBorder}`, backdropFilter: "blur(12px)", padding: "48px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}
        >
          <div style={{ width: 56, height: 56, borderRadius: 16, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FolderOpen style={{ width: 24, height: 24, color: tm.accent }} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: tm.textPrimary, margin: 0 }}>No projects yet</p>
            <p style={{ fontSize: 13, color: tm.textMuted, marginTop: 6, lineHeight: 1.6, maxWidth: 380 }}>
              Your projects will appear here once the feature ships. For now, head to the IDE to start coding.
            </p>
          </div>
          <button
            onClick={() => navigate("/ide")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, color: tm.accentText, cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "background 0.15s, box-shadow 0.15s" }}
          >
            Open IDE
            <ArrowRight style={{ width: 14, height: 14 }} />
          </button>
        </motion.div>

      </div>
    </PageLayout>
  );
}
