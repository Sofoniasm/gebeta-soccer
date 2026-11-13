/** POST /api/assistant { message, history? } → { reply, handedOff } (website help chat). */
import { NextResponse, type NextRequest } from "next/server";
import { askAssistant } from "@/lib/assistant";
import { cleanHistory } from "@/lib/assistant-prompt";
import { getAuthUser } from "@/lib/auth-user";
import { clientIp } from "@/lib/login-lock";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { message?: string; history?: unknown; lang?: string };
  const user = await getAuthUser();
  // Whose data the assistant sees comes ONLY from the session cookie, never the body.
  const history = cleanHistory(body.history);
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
