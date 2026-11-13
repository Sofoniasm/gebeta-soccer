import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { Crest, dayOf, timeOf } from "@/components/MatchLine";
import { TrophyIcon, UsersIcon } from "@/components/icons";
import { Avatar } from "@/components/Avatar";
import { formatKickoff } from "@/lib/format";
import { etbLabel, unitsLabel } from "@/lib/money";
import { SITE_URL } from "@/lib/site";
import { TELEGRAM_BOT_USERNAME } from "@/lib/telegram";
import { challengePrizeUnits, type Challenge } from "@/lib/challenges";
import { myPrize, myPrizeText, playersLabel, SOLO_REFUND_MESSAGE } from "@/lib/solo";
import { CancelChallengeButton, ChallengePicksForm, ShareChallenge } from "./ChallengePlay";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Challenge ${decodeURIComponent(code).toUpperCase()} · GebetaSoccer` };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export default async function ChallengePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ created?: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase();
  const { created } = await searchParams;
  const me = await getMe(`/challenges/${code}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_challenge", { p_code: code });

  if (!data) {
    return (
      <AppShell title="Challenge" next={`/challenges/${code}`}>
        <Banner kind="error">Challenge {code} was not found. Check the link or ask your friend for the code.</Banner>
        <Link href="/challenges" className="mt-4 inline-block text-sm font-bold text-lilac">← My challenges</Link>
      </AppShell>
    );
  }

  const raw0 = data as Challenge;
  const c: Challenge = {
    ...raw0,
    stake_units: Number(raw0.stake_units),
    prize_units: num(raw0.prize_units),
    players: Number(raw0.players),
    entries: raw0.entries.map((e) => ({ ...e, points: num(e.points), payout_units: num(e.payout_units), picks: e.picks?.map((p) => ({ ...p, points: num(p.points) })) ?? null })),
  };

  const open = c.status === "open" && !c.locked;
  const full = c.max_players !== null && c.players >= c.max_players;
  const me_entry = c.entries.find((e) => e.is_me) ?? null;
  const prize = c.status === "settled" && c.prize_units !== null ? c.prize_units : challengePrizeUnits(c.stake_units, c.players);
  // A player in the challenge never sees their own stake as a prize from others.
  const mine = c.is_member && c.status === "open" ? myPrize(prize, c.stake_units, c.players - 1) : null;
  const url = `${SITE_URL}/challenges/${c.code}`;
  const tgLink = TELEGRAM_BOT_USERNAME ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=c_${c.code}` : null;
  const winners = c.entries.filter((e) => e.rank === 1 && (e.payout_units ?? 0) > 0);
  const { data: avatarRows } = await supabase.rpc("get_avatars", { p_usernames: c.entries.map((e) => e.username) });
  const avatarOf = new Map(((avatarRows ?? []) as { username: string; avatar_url: string }[]).map((a) => [a.username, a.avatar_url]));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";
  const pill =
    c.status === "settled" ? ["Finished", "bg-white/10 text-mist"] :
    c.status === "refunded" ? ["Refunded", "bg-white/10 text-mist"] :
    c.status === "cancelled" ? ["Cancelled", "bg-white/10 text-mist"] :
    c.locked ? ["Live", "bg-rose-400/15 text-rose-200"] : ["Open", "bg-lilac/20 text-lilac-soft"];

  return (
    <AppShell title="Challenge" next={`/challenges/${c.code}`}>
      <Link href="/challenges" className="mb-4 inline-block text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">← My challenges</Link>
      {created && <div className="mb-4"><Banner kind="success">Challenge created and your stake is locked. Now send the link to your friends!</Banner></div>}

      {/* Header */}
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${pill[1]}`}>{pill[0]}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{c.code} · by {c.creator}</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">{c.title}</h1>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-ink/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Stake</p>
            <p className="mt-1 text-sm font-extrabold sm:text-lg">{etbLabel(c.stake_units)}</p>
          </div>
          <div className="rounded-2xl bg-ink/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Players</p>
            <p className="mt-1 text-sm font-extrabold sm:text-lg">
              {c.is_member ? playersLabel(c.players, true) : c.players}
              {c.max_players ? <span className="text-xs font-bold text-mist">{` / ${c.max_players}`}</span> : null}
            </p>
          </div>
          <div className="rounded-2xl bg-ink/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">{c.status === "settled" ? "Paid" : "Prize"}</p>
            <p className="mt-1 text-sm font-extrabold text-lilac-soft sm:text-lg">{mine?.kind === "waiting" ? "—" : etbLabel(prize)}</p>
          </div>
        </div>
        {mine && <p className={`mt-3 text-sm font-semibold ${mine.kind === "waiting" ? "text-mist" : "text-white"}`}>{myPrizeText(mine)}</p>}
        <p className="mt-3 text-xs text-mist">
          {open
            ? `Closes at the first kickoff: ${formatKickoff(c.lock_at)}. Winner takes ${Math.round((1 - Number(c.fee_pct)) * 100)}% of all stakes; ties share.`
            : c.status === "open"
              ? "Matches under way. Scores update as results come in; the prize is paid automatically when the last match ends."
              : `Started ${formatKickoff(c.lock_at)}.`}
        </p>
      </section>

      {/* Outcome banners */}
      {c.status === "settled" && (
        <div className="mb-5">
          <Banner kind="success">
            {winners.length === 0
              ? "Challenge finished."
              : `🏆 ${winners.map((w) => (w.is_me ? "You" : w.username)).join(" & ")} won ${etbLabel(winners[0].payout_units ?? 0)}${winners.length > 1 ? " each" : ""}.`}
          </Banner>
        </div>
      )}
      {c.status === "refunded" && (
        <div className="mb-5">
          <Banner kind="success">
            {c.players <= 1
              ? c.is_member ? SOLO_REFUND_MESSAGE : "Nobody else joined, so the stake was refunded in full."
              : "Every match was called off, so every stake went back to the wallets in full."}
          </Banner>
        </div>
      )}
      {c.status === "cancelled" && <div className="mb-5"><Banner kind="success">The creator cancelled this challenge and got the stake back.</Banner></div>}

      {/* Share (members, while open) */}
      {open && c.is_member && (
        <section className={`${card} mb-5`}>
          <h2 className="mb-1 text-lg font-extrabold">Invite friends</h2>
          <p className="mb-3 text-sm text-mist">They need {etbLabel(c.stake_units)} ({unitsLabel(c.stake_units)}) in their wallet to join. Code <b className="text-white">{c.code}</b></p>
          <ShareChallenge url={url} code={c.code} title={c.title} stakeEtb={etbLabel(c.stake_units)} tgLink={tgLink} />
          {c.is_creator && c.players === 1 && (
            <div className="mt-4 border-t border-white/5 pt-4">
              <CancelChallengeButton code={c.code} />
            </div>
          )}
        </section>
      )}

      {/* Join / edit */}
      {open && !c.is_member && (
        <section className={`${card} mb-5`}>
          {full ? (
            <p className="text-sm text-mist">This challenge is full.</p>
          ) : (
            <>
              <h2 className="text-lg font-extrabold">Join this challenge</h2>
              <p className="mb-4 mt-1 text-sm text-mist">
                Enter your score for every match. {etbLabel(c.stake_units)} is taken from your wallet when you join. Your balance: <b className="text-white">{etbLabel(me.balance_units)}</b>
              </p>
              {me.phone_verified_at ? (
                <ChallengePicksForm code={c.code} matches={c.matches} myPicks={null} mode="join" stakeUnits={c.stake_units} balanceUnits={me.balance_units} />
              ) : (
                <Banner kind="error">Confirm your phone number first. <Link href="/profile" className="underline">Go to Profile</Link></Banner>
              )}
            </>
          )}
        </section>
      )}
      {open && c.is_member && (
        <section className={`${card} mb-5`}>
          <h2 className="text-lg font-extrabold">Your scores</h2>
          <p className="mb-4 mt-1 text-sm text-mist">You can change them for free until the first kickoff. Other players&apos; scores stay hidden until then.</p>
          <ChallengePicksForm code={c.code} matches={c.matches} myPicks={me_entry?.picks ?? null} mode="edit" stakeUnits={c.stake_units} balanceUnits={me.balance_units} />
        </section>
      )}

      {/* Players / standings */}
      <section className={`${card} mb-5`}>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">{c.locked ? <TrophyIcon size={18} /> : <UsersIcon size={18} />} {c.locked ? "Standings" : "Who's in"}</h2>
        <ul className="divide-y divide-white/5">
          {c.entries.map((e, i) => (
            <li key={e.username} className={`flex items-center gap-3 py-2.5 ${e.is_me ? "font-bold text-white" : ""}`}>
              <span className="w-6 text-center text-sm font-extrabold text-mist">{c.locked ? e.rank ?? i + 1 : i + 1}</span>
              <Avatar name={e.username} src={avatarOf.get(e.username)} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm">{e.username}{e.is_me && " (you)"}</span>
              {c.locked && <span className="text-sm font-extrabold">{e.points ?? 0} pts</span>}
              {(e.payout_units ?? 0) > 0 && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-bold text-emerald-200">+{etbLabel(e.payout_units ?? 0)}</span>}
            </li>
          ))}
        </ul>
      </section>

      {/* Matches with everyone's picks after the lock */}
      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">Matches</h2>
        <div className="space-y-3">
          {c.matches.map((m) => {
            const done = m.status === "finished" && m.home_score !== null;
            return (
              <div key={m.id} className="rounded-2xl border border-white/5 bg-ink/40 p-3">
                <p className="text-[11px] text-mist">
                  <b>{dayOf(m.kickoff_at)} · {timeOf(m.kickoff_at)}</b> · {m.competition}
                  {m.status === "live" && <span className="ml-2 font-bold text-rose-300">LIVE</span>}
                  {(m.status === "postponed" || m.status === "cancelled") && <span className="ml-2 font-bold text-amber-200">{m.status}: 0 points for everyone</span>}
                </p>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                    <span className="truncate text-sm font-semibold">{m.home_team}</span>
                    <Crest src={m.home_crest} name={m.home_team} size={22} />
                  </span>
                  <span className="min-w-12 rounded-xl bg-white/5 px-2 py-1 text-center text-sm font-extrabold">{done ? `${m.home_score} - ${m.away_score}` : "vs"}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <Crest src={m.away_crest} name={m.away_team} size={22} />
                    <span className="truncate text-sm font-semibold">{m.away_team}</span>
                  </span>
                </div>
                {c.locked && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.entries.map((e) => {
                      const p = e.picks?.find((x) => x.match_id === m.id);
                      if (!p) return null;
                      const pts = p.points;
                      const tone = pts === null ? "border-white/10 text-mist" : pts >= 3 ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : pts > 0 ? "border-lilac/40 bg-lilac/10 text-white" : "border-white/10 text-mist";
                      return (
                        <span key={e.username} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
                          {e.is_me ? "You" : e.username} {p.home}-{p.away}{pts !== null ? ` · ${pts}` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
