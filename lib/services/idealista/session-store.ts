import { Browser, BrowserContext, Page } from "playwright";

// In-memory store for pending 2FA login sessions
// Safe to use since SmartBC runs as a persistent PM2 process on VPS (not serverless)

interface PendingLoginSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  username: string;
  phone: string;     // masked phone hint from Idealista, e.g. "***103"
  createdAt: Date;
}

const PENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const pendingSessions = new Map<string, PendingLoginSession>();

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of pendingSessions.entries()) {
    if (now - session.createdAt.getTime() > PENDING_TIMEOUT_MS) {
      session.browser.close().catch(() => {});
      pendingSessions.delete(id);
      console.log(`[SessionStore] Expired pending session ${id} removed`);
    }
  }
}, 60_000);

export function storePendingSession(sessionId: string, session: PendingLoginSession): void {
  pendingSessions.set(sessionId, session);
}

export function getPendingSession(sessionId: string): PendingLoginSession | undefined {
  return pendingSessions.get(sessionId);
}

export function removePendingSession(sessionId: string): void {
  pendingSessions.delete(sessionId);
}
