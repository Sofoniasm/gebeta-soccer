/**
 * GebetaSoccer help assistant (server only).
 * Answers players' questions from ASSISTANT_KB plus their own account facts,
 * in English or Amharic. Hands anything about money problems, disputes or
 * account access to a person: a support request + admin notification
 * (site, Telegram, and email when SUPPORT_EMAIL + RESEND_API_KEY are set).
 *
 * Env: ANTHROPIC_API_KEY (required to answer), ASSISTANT_MODEL (optional).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { getSiteSettings } from "@/lib/site-settings";
import { cleanHistory, ESCALATE, FORWARDED, systemPrompt, type Turn } from "@/lib/assistant-prompt";
import { formatUnits } from "@/lib/money";

export type Channel = "web" | "telegram";
export type { Turn };

const MODEL = process.env.ASSISTANT_MODEL || "claude-haiku-5-5";
const LIMIT_PLAYER_PER_HOUR = 20;
const LIMIT_GUEST_PER_HOUR = 8;

export const assistantEnabled = () => !!process.env.ANTHROPIC_API_KEY;

/** Facts about the asking player (never passwords or codes). */
async function playerFacts(userId: string | null): Promise<string> {
  if (!userId) return "The person is not logged in (a visitor).";
  const admin = createAdminClient();
  const [{ data: p }, { data: sub }, { data: wd }, { count: openSlips }] = await Promise.all([
    admin.from("profiles").select("username, balance_units, phone_verified_at, telegram_user_id, date_of_birth, excluded_until, created_at").eq("id", userId).single(),
    admin.from("subscriptions").select("plan, current_period_end, auto_renew").eq("user_id", userId).maybeSingle(),
    admin.from("withdrawal_requests").select("units, status, created_at").eq("user_id", userId).eq("status", "pending"),
    admin.from("slips").select("id, rounds!inner(status)", { count: "exact", head: true }).eq("user_id", userId).in("rounds.status", ["open", "locked"]),
  ]);
  if (!p) return "The person is logged in.";
  const premium = sub && new Date(sub.current_period_end).getTime() > Date.now()
    ? `Premium ${sub.plan} until ${sub.current_period_end.slice(0, 10)} (auto-renew ${sub.auto_renew ? "on" : "off"})`
    : "No Premium";
  const pending = (wd ?? []) as { units: number; created_at: string }[];
  return [
    `Logged-in player: ${p.username}.`,
    `Wallet: ${formatUnits(Number(p.balance_units))}.`,
    `Phone confirmed: ${p.phone_verified_at ? "yes" : "no"}. Telegram linked: ${p.telegram_user_id ? "yes" : "no"}. Date of birth saved: ${p.date_of_birth ? "yes" : "no"}.`,
    p.excluded_until && new Date(p.excluded_until).getTime() > Date.now() ? `On a break until ${p.excluded_until.slice(0, 16)} (betting paused).` : "Not on a break.",
    premium + ".",
    pending.length ? `Pending withdrawals: ${pending.map((w) => `${w.units} Units requested ${w.created_at.slice(0, 16)}`).join("; ")}.` : "No pending withdrawals.",
    `Slips in open or in-play rounds: ${openSlips ?? 0}.`,
  ].join(" ");
}

/** The player's last few questions and answers (last 30 minutes, same channel) from our log. */
async function serverHistory(userId: string, channel: Channel): Promise<Turn[]> {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await createAdminClient()
    .from("assistant_messages")
    .select("question, answer")
    .eq("user_id", userId)
    .eq("channel", channel)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(3);
  const turns: Turn[] = [];
  for (const m of ((data ?? []) as { question: string; answer: string }[]).reverse()) {
    turns.push({ role: "user", content: m.question }, { role: "assistant", content: m.answer });
  }
  return cleanHistory(turns);
}

async function underLimit(userId: string | null, chatId: number | null, ip: string | null): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  let q = admin.from("assistant_messages").select("id", { count: "exact", head: true }).gte("created_at", since);
  if (userId) q = q.eq("user_id", userId);
  else if (chatId) q = q.eq("chat_id", chatId);
  else if (ip) q = q.eq("ip", ip);
  else return true;
  const { count } = await q;
  return (count ?? 0) < (userId ? LIMIT_PLAYER_PER_HOUR : LIMIT_GUEST_PER_HOUR);
}

/** Internal email to the team (never shown to players). Needs RESEND_API_KEY and a verified sending domain in Resend. */
async function emailSupport(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_EMAIL || "admin@gebetasoccer.com";
  if (!key) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.SUPPORT_EMAIL_FROM || "GebetaSoccer Support <support@gebetasoccer.com>", to: [to], subject, text }),
    });
    if (!res.ok) console.error("support email failed:", res.status, await res.text());
  } catch (e) {
    console.error("support email:", (e as Error).message);
  }
}

export interface TelegramSender { id: number; username?: string; first_name?: string; last_name?: string }

/**
 * Create a support request with the player's contact details (taken from their
 * account / Telegram, never asked for), tell every admin, and email the team.
 */
