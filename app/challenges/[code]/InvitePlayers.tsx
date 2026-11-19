"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner, inputClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";
import { formatPhone, inviteStatusText, parseInvitePhones } from "@/lib/invites";
import { inviteToChallenge } from "../actions";

export type InvitedRow = { phone: string; status: string };

const BADGE: Record<string, string> = {
  joined: "bg-emerald-400/15 text-emerald-200",
  invited: "bg-lilac/20 text-lilac-soft",
  not_on_app: "bg-amber-200/15 text-amber-100",
};
const LABEL: Record<string, string> = { joined: "Joined", invited: "Invited", not_on_app: "Not on GebetaSoccer yet" };

/** Creator only, while the challenge is open: invite players by phone number and see who was invited. */
export function InvitePlayers({ code, invited }: { code: string; invited: InvitedRow[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; rows?: { phone: string; status: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const { phones, bad } = parseInvitePhones(text);

  function send() {
    setMsg(null);
    start(async () => {
      const r = await inviteToChallenge(code, text);
      setMsg({ ok: r.ok, text: r.message, rows: r.results });
      if (r.ok) {
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <label htmlFor="inv-phones" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-mist">Phone numbers (one per line)</label>
      <textarea
        id="inv-phones"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={"0911 223 344\n0922 334 455"}
        className={`${inputClass} text-base`}
      />
      <p className="mt-1.5 text-xs text-mist">
        Players on GebetaSoccer get a notification in the app and in Telegram. Not on GebetaSoccer yet? They are told as soon as they sign up and confirm that number. Nobody pays until they join.
      </p>
      {bad.length > 0 && <p className="mt-2 text-xs text-amber-100">Not an Ethiopian mobile number: {bad.join(", ")}</p>}
      <button
        type="button"
        disabled={pending || phones.length === 0 || bad.length > 0}
        onClick={send}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-lilac px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-ink hover:bg-lilac-soft disabled:opacity-40"
      >
        {pending && <SpinnerIcon size={14} />} Send invite{phones.length > 1 ? "s" : ""}{phones.length ? ` (${phones.length})` : ""}
      </button>
      {msg && (
        <div className="mt-3">
          <Banner kind={msg.ok ? "success" : "error"}>{msg.text}</Banner>
          {msg.ok && msg.rows && msg.rows.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-mist">
              {msg.rows.map((r) => (
                <li key={r.phone}><b className="text-white">{formatPhone(r.phone)}</b>: {inviteStatusText(r.status)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {invited.length > 0 && (
        <div className="mt-5 border-t border-white/5 pt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mist">Invited so far</p>
          <ul className="divide-y divide-white/5">
            {invited.map((i) => (
              <li key={i.phone} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{formatPhone(i.phone)}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE[i.status] ?? "bg-white/10 text-mist"}`}>{LABEL[i.status] ?? i.status}</span>
              </li>
            ))}
          </ul>
          {invited.some((i) => i.status === "not_on_app") && (
            <p className="mt-2 text-xs text-mist">Send the link above to the ones who are not on GebetaSoccer yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
