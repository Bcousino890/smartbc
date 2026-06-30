import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Browser, BrowserContext, Page, chromium } from "playwright";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

const PAGE_TIMEOUT = 30_000;

// Where cookies are persisted on disk (VPS)
const SESSION_DIR = process.env.IDEALISTA_SESSION_DIR ?? join(process.cwd(), ".idealista-session");
const COOKIES_PATH = join(SESSION_DIR, "cookies.json");

export async function createBrowserSession(withSavedCookies = false): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--window-size=1920,1080",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    extraHTTPHeaders: {
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  });

  // Hide automation fingerprints
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["es-ES", "es"] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome = { runtime: {} };
  });

  if (withSavedCookies) {
    await loadCookies(context);
  }

  context.setDefaultTimeout(PAGE_TIMEOUT);
  context.setDefaultNavigationTimeout(PAGE_TIMEOUT);

  const page = await context.newPage();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.on("pageerror" as any, (err: Error) => console.error("[Playwright] Page error:", err.message));

  return { browser, context, page };
}

export async function saveCookies(context: BrowserContext): Promise<void> {
  try {
    await mkdir(SESSION_DIR, { recursive: true });
    const cookies = await context.cookies();
    await writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2), "utf-8");
    console.log(`[Playwright] Cookies saved to ${COOKIES_PATH}`);
  } catch (err) {
    console.error("[Playwright] Failed to save cookies:", err);
  }
}

export async function saveCookiesRaw(cookies: unknown[]): Promise<void> {
  await mkdir(SESSION_DIR, { recursive: true });
  await writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2), "utf-8");
  console.log(`[Playwright] ${cookies.length} cookies imported and saved to ${COOKIES_PATH}`);
}

export async function loadCookies(context: BrowserContext): Promise<boolean> {
  try {
    const raw = await readFile(COOKIES_PATH, "utf-8");
    const cookies = JSON.parse(raw);
    await context.addCookies(cookies);
    console.log("[Playwright] Cookies loaded from disk");
    return true;
  } catch {
    // No saved session yet
    return false;
  }
}

export async function cookiesExist(): Promise<boolean> {
  try {
    await readFile(COOKIES_PATH, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function deleteCookies(): Promise<void> {
  try {
    await unlink(COOKIES_PATH);
    console.log("[Playwright] Cookies deleted from disk");
  } catch {
    // File didn't exist — that's fine
  }
}

export async function closeBrowserSession(session: BrowserSession): Promise<void> {
  try {
    await session.page.close().catch(() => {});
    await session.context.close().catch(() => {});
    await session.browser.close().catch(() => {});
  } catch (err) {
    console.error("[Playwright] Error closing browser session:", err);
  }
}

export async function navigateToPage(page: Page, url: string): Promise<void> {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
  if (res && !res.ok() && res.status() !== 304 && res.status() !== 0) {
    throw new Error(`Navigation to ${url} failed with HTTP ${res.status()}`);
  }
}

export async function fillFormField(page: Page, selector: string, value: string): Promise<void> {
  await page.fill(selector, value);
}

export async function clickElement(page: Page, selector: string, waitMs = 0): Promise<void> {
  await page.click(selector);
  if (waitMs > 0) await page.waitForTimeout(waitMs);
}

export async function checkElementExists(page: Page, selector: string): Promise<boolean> {
  return (await page.$(selector)) !== null;
}

export async function waitForSelector(page: Page, selector: string, timeout = PAGE_TIMEOUT): Promise<void> {
  await page.waitForSelector(selector, { timeout });
}

export async function extractText(page: Page, selector: string): Promise<string> {
  return (await page.textContent(selector)) ?? "";
}
