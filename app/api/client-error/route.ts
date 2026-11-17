/**
 * POST /api/client-error — a player's browser or the Telegram Mini App reports
 * a crash. We only write it to the server log (Vercel → Logs, search
 * "[client-error]"); nothing is stored and nothing is sent back.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cleanReport } from "@/lib/client-error";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (text.length > 6000) return new NextResponse(null, { status: 413 });
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const r = cleanReport(
    { message: String(data.message ?? ""), stack: String(data.stack ?? ""), digest: String(data.digest ?? ""), kind: String(data.kind ?? "") },
    String(data.url ?? ""),
    String(data.ua ?? req.headers.get("user-agent") ?? ""),
  );
  console.error("[client-error]", JSON.stringify(r));
  return new NextResponse(null, { status: 204 });
}
