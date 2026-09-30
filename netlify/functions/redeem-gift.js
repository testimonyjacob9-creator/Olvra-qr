// netlify/functions/redeem-gift.js
// POST, no auth required — gift redemption is intentionally account-free.
// Body: { code, type: 'airtime'|'cash', phone?, network?, accountNumber?, accountName?, bankCode?, bankName? }
//
// Whoever holds the link first can redeem it — like handing someone cash.
// A Firestore transaction flips the voucher from 'unredeemed' straight to
// its final status so a double-tap or two tabs can't redeem it twice.
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
const WOODPAY_BASE = process.env.WOODPAY_BASE_URL || "https://woodpay.netlify.app";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { error: "Method not allowed." });
  try {
    const body = JSON.parse(event.body || "{}");
    const { code, type } = body;
    if (!code || !["airtime", "cash"].includes(type)) return out(400, { error: "Missing or invalid code/type." });

    const voucherRef = db.collection("vouchers").doc(String(code));

    // Reserve the voucher first (unredeemed -> redeeming) in its own
    // transaction, so a concurrent second request can't also pass this
    // check while the WoodPay call below is in flight.
    let voucher;
    try {
      voucher = await db.runTransaction(async (t) => {
        const snap = await t.get(voucherRef);
        if (!snap.exists) throw new Error("NOT_FOUND");
        const v = snap.data();
        if (v.status !== "unredeemed") throw Object.assign(new Error("NOT_AVAILABLE"), { status: v.status });
        if (v.expiresAt && v.expiresAt.toDate() < new Date()) throw new Error("EXPIRED");
        t.update(voucherRef, { status: "redeeming" });
        return v;
      });
    } catch (e) {
      if (e.message === "NOT_FOUND") return out(404, { error: "This gift link isn't valid." });
      if (e.message === "EXPIRED") return out(410, { error: "This gift has expired." });
      return out(409, { error: e.status === "redeemed" ? "This gift has already been redeemed." : "This gift is being redeemed right now — try again in a moment." });
    }

    if (type === "airtime") {
      const { phone, network } = body;
      if (!phone || !network) { await voucherRef.update({ status: "unredeemed" }); return out(400, { error: "Missing phone number or network." }); }
      const res = await fetch(WOODPAY_BASE + "/.netlify/functions/partner-redeem-airtime", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: LUMORA_PARTNER_SECRET, phone, network, amount: voucher.amount, reference: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { await voucherRef.update({ status: "unredeemed" }); return out(200, { ok: false, error: data.error || "Delivery failed. Try again, or choose cash instead." }); }
      await voucherRef.update({ status: "redeemed", redeemedAs: "airtime", redeemedPhone: phone, redeemedAt: admin.firestore.FieldValue.serverTimestamp() });
      return out(200, { ok: true });
    }

    // cash
    const { accountNumber, accountName, bankCode, bankName } = body;
    if (!accountNumber || !accountName || !bankCode) { await voucherRef.update({ status: "unredeemed" }); return out(400, { error: "Missing account details." }); }
    const res = await fetch(WOODPAY_BASE + "/.netlify/functions/partner-redeem-cash", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: LUMORA_PARTNER_SECRET, accountNumber, accountName, bankCode, bankName, amount: voucher.amount, reference: code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) { await voucherRef.update({ status: "unredeemed" }); return out(200, { ok: false, error: data.error || "Could not queue the payout. Try again." }); }
    await voucherRef.update({ status: "payout_pending", redeemedAs: "cash", redeemedAt: admin.firestore.FieldValue.serverTimestamp(), payoutAccount: accountNumber, payoutName: accountName });
    return out(200, { ok: true, pending: true });
  } catch (e) {
    console.error("redeem-gift", e);
    return out(500, { error: "Something went wrong. Please try again." });
  }
};
