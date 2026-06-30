// Bot/scraper detection patterns
export const BOT_PATTERNS = {
  crawlers: [
    'googlebot',
    'bingbot',
    'slurp',
    'duckduckgo',
    'baiduspider',
    'yandexbot',
    'facebookexternalhit',
    'twitterbot',
    'linkedinbot',
    'whatsapp',
    'telegram',
    'slackbot',
    'discordbot',
    'viber',
  ],
  scrapers: [
    'scrapy',
    'selenium',
    'puppeteer',
    'playwright',
    'headless',
    'mechanize',
    'beautifulsoup',
    'jsoup',
    'cheerio',
    'aiohttp',
    'httpx',
    'requests',
    'curl',
    'wget',
    'fetch',
  ],
  tools: [
    'postman',
    'insomnia',
    'thunderclient',
    'restclient',
    'nikto',
    'sqlmap',
    'burp',
    'owasp',
  ],
  malicious: [
    'sqlmap',
    'nikto',
    'metasploit',
    'nessus',
    'masscan',
    'shodan',
    'nuclei',
    'dirbuster',
    'gobuster',
    'nmap',
  ],
  analytics: [
    'mixpanel',
    'segment',
    'fullstory',
    'newrelic',
    'datadog',
    'amplitude',
    'gtm-',
    'gtag',
  ],
  proxies: ['proxy', 'vpn', 'tor', 'anonymized'],
};

export const BOT_KEYWORDS = Object.values(BOT_PATTERNS).flat();

export function detectBotFromUA(userAgent: string | null): {
  isBotLikely: boolean;
  type?: string;
} {
  if (!userAgent || userAgent.trim() === '') {
    return { isBotLikely: true, type: 'empty_ua' };
  }

  const ua = userAgent.toLowerCase();

  // Check each category
  for (const [category, patterns] of Object.entries(BOT_PATTERNS)) {
    if (patterns.some((p) => ua.includes(p))) {
      return { isBotLikely: true, type: category };
    }
  }

  // Additional heuristics
  // Very short UA
  if (ua.trim().length < 20) {
    return { isBotLikely: true, type: 'short_ua' };
  }

  // Suspiciously generic UA
  if (ua === 'mozilla/5.0' || ua === '-' || ua === '') {
    return { isBotLikely: true, type: 'generic_ua' };
  }

  return { isBotLikely: false };
}

export function detectBotFromBehavior(data: {
  requestsPerMinute: number;
  sameDeviceMultipleIPs: boolean;
  rapidFireEvents: boolean;
  unusualPattern: boolean;
}): {
  isBotLikely: boolean;
  reason?: string;
} {
  // More than 100 requests/min from an IP is suspicious
  if (data.requestsPerMinute > 100) {
    return { isBotLikely: true, reason: 'high_request_rate' };
  }

  // Same device fingerprint from multiple IPs is suspicious
  if (data.sameDeviceMultipleIPs) {
    return { isBotLikely: true, reason: 'device_ip_mismatch' };
  }

  // Events too fast (< 100ms between events)
  if (data.rapidFireEvents) {
    return { isBotLikely: true, reason: 'rapid_fire_events' };
  }

  return { isBotLikely: false };
}
