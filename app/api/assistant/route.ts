/** POST /api/assistant { message, history? } → { reply, handedOff } (website help chat). */
import { NextResponse, type NextRequest } from "next/server";
import { askAssistant, type Turn } from "@/lib/assistant";
import { getAuthUser } from "@/lib/auth-user";
import { clientIp } from "@/lib/login-lock";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { message?: string; history?: Turn[]; lang?: string };
  const user = await getAuthUser();
  const history = Array.isArray(body.history)
    ? body.history.filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    : [];
  const r = await askAssistant({
    question: String(body.message ?? ""),
    history,
    userId: user?.id ?? null,
    ip: user ? null : await clientIp(),
    channel: "web",
    lang: body.lang === "am" ? "am" : "en",
  });
  return NextResponse.json(r);
}
