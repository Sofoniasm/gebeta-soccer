/**
 * Small helper for one-off Claude calls from admin tools (drafts, translation).
 * Server-only: uses ANTHROPIC_API_KEY, which must never reach the browser.
 */

const MODEL = process.env.ADMIN_AI_MODEL || process.env.ASSISTANT_MODEL || "claude-haiku-5-5";

export function aiReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function callClaude(opts: { system: string; user: string; maxTokens?: number }): Promise<string> {
  if (!aiReady()) throw new Error("ANTHROPIC_API_KEY is not set in Vercel.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `AI error (HTTP ${res.status})`);
  return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
}

/** Pull the first JSON object out of a reply (tolerates ```json fences or a stray sentence). */
export function parseJsonObject<T = Record<string, unknown>>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI reply was not in the expected format. Try again.");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

/** Keep only string fields we asked for, trimmed. */
export function pickStrings<K extends string>(obj: Record<string, unknown>, keys: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = typeof obj[k] === "string" ? (obj[k] as string).trim() : "";
  return out;
}
