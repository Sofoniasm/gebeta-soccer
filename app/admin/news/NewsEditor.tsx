"use client";

import { useRef, useState, useTransition } from "react";
import { NewsBody } from "@/components/NewsBody";
import { inputClass } from "@/components/ui";
import { NEWS_COVERS, NEWS_TAGS, type NewsPost } from "@/lib/news";
import { SubmitButton } from "../SubmitButton";
import { saveNews } from "./actions";
import { translateToAmharic } from "../ai-actions";

type Mode = "publish" | "schedule" | "draft";

const TOOLS: { label: string; title: string; wrap: [string, string]; block?: boolean; sample: string }[] = [
  { label: "H", title: "Heading", wrap: ["## ", ""], block: true, sample: "Heading" },
  { label: "B", title: "Bold", wrap: ["**", "**"], sample: "bold text" },
  { label: "•", title: "Bullet list", wrap: ["- ", ""], block: true, sample: "First point\n- Second point" },
  { label: "❝", title: "Highlight / quote", wrap: ["> ", ""], block: true, sample: "Key point" },
  { label: "Link", title: "Link", wrap: ["[", "](https://)"], sample: "link text" },
  { label: "Photo", title: "Photo inside the article", wrap: ["![", "](https://)"], block: true, sample: "Caption" },
];

