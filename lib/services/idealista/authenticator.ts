import { Page } from "playwright";
import { createAdminClient } from "@/lib/db/admin";
import { BrowserSession, closeBrowserSession, createBrowserSession, navigateToPage, fillFormField, clickElement, checkElementExists } from "./browser-manager";

const IDEALISTA_LOGIN_URL = "https://www.idealista.com/login";
const IDEALISTA_DASHBOARD_URL = "https://www.idealista.com/es/";

export interface AuthResult {
  success: boolean;
  error?: string;
  lastLoginAt?: Date;
}

export async function authenticateWithIdealista(username: string, password: string): Promise<AuthResult> {
  let session: BrowserSession | null = null;

  try {
    // Create browser session
    session = await createBrowserSession();
    const { page } = session;

    // Navigate to login page
    console.log("[Idealista Auth] Navigating to login page...");
    await navigateToPage(page, IDEALISTA_LOGIN_URL);

    // Check if already logged in (redirect to dashboard means already logged in)
    const currentUrl = page.url();
    if (currentUrl.includes("idealista.com/es") && !currentUrl.includes("login")) {
      console.log("[Idealista Auth] Already logged in");
      const now = new Date();
      updateLoginStatus(true, now);
      return { success: true, lastLoginAt: now };
    }

    // Look for email/username input
    const emailSelectors = [
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[id*="email" i]',
    ];

    let emailFieldFound = false;
    for (const selector of emailSelectors) {
      if (await checkElementExists(page, selector)) {
        console.log(`[Idealista Auth] Found email field: ${selector}`);
        await fillFormField(page, selector, username);
        emailFieldFound = true;
        break;
      }
    }

    if (!emailFieldFound) {
      console.error("[Idealista Auth] Email field not found - layout may have changed");
      return {
        success: false,
        error: "Email input field not found on Idealista login page. Layout may have changed.",
      };
    }

    // Look for password input
    const passwordSelectors = ['input[name="password"]', 'input[type="password"]', 'input[id*="password" i]'];

    let passwordFieldFound = false;
    for (const selector of passwordSelectors) {
      if (await checkElementExists(page, selector)) {
        console.log(`[Idealista Auth] Found password field: ${selector}`);
        await fillFormField(page, selector, password);
        passwordFieldFound = true;
        break;
      }
    }

    if (!passwordFieldFound) {
      console.error("[Idealista Auth] Password field not found");
      return {
        success: false,
        error: "Password input field not found on Idealista login page.",
      };
    }

    // Look for and click login button
    const loginButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("Entrar")',
      'button:has-text("Login")',
      'a[href*="login"]',
    ];

    let loginClicked = false;
    for (const selector of loginButtonSelectors) {
      try {
        if (await checkElementExists(page, selector)) {
          console.log(`[Idealista Auth] Clicking login button: ${selector}`);
          await clickElement(page, selector, 2000); // Wait 2 seconds after click
          loginClicked = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!loginClicked) {
      console.error("[Idealista Auth] Login button not found or click failed");
      return {
        success: false,
        error: "Could not find or click login button on Idealista.",
      };
    }

    // Wait for navigation and check if login was successful
    console.log("[Idealista Auth] Waiting for post-login navigation...");
    await page.waitForLoadState("networkidle").catch(() => {
      // Ignore timeout errors
    });

    const finalUrl = page.url();
    console.log(`[Idealista Auth] Final URL: ${finalUrl}`);

    // Check for error messages (CAPTCHA, invalid credentials, etc.)
    const errorSelectors = [
      ".error-message",
      "[class*='error']",
      "[class*='warning']",
      "text=/invalid|incorrect|contraseña|email/i",
    ];

    for (const selector of errorSelectors) {
      if (await checkElementExists(page, selector)) {
        const errorText = await page.textContent(selector);
        console.error(`[Idealista Auth] Error detected: ${errorText}`);
        return {
          success: false,
          error: `Login failed: ${errorText || "Invalid credentials"}`,
        };
      }
    }

    // Check for CAPTCHA
    const captchaSelectors = [
      "[class*='captcha']",
      "[class*='recaptcha']",
      "iframe[src*='recaptcha']",
    ];

    for (const selector of captchaSelectors) {
      if (await checkElementExists(page, selector)) {
        console.error("[Idealista Auth] CAPTCHA detected - cannot proceed");
        return {
          success: false,
          error: "CAPTCHA required. Please log in manually to Idealista.",
        };
      }
    }

    // Verify we're logged in by checking for dashboard elements
    const isDashboard = await checkElementExists(page, "[class*='dashboard']") ||
                       finalUrl.includes("/es/") && !finalUrl.includes("/login");

    if (isDashboard) {
      console.log("[Idealista Auth] Successfully logged in to Idealista");
      const now = new Date();
      updateLoginStatus(true, now);
      return { success: true, lastLoginAt: now };
    } else {
      console.warn("[Idealista Auth] Login may have failed - unexpected URL:", finalUrl);
      return {
        success: false,
        error: "Login process completed but dashboard not detected.",
      };
    }
  } catch (error) {
    console.error("[Idealista Auth] Authentication error:", error);
    updateLoginStatus(false);
    return {
      success: false,
      error: `Authentication error: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (session) {
      await closeBrowserSession(session);
    }
  }
}

async function updateLoginStatus(success: boolean, loginAt?: Date): Promise<void> {
  try {
    const db = createAdminClient();

    if (success && loginAt) {
      await db.from("idealista_config").update({
        last_login_at: loginAt.toISOString(),
        login_failed_count: 0,
        updated_at: new Date().toISOString(),
      });
    } else {
      // Increment failed login count
      const { data } = await db.from("idealista_config").select("login_failed_count").single();

      if (data) {
        await db.from("idealista_config").update({
          login_failed_count: (data.login_failed_count || 0) + 1,
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error("[Idealista Auth] Failed to update login status in DB:", error);
  }
}
