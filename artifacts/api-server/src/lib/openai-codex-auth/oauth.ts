/**
 * oauth.ts — OpenAI Codex PKCE OAuth2 flow for VenomGPT
 *
 * Adapted from Cline's oauth.ts (Apache 2.0, commit 6ed3944).
 * Key differences from Cline's implementation:
 *   - originator = "venomgpt" (not "cline")
 *   - Credential persistence via tokenStore.ts (not VSCode secretStorage)
 *   - Authorization URL emitted via API response (not vscode.env.openExternal)
 *   - Local callback server on port 1455 (same registered redirect_uri)
 *
 * OAuth client identity:
 *   clientId = "app_EMoamEEZ73f0CkXaXp7hrann"
 *   This is the OpenAI-registered client ID for the Codex-in-IDE PKCE flow.
 *   It is sourced from the Cline repo audit (Apache 2.0). Using this client ID
 *   in VenomGPT is subject to OpenAI's developer terms; operators should verify
 *   acceptability for their deployment context.
 *
 * Redirect URI: http://localhost:1455/auth/callback (registered with OpenAI)
 *
 * Key behavioral contracts preserved from Cline:
 *   - `originator=venomgpt` identifies this IDE client
 *   - `codex_cli_simplified_flow=true` in the authorization URL
 *   - state NOT included in the token exchange body (OpenAI rejects it)
 *   - expires stored as milliseconds-since-epoch
 *   - 5-minute expiry buffer
 *   - refresh_token preserved if not returned in refresh response
 *   - invalid_grant → clear credentials (force re-auth)
 *   - Refresh de-duplication via single in-flight promise
 */

import crypto from "crypto";
import http from "http";
import { URL } from "url";
import { logger } from "../logger.js";
import {
  getCredentials,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  type CodexCredentials,
} from "./tokenStore.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH_ENDPOINT   = "https://auth.openai.com/oauth/authorize";
const TOKEN_ENDPOINT  = "https://auth.openai.com/oauth/token";
const CLIENT_ID       = "app_EMoamEEZ73f0CkXaXp7hrann";
const REDIRECT_URI    = "http://localhost:1455/auth/callback";
const SCOPES          = "openid profile email offline_access";
const CALLBACK_PORT   = 1455;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
/** Tokens considered expired 5 minutes before actual expiry */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── JWT claim extraction ─────────────────────────────────────────────────────
// Extracts `chatgpt_account_id` from JWT claims per Cline's order:
// 1. Root of JWT claims
// 2. Nested under "https://api.openai.com/auth"
// 3. First organization ID
// 4. Derived from `sub` claim

interface JwtClaims {
  sub?: string;
  email?: string;
  chatgpt_account_id?: string;
  "https://api.openai.com/auth"?: { chatgpt_account_id?: string };
  organizations?: Array<{ id?: string }>;
}

function decodeJwtPayload(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1]!, "base64url").toString("utf8");
    return JSON.parse(payload) as JwtClaims;
  } catch {
    return null;
  }
}

function extractAccountId(claims: JwtClaims | null): string | undefined {
  if (!claims) return undefined;
  // Check root-level claim first, then nested namespace, then first org ID, then sub
  if (claims.chatgpt_account_id) return claims.chatgpt_account_id;
  if (claims["https://api.openai.com/auth"]?.chatgpt_account_id) {
    return claims["https://api.openai.com/auth"].chatgpt_account_id;
  }
  if (claims.organizations?.[0]?.id) return claims.organizations[0].id;
  if (claims.sub) return claims.sub;
  return undefined;
}

// ─── Token error ──────────────────────────────────────────────────────────────

export class CodexOAuthTokenError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string
  ) {
    super(message);
    this.name = "CodexOAuthTokenError";
  }

  isLikelyInvalidGrant(): boolean {
    return /invalid_grant|invalid_token|token_expired|revoked/i.test(this.errorCode);
  }
}

// ─── Token expiry check ───────────────────────────────────────────────────────

