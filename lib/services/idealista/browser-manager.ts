import { Browser, BrowserContext, Page, chromium } from "playwright";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

const BROWSER_TIMEOUT = 30000; // 30 seconds
const PAGE_TIMEOUT = 30000;

export async function createBrowserSession(): Promise<BrowserSession> {
  try {
    // Launch Playwright Chromium with headless and other optimizations for Linux VPS
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage", // Avoid /dev/shm issues on VPS
      ],
    });

    // Create a new context with persistence for cookies/storage
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      // Optional: use persistent storage for cookies
      storageState: undefined,
    });

    // Set timeout for all page operations
    context.setDefaultTimeout(PAGE_TIMEOUT);
    context.setDefaultNavigationTimeout(PAGE_TIMEOUT);

    const page = await context.newPage();

    // Log network errors for debugging
    page.on("error", (error) => {
      console.error("[Playwright] Page error:", error.message);
    });

    page.on("close", () => {
      console.log("[Playwright] Page closed");
    });

    return { browser, context, page };
  } catch (error) {
    console.error("[Playwright] Failed to create browser session:", error);
    throw new Error(`Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function closeBrowserSession(session: BrowserSession): Promise<void> {
  try {
    if (session.page) {
      await session.page.close();
    }
    if (session.context) {
      await session.context.close();
    }
    if (session.browser) {
      await session.browser.close();
    }
  } catch (error) {
    console.error("[Playwright] Error closing browser session:", error);
  }
}

export async function navigateToPage(page: Page, url: string, waitForLoad = true): Promise<void> {
  try {
    const response = await page.goto(url, {
      waitUntil: waitForLoad ? "networkidle" : "domcontentloaded",
    });

    if (!response?.ok()) {
      throw new Error(`Navigation failed: HTTP ${response?.status()}`);
    }
  } catch (error) {
    console.error(`[Playwright] Failed to navigate to ${url}:`, error);
    throw error;
  }
}

export async function fillFormField(page: Page, selector: string, value: string): Promise<void> {
  try {
    await page.fill(selector, value);
  } catch (error) {
    console.error(`[Playwright] Failed to fill field ${selector}:`, error);
    throw new Error(`Failed to fill form field: ${selector}`);
  }
}

export async function clickElement(page: Page, selector: string, waitAfter = 0): Promise<void> {
  try {
    await page.click(selector);
    if (waitAfter > 0) {
      await page.waitForTimeout(waitAfter);
    }
  } catch (error) {
    console.error(`[Playwright] Failed to click ${selector}:`, error);
    throw new Error(`Failed to click element: ${selector}`);
  }
}

export async function waitForSelector(page: Page, selector: string, timeout = PAGE_TIMEOUT): Promise<void> {
  try {
    await page.waitForSelector(selector, { timeout });
  } catch (error) {
    console.error(`[Playwright] Selector not found: ${selector}`, error);
    throw new Error(`Selector not found after ${timeout}ms: ${selector}`);
  }
}

export async function extractText(page: Page, selector: string): Promise<string> {
  try {
    const text = await page.textContent(selector);
    return text || "";
  } catch (error) {
    console.error(`[Playwright] Failed to extract text from ${selector}:`, error);
    return "";
  }
}

export async function checkElementExists(page: Page, selector: string): Promise<boolean> {
  try {
    const element = await page.$(selector);
    return element !== null;
  } catch (error) {
    console.error(`[Playwright] Error checking element existence:`, error);
    return false;
  }
}

export async function takeScreenshot(page: Page, filename: string): Promise<void> {
  try {
    await page.screenshot({ path: `/tmp/${filename}`, fullPage: true });
    console.log(`[Playwright] Screenshot saved: ${filename}`);
  } catch (error) {
    console.error(`[Playwright] Failed to take screenshot:`, error);
  }
}
