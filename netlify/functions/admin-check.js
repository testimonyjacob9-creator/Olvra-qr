// GET/POST /.netlify/functions/admin-check   Authorization: Bearer <ID token>
// Returns { isAdmin } — used to gate the admin portal client-side.
const { db } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { ok, fail } = require("./_lib/respond");

exports.handler = async (event) => {
  try {
    const decoded = await requireAuth(event);
    const snap = await db.collection("admins").doc(decoded.uid).get();
    return ok({ isAdmin: snap.exists });
  } catch (err) { return fail(err); }
};
