import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Globe, Server, Bot, Smartphone, Database, Shield, Zap, BarChart2,
  MessageSquare, ShoppingCart, FileText, Cpu, Layout, Mail, BookOpen, Layers,
  LayoutTemplate, BookTemplate,
} from "lucide-react";
import PageLayout from "@/components/layout/page-layout";
import { useTheme } from "@/lib/theme-context";
import { type VGTheme } from "@/lib/theme";
import { useIdeStore } from "@/store/use-ide-store";

// ─── Template data ─────────────────────────────────────────────────────────

type Category = "All" | "Web" | "API" | "AI" | "Mobile" | "Data" | "Security";

interface Template {
  id: string;
  name: string;
  description: string;
  category: Exclude<Category, "All">;
  icon: React.ElementType;
  prompt: string;
}

const TEMPLATES: Template[] = [
  {
    id: "fullstack-app",
    name: "Full-Stack Web App",
    description: "React frontend, Express backend, PostgreSQL database, and JWT authentication out of the box.",
    category: "Web",
    icon: Globe,
    prompt: "Build a full-stack web app with a React frontend, Express.js backend, PostgreSQL database, and JWT-based authentication. Include user registration, login, protected routes, and a simple dashboard.",
  },
  {
    id: "landing-page",
    name: "Landing Page",
    description: "Animated marketing landing page with hero section, features, pricing, and CTA blocks.",
    category: "Web",
    icon: Layout,
    prompt: "Create a modern, animated landing page for a SaaS product. Include a hero section, feature highlights, a pricing table, customer testimonials, and a call-to-action section. Use Tailwind CSS and Framer Motion for animations.",
  },
  {
    id: "blog-cms",
    name: "Blog CMS",
    description: "Markdown-based blog with tagging, search, and an admin panel for writing posts.",
    category: "Web",
    icon: BookOpen,
    prompt: "Build a blog CMS with a Next.js frontend, markdown post storage, tag filtering, full-text search, and a simple admin panel for creating and editing posts.",
  },
  {
    id: "rest-api",
    name: "REST API",
    description: "Production-ready Express REST API with validation, error handling, and OpenAPI docs.",
    category: "API",
    icon: Server,
    prompt: "Build a production-ready REST API using Express.js and TypeScript. Include input validation with Zod, structured error handling, request logging with Morgan, and auto-generated OpenAPI documentation using Swagger.",
  },
  {
    id: "graphql-api",
    name: "GraphQL API",
    description: "Apollo GraphQL server with schema-first design, resolvers, and DataLoader batching.",
    category: "API",
    icon: Layers,
    prompt: "Create a GraphQL API using Apollo Server. Define a schema-first design with type definitions, resolvers, and DataLoader for batching and caching database queries. Include mutations for creating and updating resources.",
  },
  {
    id: "webhook-service",
    name: "Webhook Service",
    description: "Event-driven webhook receiver that validates signatures, queues events, and retries failures.",
    category: "API",
    icon: Zap,
    prompt: "Build a webhook receiver service in Node.js that validates HMAC signatures, queues incoming events with BullMQ, processes them asynchronously, and retries failed jobs with exponential back-off.",
  },
  {
    id: "ai-chatbot",
    name: "AI Chatbot",
    description: "Streaming chat interface powered by GPT-4 with conversation history and system prompts.",
    category: "AI",
    icon: MessageSquare,
    prompt: "Build an AI chatbot web app using the OpenAI GPT-4 API. Support streaming responses, maintain a multi-turn conversation history, allow the user to set a custom system prompt, and display a typing indicator while the model generates output.",
  },
  {
    id: "ai-agent",
    name: "AI Agent",
    description: "Tool-calling AI agent that browses the web, runs code, and reasons over multi-step tasks.",
    category: "AI",
    icon: Bot,
    prompt: "Create an AI agent powered by GPT-4 function calling. Give it tools to search the web, execute Python code, and read files. The agent should reason step-by-step, decide which tools to use, and produce a final answer after completing multi-step tasks.",
  },
  {
    id: "rag-pipeline",
    name: "RAG Pipeline",
    description: "Retrieval-augmented generation pipeline with embeddings, vector search, and LLM synthesis.",
    category: "AI",
    icon: Cpu,
    prompt: "Build a retrieval-augmented generation (RAG) pipeline. Ingest documents, chunk them, generate embeddings with OpenAI, store them in a vector database (pgvector), and answer user questions by retrieving relevant chunks and synthesising answers with GPT-4.",
  },
  {
    id: "mobile-app",
    name: "Mobile App",
    description: "Cross-platform React Native app with navigation, auth screens, and a home feed.",
    category: "Mobile",
    icon: Smartphone,
    prompt: "Build a cross-platform mobile app using React Native and Expo. Include tab and stack navigation with React Navigation, a login and registration screen with JWT auth, and a scrollable home feed that fetches data from a REST API.",
  },
  {
    id: "data-dashboard",
    name: "Data Dashboard",
    description: "Interactive analytics dashboard with charts, filters, and CSV export.",
    category: "Data",
    icon: BarChart2,
    prompt: "Build an interactive data analytics dashboard using React and Recharts. Include line charts, bar charts, a KPI summary row, date range filters, and a CSV export button. Fetch data from a mock REST API endpoint.",
  },
  {
    id: "data-pipeline",
    name: "ETL Data Pipeline",
    description: "Extract, transform, and load pipeline with scheduling, logging, and error alerting.",
    category: "Data",
    icon: Database,
    prompt: "Design and implement an ETL data pipeline in Python. Extract records from a CSV source and a REST API, transform them (clean, deduplicate, normalise), and load them into a PostgreSQL database. Add scheduled runs with APScheduler, structured logging, and email alerts on failures.",
  },
  {
    id: "ecommerce",
    name: "E-Commerce Store",
    description: "Product catalogue, shopping cart, Stripe checkout, and order management.",
    category: "Web",
    icon: ShoppingCart,
    prompt: "Build a full-stack e-commerce store with a React frontend and Express backend. Include a product catalogue with search and filters, a shopping cart managed with React context, Stripe Checkout integration, and a basic order management dashboard.",
  },
  {
    id: "auth-service",
    name: "Auth Service",
    description: "Standalone authentication microservice with OAuth, MFA, and session management.",
    category: "Security",
    icon: Shield,
    prompt: "Build a standalone authentication microservice using Node.js and Express. Support email/password login, OAuth 2.0 with Google and GitHub, TOTP-based multi-factor authentication, refresh token rotation, and session revocation.",
  },
  {
    id: "email-service",
    name: "Email Campaign Service",
    description: "Transactional and marketing email sender with templates, scheduling, and open tracking.",
    category: "API",
    icon: Mail,
    prompt: "Create an email campaign service using Node.js and SendGrid. Support transactional emails with dynamic Handlebars templates, scheduled marketing campaigns, open and click tracking via pixel and redirect, and an unsubscribe flow.",
  },
  {
    id: "doc-generator",
    name: "Document Generator",
    description: "Generate PDFs and DOCX files from templates with dynamic data substitution.",
    category: "API",
    icon: FileText,
    prompt: "Build a document generation service in Node.js that accepts a JSON payload, merges it into a Handlebars template, and produces both a PDF (via Puppeteer) and a DOCX (via docxtemplater) file. Expose a REST endpoint that returns the generated file as a download.",
  },
];

