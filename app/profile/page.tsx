import { getMe } from "@/lib/me";
import { signOut } from "@/app/(auth)/actions";
import { AppShell } from "@/components/AppShell";
import { PasswordForm } from "./PasswordForm";
import { LogOutIcon } from "@/components/icons";
import { AvatarUpload } from "./AvatarUpload";
import { DobForm } from "./DobForm";

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
            <div className="flex justify-between py-3"><dt className="text-mist">Log in with</dt><dd className="font-semibold">Phone number + password</dd></div>
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
