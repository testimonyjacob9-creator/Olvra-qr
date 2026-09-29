// POST /.netlify/functions/ensure-user   Authorization: Bearer <ID token>
// Body (optional): { country: "NG" }
// Makes sure users/{uid} exists, saves the country, and gives brand-new, verified
// accounts a one-time Premium trial (pricing.json -> trialDays). Reports the state.
const { admin, db, FieldValue } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { ok, fail } = require("./_lib/respond");
const PRICING = require("../../pricing.json");

exports.handler = async (event) => {
  try {
    const decoded = await requireAuth(event);
    let body = {}; try { body = JSON.parse(event.body || "{}"); } catch {}
    const ref = db.collection("users").doc(decoded.uid);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    const patch = {};
    if (!snap.exists) patch.createdAt = FieldValue.serverTimestamp();
    if (!data.email && decoded.email) patch.email = decoded.email;
    if (!data.displayName && decoded.name) patch.displayName = decoded.name;
    const c = String(body.country || "").toUpperCase();
    if (/^[A-Z]{2}$/.test(c) && (!data.country || body.change)) patch.country = c;

    // One trial per account: only for accounts made in the last 24 hours, with a
    // verified email, that have never had one. Older accounts are never touched.
    let trialEndsAt = data.trialEndsAt || null;
    if (!data.trialEndsAt && !data.premiumUntil && decoded.email_verified) {
      const meta = (await admin.auth().getUser(decoded.uid)).metadata;
      if (Date.now() - new Date(meta.creationTime).getTime() < 24 * 3600 * 1000) {
        trialEndsAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + PRICING.trialDays * 86400000));
        patch.trialEndsAt = trialEndsAt;
        patch.premiumUntil = trialEndsAt;
      }
    }
    if (Object.keys(patch).length) await ref.set(patch, { merge: true });
    const adm = await db.collection("admins").doc(decoded.uid).get();
    return ok({ suspended: !!data.suspended, isAdmin: adm.exists, trialEndsAt: trialEndsAt && trialEndsAt.toDate ? trialEndsAt.toDate().toISOString() : null });
  } catch (err) { return fail(err); }
};
