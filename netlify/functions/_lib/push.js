// Shared Web Push sender, same VAPID setup as WoodPayVTU. Sends to a single
// uid's stored subscription; deletes it automatically if the push service
// reports it as dead (expired/unsubscribed on the device).
const webpush = require("web-push");

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = "mailto:vtusupport@gmail.com";
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const pushOptions = { TTL: 60, agent: new (require("https").Agent)({ keepAlive: false }) };
function sendWithTimeout(sub, payload, ms = 8000) {
  return Promise.race([
    webpush.sendNotification(sub, payload, pushOptions),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Push timed out")), ms)),
  ]);
}

async function pushToUid(db, uid, { title = "Lumora", body = "", url = "/" } = {}) {
  if (!uid || !VAPID_PUBLIC || !VAPID_PRIVATE) return;
  let sub;
  try {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return;
    sub = snap.data().pushSubscription;
    if (!sub || !sub.endpoint) return;
  } catch (e) { console.error("pushToUid: could not load subscription", uid, e.message); return; }

  const payload = JSON.stringify({ title, body, url });
  try {
    await sendWithTimeout(sub, payload);
  } catch (e) {
    const dead = typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 500;
    if (dead) db.collection("users").doc(uid).update({ pushSubscription: require("firebase-admin").firestore.FieldValue.delete() }).catch(() => {});
  }
}
module.exports = { pushToUid };
