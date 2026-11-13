import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { telegramEnabled, TELEGRAM_BOT_USERNAME } from "@/lib/telegram";
import { smsEnabled } from "@/lib/sms";
import { startTelegram } from "./actions";
import { AutoRefresh, SmsForm } from "./VerifyClient";
import { Banner, Logo } from "@/components/ui";
import { SendIcon } from "@/components/icons";
import { signOut } from "../(auth)/actions";

export const metadata = { title: "Verify your phone · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ err?: string; next?: string; tg?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/verify");

  const { data: profile } = await supabase.from("profiles").select("username, phone_number, phone_verified_at").eq("id", user.id).single();
  const { err, next, tg } = await searchParams;
  const after = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (profile?.phone_verified_at) redirect(after);

  const tgOn = telegramEnabled();
  const smsOn = smsEnabled();

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stadium.webp" alt="" className="h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0912]/80 via-plum/90 to-plum" />
      </div>
      <AutoRefresh />
      <div className="w-full max-w-md space-y-8">
        <div className="text-center"><Logo size="lg" /></div>
        <div className="rounded-[2rem] border border-white/[0.07] bg-card/70 p-7 shadow-2xl shadow-black/30 backdrop-blur sm:p-9">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Last step</p>
          <h1 className="mt-1 text-2xl font-extrabold">Confirm your phone</h1>
          <p className="mt-2 text-sm text-mist">
            Hi <b className="text-white">{profile?.username}</b>! To keep GebetaSoccer fair, every player confirms their number before playing:{" "}
            <b className="text-white">{profile?.phone_number}</b>
          </p>

          {err && <div className="mt-4"><Banner kind="error">{err}</Banner></div>}
          {tg === "sent" && !err && (
            <div className="mt-4">
              <Banner kind="success">
                📩 We just messaged you in Telegram. Open the chat with <b>@{TELEGRAM_BOT_USERNAME}</b> and tap <b>Share my phone number</b>. This page continues by itself.
              </Banner>
            </div>
          )}

          <div className="mt-6 space-y-5">
            {tgOn ? (
              <div>
                <form action={startTelegram}>
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2aabee] px-6 py-4 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-[#2aabee]/25 transition hover:brightness-110">
                    <SendIcon size={18} /> Verify with Telegram
                  </button>
                </form>
                <ol className="mt-4 space-y-2 text-sm text-mist">
                  {[
                    <>Tap the button above — Telegram opens <b className="text-white">@{TELEGRAM_BOT_USERNAME}</b></>,
                    <>Tap <b className="text-white">START</b> at the bottom of the chat</>,
                    <>Tap <b className="text-white">Share my phone number</b> and confirm</>,
                    <>Come back here — this page continues by itself</>,
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2aabee]/20 text-[11px] font-bold text-[#7fd0f7]">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-center text-xs text-mist">Free · use the Telegram account with <b className="text-white">{profile?.phone_number}</b></p>
              </div>
            ) : (
              <Banner kind="error">Telegram verification is being set up. Please check back shortly.</Banner>
            )}

            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-mist/60">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>

            {smsOn ? (
              <SmsForm />
            ) : (
              <p className="rounded-2xl border border-white/10 bg-ink/50 p-4 text-center text-sm text-mist">SMS codes are coming soon.</p>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-mist">This page updates automatically once you&apos;re verified.</p>
        </div>
        <form action={signOut} className="text-center">
          <button className="text-xs text-mist underline underline-offset-2 hover:text-white">Wrong number? Sign out</button>
        </form>
      </div>
    </main>
  );
}
