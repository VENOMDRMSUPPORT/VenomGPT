/**
 * routes/runtime.ts — Runtime port status endpoint.
 *
 * GET /api/runtime/status
 *   Probes the well-known local development ports and returns which are open.
 *   Used by the frontend Runtime Status Bar to show live preview/dev server state.
 *   Returns { probedAt, openPorts, knownServices } with no caching — every call
 *   probes the ports synchronously.
 */

import { Router, type IRouter } from "express";
import { captureSnapshot } from "../lib/orchestrator/runtimeLifecycle.js";

const router: IRouter = Router();

// ── Well-known service labels for common dev ports ────────────────────────────
// Only ports with a highly specific framework-level convention are labelled.
// Ambiguous ports (e.g. 3000, 8000) that are shared across many frameworks are
// intentionally left unlabelled so the operator surface shows the raw port number
// without implying a framework that may not be running.

const KNOWN_SERVICES: Record<number, string> = {
  // Vite dev default — essentially exclusive to Vite dev server
  5173: "Vite",
  // Vite preview — `vite preview` command
  4173: "Vite preview",
  // Expo web — exclusive to Expo dev tooling
  19006: "Expo web",
};

// ── GET /api/runtime/status ───────────────────────────────────────────────────

router.get("/runtime/status", async (_req, res) => {
  try {
    const snapshot = await captureSnapshot();

    const knownServices: Array<{ port: number; label: string }> = snapshot.openPorts
      .filter(p => KNOWN_SERVICES[p] !== undefined)
      .map(p => ({ port: p, label: KNOWN_SERVICES[p] }));

    res.json({
      probedAt:      snapshot.timestamp,
      openPorts:     snapshot.openPorts,
      knownServices,
    });
  } catch (err) {
    res.status(500).json({
      error:   "probe_failed",
      message: String(err),
    });
  }
});

export default router;
