/**
 * POST /api/nowpayments/ipn — NOWPayments tells us a payment changed status.
 * Its address is sent with every invoice (lib/nowpayments.ts), so nothing to set in the dashboard
 * except the IPN secret. Check: x-nowpayments-sig = HMAC-SHA512(NOWPAYMENTS_IPN_SECRET, JSON with sorted keys).
 * Units are added only for "finished" payments of the full price (crypto_credit_deposit, 0042/0043).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { nowPaymentsAction, verifyNowPaymentsSignature, type NowPaymentsIpn } from "@/lib/crypto-pay";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let ipn: NowPaymentsIpn;
  try {
    ipn = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!verifyNowPaymentsSignature(ipn, req.headers.get("x-nowpayments-sig"), process.env.NOWPAYMENTS_IPN_SECRET)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  const invoiceId = ipn.invoice_id != null ? String(ipn.invoice_id) : "";
  const orderId = String(ipn.order_id ?? "");
  const admin = createAdminClient();
  const depId = /^gs-dep-(\d+)$/.exec(orderId)?.[1];
  let q = admin.from("crypto_deposits").select("id, user_id, units, usd, reference, status").eq("provider", "nowpayments");
  q = invoiceId ? q.eq("reference", invoiceId) : depId ? q.eq("id", Number(depId)) : q.eq("id", -1);
  const { data: dep } = await q.maybeSingle();
  if (!dep || !dep.reference) return NextResponse.json({ ok: true, ignored: "not a GebetaSoccer deposit" });
  if (depId && String(dep.id) !== depId) return NextResponse.json({ ok: true, ignored: "order id mismatch" });

  const payCurrency = ipn.pay_currency ? String(ipn.pay_currency).slice(0, 30) : null;
  const paymentId = ipn.payment_id != null ? String(ipn.payment_id) : "";
  const decision = nowPaymentsAction(ipn, Number(dep.usd));

  if (decision.action === "wait") return NextResponse.json({ ok: true, status: ipn.payment_status });
  if (decision.action === "expire") {
    await admin.from("crypto_deposits").update({ status: "expired" }).eq("id", dep.id).eq("status", "pending");
    return NextResponse.json({ ok: true });
  }
  if (payCurrency) await admin.from("crypto_deposits").update({ pay_currency: payCurrency }).eq("id", dep.id);

  let result: string;
  if (decision.action === "review") {
    if (dep.status === "credited") return NextResponse.json({ ok: true, result: "already credited" });
    await admin
      .from("crypto_deposits")
      .update({ status: "paid_not_credited", note: decision.reason ?? "check payment", tx_hash: paymentId || null, paid_at: new Date().toISOString() })
      .eq("id", dep.id);
    result = `not credited: ${decision.reason}`;
  } else {
    const { data, error } = await admin.rpc("crypto_credit_deposit", {
      p_reference: dep.reference,
      p_paid: Number(ipn.price_amount),
      p_tx_hash: paymentId,
      p_event_id: paymentId ? `np-${paymentId}` : "",
      p_admin_id: null,
    });
    if (error) {
      console.error("[nowpayments] credit error:", error.message);
      return NextResponse.json({ ok: false, error: "credit failed" }, { status: 500 }); // NOWPayments retries
    }
    result = String(data);
  }

  try {
    // "credited": the database already tells the player ("💰 Deposit received").
    if (result.startsWith("not credited") && dep.status !== "paid_not_credited") { // tell people once, not on every retry
      const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
      const rows = ((admins ?? []) as { id: string }[]).map((a) => ({
        user_id: a.id,
        kind: "admin",
        title: "⚠️ Crypto payment not added",
        body: `NOWPayments invoice ${dep.reference}: $${dep.usd} for ${dep.units} Units was paid but not added (${result.replace("not credited: ", "")}). Check Admin → Deposits.`,
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
    console.error("[nowpayments] notify:", (e as Error).message); // the deposit itself is already saved
  }
  return NextResponse.json({ ok: true, result });
}
