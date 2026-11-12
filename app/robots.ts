import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Private, per-player and admin pages are never indexed. */
const PRIVATE = [
  "/api/", "/admin", "/dashboard", "/todo", "/wallet", "/profile", "/notifications", "/career",
  "/certificates", "/leaderboard", "/results", "/fixtures", "/match/", "/leagues", "/join/",
  "/verify", "/tma", "/login", "/am/login", "/forgot", "/am/forgot", "/reset", "/am/reset", "/auth/", "/challenges",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      // AI search assistants may read and cite the public pages (rules, news, about)
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended", "Applebot-Extended"], allow: "/", disallow: PRIVATE },
      // Known to ignore crawl rules and hammer sites
      { userAgent: "Bytespider", disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
