import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { IDEALISTA_SELECTORS } from "./selectors";
import {
  closeBrowserSession,
  createBrowserSession,
  fillFormField,
  navigateToPage,
  saveCookies,
  cookiesExist,
  deleteCookies,
} from "./browser-manager";
import { storePendingSession, getPendingSession, removePendingSession } from "./session-store";

const LOGIN_URL = "https://www.idealista.com/login";
const TOOLS_URL = "https://www.idealista.com/tools/";

export interface LoginStartResult {
  status: "sms_required" | "already_logged_in" | "error";
  sessionId?: string;
  phone?: string;   // masked phone hint, e.g. "****103"
  error?: string;
}

export interface LoginVerifyResult {
  success: boolean;
  error?: string;
}

export interface SessionStatus {
  active: boolean;
  lastCheckedAt: Date;
}

// Step 1: Enter email + password, detect SMS prompt, pause for user input
export async function startLogin(username: string, password: string): Promise<LoginStartResult> {
  const session = await createBrowserSession(false);
  const { page, browser, context } = session;

  try {
    // Navigate to login
    console.log("[Auth] Navigating to Idealista login...");
    await navigateToPage(page, LOGIN_URL);
    await page.waitForTimeout(1500);

    // Step 1: Enter email
    await page.waitForSelector(IDEALISTA_SELECTORS.login.emailInput, { timeout: 10_000 });
    await fillFormField(page, IDEALISTA_SELECTORS.login.emailInput, username);
    await page.click(IDEALISTA_SELECTORS.login.continueButton);
    await page.waitForTimeout(2000);

    // Step 2: Enter password
    await page.waitForSelector(IDEALISTA_SELECTORS.login.passwordInput, { timeout: 10_000 });
    await fillFormField(page, IDEALISTA_SELECTORS.login.passwordInput, password);
    await page.click(IDEALISTA_SELECTORS.login.loginButton);
    await page.waitForTimeout(3000);

    const currentUrl = page.url();

    // Check if login completed without 2FA (edge case)
    if (currentUrl.includes("/tools") || currentUrl.includes("/es/")) {
      await saveCookies(context);
      await closeBrowserSession(session);
      await markLoginSuccess();
      return { status: "already_logged_in" };
    }

    // Detect SMS verification page
    const smsInput = await page.$(IDEALISTA_SELECTORS.login.smsCodeInput);
    if (!smsInput) {
      const pageContent = await page.content();
      const isLoginPage = pageContent.includes("Iniciar sesión") || pageContent.includes("login-password");
      await closeBrowserSession(session);
      return {
        status: "error",
        error: isLoginPage
          ? "Credenciales incorrectas. Verifica usuario y contraseña."
          : "Estado desconocido tras login. Revisa las credenciales.",
      };
    }

    // Extract masked phone number from the SMS hint text
    const bodyText = await page.innerText("body");
    const phoneMatch = bodyText.match(/código al ([*\d]+)/);
    const phone = phoneMatch?.[1] ?? "número desconocido";

    // Store the live browser session waiting for the SMS code
    const sessionId = randomUUID();
    storePendingSession(sessionId, { browser, context, page, username, phone, createdAt: new Date() });

    console.log(`[Auth] SMS required, session stored as ${sessionId}`);
    return { status: "sms_required", sessionId, phone };
  } catch (err) {
    await closeBrowserSession(session);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Auth] startLogin error:", msg);
    return { status: "error", error: `Error al iniciar sesión: ${msg}` };
  }
}

// Step 2: Enter SMS code in the waiting browser session
export async function completeLogin(sessionId: string, smsCode: string): Promise<LoginVerifyResult> {
  const pending = getPendingSession(sessionId);
  if (!pending) {
    return { success: false, error: "Sesión no encontrada o expirada (>5 min). Inicia el login de nuevo." };
  }

  const { page, context, browser } = pending;

  try {
    await fillFormField(page, IDEALISTA_SELECTORS.login.smsCodeInput, smsCode);
    await page.click(IDEALISTA_SELECTORS.login.confirmButton);
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const isLoggedIn = finalUrl.includes("/tools") || finalUrl.includes("/es/");

    if (!isLoggedIn) {
      const errorEl = await page.$('[class*="error"], [class*="alert"]');
      const errorText = errorEl ? await errorEl.innerText() : "Código incorrecto o página inesperada";
      return { success: false, error: errorText };
    }

    // Save cookies to disk so all subsequent automations reuse this session
    await saveCookies(context);
    await markLoginSuccess();

    console.log("[Auth] Login complete, session saved to disk");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Auth] completeLogin error:", msg);
    return { success: false, error: `Error al verificar código: ${msg}` };
  } finally {
    removePendingSession(sessionId);
    await closeBrowserSession({ browser, context, page });
  }
}

// Check if the stored session cookies are still valid
export async function checkSessionStatus(): Promise<SessionStatus> {
  const hasCookies = await cookiesExist();
  if (!hasCookies) {
    return { active: false, lastCheckedAt: new Date() };
  }

  const session = await createBrowserSession(true);
  const { page } = session;

  try {
    await navigateToPage(page, TOOLS_URL);
    await page.waitForTimeout(2000);

    const url = page.url();
    const active = url.includes("/tools") && !url.includes("/login");

    return { active, lastCheckedAt: new Date() };
  } catch {
    return { active: false, lastCheckedAt: new Date() };
  } finally {
    await closeBrowserSession(session);
  }
}

async function markLoginSuccess(): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await db
      .from("idealista_config")
      .update({ last_login_at: new Date().toISOString(), login_failed_count: 0, updated_at: new Date().toISOString() })
      .neq("id", "00000000-0000-0000-0000-000000000000");
  } catch (err) {
    console.error("[Auth] Failed to update login status:", err);
  }
}
