"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crest, dayOf, timeOf } from "@/components/MatchLine";
import { Banner, inputClass, secondaryButtonClass } from "@/components/ui";
import { SendIcon, SpinnerIcon } from "@/components/icons";
import { etbLabel } from "@/lib/money";
import type { ChallengeMatch, ChallengePick } from "@/lib/challenges";
import { cancelChallenge, joinChallenge, saveChallengePicks } from "../actions";
import { PropPicker, effectivePropPick } from "@/components/PropPicker";
import { propsComplete, type PropKey, type PropPick } from "@/lib/challenge-props";

type Score = { home: string; away: string };

function ScoreBox({ value, label, disabled, onChange }: { value: string; label: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onFocus={(e) => e.target.select()}
      placeholder="–"
      className="h-12 w-12 rounded-2xl border border-white/15 bg-ink text-center text-xl font-extrabold text-white outline-none focus:border-lilac focus:ring-2 focus:ring-lilac/25 disabled:opacity-50"
    />
  );
}

/** Join form (new player) or edit form (already in), until the first kickoff. */
export function ChallengePicksForm({
  code,
  matches,
  myPicks,
  mode,
  stakeUnits,
  balanceUnits,
  props = [],
}: {
  code: string;
  props?: PropKey[];
  matches: ChallengeMatch[];
  myPicks: ChallengePick[] | null;
  mode: "join" | "edit";
  stakeUnits: number;
  balanceUnits: number;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<number, Score>>(() => {
    const s: Record<number, Score> = {};
    for (const m of matches) {
      const p = myPicks?.find((x) => x.match_id === m.id);
      s[m.id] = { home: p ? String(p.home) : "", away: p ? String(p.away) : "" };
    }
    return s;
  });
  const [extra, setExtra] = useState<Record<number, PropPick>>(() => {
    const x: Record<number, PropPick> = {};
    for (const m of matches) {
      const p = myPicks?.find((y) => y.match_id === m.id);
      x[m.id] = { btts: p?.btts ?? undefined, over25: p?.over25 ?? undefined, ht: p?.ht ?? undefined };
    }
    return x;
  });
  const effOf = (id: number) => effectivePropPick(extra[id] ?? {}, scores[id].home, scores[id].away);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const missing = matches.filter((m) => scores[m.id].home === "" || scores[m.id].away === "" || !propsComplete(props, effOf(m.id))).length;
  const enough = mode === "edit" || balanceUnits >= stakeUnits;

  function submit() {
    setMsg(null);
    const picks = matches.map((m) => ({ matchId: m.id, home: Number(scores[m.id].home), away: Number(scores[m.id].away), ...(props.length ? effOf(m.id) : {}) }));
    start(async () => {
      const r = mode === "join" ? await joinChallenge(code, picks) : await saveChallengePicks(code, picks);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <div key={m.id} className="rounded-2xl border border-white/5 bg-card/50 px-3 py-3">
          <p className="text-[11px] text-mist">
            <b>{dayOf(m.kickoff_at)} · {timeOf(m.kickoff_at)}</b> · {m.competition}
          </p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span className="flex min-w-0 items-center justify-end gap-2 text-right">
              <span className="truncate text-sm font-semibold">{m.home_team}</span>
              <Crest src={m.home_crest} name={m.home_team} size={24} />
            </span>
            <span className="flex items-center gap-1.5">
              <ScoreBox value={scores[m.id].home} label={`${m.home_team} score`} onChange={(v) => setScores((s) => ({ ...s, [m.id]: { ...s[m.id], home: v } }))} />
              <span className="text-mist">:</span>
              <ScoreBox value={scores[m.id].away} label={`${m.away_team} score`} onChange={(v) => setScores((s) => ({ ...s, [m.id]: { ...s[m.id], away: v } }))} />
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <Crest src={m.away_crest} name={m.away_team} size={24} />
              <span className="truncate text-sm font-semibold">{m.away_team}</span>
            </span>
          </div>
          <PropPicker
            props={props}
            value={extra[m.id] ?? {}}
            home={scores[m.id].home}
            away={scores[m.id].away}
            homeTeam={m.home_team}
            awayTeam={m.away_team}
            onChange={(v) => setExtra((x) => ({ ...x, [m.id]: v }))}
          />
        </div>
      ))}

      {msg && <Banner kind={msg.ok ? "success" : "error"}>{msg.text}</Banner>}
      {!enough && (
        <div className="rounded-2xl border border-amber-200/30 bg-amber-200/10 p-4 text-sm text-amber-50">
          You need {etbLabel(stakeUnits - balanceUnits)} more to join. Send it to our Telegram admin; once it is in your wallet, come back to this link. <Link href="/wallet" className="font-bold underline">Wallet</Link>
        </div>
      )}
      <button
        type="button"
        disabled={pending || missing > 0 || !enough}
        onClick={submit}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-lilac px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-ink disabled:opacity-40"
      >
        {pending && <SpinnerIcon size={16} className="animate-spin" />}
        {missing > 0 ? `${missing} match${missing === 1 ? "" : "es"} not finished` : mode === "join" ? `Join & pay ${etbLabel(stakeUnits)}` : "Save my picks"}
      </button>
    </div>
  );
}

export function ShareChallenge({ url, code, title, stakeEtb, tgLink }: { url: string; code: string; title: string; stakeEtb: string; tgLink: string | null }) {
  const [copied, setCopied] = useState(false);
  const text = `⚽ I challenge you on GebetaSoccer: “${title}”. Stake ${stakeEtb}. Predict the scores and beat me! Code ${code}${tgLink ? `\nPlay inside Telegram: ${tgLink}` : ""}`;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input readOnly value={url} className={`${inputClass} text-sm`} onFocus={(e) => e.target.select()} />
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
        href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2aabee] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white hover:brightness-110"
      >
        <SendIcon size={14} /> Share on Telegram
      </a>
    </div>
  );
}

export function CancelChallengeButton({ code }: { code: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="text-xs font-bold uppercase tracking-wider text-rose-200 hover:text-rose-100">
        Cancel challenge
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-sm">
      <span className="font-semibold text-amber-50">Cancel and get your stake back?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await cancelChallenge(code);
            if (!r.ok) setErr(r.message);
            else router.refresh();
          })
        }
        className="rounded-full bg-lilac px-4 py-1.5 text-xs font-extrabold uppercase text-ink"
      >
        Yes
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-bold uppercase text-white">
        No
      </button>
      {err && <span className="w-full text-xs text-rose-200">{err}</span>}
    </div>
  );
}