export function NewsEditor({
  post,
  defaultSchedule,
}: {
  post: (NewsPost & { status: "draft" | "scheduled" | "live"; scheduleValue: string }) | null;
  defaultSchedule: string;
}) {
  const [body, setBody] = useState(post?.body ?? "");
  const [preview, setPreview] = useState(false);
  const builtIn = NEWS_COVERS.some((c) => c.src === post?.cover_image);
  const [coverChoice, setCoverChoice] = useState<string>(builtIn || !post ? post?.cover_image ?? "/stadium.webp" : "/stadium.webp");
  const [coverUrl, setCoverUrl] = useState(!builtIn && post ? post.cover_image : "");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(post?.status === "draft" ? "draft" : post?.status === "scheduled" ? "schedule" : "publish");
  const area = useRef<HTMLTextAreaElement>(null);
  const [titleAm, setTitleAm] = useState(post?.title_am ?? "");
  const [excerptAm, setExcerptAm] = useState(post?.excerpt_am ?? "");
  const [bodyAm, setBodyAm] = useState(post?.body_am ?? "");
  const [amOpen, setAmOpen] = useState(Boolean(post?.title_am || post?.body_am));
  const [translating, startTranslate] = useTransition();
  const [amNote, setAmNote] = useState<{ ok: boolean; text: string } | null>(null);

  function translate() {
    const title = (document.getElementById("title") as HTMLInputElement | null)?.value ?? "";
    const excerpt = (document.getElementById("excerpt") as HTMLTextAreaElement | null)?.value ?? "";
    if (!title.trim() || !body.trim()) return setAmNote({ ok: false, text: "Write the English title and article first." });
    if ((titleAm.trim() || bodyAm.trim()) && !window.confirm("Replace the Amharic text already there?")) return;
    setAmNote(null);
    setAmOpen(true);
    startTranslate(async () => {
      const r = await translateToAmharic({ title, excerpt, body });
      if (!r.ok) return setAmNote({ ok: false, text: r.error });
      setTitleAm(r.fields.title ?? "");
      setExcerptAm(r.fields.excerpt ?? "");
      setBodyAm(r.fields.body ?? "");
      setAmNote({ ok: true, text: "Amharic filled in. Please read it before saving." });
    });
  }

  const cover = filePreview ?? (coverUrl.startsWith("https://") ? coverUrl : coverChoice);

  function applyTool(t: (typeof TOOLS)[number]) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = body.slice(s, e) || t.sample;
    let before = body.slice(0, s);
    const after = body.slice(e);
    if (t.block && before && !before.endsWith("\n\n")) before += before.endsWith("\n") ? "\n" : "\n\n";
    const insert = `${t.wrap[0]}${selected}${t.wrap[1]}`;
    const next = `${before}${insert}${t.block && after && !after.startsWith("\n") ? "\n\n" : ""}${after}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const start = before.length + t.wrap[0].length;
      el.setSelectionRange(start, start + selected.length);
    });
  }

  const label = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-mist";

  return (
    <form action={saveNews} className="space-y-5">
      {post && <input type="hidden" name="id" value={post.id} />}

      <div>
        <label className={label} htmlFor="title">Title</label>
        <input id="title" name="title" required minLength={3} maxLength={140} defaultValue={post?.title} placeholder="Arsenal vs Chelsea: who wins the London derby?" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="tag">Category</label>
          <select id="tag" name="tag" defaultValue={post?.tag ?? "News"} className={inputClass}>
            {NEWS_TAGS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="slug">Web address</label>
          <input id="slug" name="slug" defaultValue={post?.slug} placeholder="made from the title" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="excerpt">Short summary <span className="normal-case tracking-normal text-mist/60">(shown on cards and Google; leave empty to use the first lines)</span></label>
        <textarea id="excerpt" name="excerpt" rows={2} maxLength={300} defaultValue={post?.excerpt} className={`${inputClass} resize-y`} />
      </div>

      {/* Body with formatting buttons and a preview */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className={label.replace("mb-1.5 ", "")}>Article</span>
          <div className="flex rounded-full border border-white/10 p-0.5 text-[11px] font-bold uppercase tracking-wider">
            <button type="button" onClick={() => setPreview(false)} className={`rounded-full px-3 py-1 ${!preview ? "bg-lilac text-ink" : "text-mist"}`}>Write</button>
            <button type="button" onClick={() => setPreview(true)} className={`rounded-full px-3 py-1 ${preview ? "bg-lilac text-ink" : "text-mist"}`}>Preview</button>
          </div>
        </div>
        <div className={preview ? "hidden" : ""}>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TOOLS.map((t) => (
              <button key={t.title} type="button" title={t.title} onClick={() => applyTool(t)} className="min-w-9 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-white hover:border-lilac/50 hover:bg-lilac/15">
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            ref={area}
            name="body"
            required
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"Write your article here.\n\nLeave an empty line between paragraphs.\n\n## A heading\n\n- a bullet point\n- another one"}
            className={`${inputClass} resize-y font-mono text-sm leading-relaxed`}
          />
          <p className="mt-1.5 text-[11px] text-mist/70">Empty line = new paragraph · ## heading · - bullet · **bold** · &gt; highlight</p>
        </div>
        {preview && (
          <div className="space-y-4 rounded-3xl border border-white/10 bg-ink/60 p-5 text-[15px] leading-relaxed text-[#d9d5ea]">
            {body.trim() ? <NewsBody body={body} /> : <p className="text-mist">Nothing written yet.</p>}
          </div>
        )}
      </div>

      {/* Amharic */}
      <details open={amOpen} onToggle={(e) => setAmOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <summary className="cursor-pointer text-sm font-bold">አማርኛ (optional): Amharic version for /am pages</summary>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={translate} disabled={translating} className="inline-flex items-center gap-2 rounded-full border border-lilac/40 bg-lilac/10 px-4 py-2 text-xs font-bold text-white hover:bg-lilac/20 disabled:opacity-50">
              {translating ? "Translating…" : "🇪🇹 Translate to Amharic"}
            </button>
            <span className="text-[11px] text-mist/80">Leave empty to show the English article on Amharic pages.</span>
          </div>
          {amNote && <p className={`text-xs ${amNote.ok ? "text-emerald-300" : "text-rose-300"}`}>{amNote.text}</p>}
          <div>
            <label className={label} htmlFor="title_am">Title (Amharic)</label>
            <input id="title_am" name="title_am" maxLength={200} value={titleAm} onChange={(e) => setTitleAm(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={label} htmlFor="excerpt_am">Short summary (Amharic)</label>
            <textarea id="excerpt_am" name="excerpt_am" rows={2} maxLength={400} value={excerptAm} onChange={(e) => setExcerptAm(e.target.value)} className={`${inputClass} resize-y`} />
          </div>
          <div>
            <label className={label} htmlFor="body_am">Article (Amharic)</label>
            <textarea id="body_am" name="body_am" rows={12} value={bodyAm} onChange={(e) => setBodyAm(e.target.value)} className={`${inputClass} resize-y font-mono text-sm leading-relaxed`} />
          </div>
        </div>
      </details>

      {/* Cover */}
      <div>
        <span className={label}>Cover photo</span>
        <div className="grid grid-cols-[7rem_1fr] gap-3 sm:grid-cols-[10rem_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="aspect-[4/3] w-full rounded-2xl border border-white/10 object-cover" />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {NEWS_COVERS.map((c) => (
                <label key={c.src} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold ${coverChoice === c.src && !coverUrl && !filePreview ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist"}`}>
                  <input type="radio" name="cover_choice" value={c.src} checked={coverChoice === c.src} onChange={() => { setCoverChoice(c.src); setCoverUrl(""); }} className="sr-only" />
                  {c.label}
                </label>
              ))}
            </div>
            <input
              type="file"
              name="cover_file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFilePreview(f ? URL.createObjectURL(f) : null);
              }}
              className="block w-full text-xs text-mist file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
            />
            <input name="cover_url" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="or paste an image link (https://…)" className={`${inputClass} py-2 text-sm`} />
            <p className="text-[11px] text-mist/70">Upload JPG, PNG or WebP up to 3 MB. Wide photos look best.</p>
          </div>
        </div>
      </div>

      {/* When */}
      <div>
        <span className={label}>When</span>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["publish", "Publish now"],
            ["schedule", "Schedule"],
            ["draft", "Save draft"],
          ] as [Mode, string][]).map(([m, l]) => (
            <label key={m} className={`cursor-pointer rounded-2xl border px-2 py-3 text-center text-xs font-bold ${mode === m ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist"}`}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
        {mode === "schedule" && (
          <div className="mt-3">
            <input type="datetime-local" name="publish_at" defaultValue={post?.scheduleValue ?? defaultSchedule} className={inputClass} />
            <p className="mt-1 text-[11px] text-mist/70">Addis Ababa time. The article appears by itself at that time.</p>
          </div>
        )}
        {mode === "publish" && (
          <label className="mt-3 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
            <input type="checkbox" name="notify" defaultChecked={!post} className="mt-0.5 h-4 w-4 accent-[#b4a7f5]" />
            <span>
              <b className="text-white">Tell all players</b>
              <span className="block text-xs text-mist">Sends a notification in the app and a Telegram message with a button to read it.</span>
            </span>
          </label>
        )}
      </div>

      <SubmitButton className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-lilac px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
        {mode === "draft" ? "Save draft" : mode === "schedule" ? "Schedule article" : post?.status === "live" ? "Save changes" : "Publish"}
      </SubmitButton>
    </form>
  );
}
