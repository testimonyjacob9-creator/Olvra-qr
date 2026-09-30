// netlify/functions/partner-refund-voucher.js
// Webhook WoodPay calls (from admin-approve-gift-payout.js) when an admin
// rejects a cash payout, so the voucher doesn't stay stuck "paid out" when
// no money actually moved. Re-opens it so the recipient can try again.
// Body: { secret, reference, reason }
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!raw) throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables.");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}
const db = admin.firestore();
const out = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const LUMORA_PARTNER_SECRET = process.env.LUMORA_PARTNER_SECRET || "";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { error: "Method not allowed." });
  const body = JSON.parse(event.body || "{}");
  if (!LUMORA_PARTNER_SECRET || body.secret !== LUMORA_PARTNER_SECRET) return out(401, { ok: false, error: "Unauthorized" });
  const { reference, reason } = body;
  if (!reference) return out(400, { ok: false, error: "Missing reference." });

  const voucherRef = db.collection("vouchers").doc(String(reference));
  const snap = await voucherRef.get();
  if (!snap.exists) return out(200, { ok: true }); // nothing to reopen
  await voucherRef.update({ status: "unredeemed", lastRefundReason: reason || null, refundedAt: admin.firestore.FieldValue.serverTimestamp() });
  return out(200, { ok: true });
};
