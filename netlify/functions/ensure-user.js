// POST /.netlify/functions/ensure-user   Authorization: Bearer <ID token>
// Makes sure users/{uid} exists (so profile, chat rules and the admin list work)
// and reports { suspended, isAdmin }.
const { db, FieldValue } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { ok, fail } = require("./_lib/respond");

exports.handler = async (event) => {
  try {
    const decoded = await requireAuth(event);
    const ref = db.collection("users").doc(decoded.uid);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    const patch = {};
    if (!snap.exists) patch.createdAt = FieldValue.serverTimestamp();
    if (!data.email && decoded.email) patch.email = decoded.email;
    if (!data.displayName && decoded.name) patch.displayName = decoded.name;
    if (Object.keys(patch).length) await ref.set(patch, { merge: true });
    const adm = await db.collection("admins").doc(decoded.uid).get();
    return ok({ suspended: !!data.suspended, isAdmin: adm.exists });
  } catch (err) { return fail(err); }
};
