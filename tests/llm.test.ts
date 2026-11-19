import { test } from "node:test";
import assert from "node:assert/strict";
import { geminiBody, geminiText, llmProvider } from "../lib/llm";
import { kbAnswer, kbMatches } from "../lib/kb-answer";

test("provider: Gemini first, Claude only as an option, none without keys", () => {
  assert.equal(llmProvider({}), null);
  assert.equal(llmProvider({ GEMINI_API_KEY: "g" }), "gemini");
  assert.equal(llmProvider({ ANTHROPIC_API_KEY: "a" }), "anthropic");
  assert.equal(llmProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" }), "gemini");
  assert.equal(llmProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", AI_PROVIDER: "anthropic" }), "anthropic");
  // Asking for a provider without its key falls back to the one that has a key.
  assert.equal(llmProvider({ ANTHROPIC_API_KEY: "a", AI_PROVIDER: "gemini" }), "anthropic");
});

test("Gemini body: system prompt apart, assistant turns become 'model'", () => {
  const b = geminiBody({ system: "S", messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }, { role: "user", content: "q" }], maxTokens: 700 });
  assert.deepEqual(b.systemInstruction, { parts: [{ text: "S" }] });
  assert.deepEqual(b.contents.map((c) => c.role), ["user", "model", "user"]);
  assert.ok(b.generationConfig.maxOutputTokens >= 2048);
});

test("Gemini reply: text without thoughts, clear errors otherwise", () => {
  assert.equal(geminiText({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "Answer" }] } }] }), "Answer");
  assert.throws(() => geminiText({ error: { message: "API key not valid" } }), /API key not valid/);
  assert.throws(() => geminiText({ candidates: [{ finishReason: "SAFETY" }] }), /SAFETY/);
  assert.throws(() => geminiText({}), /empty AI reply/);
});

test("guide backup answers common questions in English and Amharic", () => {
  assert.match(kbMatches("How do I withdraw my money?").join(" "), /Withdraw/);
  assert.match(kbMatches("how do I deposit / top up").join(" "), /Deposit/);
  assert.match(kbMatches("when does the round lock?").join(" "), /lock/);
  assert.match(kbMatches("ገንዘብ ማውጣት እንዴት ነው").join(" "), /Withdraw/);
  assert.match(kbMatches("What is the late night round?").join(" "), /Late night/);
  const r = kbAnswer("how do I withdraw", "en", "https://t.me/support");
  assert.ok(r && r.includes("https://t.me/support"));
  assert.equal(kbAnswer("xyzzy plugh", "en", "s"), null);
});