async function handOff(opts: { userId: string | null; chatId: number | null; channel: Channel; question: string; summary: string; history: Turn[]; tg?: TelegramSender | null }) {
  const admin = createAdminClient();
  const { data: who } = opts.userId
    ? await admin.from("profiles").select("username, phone_number, telegram_user_id").eq("id", opts.userId).single()
    : { data: null };
  const contact = {
    username: who?.username ?? null,
    phone: who?.phone_number ?? null,
    telegram_id: opts.tg?.id ?? (who?.telegram_user_id ? Number(who.telegram_user_id) : null) ?? opts.chatId,
    telegram_username: opts.tg?.username ? `@${opts.tg.username}` : null,
    telegram_name: [opts.tg?.first_name, opts.tg?.last_name].filter(Boolean).join(" ") || null,
  };
  const { data: req } = await admin
    .from("support_requests")
    .insert({ user_id: opts.userId, chat_id: opts.chatId, channel: opts.channel, question: opts.question.slice(0, 2000), summary: opts.summary.slice(0, 1000), contact })
    .select("id")
    .single();
  const name = who ? `${who.username} (${who.phone_number ?? "no phone"})` : contact.telegram_username ?? (opts.chatId ? `Telegram chat ${opts.chatId}` : "A visitor");
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  const body = `${name} via ${opts.channel}: "${opts.question.slice(0, 220)}"`;
  if (admins?.length) {
    await admin.from("notifications").insert(
      admins.map((a: { id: string }) => ({ user_id: a.id, kind: "admin", title: `🆘 Support request #${req?.id ?? ""}`, body, link: "/admin/support" })),
    );
    await pushNotifications();
  }
  const line = (k: string, v: unknown) => `${k}: ${v ?? "-"}`;
  const convo = [...opts.history, { role: "user" as const, content: opts.question }]
    .map((t) => `${t.role === "user" ? "Player" : "Assistant"}: ${t.content}`)
    .join("\n");
  await emailSupport(
    `Support request #${req?.id ?? ""}: ${name}`,
    [
      `New support request #${req?.id ?? ""} (${opts.channel}), handed over by the help assistant.`,
      "",
      "CONTACT",
      line("Account", contact.username),
      line("Phone", contact.phone),
      line("Telegram ID", contact.telegram_id),
      line("Telegram username", contact.telegram_username),
      line("Telegram name", contact.telegram_name),
      "",
      "ISSUE (assistant's summary)",
      opts.summary,
      "",
      "CONVERSATION",
      convo,
      "",
      "Open: https://www.gebetasoccer.com/admin/support",
      contact.telegram_username ? `Message on Telegram: https://t.me/${contact.telegram_username.slice(1)}` : "",
    ].join("\n"),
  );
}

/**
 * Ask the assistant. Returns the reply text to show. Never throws.
 */
export async function askAssistant(opts: {
  question: string;
  history?: Turn[];
  userId: string | null;
  chatId?: number | null;
  ip?: string | null;
  channel: Channel;
  lang?: "en" | "am" | null;
  /** Telegram sender of the message (bot only), for the team to reach them. */
  telegram?: TelegramSender | null;
}): Promise<{ reply: string; handedOff: boolean }> {
  const { telegram_support } = await getSiteSettings();
  const question = opts.question.trim().slice(0, 1500);
  const am = opts.lang === "am";
  if (!question) return { reply: am ? "ጥያቄዎን ይጻፉ።" : "Type your question.", handedOff: false };
  if (!assistantEnabled()) {
    return { reply: am ? `ረዳቱ ገና አልበራም። እባክዎ ድጋፍን በቴሌግራም ያግኙ፦ ${telegram_support}` : `The help assistant isn't switched on yet. Please message support on Telegram: ${telegram_support}`, handedOff: false };
  }
  const chatId = opts.chatId ?? null;
  const ip = opts.ip ?? null;
  if (!(await underLimit(opts.userId, chatId, ip))) {
    return { reply: am ? `ብዙ ጥያቄዎች ተልከዋል። ትንሽ ቆይተው ይሞክሩ፣ ወይም ድጋፍን ያግኙ፦ ${telegram_support}` : `That's a lot of questions for one hour. Please try again a bit later, or message support: ${telegram_support}`, handedOff: false };
  }

  const facts = await playerFacts(opts.userId);
  // Logged-in players: rebuild the conversation from our own log, so a browser
  // cannot plant fake earlier turns. Visitors: cleaned browser history only.
  const history = opts.userId ? await serverHistory(opts.userId, opts.channel) : cleanHistory(opts.history);
  let text = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: systemPrompt(facts, telegram_support, opts.lang ?? null, Boolean(opts.userId)),
        messages: [...history, { role: "user", content: question }],
      }),
    });
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  } catch (e) {
    console.error("assistant:", (e as Error).message);
    return { reply: am ? `ይቅርታ፣ አሁን መመለስ አልቻልኩም። ድጋፍን ያግኙ፦ ${telegram_support}` : `Sorry, I can't answer right now. Please message support: ${telegram_support}`, handedOff: false };
  }

  const handedOff = text.includes(ESCALATE);
  const note = text.replace(ESCALATE, "").trim();
  // A web visitor who isn't logged in can't be reached: ask them to log in instead of filing a request.
  const reachable = Boolean(opts.userId || chatId);
  const reply = handedOff
    ? reachable ? (am ? FORWARDED.am : FORWARDED.en) : am ? FORWARDED.guestAm : FORWARDED.guestEn
    : note || (am ? "ይቅርታ፣ እንደገና ይሞክሩ።" : "Sorry, please try again.");
  await createAdminClient().from("assistant_messages").insert({ user_id: opts.userId, chat_id: chatId, ip, channel: opts.channel, question, answer: handedOff ? `[handed over] ${note}` : reply, escalated: handedOff && reachable });
  if (handedOff && reachable) await handOff({ userId: opts.userId, chatId, channel: opts.channel, question, summary: note || question, history, tg: opts.telegram });
  return { reply, handedOff: handedOff && reachable };
}
