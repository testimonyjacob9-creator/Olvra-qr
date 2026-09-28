// POST /.netlify/functions/verify-premium   Authorization: Bearer <Firebase ID token>
// Body: { transactionId, txRef, country }
// The browser never grants itself premium. This re-checks the payment with Flutterwave,
// confirms amount + currency match pricing.json for the chosen country, credits each
// transaction only once, and then extends users/{uid}.premiumUntil by 30 days.
const admin = require("firebase-admin");
const PRICING = require("../../pricing.json");

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not set.");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(Buffer.from(raw.trim(), "base64").toString("utf8"))) });
}
const db = admin.firestore();
const out = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { error: "Method not allowed." });
  try {
    const m = (event.headers.authorization || event.headers.Authorization || "").match(/^Bearer (.+)$/i);
    if (!m) return out(401, { error: "Sign in first." });
    const user = await admin.auth().verifyIdToken(m[1]).catch(() => null);
    if (!user) return out(401, { error: "Session expired. Sign in again." });

    const { transactionId, txRef, country } = JSON.parse(event.body || "{}");
    const price = PRICING.countries[country];
    if (!transactionId || !txRef || !price) return out(400, { error: "Missing payment details." });
    if (!String(txRef).startsWith("OQ-" + user.uid.slice(0, 8) + "-")) return out(400, { error: "Payment does not belong to this account." });

    const r = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    });
    const v = await r.json().catch(() => ({}));
    const tx = v && v.data;
    if (!r.ok || v.status !== "success" || !tx) return out(502, { error: "Could not verify the payment with Flutterwave." });
    if (tx.status !== "successful") return out(402, { error: `Payment status is "${tx.status}".` });
    if (tx.tx_ref !== txRef) return out(400, { error: "Payment reference does not match." });
    if (tx.currency !== price.currency || Number(tx.amount) < price.amount) return out(400, { error: "Payment amount or currency does not match the price for this country." });

    const payRef = db.collection("payments").doc(String(tx.id));
    const userRef = db.collection("users").doc(user.uid);
    const until = await db.runTransaction(async (t) => {
      const [p, u] = await Promise.all([t.get(payRef), t.get(userRef)]);
      const current = u.exists && u.data().premiumUntil ? u.data().premiumUntil.toDate() : null;
      if (p.exists) return current; // already credited
      const start = current && current > new Date() ? current : new Date();
      const next = new Date(start.getTime() + PRICING.days * 86400000);
      t.set(payRef, { uid: user.uid, txRef, amount: tx.amount, currency: tx.currency, country, at: admin.firestore.FieldValue.serverTimestamp() });
      t.set(userRef, { premiumUntil: admin.firestore.Timestamp.fromDate(next), email: user.email || null }, { merge: true });
      return next;
    });
    return out(200, { premiumUntil: until && until.toISOString() });
  } catch (e) {
    console.error("verify-premium", e);
    return out(500, { error: "Something went wrong. If you were charged, contact support with your payment reference." });
  }
};
