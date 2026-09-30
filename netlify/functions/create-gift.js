// netlify/functions/create-gift.js
// POST, Authorization: Bearer <Firebase ID token>
// Body: { transactionId, txRef, amount, message, animation }
// Re-verifies the payment with Flutterwave (never trusts the browser),
// then creates a NGN cash voucher. Amount is what the recipient can
// redeem — WoodPay's minimum payout is ₦500, so gifts start there too.
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!raw) throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables.");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}
const db = admin.firestore();
const out = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const MIN_GIFT = 500; // matches WoodPay's own withdrawal minimum

function makeCode() {
  return crypto.randomBytes(9).toString("base64url"); // ~12 chars, URL-safe
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { error: "Method not allowed." });
  try {
    const m = (event.headers.authorization || event.headers.Authorization || "").match(/^Bearer (.+)$/i);
    if (!m) return out(401, { error: "Sign in first." });
    const user = await admin.auth().verifyIdToken(m[1], true).catch(() => null);
    if (!user) return out(401, { error: "Session expired. Sign in again." });

    const { transactionId, txRef, amount, message, animation } = JSON.parse(event.body || "{}");
    const amt = Number(amount);
    if (!transactionId || !txRef || !(amt >= MIN_GIFT)) return out(400, { error: `Missing payment details, or amount below the ₦${MIN_GIFT} minimum.` });
    if (!String(txRef).startsWith("OQG-" + user.uid.slice(0, 8) + "-")) return out(400, { error: "Payment does not belong to this account." });

    const r = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    });
    const v = await r.json().catch(() => ({}));
    const tx = v && v.data;
    if (!r.ok || v.status !== "success" || !tx) return out(502, { error: "Could not verify the payment with Flutterwave." });
    if (tx.status !== "successful") return out(402, { error: `Payment status is "${tx.status}".` });
    if (tx.tx_ref !== txRef) return out(400, { error: "Payment reference does not match." });
    if (tx.currency !== "NGN" || Number(tx.amount) < amt) return out(400, { error: "Payment amount or currency does not match." });

    const payRef = db.collection("payments").doc(String(tx.id));
    const already = await payRef.get();
    if (already.exists) {
      const existingCode = already.data().voucherCode;
      return out(200, { code: existingCode, alreadyCreated: true });
    }

    const code = makeCode();
    const voucherRef = db.collection("vouchers").doc(code);
    const expiresAt = new Date(Date.now() + 90 * 86400000); // 90 days

    await db.runTransaction(async (t) => {
      t.set(payRef, { uid: user.uid, txRef, amount: tx.amount, currency: tx.currency, purpose: "gift", voucherCode: code, at: admin.firestore.FieldValue.serverTimestamp() });
      t.set(voucherRef, {
        amount: amt,
        message: String(message || "").slice(0, 500),
        animation: String(animation || "none").slice(0, 30),
        senderUid: user.uid,
        senderEmail: user.email || null,
        status: "unredeemed", // unredeemed | redeeming | redeemed | payout_pending | refunded | expired
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      });
    });

    return out(200, { code });
  } catch (e) {
    console.error("create-gift", e);
    return out(500, { error: "Something went wrong. If you were charged, contact support with your payment reference." });
  }
};
