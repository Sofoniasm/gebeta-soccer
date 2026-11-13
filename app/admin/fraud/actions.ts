"use server";

import { requireAdminId } from "@/lib/admin";
import { aiReady, callClaude } from "@/lib/ai";
import { runFraudWatch } from "@/lib/fraud-watch";

/** One-sentence plain summary of why an account was flagged, written only from the rule findings. */
export async function summarizeFlag(userId: string): Promise<{ ok: boolean; text: string }> {
  await requireAdminId("/admin/fraud");
  if (!aiReady()) return { ok: false, text: "AI is off: add ANTHROPIC_API_KEY in Vercel." };
  const { flagged } = await runFraudWatch();
  const f = flagged.find((x) => x.user.id === userId);
  if (!f) return { ok: false, text: "This account is no longer flagged." };
  const facts = [
    `Player: ${f.user.username}`,
    `Money (last 180 days, Units): deposits ${f.facts.deposits}, bonuses ${f.facts.bonuses}, spent on rounds/Premium ${f.facts.played}, winnings ${f.facts.won}, withdrawals asked ${f.facts.withdrawn}`,
    "Findings:",
    ...f.flags.map((x) => `- [${x.severity}] ${x.rule}: ${x.reason}`),
  ].join("\n");
  try {
    const text = await callClaude({
      system:
        "You help the admin of GebetaSoccer, a football prediction game in Ethiopia, review accounts. Write ONE plain English sentence (max 35 words) saying why this account deserves a look, using only the findings given. Name the strongest signal first. Say 'may' or 'looks like', never accuse. Note if the only signal is a shared IP, since mobile networks share IPs. No advice, no extra facts.",
      user: facts,
      maxTokens: 150,
    });
    return { ok: true, text: text.split("\n")[0] };
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
}
