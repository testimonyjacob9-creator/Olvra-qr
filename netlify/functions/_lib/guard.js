// requireActive: signed-in AND not suspended. Returns { decoded, ref, data }.
const { db } = require("./firebase-admin");
const { requireAuth } = require("./require-auth");
async function requireActive(event) {
  const decoded = await requireAuth(event);
  const ref = db.collection("users").doc(decoded.uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  if (data.suspended) throw Object.assign(new Error("This account is suspended. Contact support."), { statusCode: 403 });
  return { decoded, ref, data };
}
module.exports = { requireActive };
