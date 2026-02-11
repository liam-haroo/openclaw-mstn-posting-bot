import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { SessionData } from "./session-store.js";

let browser: Browser | null = null;

export async function launchBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function createContext(session?: SessionData | null): Promise<BrowserContext> {
  const b = await launchBrowser();
  const options: Parameters<Browser["newContext"]>[0] = {
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  };
  if (session?.storageState) {
    options.storageState = session.storageState as any;
  }
  return b.newContext(options);
}

export async function openPage(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browser?.isConnected()) {
    await browser.close();
    browser = null;
  }
}
