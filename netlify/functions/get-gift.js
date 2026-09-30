// netlify/functions/get-gift.js — public lookup for the gift landing page.
// Only returns what a recipient needs to see: amount, message, animation,
// status. Never the sender's email/uid.
// GET /.netlify/functions/get-gift?code=XXXX
const admin = require("firebase-admin");
if (!admin.apps.length) {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!raw) throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables.");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}
const db = admin.firestore();
const out = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  const code = (event.queryStringParameters || {}).code;
  if (!code) return out(400, { error: "Missing code." });
  const snap = await db.collection("vouchers").doc(String(code)).get();
  if (!snap.exists) return out(404, { error: "Not found." });
  const v = snap.data();
  return out(200, {
    amount: v.amount, message: v.message, animation: v.animation, status: v.status,
    expiresAt: v.expiresAt ? v.expiresAt.toDate().toISOString() : null,
  });
};
