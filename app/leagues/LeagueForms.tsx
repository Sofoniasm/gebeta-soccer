"use client";

import { useActionState, useState } from "react";
import { createLeague, joinLeague, type LeagueFormState } from "./actions";
import { Banner, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { CheckIcon, SendIcon, SpinnerIcon } from "@/components/icons";

const ETB = 200;

export function CreateLeagueForm({ rounds, balance }: { rounds: { id: number; name: string }[]; balance: number }) {
  const [state, action, pending] = useActionState<LeagueFormState, FormData>(createLeague, undefined);
  const [type, setType] = useState<"free" | "paid">("free");
  const [fee, setFee] = useState("5");
  const feeN = Number(fee) || 0;

  if (rounds.length === 0) {
    return <p className="text-sm text-mist">There&apos;s no open round right now. Leagues can be created when the next round opens.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      {state?.message && <Banner kind={state.ok ? "success" : "error"}>{state.message}</Banner>}
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-mist">League name</span>
        <input name="name" required minLength={3} maxLength={40} placeholder="e.g. The Boys" className={inputClass} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-mist">Round (its 10 matches)</span>
        <select name="roundId" className={inputClass} defaultValue={rounds[0].id}>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <input type="hidden" name="type" value={type} />
      <div className="grid grid-cols-2 gap-2">
        {(["free", "paid"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-2xl border p-3 text-left transition ${
              type === t ? "border-lilac bg-lilac/15" : "border-white/10 bg-ink/40 hover:border-white/25"
            }`}
          >
            <span className="block text-sm font-extrabold">{t === "free" ? "Free league" : "Paid league"}</span>
            <span className="block text-xs text-mist">{t === "free" ? "Just for bragging rights" : "Everyone pays · winner takes 70%"}</span>
          </button>
        ))}
      </div>

      {type === "paid" && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-ink/40 p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-mist">Entry fee per player (5–50 Units)</span>
            <input
              name="fee"
              type="number"
              min={5}
              max={50}
              step={1}
              value={fee}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFee(e.target.value)}
              className={`${inputClass} text-xl font-extrabold`}
            />
          </label>
          <p className="text-xs text-mist">
            = <b className="text-white">{(feeN * ETB).toLocaleString("en-US")} ETB</b> each. With 10 friends the winner gets{" "}
            <b className="text-emerald-200">{(feeN * 10 * 0.7 * ETB).toLocaleString("en-US")} ETB</b> (70% of the pot).
          </p>
          <p className="text-xs text-mist">
            {balance >= feeN
              ? `Your fee is taken from your wallet now (you have ${balance} Units).`
              : `You have ${balance} Units — you'll be in as soon as the admin confirms your payment on Telegram.`}
          </p>
        </div>
      )}

      <button disabled={pending} className={primaryButtonClass}>
        {pending && <SpinnerIcon size={16} />} Create league
      </button>
    </form>
  );
}

export function JoinLeagueBox({
  code,
  fee,
  balance,
  status,
}: {
  code: string;
  fee: number;
  balance: number;
  status: "none" | "pending" | "rejected";
}) {
  const [state, action, pending] = useActionState<LeagueFormState, FormData>(joinLeague, undefined);
  const isPending = status === "pending" || (state?.ok && !!state.message);

  if (isPending) {
    return (
      <div className="space-y-2 rounded-2xl border border-amber-200/30 bg-amber-200/10 p-4 text-sm">
        <p className="font-bold text-amber-50">⏳ Waiting for payment confirmation</p>
        <p className="text-mist">
          Send <b className="text-white">{(fee * ETB).toLocaleString("en-US")} ETB</b> to the admin on Telegram and mention code{" "}
          <b className="text-white">{code}</b>. You&apos;ll get a notification as soon as you&apos;re in.
        </p>
        {balance >= fee && (
          <form action={action}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="pay" value="wallet" />
            <button disabled={pending} className={`${secondaryButtonClass} mt-1`}>
              {pending && <SpinnerIcon size={14} />} Or pay {fee} Units from my wallet now
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state?.message && !state.ok && <Banner kind="error">{state.message}</Banner>}
      {status === "rejected" && <Banner kind="error">Your last request wasn&apos;t approved. You can ask again.</Banner>}
      {fee === 0 ? (
        <form action={action}>
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="pay" value="wallet" />
          <button disabled={pending} className={primaryButtonClass}>
            {pending ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />} Join free league
          </button>
        </form>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <form action={action}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="pay" value="wallet" />
            <button disabled={pending || balance < fee} className={`${primaryButtonClass} w-full`}>
              {pending && <SpinnerIcon size={16} />} Pay {fee} Units &amp; join
            </button>
            <p className="mt-1 text-center text-[11px] text-mist">
              {balance >= fee ? `From your wallet (${balance} Units)` : `You have ${balance} Units`}
            </p>
          </form>
          <form action={action}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="pay" value="request" />
            <button disabled={pending} className={`${secondaryButtonClass} w-full justify-center`}>
              <SendIcon size={14} /> Request to join
            </button>
            <p className="mt-1 text-center text-[11px] text-mist">Pay {(fee * ETB).toLocaleString("en-US")} ETB to the admin on Telegram</p>
          </form>
        </div>
      )}
    </div>
  );
}

export function CopyInvite({ url, code, name }: { url: string; code: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const share = `Join my GebetaSoccer league “${name}” — predict the scores and beat me! ${url} (code ${code})`;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input readOnly value={url} className={`${inputClass} text-sm`} onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()} />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard blocked: the field is selectable */
            }
          }}
          className={`${secondaryButtonClass} shrink-0`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <a
        href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(share)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2aabee] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white hover:brightness-110"
      >
        <SendIcon size={14} /> Share on Telegram
      </a>
    </div>
  );
}
