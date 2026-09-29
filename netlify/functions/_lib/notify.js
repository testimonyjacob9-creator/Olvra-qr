// Writes a persistent in-app notification to users/{uid}/notifications.
// Automated events are prefixed "Olives"; admin broadcasts pass from:'admin'
// to skip that prefix, matching the WoodPayVTU convention.
async function notifyUser(admin, db, uid, { title, body, type = "info", url = "/", from = "olives" }) {
  if (!uid) return;
  const finalTitle = from === "admin" ? title : `🫒 Olives — ${title}`;
  try {
    await db.collection("users").doc(uid).collection("notifications").add({
      title: finalTitle, body, type, url, read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.error("notifyUser failed:", e.message); }
  // Also fire a real device push if the user has one enabled. Best-effort —
  // never throws, so an in-app bell notification always still lands even
  // if the person has push turned off or their subscription has expired.
  try {
    const { pushToUid } = require("./push");
    await pushToUid(db, uid, { title: finalTitle, body, url });
  } catch (e) { console.error("notifyUser push failed:", e.message); }
}
async function assertAdmin(db, uid) {
  const snap = await db.collection("admins").doc(uid).get();
  if (!snap.exists) throw Object.assign(new Error("Admin access required."), { statusCode: 403 });
}
module.exports = { notifyUser, assertAdmin };
