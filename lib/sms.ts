/**
 * SMS sending (server only) — OFF until configured.
 * Pick a pay-as-you-go provider (no upfront fee) and set in Vercel:
 *   SMS_PROVIDER   "smsto" | "afromessage"
 *   SMS_API_KEY    the provider's API key / token
 *   SMS_SENDER_ID  optional sender name / identifier
 * If SMS_PROVIDER is not set, the app simply hides the SMS option.
 */
export const smsEnabled = () => Boolean(process.env.SMS_PROVIDER && process.env.SMS_API_KEY);

export async function sendSms(phoneE164: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const provider = (process.env.SMS_PROVIDER ?? "").toLowerCase();
  const key = process.env.SMS_API_KEY ?? "";
  const sender = process.env.SMS_SENDER_ID ?? "";
  if (!provider || !key) return { ok: false, error: "SMS is not configured" };

  try {
    if (provider === "smsto") {
      // https://developers.sms.to — POST /sms/send
      const res = await fetch("https://api.sms.to/sms/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: phoneE164, message, ...(sender ? { sender_id: sender } : {}) }),
      });
      return res.ok ? { ok: true } : { ok: false, error: `sms.to HTTP ${res.status}` };
    }
    if (provider === "afromessage") {
      // https://afromessage.com/developers — GET /api/send
      const params = new URLSearchParams({ to: phoneE164, message, ...(sender ? { sender } : {}) });
      const res = await fetch(`https://api.afromessage.com/api/send?${params}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const body = (await res.json().catch(() => ({}))) as { acknowledge?: string };
      return res.ok && body.acknowledge === "success" ? { ok: true } : { ok: false, error: `AfroMessage HTTP ${res.status}` };
    }
    return { ok: false, error: `Unknown SMS_PROVIDER "${provider}"` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
