/**
 * POST /api/aurapay/webhook — AuraPay Global tells us an invoice was paid or expired.
 * Give AuraPay this URL: <site>/api/aurapay/webhook
 * Checks: X-AuraPay-Signature = sha256=HMAC(AURAPAY_WEBHOOK_SECRET, raw body),
 * X-AuraPay-Timestamp within 5 minutes. Credits the Units once (crypto_credit_deposit, 0042).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { timestampFresh, verifyAuraPaySignature } from "@/lib/crypto-pay";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyAuraPaySignature(raw, req.headers.get("x-aurapay-signature"), process.env.AURAPAY_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }
  if (!timestampFresh(req.headers.get("x-aurapay-timestamp"))) {
    return NextResponse.json({ ok: false, error: "old timestamp" }, { status: 401 });
  }

  let ev: { event_id?: string; event?: string; referenceCode?: string; amount?: number | string; txHash?: string };
  try {
    ev = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const ref = String(ev.referenceCode ?? "");
  if (!/^PR-[A-Za-z0-9]+$/.test(ref)) return NextResponse.json({ ok: true, ignored: "no reference" });

  const admin = createAdminClient();
  const { data: dep } = await admin.from("crypto_deposits").select("id, user_id, units, usd").eq("reference", ref).maybeSingle();
  if (!dep) return NextResponse.json({ ok: true, ignored: "not a GebetaSoccer deposit" }); // e.g. another AuraPay invoice

  if (ev.event === "payment.expired") {
    await admin.from("crypto_deposits").update({ status: "expired" }).eq("id", dep.id).eq("status", "pending");
    return NextResponse.json({ ok: true });
  }
  if (ev.event !== "payment.confirmed") return NextResponse.json({ ok: true, ignored: ev.event ?? "no event" });

  const { data: result, error } = await admin.rpc("crypto_credit_deposit", {
    p_reference: ref,
    p_paid: Number(ev.amount),
    p_tx_hash: String(ev.txHash ?? ""),
    p_event_id: String(ev.event_id ?? ""),
    p_admin_id: null,
  });
  if (error) {
    console.error("[aurapay] credit error:", error.message);
    return NextResponse.json({ ok: false, error: "credit failed" }, { status: 500 }); // AuraPay retries
  }
  const r = String(result);
  try {
    // "credited": the database already tells the player ("💰 Deposit received").
    if (r.startsWith("not credited")) {
      const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
      const rows = ((admins ?? []) as { id: string }[]).map((a) => ({
        user_id: a.id,
        kind: "admin",
        title: "⚠️ Crypto payment not added",
        body: `${ref}: ${dep.usd} USDT was paid but the Units were not added (${r.replace("not credited: ", "")}). Check Admin → Deposits.`,
        link: "/admin/deposits",
      }));
      rows.push({
        user_id: dep.user_id,
        kind: "deposit",
        title: "⏳ We received your crypto payment",
        body: "Our team is checking it and will add your Units soon. You don't need to pay again.",
        link: "/wallet",
      });
      await admin.from("notifications").insert(rows);
    }
    await pushNotifications();
  } catch (e) {
    console.error("[aurapay] notify:", (e as Error).message); // the deposit itself is already saved
  }
  return NextResponse.json({ ok: true, result: r });
}
