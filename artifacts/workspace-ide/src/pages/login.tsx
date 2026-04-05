import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LogIn, Lock, User } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { VenomLogo } from "@/components/ui/venom-logo";
import {
  BOOTSTRAP_USERNAME,
  BOOTSTRAP_PASSWORD,
  login,
} from "@/auth/bootstrap-auth";

export default function LoginPage() {
  const { tm } = useTheme();
  const [, navigate] = useLocation();

  const [username, setUsername] = useState(BOOTSTRAP_USERNAME);
  const [password, setPassword] = useState(BOOTSTRAP_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const ok = login(username, password);

    setLoading(false);
    if (ok) {
      navigate("/apps");
    } else {
      setError("Invalid username or password.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: tm.bgBase,
        padding: "24px",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          width: "100%",
          maxWidth: 380,
          borderRadius: 16,
          background: tm.glassPanelBg,
          border: `1px solid ${tm.glassPanelBorder}`,
          backdropFilter: "blur(16px)",
          padding: "36px 32px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Logo + heading */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <VenomLogo size={52} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.08em", color: tm.textPrimary, lineHeight: 1.2 }}>
              VENOM<span style={{ color: tm.accent }}>GPT</span>
            </div>
            <div style={{ fontSize: 12, color: tm.textMuted, marginTop: 4 }}>
              Sign in to access your apps
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Username */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: tm.textMuted, letterSpacing: "0.04em" }}>
              USERNAME
            </label>
            <div style={{ position: "relative" }}>
              <User
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  color: tm.textMuted,
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                style={{
                  width: "100%",
                  paddingLeft: 36,
                  paddingRight: 12,
                  paddingTop: 10,
                  paddingBottom: 10,
                  borderRadius: 9,
                  border: `1px solid ${tm.glassPanelBorder}`,
                  background: tm.bgInput,
                  color: tm.textPrimary,
                  fontSize: 13.5,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: tm.textMuted, letterSpacing: "0.04em" }}>
              PASSWORD
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  color: tm.textMuted,
                  pointerEvents: "none",
                }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: "100%",
                  paddingLeft: 36,
                  paddingRight: 12,
                  paddingTop: 10,
                  paddingBottom: 10,
                  borderRadius: 9,
                  border: `1px solid ${tm.glassPanelBorder}`,
                  background: tm.bgInput,
                  color: tm.textPrimary,
                  fontSize: 13.5,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                fontSize: 12.5,
                color: "#f87171",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.25)",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "11px 18px",
              borderRadius: 9,
              background: tm.accentBg,
              border: `1px solid ${tm.accentBorder}`,
              color: tm.accentText,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "opacity 0.15s",
              width: "100%",
            }}
          >
            <LogIn style={{ width: 14, height: 14 }} />
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
