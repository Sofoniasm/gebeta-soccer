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
import { ASSISTANT_KB } from "@/lib/assistant-kb";
import { formatUnits } from "@/lib/money";

export type Channel = "web" | "telegram";
export interface Turn { role: "user" | "assistant"; content: string }

const MODEL = process.env.ASSISTANT_MODEL || "claude-haiku-5-5";
const ESCALATE = "[[HANDOFF]]";
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

function systemPrompt(facts: string, support: string, lang: "en" | "am" | null) {
  return `You are the GebetaSoccer help assistant, inside the website and the Telegram bot.

Answer only questions about using GebetaSoccer, from the HELP below and the PLAYER facts. Be short and friendly: a few sentences or a short numbered list of steps. Reply in the language the person writes in (Amharic or English)${lang === "am" ? "; this person prefers Amharic" : ""}. Use Ethiopian time.

Rules:
- Never invent features, prices, dates or rules that are not in the HELP. If you don't know, say so and offer a person.
- Never give betting tips, predict scores, say who will win, or encourage betting more. If asked, explain you can't, and mention the free form blocks on the pick cards.
- Never ask for or accept passwords, reset codes or PINs. If someone shares one, tell them to change it.
- Never promise a payment, refund, deposit or bonus, and never say money "has been sent": only the admin does that.
- Hand over to a person when: money is missing or wrong (deposit not added, withdrawal late, wrong payout), a dispute about results, a locked or hacked account, a request to change a phone number or birth date, a complaint, or anything you can't solve from the HELP. Then tell them a person from GebetaSoccer will contact them (usually on Telegram), that they can also message ${support}, and end your reply with ${ESCALATE} on its own line.
- If they seem to be losing control (chasing losses, borrowing to play), kindly point them to Take a break and the deposit limit on the Profile page.
- Plain text only (no markdown tables).

PLAYER
${facts}

HELP
${ASSISTANT_KB}`;
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

async function emailSupport(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_EMAIL;
  if (!key || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.SUPPORT_EMAIL_FROM || "GebetaSoccer <onboarding@resend.dev>", to: [to], subject, text }),
    });
  } catch (e) {
    console.error("support email:", (e as Error).message);
  }
}

/** Create a support request and tell every admin. */
async function handOff(opts: { userId: string | null; chatId: number | null; channel: Channel; question: string; summary: string }) {
  const admin = createAdminClient();
  const { data: req } = await admin
    .from("support_requests")
    .insert({ user_id: opts.userId, chat_id: opts.chatId, channel: opts.channel, question: opts.question.slice(0, 2000), summary: opts.summary.slice(0, 1000) })
    .select("id")
    .single();
  const { data: who } = opts.userId ? await admin.from("profiles").select("username, phone_number").eq("id", opts.userId).single() : { data: null };
  const name = who ? `${who.username} (${who.phone_number ?? "no phone"})` : opts.chatId ? `Telegram chat ${opts.chatId}` : "A visitor";
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  const body = `${name} via ${opts.channel}: "${opts.question.slice(0, 220)}"`;
  if (admins?.length) {
    await admin.from("notifications").insert(
      admins.map((a: { id: string }) => ({ user_id: a.id, kind: "admin", title: `🆘 Support request #${req?.id ?? ""}`, body, link: "/admin/support" })),
    );
    await pushNotifications();
  }
  await emailSupport(`GebetaSoccer support request #${req?.id ?? ""}`, `${body}\n\nAssistant's reply:\n${opts.summary}\n\nOpen: https://www.gebetasoccer.com/admin/support`);
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
  const history = (opts.history ?? []).slice(-8).map((t) => ({ role: t.role, content: t.content.slice(0, 1500) }));
  let text = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: systemPrompt(facts, telegram_support, opts.lang ?? null),
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
  const reply = text.replace(ESCALATE, "").trim() || (am ? "ይቅርታ፣ እንደገና ይሞክሩ።" : "Sorry, please try again.");
  await createAdminClient().from("assistant_messages").insert({ user_id: opts.userId, chat_id: chatId, ip, channel: opts.channel, question, answer: reply, escalated: handedOff });
  if (handedOff) await handOff({ userId: opts.userId, chatId, channel: opts.channel, question, summary: reply });
  return { reply, handedOff };
}
