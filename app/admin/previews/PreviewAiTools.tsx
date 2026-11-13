"use client";

import { useRef, useState, useTransition } from "react";
import { draftPreviewWithAI, translateToAmharic } from "../ai-actions";

const field = (id: string) => document.getElementById(id) as HTMLTextAreaElement | null;

function setField(id: string, value: string) {
  const el = field(id);
  if (el && value) el.value = value;
}

function openAmharic() {
  const d = document.getElementById("preview-am") as HTMLDetailsElement | null;
  if (d) d.open = true;
}

/** "Draft with AI" (from our real data) and "Translate to Amharic" for the preview form. */
export function PreviewAiTools({ matchId }: { matchId: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"draft" | "translate" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function pick(name: string): number | null {
    const form = box.current?.closest("form");
    const v = (form?.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value.trim() ?? "";
    const n = Number(v);
    return v !== "" && Number.isInteger(n) && n >= 0 && n <= 20 ? n : null;
  }

  function draft() {
    const hasText = Boolean(field("verdict")?.value.trim() || field("body")?.value.trim());
    if (hasText && !window.confirm("Replace the text already in the boxes with an AI draft?")) return;
    setBusy("draft");
    setNote(null);
    start(async () => {
      const r = await draftPreviewWithAI(matchId, pick("pick_home"), pick("pick_away"));
      setBusy(null);
      if (!r.ok) return setNote({ ok: false, text: r.error });
      setField("verdict", r.verdict);
      setField("body", r.body);
      setField("verdict_am", r.verdict_am);
      setField("body_am", r.body_am);
      openAmharic();
      setNote({ ok: true, text: `Draft written from ${r.games} past results in our database. Read it, fix anything, then save. Nothing is published until you press Save.` });
    });
  }

  function translate() {
    const verdict = field("verdict")?.value ?? "";
    const body = field("body")?.value ?? "";
    if (!verdict.trim() && !body.trim()) return setNote({ ok: false, text: "Write the English short answer first." });
    const hasAm = Boolean(field("verdict_am")?.value.trim() || field("body_am")?.value.trim());
    if (hasAm && !window.confirm("Replace the Amharic text already there?")) return;
    setBusy("translate");
    setNote(null);
    start(async () => {
      const r = await translateToAmharic({ verdict, body });
      setBusy(null);
      if (!r.ok) return setNote({ ok: false, text: r.error });
      setField("verdict_am", r.fields.verdict ?? "");
      setField("body_am", r.fields.body ?? "");
      openAmharic();
      setNote({ ok: true, text: "Amharic filled in below. Please read it before saving." });
    });
  }

  const btn = "inline-flex items-center gap-2 rounded-full border border-lilac/40 bg-lilac/10 px-4 py-2 text-xs font-bold text-white hover:bg-lilac/20 disabled:opacity-50";
  return (
    <div ref={box} className="rounded-2xl border border-lilac/20 bg-lilac/5 p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={draft} disabled={pending} className={btn}>
          {busy === "draft" ? "Writing draft…" : "✨ Draft with AI"}
        </button>
        <button type="button" onClick={translate} disabled={pending} className={btn}>
          {busy === "translate" ? "Translating…" : "🇪🇹 Translate to Amharic"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-mist/80">
        The draft uses only results we hold (last 5, home/away record, goals, past meetings). It never invents injuries or news. Pick your score first and the draft explains it.
      </p>
      {note && <p className={`mt-2 text-xs ${note.ok ? "text-emerald-300" : "text-rose-300"}`}>{note.text}</p>}
    </div>
  );
}
