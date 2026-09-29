// POST /.netlify/functions/create-love   Authorization: Bearer <Firebase ID token>
// Body: { to, from, msg, anim, theme }
// Creates a love-message link server-side so the free-message limit can't be
// bypassed from the browser. Free accounts get FREE_LIMIT messages, ever;
// Premium accounts are unlimited.
const crypto = require("crypto");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!raw) throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables.");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}
const db = admin.firestore();
const out = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const FREE_LIMIT = 15;
const ANIMS = ["couple", "hearts", "confetti", "typing"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { error: "Method not allowed." });
  try {
    const m = (event.headers.authorization || event.headers.Authorization || "").match(/^Bearer (.+)$/i);
    if (!m) return out(401, { error: "Sign in first." });
    const decoded = await admin.auth().verifyIdToken(m[1]).catch(() => null);
    if (!decoded) return out(401, { error: "Session expired. Sign in again." });

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return out(400, { error: "Invalid request." }); }
    const to = String(body.to || "").trim();
    const from = String(body.from || "").trim();
    const msg = String(body.msg || "").trim();
    if (!to || !from || !msg) return out(400, { error: "Fill in who it is for, your name and the message." });
    if (to.length > 40 || from.length > 40) return out(400, { error: "Names must be 40 characters or fewer." });
    if (msg.length > 600) return out(400, { error: "Message must be 600 characters or fewer." });
    const anim = ANIMS.includes(body.anim) ? body.anim : "couple";
    const theme = [0, 1, 2].includes(body.theme) ? body.theme : 0;

    const userRef = db.collection("users").doc(decoded.uid);
    let limitReached = false;
    const id = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.exists ? snap.data() : {};
      const premiumUntil = data.premiumUntil ? data.premiumUntil.toDate() : null;
      const isPremium = premiumUntil && premiumUntil > new Date();
      const count = data.loveCount || 0;
      if (!isPremium && count >= FREE_LIMIT) { limitReached = true; return null; }

      const A = "abcdefghjkmnpqrstuvwxyz23456789";
      const newId = Array.from(crypto.randomBytes(14), (b) => A[b % A.length]).join("");
      tx.set(db.collection("love").doc(newId), { to, from, msg, anim, theme, uid: decoded.uid, fromPhoto: data.photoURL || null, at: admin.firestore.FieldValue.serverTimestamp() });
      tx.set(userRef, { loveCount: count + 1, email: decoded.email || null }, { merge: true });
      return newId;
    });

    if (limitReached) return out(402, { error: `You've used your ${FREE_LIMIT} free love messages. Upgrade to Premium to send more.`, limitReached: true });
    return out(200, { id });
  } catch (e) {
    console.error("create-love", e);
    return out(500, { error: "Could not create the link. Try again." });
  }
};
