import { RegisterForm } from "../AuthForms";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Create your free account",
  description: "Join GebetaSoccer with your Ethiopian phone number and start predicting this week's 10 football matches. 18+.",
  path: "/register",
});

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Join GebetaSoccer</h1>
        <p className="mt-1 text-sm text-mist">
          {safe?.startsWith("/leagues/") ? "Create your account to join your friend's league." : "Predict 10 matches a week. Top the table."}
        </p>
      </div>
      <RegisterForm next={safe} />
    </div>
  );
}
