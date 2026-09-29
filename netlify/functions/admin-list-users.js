// GET /.netlify/functions/admin-list-users   Authorization: Bearer <ID token, admin>
const { db } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { assertAdmin } = require("./_lib/notify");
const { ok, fail } = require("./_lib/respond");

exports.handler = async (event) => {
  try {
    const decoded = await requireAuth(event);
    await assertAdmin(db, decoded.uid);
    const snap = await db.collection("users").get();
    const users = snap.docs.map((d) => {
      const u = d.data();
      return {
        uid: d.id, email: u.email || null, displayName: u.displayName || null, photoURL: u.photoURL || null,
        premiumUntil: u.premiumUntil ? u.premiumUntil.toDate().toISOString() : null,
        loveCount: u.loveCount || 0, suspended: !!u.suspended, country: u.country || null,
        trialEndsAt: u.trialEndsAt ? u.trialEndsAt.toDate().toISOString() : null,
        createdAt: u.createdAt && u.createdAt.toDate ? u.createdAt.toDate().toISOString() : null,
      };
    });
    return ok({ users, count: users.length });
  } catch (err) { return fail(err); }
};
