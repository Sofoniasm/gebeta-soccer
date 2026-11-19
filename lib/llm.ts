/**
 * One place for every AI call (help chat, AI previews, quiz drafts, Fraud Watch).
 * Server only: the keys must never reach the browser.
 *
 *  - Google Gemini when GEMINI_API_KEY is set (default),
 *  - Anthropic Claude when only ANTHROPIC_API_KEY is set,
 *  - AI_PROVIDER=gemini|anthropic picks one when both are set.
 * Models: GEMINI_MODEL (default "gemini-flash-latest", Google's alias for its
 * newest Flash model, so it never goes out of date) / ASSISTANT_MODEL for Claude.
 */
export type Turn = { role: "user" | "assistant"; content: string };
export type Provider = "gemini" | "anthropic";

const GEMINI_DEFAULT = "gemini-flash-latest";
const CLAUDE_DEFAULT = "claude-haiku-5-5";

export function llmProvider(env: Record<string, string | undefined> = process.env): Provider | null {
  const want = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (want === "gemini" && env.GEMINI_API_KEY) return "gemini";
  if ((want === "anthropic" || want === "claude") && env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export const llmReady = () => llmProvider() !== null;

/** The Gemini request body (pure, so it can be tested). */
export function geminiBody(opts: { system: string; messages: Turn[]; maxTokens: number }) {
  return {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    // Newer Flash models may "think" first, which also uses output tokens: leave room for the answer.
    generationConfig: { maxOutputTokens: Math.max(2048, opts.maxTokens * 3), temperature: 0.4 },
  };
}

/** Text out of a Gemini reply (pure). Throws with Google's own reason when there is none. */
export function geminiText(data: {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}): string {
  if (data.error?.message) throw new Error(data.error.message);
  const c = data.candidates?.[0];
  const text = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error(`empty AI reply (${data.promptFeedback?.blockReason ?? c?.finishReason ?? "no candidates"})`);
  return text;
}

/** Ask the AI. Throws on any failure (callers have their own fallback). */
export async function generate(opts: { system: string; messages: Turn[]; maxTokens?: number; timeoutMs?: number }): Promise<string> {
  const provider = llmProvider();
  if (!provider) throw new Error("No AI key: set GEMINI_API_KEY (or ANTHROPIC_API_KEY) in Vercel.");
  const maxTokens = opts.maxTokens ?? 1500;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
  try {
    if (provider === "gemini") {
      const model = (process.env.GEMINI_MODEL || GEMINI_DEFAULT).trim();
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" },
        body: JSON.stringify(geminiBody({ system: opts.system, messages: opts.messages, maxTokens })),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: { message?: string } }).error?.message ?? `Gemini error (HTTP ${res.status})`);
      return geminiText(data);
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ASSISTANT_MODEL || CLAUDE_DEFAULT, max_tokens: maxTokens, system: opts.system, messages: opts.messages }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message ?? `Claude error (HTTP ${res.status})`);
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (!text) throw new Error("empty AI reply");
    return text;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("AI took too long to answer");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
