// POST /.netlify/functions/send-message   Authorization: Bearer <ID token>
// Body: { chatId, text }. Only accepted friends can message, suspended users can't.
const { db, FieldValue } = require("./_lib/firebase-admin");
const { requireActive } = require("./_lib/guard");
const { pushToUid } = require("./_lib/push");
const { ok, fail } = require("./_lib/respond");

const err = (m, c = 400) => Object.assign(new Error(m), { statusCode: c });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(err("Method not allowed.", 405));
  try {
    const { decoded, ref: meRef, data: me } = await requireActive(event);
    let body; try { body = JSON.parse(event.body || "{}"); } catch { throw err("Invalid request."); }
    const chatId = String(body.chatId || "");
    const text = String(body.text || "").trim();
    if (!text) throw err("Write a message first.");
    if (text.length > 1000) throw err("Messages can be up to 1,000 characters.");
    if (Date.now() - (me.lastMsgAt || 0) < 700) throw err("You're sending messages too fast. Wait a moment.", 429);

    const fRef = db.collection("friendships").doc(chatId);
    const f = await fRef.get();
    if (!f.exists || f.data().status !== "accepted" || !f.data().users.includes(decoded.uid)) throw err("You can only message accepted friends.", 403);
    const other = f.data().users.find((u) => u !== decoded.uid);
    const otherSnap = await db.collection("users").doc(other).get();
    if (otherSnap.exists && otherSnap.data().suspended) throw err("You can't message this person right now.", 403);

    await db.collection("chats").doc(chatId).collection("messages").add({ from: decoded.uid, text, at: FieldValue.serverTimestamp() });
    await fRef.update({ last: { text: text.slice(0, 80), from: decoded.uid, at: FieldValue.serverTimestamp() } });
    await meRef.set({ lastMsgAt: Date.now() }, { merge: true });

    const name = me.displayName || (me.email || decoded.email || "").split("@")[0] || "New message";
    pushToUid(db, other, { title: name, body: text.slice(0, 100), url: "/chat#" + chatId }).catch(() => {});
    return ok({});
  } catch (e) { return fail(e); }
};
