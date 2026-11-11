import { LoginForm } from "../AuthForms";
import { Banner } from "@/components/ui";

export const metadata = { title: "Log in · GebetaSoccer" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; confirmed?: string }>;
}) {
  const { next, error, confirmed } = await searchParams;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Welcome back</h1>
      {confirmed && <Banner kind="success">Email confirmed — you can log in now.</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      <LoginForm next={next} />
    </div>
  );
}
