/**
 * tokenStore.ts — Persisted credential store for OpenAI Codex OAuth sessions
 *
 * Stores the OAuth credentials in <DATA_DIR>/codex-credentials.json.
 * The file is mode-restricted to 0600 (owner read/write only).
 * Credentials are treated as secrets — never logged.
 *
 * Design mirrors settingsStore.ts: one file, one in-memory singleton,
 * async read/write.
 */

import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "../settingsStore.js";
import { logger } from "../logger.js";

// ─── Credential schema ────────────────────────────────────────────────────────

export interface CodexCredentials {
  type: "openai-codex";
  access_token: string;
  refresh_token: string;
  /** Milliseconds-since-epoch expiry (Date.now() + expires_in * 1000) */
  expires: number;
  email?: string;
  accountId?: string;
  /** ISO timestamp when the user last successfully authenticated. */
  connectedAt?: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const CREDENTIALS_FILE = path.join(DATA_DIR, "codex-credentials.json");

// ─── In-memory singleton ──────────────────────────────────────────────────────

let _credentials: CodexCredentials | null = null;

export function getCredentials(): CodexCredentials | null {
  return _credentials;
}

// ─── Disk I/O ─────────────────────────────────────────────────────────────────

async function writeToDisk(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    if (_credentials) {
      await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(_credentials, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
    } else {
      await fs.rm(CREDENTIALS_FILE, { force: true });
    }
  } catch (err) {
    logger.warn({ err, file: CREDENTIALS_FILE }, "[tokenStore] Failed to write credentials");
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load persisted credentials from disk at server startup.
 * Falls back silently if the file is missing — user simply isn't connected.
 */
export async function loadCredentials(): Promise<void> {
  try {
    const raw = await fs.readFile(CREDENTIALS_FILE, "utf8");
    const parsed = JSON.parse(raw) as CodexCredentials;
    if (parsed.type === "openai-codex" && parsed.access_token && parsed.refresh_token) {
      _credentials = parsed;
      logger.info(
        { email: parsed.email ?? "(none)", connectedAt: parsed.connectedAt },
        "[tokenStore] Loaded OpenAI Codex credentials"
      );
    } else {
      _credentials = null;
      logger.info("[tokenStore] Codex credentials file present but invalid schema — ignoring");
    }
  } catch {
    _credentials = null;
    logger.info("[tokenStore] No Codex credentials file — user not connected");
  }
}

/**
 * Persist new credentials to memory + disk.
 */
export async function saveCredentials(creds: CodexCredentials): Promise<void> {
  _credentials = creds;
  await writeToDisk();
  logger.info({ email: creds.email ?? "(none)" }, "[tokenStore] Codex credentials saved");
}

/**
 * Update specific fields of existing credentials (e.g. after a token refresh).
 */
export async function updateCredentials(patch: Partial<Omit<CodexCredentials, "type">>): Promise<void> {
  if (!_credentials) return;
  _credentials = { ..._credentials, ...patch };
  await writeToDisk();
}

/**
 * Clear credentials from memory + disk (disconnect / invalid_grant).
 */
export async function clearCredentials(): Promise<void> {
  _credentials = null;
  await writeToDisk();
  logger.info("[tokenStore] Codex credentials cleared");
}

/**
 * True if credentials exist in memory (does NOT trigger a refresh).
 */
export function isAuthenticated(): boolean {
  return _credentials !== null;
}

export { CREDENTIALS_FILE, DATA_DIR };
