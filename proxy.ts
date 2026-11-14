import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static files, the cron endpoint and the webhooks.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/sync-matches|api/telegram/webhook|api/aurapay/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