export function isTokenExpired(creds: CodexCredentials): boolean {
  return Date.now() >= creds.expires - EXPIRY_BUFFER_MS;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<CodexCredentials> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
    // NOTE: state must NOT be in the body — OpenAI rejects it (per Cline audit)
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const body = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const errCode = (body["error"] as string) ?? `http_${res.status}`;
    throw new CodexOAuthTokenError(errCode, `Token exchange failed: ${JSON.stringify(body)}`);
  }

  const access_token  = body["access_token"] as string;
  const refresh_token = body["refresh_token"] as string;
  const expires_in    = body["expires_in"] as number;
  const id_token      = body["id_token"] as string | undefined;

  if (!access_token || !refresh_token) {
    throw new CodexOAuthTokenError("missing_tokens", "Token response missing access_token or refresh_token");
  }

  // Extract account info from id_token first, then access_token (Cline's order)
  const claims    = decodeJwtPayload(id_token ?? access_token);
  const email     = claims?.email;
  const accountId = extractAccountId(claims);

  return {
    type: "openai-codex",
    access_token,
    refresh_token,
    expires: Date.now() + expires_in * 1000,
    email,
    accountId,
    connectedAt: new Date().toISOString(),
  };
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(
  currentCreds: CodexCredentials
): Promise<CodexCredentials | null> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: currentCreds.refresh_token,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const body = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const errCode = (body["error"] as string) ?? `http_${res.status}`;
    const err = new CodexOAuthTokenError(errCode, `Token refresh failed (${res.status}): ${JSON.stringify(body)}`);

    if (err.isLikelyInvalidGrant()) {
      logger.warn({ errCode }, "Codex token refresh: invalid_grant — clearing credentials");
      await clearCredentials();
      throw err;
    }

    // Transient failure — preserve credentials, return null (do not sign out)
    logger.warn({ errCode }, "Codex token refresh: transient failure — preserving credentials");
    return null;
  }

  const access_token  = body["access_token"] as string;
  // Preserve the existing refresh_token if the response doesn't include a new one
  const refresh_token = (body["refresh_token"] as string | undefined) ?? currentCreds.refresh_token;
  const expires_in    = body["expires_in"] as number;

  const updated: CodexCredentials = {
    ...currentCreds,
    access_token,
    refresh_token,
    expires: Date.now() + expires_in * 1000,
  };

  await saveCredentials(updated);
  logger.info("Codex access token refreshed");
  return updated;
}

// ─── OAuth manager singleton ──────────────────────────────────────────────────

class CodexOAuthManager {
  private _refreshPromise: Promise<CodexCredentials | null> | null = null;
  private _callbackServer: http.Server | null = null;
  private _pendingAuthReject: ((err: Error) => void) | null = null;

  /** Returns true if credentials exist in memory (does not trigger refresh). */
  isAuthenticated(): boolean {
    return getCredentials() !== null;
  }

  getEmail(): string | undefined {
    return getCredentials()?.email;
  }

  getAccountId(): string | undefined {
    return getCredentials()?.accountId;
  }

  getConnectedAt(): string | undefined {
    return getCredentials()?.connectedAt;
  }

  /**
   * Returns a valid access token, refreshing if necessary.
   * Returns null if not authenticated or on transient refresh failure.
   *
   * Refresh is de-duplicated — concurrent callers share the same in-flight promise.
   */
  async getAccessToken(): Promise<string | null> {
    let creds = getCredentials();
    if (!creds) {
      await loadCredentials();
      creds = getCredentials();
    }
    if (!creds) return null;

    if (isTokenExpired(creds)) {
      try {
        const refreshed = await this._deduplicatedRefresh(creds);
        if (!refreshed) return null;
        return refreshed.access_token;
      } catch {
        return null;
      }
    }

    return creds.access_token;
  }

  /** Force a token refresh regardless of expiry. Used when server returns 401. */
  async forceRefreshAccessToken(): Promise<string | null> {
    const creds = getCredentials();
    if (!creds) return null;
    try {
      const refreshed = await this._deduplicatedRefresh(creds);
      return refreshed?.access_token ?? null;
    } catch {
      return null;
    }
  }

  private _deduplicatedRefresh(creds: CodexCredentials): Promise<CodexCredentials | null> {
    if (!this._refreshPromise) {
      this._refreshPromise = refreshAccessToken(creds).finally(() => {
        this._refreshPromise = null;
      });
    }
    return this._refreshPromise;
  }

  /**
   * Returns the authorization URL and PKCE parameters.
   * The caller (codexAuth.ts) is responsible for opening the URL in the browser
   * and passing codeVerifier + state to waitForCallback().
   */
  async startAuthorizationFlow(): Promise<{ authUrl: string; codeVerifier: string; state: string }> {
    // Cancel any prior pending flow
    this.cancelAuthorizationFlow();

    const codeVerifier  = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state         = generateState();

    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set("response_type",             "code");
    url.searchParams.set("client_id",                 CLIENT_ID);
    url.searchParams.set("redirect_uri",              REDIRECT_URI);
    url.searchParams.set("scope",                     SCOPES);
    url.searchParams.set("code_challenge",            codeChallenge);
    url.searchParams.set("code_challenge_method",     "S256");
    url.searchParams.set("state",                     state);
    url.searchParams.set("codex_cli_simplified_flow", "true");
    url.searchParams.set("originator",                "venomgpt");

    logger.info("[codex-oauth] Authorization flow started — URL generated");
    return { authUrl: url.toString(), codeVerifier, state };
  }

