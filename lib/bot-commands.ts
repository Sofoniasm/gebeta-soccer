/**
 * Telegram bot commands: /help, /balance, /rounds, /settings, /english, /amharic.
 * Replies in the chat's chosen language (English by default). Server only.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/telegram";
import { SITE_URL as SITE } from "@/lib/site";
import { getActiveRounds, getRoundPool } from "@/lib/rounds";
import { formatEtb, formatKickoff } from "@/lib/format";
import { unitsToEtb, formatUnits } from "@/lib/money";
import { getSiteSettings } from "@/lib/site-settings";

type Lang = "en" | "am";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const T = {
  en: {
    play: "⚽ Play GebetaSoccer",
    help: (support: string) =>
      "<b>GebetaSoccer bot</b>\n\n" +
      "/rounds – open rounds, prize pots and lock times\n" +
      "/balance – your wallet and Premium\n" +
      "/settings – your account and language\n" +
      "/amharic – reply in Amharic\n\n" +
      `Tap <b>Play</b> to predict right here in Telegram.\nHelp from a person: ${support}`,
    unlinked: "Your Telegram isn't linked to a GebetaSoccer account yet. Tap <b>Play</b> and log in once, then try again.",
    balance: (u: string, units: string, etb: string, premium: string) => `👛 <b>${u}</b>\nWallet: <b>${units}</b> (${etb})\n${premium}`,
    premiumOn: (d: string) => `⭐ Premium until ${d}`,
    premiumOff: "Premium: not active",
    noRounds: "No round is open right now. Rounds open by themselves (Morning, Evening, Night, Ethiopian time) when a slot has 10 matches.",
    roundsTitle: "<b>Open rounds</b>",
    open: (lock: string) => `🟢 open · locks ${lock} EAT`,
    inPlay: "🔴 in play",
    pot: (etb: string, slips: number, players: number) => `pot ${etb} · ${slips} slips · ${players} players`,
    settings: (lang: string, acct: string) => `⚙️ <b>Settings</b>\nLanguage: ${lang}\nAccount: ${acct}\n\n/english · /amharic to change the language.`,
    linked: (u: string) => `linked to <b>${u}</b>`,
    notLinked: "not linked (tap Play and log in)",
    langName: "English",
    langSet: "✅ The bot will reply in English.",
    unknown: "I didn't understand that. Send /help to see what I can do.",
  },
  am: {
    play: "⚽ ገበጣሶከርን ይጫወቱ",
    help: (support: string) =>
      "<b>የገበጣሶከር ቦት</b>\n\n" +
      "/rounds – ክፍት ዙሮች፣ የሽልማት ገንዳና የመዝጊያ ሰዓት\n" +
      "/balance – ዋሌትዎና ፕሪሚየም\n" +
      "/settings – መለያዎና ቋንቋ\n" +
      "/english – በእንግሊዝኛ መልስ\n\n" +
      `እዚሁ ቴሌግራም ላይ ለመገመት <b>ይጫወቱ</b>ን ይንኩ።\nየሰው እርዳታ፦ ${support}`,
    unlinked: "ቴሌግራምዎ ገና ከገበጣሶከር መለያ ጋር አልተገናኘም። <b>ይጫወቱ</b>ን ተጭነው አንድ ጊዜ ይግቡ፣ ከዚያ እንደገና ይሞክሩ።",
    balance: (u: string, units: string, etb: string, premium: string) => `👛 <b>${u}</b>\nዋሌት፦ <b>${units}</b> (${etb})\n${premium}`,
    premiumOn: (d: string) => `⭐ ፕሪሚየም እስከ ${d}`,
    premiumOff: "ፕሪሚየም፦ ንቁ አይደለም",
    noRounds: "አሁን ክፍት ዙር የለም። አንድ ክፍለ ጊዜ 10 ጨዋታዎች ሲኖሩት ዙሮች በራሳቸው ይከፈታሉ (ጠዋት፣ ከሰዓት፣ ማታ፣ በኢትዮጵያ ሰዓት)።",
    roundsTitle: "<b>ክፍት ዙሮች</b>",
    open: (lock: string) => `🟢 ክፍት · የሚዘጋው ${lock}`,
    inPlay: "🔴 እየተጫወተ ነው",
    pot: (etb: string, slips: number, players: number) => `ገንዳ ${etb} · ${slips} ስሊፖች · ${players} ተጫዋቾች`,
    settings: (lang: string, acct: string) => `⚙️ <b>ቅንብሮች</b>\nቋንቋ፦ ${lang}\nመለያ፦ ${acct}\n\nቋንቋ ለመቀየር /english · /amharic።`,
    linked: (u: string) => `ከ<b>${u}</b> ጋር ተገናኝቷል`,
    notLinked: "አልተገናኘም (ይጫወቱን ተጭነው ይግቡ)",
    langName: "አማርኛ",
    langSet: "✅ ቦቱ ከአሁን በኋላ በአማርኛ ይመልሳል።",
    unknown: "አልገባኝም። ምን ማድረግ እንደምችል ለማየት /help ይላኩ።",
  },
};

const playButton = (lang: Lang) => ({
  reply_markup: { inline_keyboard: [[{ text: T[lang].play, web_app: { url: `${SITE}/tma` } }]] },
});

export async function getBotLang(chatId: number): Promise<Lang> {
  const { data } = await createAdminClient().from("telegram_prefs").select("lang").eq("chat_id", chatId).maybeSingle();
  return data?.lang === "am" ? "am" : "en";
}

async function setBotLang(chatId: number, lang: Lang) {
  await createAdminClient().from("telegram_prefs").upsert({ chat_id: chatId, lang, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
}

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

/** Handle a command. Returns true when the message was a command we answered. */
export async function handleBotCommand(chatId: number, fromId: number | undefined, text: string): Promise<boolean> {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
  if (!["/help", "/balance", "/rounds", "/settings", "/english", "/amharic", "/language"].includes(cmd)) return false;
  const admin = createAdminClient();

  if (cmd === "/english" || cmd === "/amharic") {
    const lang: Lang = cmd === "/amharic" ? "am" : "en";
    await setBotLang(chatId, lang);
    await sendMessage(chatId, T[lang].langSet, playButton(lang));
    return true;
  }

  const lang = await getBotLang(chatId);
  const t = T[lang];
  const { data: me } = fromId
    ? await admin.from("profiles").select("id, username, balance_units").eq("telegram_user_id", fromId).maybeSingle()
    : { data: null };

  if (cmd === "/help") {
    const { telegram_support } = await getSiteSettings();
    await sendMessage(chatId, t.help(telegram_support), playButton(lang));
    return true;
  }

  if (cmd === "/balance") {
    if (!me) {
      await sendMessage(chatId, t.unlinked, playButton(lang));
      return true;
    }
    const { data: sub } = await admin.from("subscriptions").select("current_period_end").eq("user_id", me.id).maybeSingle();
    const active = sub && new Date(sub.current_period_end).getTime() > Date.now();
    const units = Number(me.balance_units);
    await sendMessage(chatId, t.balance(esc(me.username), formatUnits(units), formatEtb(unitsToEtb(units)), active ? t.premiumOn(day(sub!.current_period_end)) : t.premiumOff), playButton(lang));
    return true;
  }

  if (cmd === "/rounds") {
    const rounds = await getActiveRounds(admin);
    if (rounds.length === 0) {
      await sendMessage(chatId, t.noRounds, playButton(lang));
      return true;
    }
    const lines: string[] = [t.roundsTitle, ""];
    for (const r of rounds.slice(0, 8)) {
      const pool = await getRoundPool(admin, r.id);
      lines.push(`<b>${esc(r.name)}</b>`);
      lines.push(r.bettable && r.lock_at ? t.open(formatKickoff(r.lock_at)) : t.inPlay);
      lines.push(t.pot(formatEtb(unitsToEtb(pool.prize_fund_units)), pool.entrants, pool.players));
      lines.push("");
    }
    await sendMessage(chatId, lines.join("\n"), playButton(lang));
    return true;
  }

  // /settings, /language
  await sendMessage(chatId, t.settings(t.langName, me ? t.linked(esc(me.username)) : t.notLinked), playButton(lang));
  return true;
}

/** Commands shown in Telegram's "/" menu, per language. */
export const BOT_COMMANDS = {
  en: [
    { command: "start", description: "Open GebetaSoccer" },
    { command: "rounds", description: "Open rounds and prize pots" },
    { command: "balance", description: "My wallet and Premium" },
    { command: "settings", description: "Account and language" },
    { command: "help", description: "What this bot can do" },
    { command: "amharic", description: "Reply in Amharic" },
  ],
  am: [
    { command: "start", description: "ገበጣሶከርን ክፈት" },
    { command: "rounds", description: "ክፍት ዙሮችና የሽልማት ገንዳ" },
    { command: "balance", description: "ዋሌቴና ፕሪሚየም" },
    { command: "settings", description: "መለያና ቋንቋ" },
    { command: "help", description: "ቦቱ ምን ይሰራል" },
    { command: "english", description: "በእንግሊዝኛ መልስ" },
  ],
};
