import { RegisterForm } from "../AuthForms";

export const metadata = { title: "Create account · GebetaSoccer" };

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