const CATEGORIES: Category[] = ["All", "Web", "API", "AI", "Mobile", "Data", "Security"];

const CATEGORY_COLORS: Record<Exclude<Category, "All">, string> = {
  Web: "#60a5fa",
  API: "#a78bfa",
  AI: "#34d399",
  Mobile: "#f472b6",
  Data: "#fbbf24",
  Security: "#fb7185",
};

// ─── Sub-components ────────────────────────────────────────────────────────

function CategoryPill({
  label,
  active,
  tm,
  onClick,
}: {
  label: Category;
  active: boolean;
  tm: VGTheme;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const color = label !== "All" ? CATEGORY_COLORS[label] : tm.accent;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "6px 14px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        letterSpacing: "0.02em",
        border: active
          ? `1px solid ${color}`
          : `1px solid ${hov ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)"}`,
        background: active
          ? `${color}22`
          : hov
          ? "rgba(255,255,255,0.06)"
          : "transparent",
        color: active ? color : hov ? tm.textSecondary : tm.textMuted,
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function CardBanner({ color, Icon, hov }: { color: string; Icon: React.ElementType; hov: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        height: 110,
        borderRadius: "11px 11px 0 0",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${color}28 0%, ${color}10 60%, transparent 100%)`,
        flexShrink: 0,
      }}
    >
      {/* grid dots pattern */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`dots-${color.replace("#","")}`} x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill={color} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#dots-${color.replace("#","")})`} />
      </svg>

      {/* decorative ring */}
      <div
        style={{
          position: "absolute",
          right: -28,
          top: -28,
          width: 120,
          height: 120,
          borderRadius: "50%",
          border: `1.5px solid ${color}30`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -8,
          top: -8,
          width: 76,
          height: 76,
          borderRadius: "50%",
          border: `1.5px solid ${color}25`,
          pointerEvents: "none",
        }}
      />

      {/* glow blob */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 90,
          height: 90,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
          pointerEvents: "none",
          transition: "opacity 0.2s",
          opacity: hov ? 1 : 0.6,
        }}
      />

      {/* large icon */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 52,
          height: 52,
          borderRadius: 14,
          background: `${color}20`,
          border: `1.5px solid ${color}45`,
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s, box-shadow 0.2s",
          boxShadow: hov ? `0 4px 18px ${color}40` : "none",
          ...(hov ? { transform: "translate(-50%, -50%) scale(1.08)" } : {}),
        }}
      >
        <Icon size={24} style={{ color }} />
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  tm,
  delay,
  onUse,
}: {
  template: Template;
  tm: VGTheme;
  delay: number;
  onUse: (prompt: string) => void;
}) {
  const [hov, setHov] = useState(false);
  const Icon = template.icon;
  const color = CATEGORY_COLORS[template.category];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.28 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onUse(template.prompt)}
      style={{
        borderRadius: 14,
        background: tm.glassPanelBg,
        border: `1px solid ${hov ? color + "55" : tm.glassPanelBorder}`,
        backdropFilter: "blur(12px)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: hov ? `0 6px 28px ${color}22` : "none",
        transform: hov ? "translateY(-3px)" : "none",
        transition: "border-color 0.18s, box-shadow 0.18s, transform 0.15s",
      }}
    >
      {/* Visual banner */}
      <CardBanner color={color} Icon={Icon} hov={hov} />

      {/* Card body */}
      <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: tm.textPrimary, lineHeight: 1.3 }}>
            {template.name}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 9999,
              background: `${color}15`,
              border: `1px solid ${color}35`,
              color,
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {template.category}
          </span>
        </div>

        <span style={{ fontSize: 12.5, color: tm.textMuted, lineHeight: 1.6 }}>
          {template.description}
        </span>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 6,
            fontSize: 12,
            fontWeight: 600,
            color: hov ? color : tm.textDimmed,
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "color 0.15s",
          }}
        >
          <Zap size={11} style={{ flexShrink: 0 }} />
          Use template
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { tm } = useTheme();
  const [, navigate] = useLocation();
  const [activeCategory, setActiveCategory] = useState<Category>("All");

  const filtered =
    activeCategory === "All"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === activeCategory);

  const handleUse = (prompt: string) => {
    useIdeStore.getState().setPendingNewTaskPrompt(prompt);
    navigate("/ide");
  };

  return (
    <PageLayout
      activePage="templates"
      header={
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <BookTemplate style={{ width: 17, height: 17, color: tm.accent, flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: tm.textPrimary, lineHeight: 1.2 }}>Templates</span>
            <span style={{ fontSize: 10.5, color: tm.textMuted, lineHeight: 1.2 }}>Start faster with a curated, production-ready template</span>
          </div>
        </div>
      }
    >
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 36px 52px", width: "100%" }}>

        {/* Category filter */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3 }}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}
        >
          {CATEGORIES.map((cat) => (
            <CategoryPill
              key={cat}
              label={cat}
              active={activeCategory === cat}
              tm={tm}
              onClick={() => setActiveCategory(cat)}
            />
          ))}
        </motion.div>

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((tpl, i) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              tm={tm}
              delay={0.12 + i * 0.04}
              onUse={handleUse}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: "center", padding: "60px 0", color: tm.textMuted, fontSize: 14 }}
          >
            No templates in this category yet.
          </motion.div>
        )}
      </div>
    </PageLayout>
  );
}
