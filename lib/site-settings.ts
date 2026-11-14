/**
 * Site settings the admin edits in Admin -> Site (stored in site_settings).
 * Read with getSiteSettings() in server components; falls back to sensible
 * defaults so the site works before anything is saved.
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { TELEGRAM_URL } from "@/lib/config";

export interface SiteSettings {
  telegram_support: string;
  telegram_channel: string;
  contact_email: string;
  contact_phone: string;
  competitions: string[];
  show_public_stats: boolean;
  /** Create Morning / Evening / Night rounds by themselves at every match sync. */
  auto_rounds: boolean;
  /** Entry fee of automatic rounds, in Units. */
  auto_round_fee: number;
  /** Price of 1 Unit in USDT for crypto deposits. */
  crypto_usd_per_unit: number;
}

/** Leagues our football data plan can sync (free tier). */
export const ALL_COMPETITIONS = [
  { code: "PL", name: "Premier League", label: "Premier League", country: "England", hue: "from-[#6d5bd0] to-[#3b2f80]" },
  { code: "CL", name: "UEFA Champions League", label: "Champions League", country: "Europe", hue: "from-[#4a5bd6] to-[#1f2a73]" },
  { code: "PD", name: "Primera Division", label: "La Liga", country: "Spain", hue: "from-[#c0566b] to-[#6b2335]" },
  { code: "SA", name: "Serie A", label: "Serie A", country: "Italy", hue: "from-[#3d8bd1] to-[#1b4570]" },
  { code: "BL1", name: "Bundesliga", label: "Bundesliga", country: "Germany", hue: "from-[#d0564f] to-[#6e2420]" },
  { code: "FL1", name: "Ligue 1", label: "Ligue 1", country: "France", hue: "from-[#5a8f6a] to-[#244331]" },
  { code: "ELC", name: "Championship", label: "Championship", country: "England", hue: "from-[#8a7bd8] to-[#463c86]" },
  { code: "DED", name: "Eredivisie", label: "Eredivisie", country: "Netherlands", hue: "from-[#e08a45] to-[#7a431a]" },
  { code: "PPL", name: "Primeira Liga", label: "Primeira Liga", country: "Portugal", hue: "from-[#3fa37a] to-[#1a5139]" },
  { code: "BSA", name: "Campeonato Brasileiro Série A", label: "Brasileirão", country: "Brazil", hue: "from-[#c9b240] to-[#5f531a]" },
  { code: "WC", name: "FIFA World Cup", label: "World Cup", country: "International", hue: "from-[#b38a3e] to-[#5a4219]" },
  { code: "EC", name: "European Championship", label: "Euros", country: "Europe", hue: "from-[#4d7fd6] to-[#213a6d]" },
] as const;

const envCompetitions = (process.env.FOOTBALL_COMPETITIONS ?? "PL")
  .split(",")
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);

export const DEFAULT_SETTINGS: SiteSettings = {
  telegram_support: TELEGRAM_URL,
  telegram_channel: "https://t.me/GebetaSoccerOfficial",
  contact_email: "",
  contact_phone: "",
  competitions: envCompetitions,
  show_public_stats: false,
  auto_rounds: true,
  auto_round_fee: 1,
  crypto_usd_per_unit: 1.5,
};

function merge(rows: { key: string; value: unknown }[]): SiteSettings {
  const s: SiteSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    const v = r.value;
    switch (r.key) {
      case "telegram_support":
        if (typeof v === "string" && /^https:\/\/t\.me\/\S+$/.test(v)) s.telegram_support = v;
        break;
      case "telegram_channel":
        if (typeof v === "string" && /^https:\/\/t\.me\/\S+$/.test(v)) s.telegram_channel = v; // empty = our official channel
        break;
      case "contact_email":
        if (typeof v === "string") s.contact_email = v;
        break;
      case "contact_phone":
        if (typeof v === "string") s.contact_phone = v;
        break;
      case "competitions":
        if (Array.isArray(v) && v.length) s.competitions = v.map(String).filter((c) => ALL_COMPETITIONS.some((x) => x.code === c));
        break;
      case "show_public_stats":
        if (typeof v === "boolean") s.show_public_stats = v;
        break;
      case "auto_rounds":
        if (typeof v === "boolean") s.auto_rounds = v;
        break;
      case "auto_round_fee":
        if (typeof v === "number" && v >= 0.5 && v <= 50) s.auto_round_fee = v;
        break;
      case "crypto_usd_per_unit":
        if (typeof v === "number" && v >= 0.1 && v <= 20) s.crypto_usd_per_unit = v;
        break;
    }
  }
  if (s.competitions.length === 0) s.competitions = DEFAULT_SETTINGS.competitions;
  return s;
}

export const SITE_SETTINGS_TAG = "site-settings";

/** Settings rows, cached on the server for 5 minutes (Admin -> Site clears the cache on save). */
const loadRows = unstable_cache(
  async (): Promise<{ key: string; value: unknown }[] | null> => {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
    const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.from("site_settings").select("key, value");
    return error || !data ? null : (data as { key: string; value: unknown }[]);
  },
  ["site-settings-v1"],
  { revalidate: 300, tags: [SITE_SETTINGS_TAG] },
);

/** Never throws: on any problem the defaults are used. */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const rows = await loadRows();
    return rows ? merge(rows) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
});

/** "@GebetaSoccer" from "https://t.me/GebetaSoccer" */
export const telegramHandle = (url: string) => "@" + url.replace(/^https?:\/\/t\.me\//, "").replace(/\/$/, "");
