// POST /.netlify/functions/admin-notify   Authorization: Bearer <ID token, admin>
// Body: { title, body, uid? }  -- omit uid to send to every user.
const { db } = require("./_lib/firebase-admin");
const { admin } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { assertAdmin, notifyUser } = require("./_lib/notify");
const { ok, fail } = require("./_lib/respond");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(Object.assign(new Error("Method not allowed"), { statusCode: 405 }));
  try {
    const decoded = await requireAuth(event);
    await assertAdmin(db, decoded.uid);
    const { title, body, uid } = JSON.parse(event.body || "{}");
    if (!title || !body) throw Object.assign(new Error("title and body are required."), { statusCode: 400 });

    if (uid) {
      await notifyUser(admin, db, uid, { title, body, from: "admin" });
      return ok({ sent: 1 });
    }
    const snap = await db.collection("users").get();
    let sent = 0;
    for (const d of snap.docs) { await notifyUser(admin, db, d.id, { title, body, from: "admin" }); sent++; }
    return ok({ sent });
  } catch (err) { return fail(err); }
};
