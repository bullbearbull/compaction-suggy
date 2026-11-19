import { chatGptAdapter } from "./chatgpt.js";
import { claudeAdapter } from "./claude.js";
import type { SiteAdapter, SiteId } from "./types.js";

export type { SiteAdapter, SiteId } from "./types.js";
export { chatGptAdapter } from "./chatgpt.js";
export { claudeAdapter } from "./claude.js";

export function detectSiteFromHostname(hostname: string): SiteId | undefined {
  const host = hostname.toLowerCase();
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com") {
    return "chatgpt";
  }
  if (host === "claude.ai" || host.endsWith(".claude.ai")) {
    return "claude";
  }
  return undefined;
}

export function detectSiteFromUrl(urlStr: string): SiteId | undefined {
  try {
    return detectSiteFromHostname(new URL(urlStr).hostname);
  } catch {
    return undefined;
  }
}

export function getSiteAdapter(siteId: SiteId): SiteAdapter {
  return siteId === "claude" ? claudeAdapter : chatGptAdapter;
}

export function getActiveSiteAdapter(
  hostname: string = window.location.hostname,
): SiteAdapter | undefined {
  const id = detectSiteFromHostname(hostname);
  return id ? getSiteAdapter(id) : undefined;
}
