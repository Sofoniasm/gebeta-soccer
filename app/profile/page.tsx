import { getMe } from "@/lib/me";
import { signOut } from "@/app/(auth)/actions";
import { AppShell } from "@/components/AppShell";
import { PasswordForm } from "./PasswordForm";
import { LogOutIcon } from "@/components/icons";
import { AvatarUpload } from "./AvatarUpload";
import { DobForm } from "./DobForm";
import { ResponsiblePlay } from "./ResponsiblePlay";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LangSwitch } from "@/components/LangSwitch";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { TELEGRAM_BOT_USERNAME, telegramBotId, telegramEnabled } from "@/lib/telegram";

export const metadata = { title: "Profile & settings · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await getMe("/profile");
  const since = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Addis_Ababa" }).format(new Date(me.created_at));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";
  const supabase = await createClient();
  const { data: lim } = await supabase.rpc("get_my_play_limits").maybeSingle();
  const limits = (lim ?? {}) as { excluded_until?: string | null; deposit_limit_units?: number | null; next_units?: number | null; next_at?: string | null; deposited_7d?: number | null };
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const { data: tgRow } = await supabase.from("profiles").select("telegram_user_id").eq("id", me.id).maybeSingle();
  const tgLinked = Boolean((tgRow as { telegram_user_id?: number | null } | null)?.telegram_user_id);
  const row = "flex items-center gap-3 rounded-2xl border border-white/5 bg-ink/40 p-4 transition hover:border-lilac/40";

  return (
    <AppShell title="Profile & settings" next="/profile">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <AvatarUpload name={me.username} src={me.avatar_url} />
          <p className="mt-2 text-sm text-mist">
            Member since {since}
            {me.is_admin && <span className="ml-2 rounded-full bg-lilac/15 px-2 py-0.5 text-[10px] font-bold uppercase text-lilac-soft">Admin</span>}
          </p>
          <p className="mt-1 text-[11px] text-mist/70">Your picture is shown to other players on leaderboards and challenges. Keep it decent; the admin can remove it.</p>
          <dl className="mt-6 divide-y divide-white/5 text-sm">
            <div className="flex justify-between py-3"><dt className="text-mist">Phone</dt><dd className="font-semibold">{me.phone_number ?? "—"} {me.phone_verified_at && <span className="ml-1 rounded-full bg-emerald-300/15 px-2 py-0.5 text-[10px] font-bold text-emerald-100">Verified ✓</span>}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-mist">Email</dt><dd className="font-semibold">{me.email ?? "Not set"}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-mist">Date of birth</dt><dd className="font-semibold">{me.date_of_birth ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${me.date_of_birth}T00:00:00Z`)) : "Not added yet"}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-mist">Log in with</dt><dd className="font-semibold">Phone + password{tgLinked ? " · Telegram" : ""}</dd></div>
          </dl>
          {!me.date_of_birth && (
            <div className="mt-4 rounded-2xl border border-amber-200/30 bg-amber-200/10 p-4">
              <p className="mb-2 text-sm font-bold text-amber-50">Add your date of birth (18+ only). You can only set it once.</p>
              <DobForm />
            </div>
          )}
          <p className="mt-4 text-xs text-mist">Your confirmed phone number is your identity on GebetaSoccer. To change it, contact support on Telegram.</p>
        </section>

        <section className={card}>
          <h2 className="text-lg font-extrabold">Change password</h2>
          <div className="mt-4"><PasswordForm /></div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Telegram */}
        <section className={card}>
          <h2 className="flex items-center gap-2 text-lg font-extrabold">✈️ Telegram</h2>
          {tgLinked ? (
            <>
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-bold text-emerald-100">Connected ✓</p>
              <p className="mt-3 text-sm text-mist">
                Results, wins, wallet updates and round reminders come to your Telegram. You can also log in with one tap and play inside Telegram.
              </p>
              {TELEGRAM_BOT_USERNAME && (
                <a href={`https://t.me/${TELEGRAM_BOT_USERNAME}`} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#2aabee] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:brightness-110">
                  Open @{TELEGRAM_BOT_USERNAME}
                </a>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-mist">
                Connect Telegram to get your results and wins as messages, and to log in with one tap. Allow messages when Telegram asks.
              </p>
              {telegramEnabled() && (
                <div className="mt-4">
                  <TelegramLoginButton botId={telegramBotId()} next="/profile" label="Connect my Telegram" failedText="Telegram didn't finish. Please try again." />
                </div>
              )}
            </>
          )}
        </section>

        {/* Language */}
        <section className={card}>
          <h2 className="text-lg font-extrabold">🌐 Language</h2>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-ink/40 p-4">
            <span className="text-sm">Website</span>
            <LangSwitch />
          </div>
          <p className="mt-3 text-sm text-mist">
            Telegram bot: send <b className="text-white">/english</b> or <b className="text-white">/amharic</b> to the bot to change its language.
          </p>
        </section>
      </div>

      {/* Shortcuts */}
      <section className={`${card} mt-5`}>
        <h2 className="mb-4 text-lg font-extrabold">More</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { href: "/sales", emoji: "👥", t: "Invite friends", s: me.referral_code ? `Your code ${me.referral_code}` : "Your code and commission" },
            { href: "/premium", emoji: "⭐", t: "Gebeta Premium", s: "Crowd picks and form guide" },
            { href: "/career", emoji: "📈", t: "My career", s: "Stats, rounds and badges" },
            { href: "/certificates", emoji: "🏅", t: "Certificates", s: "Your achievements" },
            { href: "/notifications", emoji: "🔔", t: "Notifications", s: "Everything we sent you" },
            { href: "/help", emoji: "💬", t: "Help & support", s: "Questions and contact" },
            { href: "/how-to-play", emoji: "📘", t: "How to play", s: "Rules and points" },
            { href: "/terms", emoji: "📄", t: "Terms & responsible play", s: "The rules in full" },
          ].map((x) => (
            <Link key={x.href} href={x.href} className={row}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lilac/15 text-lg" aria-hidden="true">{x.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{x.t}</span>
                <span className="block truncate text-xs text-mist">{x.s}</span>
              </span>
              <span className="text-mist">→</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="responsible-play" className={`${card} mt-5 scroll-mt-24`}>
        <h2 className="text-lg font-extrabold">Responsible play</h2>
        <p className="mb-5 mt-1 text-sm text-mist">Tools to keep the game fun. Our admin will respect them; the system enforces them.</p>
        <ResponsiblePlay
          breakUntil={limits.excluded_until ?? me.excluded_until}
          limitUnits={num(limits.deposit_limit_units)}
          nextUnits={num(limits.next_units)}
          nextAt={limits.next_at ?? null}
          deposited7d={num(limits.deposited_7d) ?? 0}
        />
      </section>

      <section className={`${card} mt-5 flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <p className="text-sm text-mist">18+ only. Play responsibly — only stake what you can afford to lose.</p>
        </div>
        <form action={signOut}>
          <button className="inline-flex items-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-white/10">
            <LogOutIcon size={14} /> Sign out
          </button>
        </form>
      </section>
    </AppShell>
  );
}
