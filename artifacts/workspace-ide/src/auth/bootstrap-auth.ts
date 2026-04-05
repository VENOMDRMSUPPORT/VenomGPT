/**
 * bootstrap-auth.ts
 *
 * TEMPORARY BOOTSTRAP — This module provides a minimal, client-side-only
 * authentication shim for gating the APPS page. It uses fixed credentials
 * and localStorage to persist the session.
 *
 * Replace this entire module with real auth (JWT, OAuth, server-side sessions,
 * etc.) when proper authentication is implemented.
 */

// TEMPORARY BOOTSTRAP — Fixed credentials. Replace with real auth system.
export const BOOTSTRAP_USERNAME = "admin";
export const BOOTSTRAP_PASSWORD = "venom2025";

const SESSION_KEY = "vgpt_bootstrap_session";

interface BootstrapSession {
  loggedIn: boolean;
  username: string;
  loginAt: string;
}

function readSession(): BootstrapSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BootstrapSession;
  } catch {
    return null;
  }
}

function writeSession(session: BootstrapSession | null): void {
  if (session === null) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

/**
 * TEMPORARY BOOTSTRAP — Attempt to log in with the provided credentials.
 * Returns true if credentials match; false otherwise.
 */
export function login(username: string, password: string): boolean {
  if (username === BOOTSTRAP_USERNAME && password === BOOTSTRAP_PASSWORD) {
    writeSession({
      loggedIn: true,
      username,
      loginAt: new Date().toISOString(),
    });
    return true;
  }
  return false;
}

/**
 * TEMPORARY BOOTSTRAP — Log out by clearing the session from localStorage.
 */
export function logout(): void {
  writeSession(null);
}

/**
 * TEMPORARY BOOTSTRAP — Returns true when an active session exists in localStorage.
 */
export function isLoggedIn(): boolean {
  const session = readSession();
  return session?.loggedIn === true;
}
