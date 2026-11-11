import { getMe } from "@/lib/me";
import { signOut } from "@/app/(auth)/actions";
import { AppShell } from "@/components/AppShell";
import { LogoMark } from "@/components/ui";
import { PasswordForm } from "./PasswordForm";
import { LogOutIcon } from "@/components/icons";

export const metadata = { title: "Profile · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await getMe("/profile");
  const since = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Addis_Ababa" }).format(new Date(me.created_at));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  return (
    <AppShell title="Profile" next="/profile">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-lilac to-[#6c5fb3] text-2xl font-extrabold text-ink">
              {me.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="text-xl font-extrabold">{me.username}</p>
              <p className="text-sm text-mist">Member since {since}</p>
              {me.is_admin && <span className="mt-1 inline-block rounded-full bg-lilac/15 px-2 py-0.5 text-[10px] font-bold uppercase text-lilac-soft">Admin</span>}
            </div>
          </div>
          <dl className="mt-6 divide-y divide-white/5 text-sm">
            <div className="flex justify-between py-3"><dt className="text-mist">Phone</dt><dd className="font-semibold">{me.phone_number ?? "—"}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-mist">Email</dt><dd className="font-semibold">{me.email ?? "Not set"}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-mist">Log in with</dt><dd className="font-semibold">Username or phone</dd></div>
          </dl>
          <p className="mt-4 text-xs text-mist">To change your phone number, contact support on Telegram — it&apos;s linked to your deposits.</p>
        </section>

        <section className={card}>
          <h2 className="text-lg font-extrabold">Change password</h2>
          <div className="mt-4"><PasswordForm /></div>
        </section>
      </div>

      <section className={`${card} mt-5 flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <LogoMark className="h-10 w-10" tile />
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
