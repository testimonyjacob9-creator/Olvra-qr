// POST /.netlify/functions/admin-user-action   Authorization: Bearer <ID token, admin>
// Body: { uid, action: "grant"|"revoke"|"suspend"|"unsuspend", days? }
const { admin, db, FieldValue } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { assertAdmin, notifyUser } = require("./_lib/notify");
const { ok, fail } = require("./_lib/respond");
const err = (m, c = 400) => Object.assign(new Error(m), { statusCode: c });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(err("Method not allowed.", 405));
  try {
    const decoded = await requireAuth(event);
    await assertAdmin(db, decoded.uid);
    const { uid, action, days } = JSON.parse(event.body || "{}");
    if (!uid) throw err("Missing user.");
    const ref = db.collection("users").doc(String(uid));
    const out = {};

    if (action === "grant") {
      const d = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
      let until;
      await db.runTransaction(async (t) => {
        const s = await t.get(ref);
        const cur = s.exists && s.data().premiumUntil ? s.data().premiumUntil.toDate() : null;
        const start = cur && cur > new Date() ? cur : new Date();
        until = new Date(start.getTime() + d * 86400000);
        t.set(ref, { premiumUntil: admin.firestore.Timestamp.fromDate(until) }, { merge: true });
      });
      await notifyUser(admin, db, uid, { title: "Premium added", body: `${d} days of Premium were added to your account.`, url: "/account" });
      out.premiumUntil = until.toISOString();
    } else if (action === "revoke") {
      await ref.set({ premiumUntil: FieldValue.delete() }, { merge: true });
    } else if (action === "suspend" || action === "unsuspend") {
      if (uid === decoded.uid) throw err("You can't suspend your own account.");
      if ((await db.collection("admins").doc(uid).get()).exists) throw err("Admins can't be suspended.");
      const on = action === "suspend";
      await admin.auth().updateUser(uid, { disabled: on });
      if (on) await admin.auth().revokeRefreshTokens(uid);
      await ref.set({ suspended: on, ...(on ? { suspendedAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
    } else throw err("Unknown action.");

    await db.collection("adminLog").add({ by: decoded.uid, uid, action, days: days || null, at: FieldValue.serverTimestamp() });
    return ok(out);
  } catch (e) { return fail(e); }
};
