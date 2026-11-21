import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { etbLabel } from "@/lib/money";
import { SubmitButton } from "../SubmitButton";
import { fundChessBot, pauseChessBot, resumeChessBot, saveChessBotSettings } from "./actions";

export const metadata = { title: "Chess bot · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const BOT_ID = "00000000-0000-4000-8000-00000000b075";

interface Settings {
  enabled: boolean;
  max_stake_units: number;
  daily_loss_limit_units: number;
  max_consecutive_losses: number;
  per_player_daily_games: number;
  join_after_seconds: number;
  paused_at: string | null;
  paused_reason: string | null;
}
interface BotGame {
  code: string;
  status: string;
  stake_units: number;
  winner_id: string | null;
  result: string | null;
  created_at: string;
  creator: { username: string } | { username: string }[] | null;
}

export default async function AdminChessBotPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdminId("/admin/chessbot");
  const sp = await searchParams;
  const admin = createAdminClient();
  const dayStart = new Date(Date.now() + 3 * 3600 * 1000);
  dayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = new Date(dayStart.getTime() - 3 * 3600 * 1000).toISOString(); // start of today, Addis Ababa time

  const [{ data: s }, { data: bot }, { data: ledger }, { data: games }] = await Promise.all([
    admin.from("house_bot_settings").select("*").eq("id", 1).single(),
    admin.from("profiles").select("balance_units").eq("id", BOT_ID).single(),
    admin.from("wallet_ledger").select("amount_units").eq("user_id", BOT_ID).not("chess_id", "is", null).gte("created_at", todayIso),
    admin.from("chess_games").select("code, status, stake_units, winner_id, result, created_at, creator:profiles!chess_games_creator_id_fkey(username)").eq("vs_bot", true).order("created_at", { ascending: false }).limit(15),
  ]);
  const set = (s ?? {}) as Settings;
  const balance = Number(bot?.balance_units ?? 0);
  const todayNet = Math.round(((ledger ?? []) as { amount_units: number }[]).reduce((a, r) => a + Number(r.amount_units), 0) * 100) / 100;
  const list = (games ?? []) as unknown as BotGame[];
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";
  const field = "w-full rounded-xl border border-white/10 bg-ink/70 px-3 py-2 text-sm text-white outline-none";

  return (
    <AppShell title="Chess House Bot" next="/admin/chessbot">
      {sp.msg && <div className="mb-4"><Banner kind="success">{sp.msg}</Banner></div>}
      {sp.err && <div className="mb-4"><Banner kind="error">{sp.err}</Banner></div>}

      <section className={`${card} mb-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${set.paused_at ? "bg-rose-400/20 text-rose-200" : set.enabled ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-mist"}`}>
            {set.paused_at ? "Paused" : set.enabled ? "On" : "Off"}
          </span>
          {set.paused_at && <span className="text-sm text-rose-200">{set.paused_reason}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
          <div className="rounded-2xl bg-ink/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Bot wallet (bank)</p>
            <p className="mt-1 text-lg font-extrabold">{balance} Units</p>
            <p className="text-xs text-mist">{etbLabel(balance)}</p>
          </div>
          <div className="rounded-2xl bg-ink/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Today (bot net)</p>
            <p className={`mt-1 text-lg font-extrabold ${todayNet < 0 ? "text-rose-200" : "text-emerald-200"}`}>{todayNet > 0 ? "+" : ""}{todayNet} Units</p>
            <p className="text-xs text-mist">stakes in play count as spent</p>
          </div>
          <div className="col-span-2 rounded-2xl bg-ink/50 p-3 sm:col-span-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Loss limit today</p>
            <p className="mt-1 text-lg font-extrabold">{set.daily_loss_limit_units} Units</p>
            <p className="text-xs text-mist">{etbLabel(Number(set.daily_loss_limit_units))}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {set.paused_at ? (
            <form action={resumeChessBot}><SubmitButton>Resume the bot</SubmitButton></form>
          ) : (
            <form action={pauseChessBot}><SubmitButton>Pause the bot</SubmitButton></form>
          )}
        </div>
        <p className="mt-3 text-xs text-mist">
          The bot is a labelled computer player (Stockfish). It only joins games that are open to anyone and have waited {set.join_after_seconds} seconds. It pays its stake from its own wallet and pays players who beat it from that wallet.
          If the wallet is too low it cannot join. After {set.max_consecutive_losses} losses in a row it pauses itself until you resume it.
        </p>
      </section>

      <section className={`${card} mb-5`}>
        <h2 className="mb-3 text-lg font-extrabold">Fund the bot wallet</h2>
        <form action={fundChessBot} className="flex gap-2">
          <input name="units" type="number" min="5" max="500" step="1" placeholder="Units, at least 5 (1 Unit = 200 ETB)" className={field} required />
          <SubmitButton>Add Units</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-mist">The bot&apos;s wallet is the house bank: only put in what you can afford to lose.</p>
      </section>

      <section className={`${card} mb-5`}>
        <h2 className="mb-3 text-lg font-extrabold">Limits</h2>
        <form action={saveChessBotSettings} className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={set.enabled} className="h-4 w-4 accent-[#9d8cff]" /> The House Bot is switched ON
          </label>
          <label className="text-xs text-mist">Largest stake the bot accepts (Units)
            <input name="max_stake_units" type="number" step="0.25" min="1" max="50" defaultValue={set.max_stake_units} className={`${field} mt-1`} />
          </label>
          <label className="text-xs text-mist">Daily loss limit (Units)
            <input name="daily_loss_limit_units" type="number" step="1" min="1" defaultValue={set.daily_loss_limit_units} className={`${field} mt-1`} />
          </label>
          <label className="text-xs text-mist">Pause after this many losses in a row
            <input name="max_consecutive_losses" type="number" step="1" min="1" max="10" defaultValue={set.max_consecutive_losses} className={`${field} mt-1`} />
          </label>
          <label className="text-xs text-mist">Games per player per day
            <input name="per_player_daily_games" type="number" step="1" min="1" max="50" defaultValue={set.per_player_daily_games} className={`${field} mt-1`} />
          </label>
          <label className="text-xs text-mist">Wait before joining (seconds)
            <input name="join_after_seconds" type="number" step="10" min="30" max="3600" defaultValue={set.join_after_seconds} className={`${field} mt-1`} />
          </label>
          <div className="sm:col-span-2"><SubmitButton>Save limits</SubmitButton></div>
        </form>
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">Recent bot games</h2>
        {list.length === 0 ? (
          <p className="text-sm text-mist">No games against the bot yet.</p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {list.map((g) => {
              const creator = Array.isArray(g.creator) ? g.creator[0]?.username : g.creator?.username;
              const outcome = g.status !== "settled" ? g.status : g.result === "draw" ? "draw" : g.winner_id === BOT_ID ? "bot won" : "bot LOST";
              return (
                <li key={g.code} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{creator ?? "?"} · {g.code}</span>
                  <span className="text-xs text-mist">{etbLabel(Number(g.stake_units))}</span>
                  <span className={`text-xs font-bold ${outcome === "bot LOST" ? "text-rose-200" : outcome === "bot won" ? "text-emerald-200" : "text-mist"}`}>{outcome}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
