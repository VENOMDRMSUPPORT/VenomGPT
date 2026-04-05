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

const orbVariants = {
  animate: (custom: { x: number[]; y: number[]; duration: number }) => ({
    x: custom.x,
    y: custom.y,
    transition: {
      duration: custom.duration,
      repeat: Infinity,
      repeatType: "mirror" as const,
      ease: "easeInOut" as const,
    },
  }),
};

export default function LoginPage() {
  const { tm, isDark } = useTheme();
  const [, navigate] = useLocation();

  const [username, setUsername] = useState(BOOTSTRAP_USERNAME);
  const [password, setPassword] = useState(BOOTSTRAP_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [cardHover, setCardHover] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const ok = login(username, password);

    setLoading(false);
    if (ok) {
      navigate("/");
    } else {
      setError("Invalid username or password.");
    }
  }

  const darkBg = "linear-gradient(135deg, #0e0b1f 0%, #0c0a1e 40%, #110d25 100%)";
  const lightBg = "linear-gradient(135deg, #f0ecff 0%, #f4f1fb 50%, #ede8ff 100%)";

  const cardShadowDark =
    "0 0 0 1px rgba(138,43,226,0.22), 0 8px 60px rgba(0,0,0,0.70), 0 2px 24px rgba(138,43,226,0.18), inset 0 1px 0 rgba(255,255,255,0.06)";
  const cardShadowDarkHover =
    "0 0 0 1.5px rgba(138,43,226,0.50), 0 8px 72px rgba(0,0,0,0.75), 0 4px 32px rgba(138,43,226,0.30), inset 0 1px 0 rgba(255,255,255,0.08)";
  const cardShadowLight =
    "0 0 0 1px rgba(124,58,237,0.18), 0 8px 48px rgba(124,58,237,0.12), 0 2px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)";
  const cardShadowLightHover =
    "0 0 0 1.5px rgba(124,58,237,0.40), 0 8px 56px rgba(124,58,237,0.20), 0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)";

  const accentGradientDark = "linear-gradient(135deg, #7c3aed 0%, #8A2BE2 100%)";
  const accentGradientLight = "linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)";
  const accentGradient = isDark ? accentGradientDark : accentGradientLight;

  const btnGlowDark = "0 0 20px rgba(138,43,226,0.55), 0 4px 12px rgba(0,0,0,0.4)";
  const btnGlowLight = "0 0 16px rgba(124,58,237,0.40), 0 4px 10px rgba(0,0,0,0.10)";

  const cardTopBorder = isDark
    ? "linear-gradient(90deg, transparent, rgba(138,43,226,0.7), rgba(168,85,247,0.9), rgba(138,43,226,0.7), transparent)"
    : "linear-gradient(90deg, transparent, rgba(124,58,237,0.5), rgba(167,139,250,0.8), rgba(124,58,237,0.5), transparent)";

  const inputFocusShadowDark = "0 0 0 2px rgba(138,43,226,0.50), 0 0 12px rgba(138,43,226,0.20)";
  const inputFocusShadowLight = "0 0 0 2px rgba(124,58,237,0.40), 0 0 10px rgba(124,58,237,0.12)";

  const orb1Dark = { color: "rgba(138,43,226,0.28)", size: 560 };
  const orb2Dark = { color: "rgba(168,85,247,0.18)", size: 420 };
  const orb3Dark = { color: "rgba(110,30,200,0.20)", size: 380 };

  const orb1Light = { color: "rgba(124,58,237,0.14)", size: 560 };
  const orb2Light = { color: "rgba(167,139,250,0.12)", size: 420 };
  const orb3Light = { color: "rgba(109,40,217,0.10)", size: 380 };

  const orb1 = isDark ? orb1Dark : orb1Light;
  const orb2 = isDark ? orb2Dark : orb2Light;
  const orb3 = isDark ? orb3Dark : orb3Light;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark ? darkBg : lightBg,
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glassmesh overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: tm.glassMesh,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Animated orb 1 — top-left */}
      <motion.div
        custom={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0], duration: 11 }}
        variants={orbVariants}
        animate="animate"
        style={{
          position: "absolute",
          top: "5%",
          left: "8%",
          width: orb1.size,
          height: orb1.size,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${orb1.color} 0%, transparent 70%)`,
          filter: "blur(48px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Animated orb 2 — bottom-right */}
      <motion.div
        custom={{ x: [0, -50, 20, 0], y: [0, 40, -20, 0], duration: 14 }}
        variants={orbVariants}
        animate="animate"
        style={{
          position: "absolute",
          bottom: "8%",
          right: "6%",
          width: orb2.size,
          height: orb2.size,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${orb2.color} 0%, transparent 70%)`,
          filter: "blur(56px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Animated orb 3 — center-right upper area */}
      <motion.div
        custom={{ x: [0, 30, -40, 0], y: [0, 50, -15, 0], duration: 9 }}
        variants={orbVariants}
        animate="animate"
        style={{
          position: "absolute",
          top: "30%",
          right: "15%",
          width: orb3.size,
          height: orb3.size,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${orb3.color} 0%, transparent 70%)`,
          filter: "blur(64px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          boxShadow: cardHover
            ? (isDark ? cardShadowDarkHover : cardShadowLightHover)
            : (isDark ? cardShadowDark : cardShadowLight),
          borderColor: cardHover
            ? (isDark ? "rgba(138,43,226,0.45)" : "rgba(124,58,237,0.35)")
            : tm.glassPanelBorder,
        }}
        transition={{
          opacity: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          y: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          scale: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          boxShadow: { duration: 0.25 },
          borderColor: { duration: 0.25 },
        }}
        onHoverStart={() => setCardHover(true)}
        onHoverEnd={() => setCardHover(false)}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 420,
          borderRadius: 20,
          background: tm.glassPanelBg,
          border: `1px solid ${tm.glassPanelBorder}`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "40px 36px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 26,
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        {/* Top accent gradient line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: cardTopBorder,
            borderRadius: "20px 20px 0 0",
            pointerEvents: "none",
          }}
        />

        {/* Logo + heading */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <VenomLogo size={56} />
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "0.09em",
                color: tm.textPrimary,
                lineHeight: 1.2,
              }}
            >
              VENOM<span style={{ color: tm.accent }}>GPT</span>
            </div>
            <div style={{ fontSize: 12.5, color: tm.textMuted, marginTop: 6, letterSpacing: "0.01em" }}>
              Sign in to access your workspace
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Username */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: tm.textMuted,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}
            >
              Username
            </label>
            <div style={{ position: "relative" }}>
              <User
                style={{
                  position: "absolute",
                  left: 13,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  color: usernameFocused ? tm.accent : tm.textMuted,
                  pointerEvents: "none",
                  transition: "color 0.2s",
                }}
              />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => setUsernameFocused(false)}
                required
                autoComplete="username"
                style={{
                  width: "100%",
                  paddingLeft: 38,
                  paddingRight: 14,
                  paddingTop: 11,
                  paddingBottom: 11,
                  borderRadius: 11,
                  border: `1.5px solid ${usernameFocused ? tm.accent : tm.glassPanelBorder}`,
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.70)",
                  color: tm.textPrimary,
                  fontSize: 13.5,
                  outline: "none",
                  boxSizing: "border-box",
                  boxShadow: usernameFocused
                    ? (isDark ? inputFocusShadowDark : inputFocusShadowLight)
                    : "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: tm.textMuted,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                style={{
                  position: "absolute",
                  left: 13,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  color: passwordFocused ? tm.accent : tm.textMuted,
                  pointerEvents: "none",
                  transition: "color 0.2s",
                }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                required
                autoComplete="current-password"
                style={{
                  width: "100%",
                  paddingLeft: 38,
                  paddingRight: 14,
                  paddingTop: 11,
                  paddingBottom: 11,
                  borderRadius: 11,
                  border: `1.5px solid ${passwordFocused ? tm.accent : tm.glassPanelBorder}`,
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.70)",
                  color: tm.textPrimary,
                  fontSize: 13.5,
                  outline: "none",
                  boxSizing: "border-box",
                  boxShadow: passwordFocused
                    ? (isDark ? inputFocusShadowDark : inputFocusShadowLight)
                    : "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
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
                borderRadius: 9,
                padding: "9px 13px",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit button */}
          <motion.button
            type="submit"
            disabled={loading}
            onHoverStart={() => setBtnHover(true)}
            onHoverEnd={() => setBtnHover(false)}
            animate={{
              scale: btnHover && !loading ? 1.025 : 1,
              boxShadow: btnHover && !loading
                ? (isDark ? btnGlowDark : btnGlowLight)
                : "0 2px 8px rgba(0,0,0,0.20)",
            }}
            transition={{ duration: 0.18 }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 18px",
              borderRadius: 11,
              background: accentGradient,
              border: "none",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              width: "100%",
              letterSpacing: "0.02em",
            }}
          >
            <LogIn style={{ width: 15, height: 15 }} />
            {loading ? "Signing in…" : "Sign in"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
