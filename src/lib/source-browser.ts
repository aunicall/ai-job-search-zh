import { chromium, type BrowserContext, type Page } from "playwright-core";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { dataDir } from "./db";
import { DISCOVERY_SOURCES, type SourceId } from "./discovery-types";

const shared = globalThis as typeof globalThis & {
  offerBrowser?: Promise<BrowserContext>;
  offerBrowserNextAt?: number;
};
export function browserReady() {
  return Boolean(shared.offerBrowser);
}
async function browser() {
  if (!shared.offerBrowser) {
    const environment = { ...process.env };
    delete environment.OFFER_CAMPUS_API_KEY;
    shared.offerBrowser = chromium
      .launchPersistentContext(path.join(dataDir, "source-browser"), {
        channel:
          process.env.OFFER_BROWSER_CHANNEL ||
          (process.platform === "win32" ? "msedge" : "chrome"),
        headless: false,
        chromiumSandbox: true,
        acceptDownloads: false,
        viewport: null,
        env: environment,
      })
      .then((context) => {
        context.on("close", () => {
          shared.offerBrowser = undefined;
        });
        context.setDefaultTimeout(12000);
        return context;
      })
      .catch(() => {
        shared.offerBrowser = undefined;
        throw new Error(
          "无法打开招聘浏览器。请安装 Edge / Chrome，或配置 OFFER_BROWSER_CHANNEL。",
        );
      });
  }
  return shared.offerBrowser;
}
export function sourceUrl(source: SourceId, keywords = "", city = "") {
  const q = encodeURIComponent([keywords, city].filter(Boolean).join(" "));
  const urls: Record<SourceId, string> = {
    liepin: `https://www.liepin.com/zhaopin/?key=${q}`,
    boss: `https://www.zhipin.com/web/geek/job?query=${q}`,
    zhaopin: `https://sou.zhaopin.com/?kw=${q}`,
    "51job": `https://we.51job.com/pc/search?keyword=${q}`,
    offer: "https://www.offerxiansheng.com/",
  };
  return urls[source];
}
export function allowedJobUrl(source: SourceId, value: string) {
  try {
    const url = new URL(value);
    const domain = DISCOVERY_SOURCES.find((s) => s.id === source)!.domain;
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    );
  } catch {
    return false;
  }
}
export async function nextSearchPage(page: Page, signal: AbortSignal) {
  signal.throwIfAborted();
  const wait = Math.max(0, (shared.offerBrowserNextAt || 0) - Date.now());
  if (wait) await delay(wait, undefined, { signal });
  shared.offerBrowserNextAt = Date.now() + 8000;
  const controls = page.locator('a,button,[role="button"],.btn-next,.soupager__btn,.pagination-next,.ant-pagination-next');
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue;
    const label = ((await control.getAttribute("aria-label")) || (await control.getAttribute("title")) || (await control.innerText())).trim();
    const classes = await control.getAttribute("class") || "";
    if (!/^(下一页|下页|加载更多|查看更多职位|next(?: page)?|[›»>])$/i.test(label) && !/(?:btn-next|pagination-next|(?:^|\s)next(?:\s|$))/.test(classes)) continue;
    if (await control.isDisabled() || await control.getAttribute("aria-disabled") === "true" || /disabled/.test(classes)) return false;
    await control.click();
    await page.waitForTimeout(1800);
    return true;
  }
  // 没有翻页按钮的平台可能在滚动到底部时加载下一批。
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    for (const node of document.querySelectorAll<HTMLElement>('main,[class*="job-list"],[class*="jobList"]')) {
      if (node.scrollHeight > node.clientHeight) node.scrollTop = node.scrollHeight;
    }
  });
  await page.waitForTimeout(1800);
  return true;
}

export async function openSourceBrowser(source: SourceId) {
  const context = await browser();
  const url = sourceUrl(source);
  const existing = context.pages().find((p) => {
    try {
      return new URL(p.url()).hostname === new URL(url).hostname;
    } catch {
      return false;
    }
  });
  const page = existing || (await context.newPage());
  if (!existing)
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.bringToFront();
}
export async function browserPage<T>(
  source: SourceId,
  signal: AbortSignal,
  use: (page: Page, visit: (url: string) => Promise<string>) => Promise<T>,
): Promise<T> {
  const page = await (await browser()).newPage();
  const abort = () => {
    void page.close().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    return await use(page, async (url) => {
      if (!allowedJobUrl(source, url))
        throw new Error("来源链接不受信任，已停止访问。");
      const wait = Math.max(0, (shared.offerBrowserNextAt || 0) - Date.now());
      if (wait) await delay(wait, undefined, { signal });
      shared.offerBrowserNextAt = Date.now() + 8000;
      signal.throwIfAborted();
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      if (!allowedJobUrl(source, page.url()))
        throw new Error("平台跳转到登录或验证页面，请在招聘浏览器中处理。");
      if (response && [403, 429].includes(response.status()))
        throw new Error("平台限制访问，请在招聘浏览器中处理后再试。");
      await page.locator("body").waitFor();
      // Allow client-rendered job lists to replace the initial loading screen.
      await page.waitForTimeout(1800);
      const text = (await page.locator("body").innerText()).slice(0, 60000);
      if (
        /安全验证|滑动验证|拖动滑块|访问过于频繁|异常访问|请完成验证|人机验证/.test(
          text,
        )
      )
        throw new Error("需要平台验证。请打开招聘浏览器处理后重新发现。");
      return text;
    });
  } finally {
    signal.removeEventListener("abort", abort);
    await page.close().catch(() => {});
  }
}
