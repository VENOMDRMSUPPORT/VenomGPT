import { motion } from "framer-motion";
import { FolderOpen, FolderPlus, Clock, GitBranch, Zap } from "lucide-react";
import PageLayout from "@/components/layout/page-layout";
import { useTheme } from "@/lib/theme-context";

const EXAMPLE_PROJECTS = [
  { name: "venom-api", description: "Backend API service with Express and Drizzle ORM", branch: "main", updated: "2 hours ago" },
  { name: "dashboard-ui", description: "React dashboard with Recharts and TanStack Query", branch: "feat/auth", updated: "Yesterday" },
  { name: "ml-pipeline", description: "Data ingestion and transformation pipeline", branch: "main", updated: "3 days ago" },
];

function ProjectCard({ project, delay, tm }: { project: typeof EXAMPLE_PROJECTS[number]; delay: number; tm: ReturnType<typeof useTheme>["tm"] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      style={{
        borderRadius: 12,
        background: tm.glassPanelBg,
        border: `1px solid ${tm.glassPanelBorder}`,
        backdropFilter: "blur(12px)",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: 0.45,
        cursor: "not-allowed",
        userSelect: "none",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: tm.accentBg, border: `1px solid ${tm.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FolderOpen style={{ width: 16, height: 16, color: tm.accent }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: tm.textPrimary }}>{project.name}</span>
        </div>
        <p style={{ fontSize: 12, color: tm.textMuted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.description}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: tm.textDimmed }}>
          <GitBranch style={{ width: 11, height: 11 }} />
          <span style={{ fontFamily: "monospace" }}>{project.branch}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: tm.textDimmed }}>
          <Clock style={{ width: 11, height: 11 }} />
          <span>{project.updated}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function ProjectsPage() {
  const { tm } = useTheme();

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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                background: tm.accentBg,
                border: `1px solid ${tm.accentBorder}`,
                color: tm.textDimmed,
                fontSize: 12,
                fontWeight: 600,
                cursor: "not-allowed",
                opacity: 0.5,
                userSelect: "none",
              }}
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
          style={{
            borderRadius: 14,
            background: tm.glassPanelBg,
            border: `1px solid ${tm.accentBorder}`,
            backdropFilter: "blur(12px)",
            padding: "24px 28px",
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-start",
            gap: 18,
          }}
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

        {/* Preview list (dimmed) */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: tm.sectionLabel, marginBottom: 10 }}>
            Preview
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {EXAMPLE_PROJECTS.map((p, i) => (
              <ProjectCard key={p.name} project={p} delay={0.15 + i * 0.07} tm={tm} />
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
