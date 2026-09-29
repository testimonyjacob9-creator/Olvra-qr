// GET /.netlify/functions/admin-list-support   Authorization: Bearer <ID token, admin>
const { db } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { assertAdmin } = require("./_lib/notify");
const { ok, fail } = require("./_lib/respond");

exports.handler = async (event) => {
  try {
    const decoded = await requireAuth(event);
    await assertAdmin(db, decoded.uid);
    const snap = await db.collection("support_messages").orderBy("created_at", "desc").limit(100).get();
    const messages = snap.docs.map((d) => {
      const m = d.data();
      return { id: d.id, email: m.email, message: m.message, emailFailed: !!m.email_failed, at: m.created_at ? m.created_at.toDate().toISOString() : null };
    });
    return ok({ messages });
  } catch (err) { return fail(err); }
};
