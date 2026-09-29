// POST /.netlify/functions/auth-code
// Body actions:
//   { action:"send-reset",    email }                       -- no auth required
//   { action:"confirm-reset", email, code, newPassword }     -- no auth required
//   { action:"send-verify"    }                               -- Authorization: Bearer <ID token>
//   { action:"confirm-verify", code }                         -- Authorization: Bearer <ID token>
//
// Codes are 6 digits, stored as a salted hash with a 10-minute expiry,
// and are single-use. Password reset never reveals whether an email
// exists (same response either way) to avoid leaking account emails.
const crypto = require("crypto");
const admin = require("firebase-admin");
const { sendEmail, resetCodeEmail, verifyCodeEmail } = require("./_lib/brevo");

if (!admin.apps.length) {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!raw) throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables.");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}
const db = admin.firestore();
const out = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const TTL_MS = 10 * 60 * 1000;
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const mask = (email) => { const [l, d] = email.split("@"); return `${l.slice(0, 1)}***@${d || ""}`; };

async function bearerUser(event) {
  const m = (event.headers.authorization || event.headers.Authorization || "").match(/^Bearer (.+)$/i);
  if (!m) return null;
  return admin.auth().verifyIdToken(m[1], true).catch(() => null);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { error: "Method not allowed." });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return out(400, { error: "Invalid request." }); }
  const { action } = body;

  try {
    // ---- Forgot password: request a code by email, no sign-in needed ----
    if (action === "send-reset") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return out(400, { error: "Enter your account email." });
      const generic = { sent: true, maskedEmail: mask(email) }; // same response whether or not the account exists
      let user;
      try { user = await admin.auth().getUserByEmail(email); } catch { return out(200, generic); }
      const code = genCode();
      await db.collection("authCodes").doc("reset_" + user.uid).set({ code_hash: hash(code), email, expires_at: Date.now() + TTL_MS });
      const { subject, html } = resetCodeEmail({ name: user.displayName, code });
      try { await sendEmail({ to: email, toName: user.displayName, subject, html }); } catch (e) { console.error("reset email:", e.message); }
      return out(200, generic);
    }

    if (action === "confirm-reset") {
      const email = String(body.email || "").trim().toLowerCase();
      const { code, newPassword } = body;
      if (!email || !code || !newPassword) return out(400, { error: "Missing email, code or new password." });
      if (String(newPassword).length < 6) return out(400, { error: "Password must be at least 6 characters." });
      let user;
      try { user = await admin.auth().getUserByEmail(email); } catch { return out(400, { error: "Incorrect or expired code." }); }
      const ref = db.collection("authCodes").doc("reset_" + user.uid);
      const snap = await ref.get();
      if (!snap.exists) return out(400, { error: "No reset code found — request a new one." });
      const stored = snap.data();
      if (Date.now() > stored.expires_at) { await ref.delete(); return out(400, { error: "Code expired — request a new one." }); }
      if (hash(code) !== stored.code_hash) return out(400, { error: "Incorrect code." });
      await admin.auth().updateUser(user.uid, { password: String(newPassword) });
      await ref.delete();
      return out(200, { success: true });
    }

    // ---- Email verification for signed-in, not-yet-verified users ----
    if (action === "send-verify" || action === "confirm-verify") {
      const decoded = await bearerUser(event);
      if (!decoded) return out(401, { error: "Sign in first." });
      const email = decoded.email;
      if (!email) return out(400, { error: "No email on this account." });

      if (action === "send-verify") {
        const code = genCode();
        await db.collection("authCodes").doc("verify_" + decoded.uid).set({ code_hash: hash(code), expires_at: Date.now() + TTL_MS });
        const { subject, html } = verifyCodeEmail({ name: decoded.name, code });
        let emailSent = true;
        try { await sendEmail({ to: email, toName: decoded.name, subject, html }); } catch (e) { console.error("verify email:", e.message); emailSent = false; }
        return out(200, { emailSent, maskedEmail: mask(email) });
      }

      const { code } = body;
      if (!code) return out(400, { error: "Enter the code." });
      const ref = db.collection("authCodes").doc("verify_" + decoded.uid);
      const snap = await ref.get();
      if (!snap.exists) return out(400, { error: "No code found — request a new one." });
      const stored = snap.data();
      if (Date.now() > stored.expires_at) { await ref.delete(); return out(400, { error: "Code expired — request a new one." }); }
      if (hash(code) !== stored.code_hash) return out(400, { error: "Incorrect code." });
      await admin.auth().updateUser(decoded.uid, { emailVerified: true });
      await ref.delete();
      return out(200, { success: true });
    }

    return out(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("auth-code", e);
    return out(500, { error: "Something went wrong. Try again shortly." });
  }
};