  /**
   * Starts a local HTTP server on port 1455 to receive the OAuth callback.
   * Resolves with credentials on success, rejects on timeout or error.
   */
  waitForCallback(
    expectedState: string,
    codeVerifier: string
  ): Promise<CodexCredentials> {
    return new Promise((resolve, reject) => {
      this._pendingAuthReject = reject;

      const timeout = setTimeout(() => {
        this.cancelAuthorizationFlow();
        reject(new Error("OAuth callback timed out after 5 minutes"));
      }, CALLBACK_TIMEOUT_MS);

      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);
          if (url.pathname !== "/auth/callback") {
            res.writeHead(404);
            res.end("Not found");
            return;
          }

          const code  = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const error = url.searchParams.get("error");

          if (error) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<html><body><h2>Authentication failed: ${error}</h2><p>You may close this window.</p></body></html>`);
            clearTimeout(timeout);
            this.cancelAuthorizationFlow();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (!code || state !== expectedState) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<html><body><h2>Invalid state parameter</h2><p>Possible CSRF — you may close this window.</p></body></html>");
            clearTimeout(timeout);
            this.cancelAuthorizationFlow();
            reject(new Error("Invalid OAuth callback: missing code or state mismatch"));
            return;
          }

          // Exchange code for tokens
          const creds = await exchangeCodeForTokens(code, codeVerifier);
          await saveCredentials(creds);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <head><title>VenomGPT — Connected</title></head>
              <body style="font-family:sans-serif;max-width:400px;margin:80px auto;text-align:center">
                <h2 style="color:#22c55e">Connected to OpenAI Codex</h2>
                <p>You are now signed in${creds.email ? ` as <strong>${creds.email}</strong>` : ""}.</p>
                <p style="color:#888">You can close this tab and return to VenomGPT.</p>
              </body>
            </html>
          `);

          clearTimeout(timeout);
          this.cancelAuthorizationFlow();
          logger.info({ email: creds.email ?? "(none)" }, "[codex-oauth] OAuth flow completed successfully");
          resolve(creds);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<html><body><h2>Authentication error</h2><p>${msg}</p><p>You may close this window.</p></body></html>`);
          clearTimeout(timeout);
          this.cancelAuthorizationFlow();
          reject(err instanceof Error ? err : new Error(msg));
        }
      });

      this._callbackServer = server;
      server.listen(CALLBACK_PORT, "127.0.0.1", () => {
        logger.info({ port: CALLBACK_PORT }, "[codex-oauth] Callback server listening");
      });
      server.on("error", (err) => {
        clearTimeout(timeout);
        this.cancelAuthorizationFlow();
        reject(err);
      });
    });
  }

  cancelAuthorizationFlow(): void {
    if (this._callbackServer) {
      this._callbackServer.close();
      this._callbackServer = null;
    }
    if (this._pendingAuthReject) {
      this._pendingAuthReject(new Error("Authorization flow cancelled"));
      this._pendingAuthReject = null;
    }
  }

  /**
   * Complete the OAuth flow manually using a code+codeVerifier pair.
   * Used in hosted environments (e.g. Replit) where the localhost:1455
   * callback server is unreachable from the user's browser.
   * The caller must supply the codeVerifier that matches this auth session.
   */
  async exchangeCodeManually(code: string, codeVerifier: string): Promise<CodexCredentials> {
    this.cancelAuthorizationFlow();
    const creds = await exchangeCodeForTokens(code, codeVerifier);
    await saveCredentials(creds);
    logger.info({ email: creds.email ?? "(none)" }, "[codex-oauth] Manual code exchange completed successfully");
    return creds;
  }

  async clearCredentials(): Promise<void> {
    this.cancelAuthorizationFlow();
    this._refreshPromise = null;
    await clearCredentials();
    logger.info("[codex-oauth] User disconnected — credentials cleared");
  }
}

export const codexOAuthManager = new CodexOAuthManager();

export { CALLBACK_PORT, TOKEN_ENDPOINT, CLIENT_ID, REDIRECT_URI };
