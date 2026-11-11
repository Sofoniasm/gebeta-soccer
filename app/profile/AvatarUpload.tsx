"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SpinnerIcon } from "@/components/icons";
import { removeAvatar, uploadAvatar } from "./actions";

/** Shrinks the photo to a 320×320 square on the phone (saves data), then uploads it. */
async function squareJpeg(file: File, size = 320): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a picture we can read."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the picture."))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarUpload({ name, src }: { name: string; src: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    start(async () => {
      try {
        const blob = await squareJpeg(file);
        setPreview(URL.createObjectURL(blob));
        const fd = new FormData();
        fd.append("photo", blob, "avatar.jpg");
        const r = await uploadAvatar(fd);
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => input.current?.click()} className="relative rounded-full" aria-label="Change profile picture">
        <Avatar name={name} src={preview ?? src} size={72} />
        <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-lilac text-xs text-ink ring-2 ring-[#1a1530]">
          {pending ? <SpinnerIcon size={12} className="animate-spin" /> : "📷"}
        </span>
      </button>
      <div className="min-w-0">
        <p className="truncate text-xl font-extrabold">{name}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-wider">
          <button type="button" onClick={() => input.current?.click()} className="text-lilac hover:text-lilac-soft">
            {src ? "Change photo" : "Upload photo"}
          </button>
          {src && !pending && (
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  const r = await removeAvatar();
                  setPreview(null);
                  setMsg({ ok: r.ok, text: r.message });
                  router.refresh();
                })
              }
              className="text-mist hover:text-white"
            >
              Remove
            </button>
          )}
        </div>
        {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-200" : "text-rose-200"}`}>{msg.text}</p>}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
