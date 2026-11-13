"use server";

import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiReady, callClaude, parseJsonObject, pickStrings } from "@/lib/ai";
import { buildPreviewFacts, type FinishedMatch } from "@/lib/preview-facts";

type Fail = { ok: false; error: string };

const FORMAT_HELP = "Formatting you may use in long text: an empty line between paragraphs, '## ' for a heading, '- ' for a bullet, **bold**, and '> ' for a highlighted line. No other markdown, no tables, no links.";

const AMHARIC_STYLE =
  "Write natural, clear Ethiopian Amharic (Ge'ez script) as a football writer in Addis Ababa would, not a word-for-word translation. Keep club, player and competition names exactly as written in English letters. Keep numbers and scores as digits (2-1).";

/** Keep the short answer inside the 20-400 character limit, cutting at a sentence end if needed. */
function fitVerdict(v: string): string {
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length <= 400) return s;
  const cut = s.slice(0, 400);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("። "));
  return end > 40 ? cut.slice(0, end + 1) : cut.slice(0, 397) + "...";
}

export type DraftResult = { ok: true; verdict: string; body: string; verdict_am: string; body_am: string; games: number } | Fail;

export async function draftPreviewWithAI(matchId: number, pickHome: number | null, pickAway: number | null): Promise<DraftResult> {
  await requireAdminId("/admin/previews");
  if (!aiReady()) return { ok: false, error: "AI is not switched on yet: add ANTHROPIC_API_KEY in Vercel and redeploy." };
  const admin = createAdminClient();
  const { data: match } = await admin.from("matches").select("id, competition, home_team, away_team, kickoff_at").eq("id", matchId).maybeSingle();
  if (!match) return { ok: false, error: "Match not found." };

  const names = [match.home_team, match.away_team].map((t: string) => `"${t.replace(/"/g, '\\"')}"`).join(",");
  const { data: rows } = await admin
    .from("matches")
    .select("home_team, away_team, actual_home_score, actual_away_score, kickoff_at, competition")
    .eq("status", "finished")
    .neq("provider", "test")
    .not("actual_home_score", "is", null)
    .not("actual_away_score", "is", null)
    .lt("kickoff_at", match.kickoff_at)
    .or(`home_team.in.(${names}),away_team.in.(${names})`)
    .order("kickoff_at", { ascending: false })
    .limit(200);
  const facts = buildPreviewFacts(match, (rows ?? []) as FinishedMatch[]);
  if (facts.games === 0) return { ok: false, error: "We have no past results for either team yet, so there is nothing true to write from. Write this one by hand." };

  const hasPick = pickHome !== null && pickAway !== null;
  const system = [
    "You draft football match previews for GebetaSoccer, a free score-prediction game in Ethiopia.",
    "STRICT RULES:",
    "1. Use ONLY the facts in the FACT SHEET. Every number you write must come from it.",
    "2. If a section says NO DATA, do not mention that topic at all.",
    "3. Never mention injuries, suspensions, line-ups, managers, transfers, weather, odds, betting, or anything not in the fact sheet. Do not guess.",
    "4. Do not write the predicted score in the text; the site adds it automatically.",
    "5. No hype words like 'guaranteed', 'sure win', 'lock'.",
    hasPick
      ? `6. The editor's tip is ${match.home_team} ${pickHome}-${pickAway} ${match.away_team}. Explain it from the facts. If the facts point the other way, say honestly that it is a bold call.`
      : "6. No tip was chosen yet. Explain what the facts suggest without naming a final score.",
    "",
    "Write:",
    "- verdict: 1 or 2 sentences, 25-45 words, the main reason, in English.",
    `- body: 120-250 words in English with '## Form' and, only if there is data, '## Head-to-head' and '## Key stat' sections. ${FORMAT_HELP}`,
    "- verdict_am and body_am: the same content in Amharic. " + AMHARIC_STYLE,
    "",
    'Reply with ONLY a JSON object: {"verdict": "...", "body": "...", "verdict_am": "...", "body_am": "..."}',
  ].join("\n");

  try {
    const text = await callClaude({ system, user: `FACT SHEET\n\n${facts.text}`, maxTokens: 3000 });
    const out = pickStrings(parseJsonObject(text), ["verdict", "body", "verdict_am", "body_am"] as const);
    if (out.verdict.length < 20) return { ok: false, error: "The AI draft came back too short. Try again." };
    return { ok: true, verdict: fitVerdict(out.verdict), body: out.body, verdict_am: fitVerdict(out.verdict_am), body_am: out.body_am, games: facts.games };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type TranslateResult = { ok: true; fields: Record<string, string> } | Fail;

const MAX_CHARS = 15000;

/** Translate the given English fields (title, excerpt, body, verdict...) to Amharic. Empty fields stay empty. */
export async function translateToAmharic(fields: Record<string, string>): Promise<TranslateResult> {
  await requireAdminId("/admin");
  if (!aiReady()) return { ok: false, error: "AI is not switched on yet: add ANTHROPIC_API_KEY in Vercel and redeploy." };
  const keys = Object.keys(fields).filter((k) => /^[a-z_]{1,20}$/.test(k)).slice(0, 6);
  const input: Record<string, string> = {};
  for (const k of keys) if (typeof fields[k] === "string" && fields[k].trim()) input[k] = fields[k].trim();
  if (Object.keys(input).length === 0) return { ok: false, error: "Write the English text first." };
  if (JSON.stringify(input).length > MAX_CHARS) return { ok: false, error: "Too long to translate in one go (max about 15,000 characters)." };

  const system = [
    "You translate football website content from English to Amharic for GebetaSoccer (Ethiopia).",
    AMHARIC_STYLE,
    "Translate meaning only: do not add, remove or change any facts, names or numbers.",
    "Keep the same formatting marks exactly where they are ('## ', '- ', '**', '> ', links like [text](url) keep the url unchanged, image lines ![..](url) keep the url).",
    "Reply with ONLY a JSON object with exactly the same keys as the input, each value translated.",
  ].join("\n");

  try {
    const text = await callClaude({ system, user: JSON.stringify(input), maxTokens: 8000 });
    const out = pickStrings(parseJsonObject(text), Object.keys(input));
    if (Object.values(out).every((v) => !v)) return { ok: false, error: "The translation came back empty. Try again." };
    if (out.verdict) out.verdict = fitVerdict(out.verdict);
    return { ok: true, fields: out };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
