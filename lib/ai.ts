/**
 * Small helper for one-off AI calls from admin tools (drafts, translation, summaries).
 * Uses lib/llm: Gemini when GEMINI_API_KEY is set, otherwise Claude. Server only.
 */
import { generate, llmReady } from "@/lib/llm";

export function aiReady(): boolean {
  return llmReady();
}

/** Kept under its old name so the admin tools need no change; any provider. */
export async function callClaude(opts: { system: string; user: string; maxTokens?: number }): Promise<string> {
  return generate({ system: opts.system, messages: [{ role: "user", content: opts.user }], maxTokens: opts.maxTokens ?? 1500, timeoutMs: 60_000 });
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
