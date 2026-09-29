// POST /.netlify/functions/friends   Authorization: Bearer <ID token>
// Body: { action: "list" | "request" | "respond" | "remove", ... }
// friendships/{a_b} = { users:[a,b], requester, status:"pending"|"accepted", last? }
const { admin, db, FieldValue } = require("./_lib/firebase-admin");
const { requireActive } = require("./_lib/guard");
const { notifyUser } = require("./_lib/notify");
const { ok, fail } = require("./_lib/respond");

const err = (m, c = 400) => Object.assign(new Error(m), { statusCode: c });
const pairId = (a, b) => [a, b].sort().join("_");
const nameOf = (d = {}) => d.displayName || (d.email || "").split("@")[0] || "A Lumora member";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(err("Method not allowed.", 405));
  try {
    const { decoded, data: me } = await requireActive(event);
    const uid = decoded.uid;
    let body; try { body = JSON.parse(event.body || "{}"); } catch { throw err("Invalid request."); }
    const myName = nameOf({ ...me, email: me.email || decoded.email });

    if (body.action === "list") {
      const snap = await db.collection("friendships").where("users", "array-contains", uid).get();
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const others = rows.map((r) => r.users.find((u) => u !== uid));
      const docs = others.length ? await db.getAll(...others.map((o) => db.collection("users").doc(o))) : [];
      const items = rows.map((r, i) => {
        const u = docs[i].exists ? docs[i].data() : {};
        const ts = (r.last && r.last.at) || r.createdAt;
        return {
          chatId: r.id, uid: others[i], name: nameOf(u), photoURL: u.photoURL || null, status: r.status,
          incoming: r.status === "pending" && r.requester !== uid,
          lastText: r.last ? r.last.text : "", lastFrom: r.last ? r.last.from : null,
          lastAt: ts && ts.toMillis ? ts.toMillis() : 0,
        };
      }).sort((a, b) => b.lastAt - a.lastAt);
      return ok({ items });
    }

    if (body.action === "request") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email.includes("@")) throw err("Enter your friend's email address.");
      if (email === (decoded.email || "").toLowerCase()) throw err("That's your own email address.");
      // Same answer whether or not the account exists, so emails can't be probed.
      const generic = ok({ message: "If that email has a Lumora account, your request is on its way." });
      let target; try { target = await admin.auth().getUserByEmail(email); } catch { return generic; }
      if (target.disabled) return generic;
      const ref = db.collection("friendships").doc(pairId(uid, target.uid));
      const s = await ref.get();
      if (s.exists) {
        const f = s.data();
        if (f.status === "accepted") throw err("You're already friends.");
        if (f.requester !== uid) { await ref.update({ status: "accepted", acceptedAt: FieldValue.serverTimestamp() }); return ok({ message: "You're now friends." }); }
        throw err("You already sent this person a request.");
      }
      await ref.set({ users: [uid, target.uid], requester: uid, status: "pending", createdAt: FieldValue.serverTimestamp() });
      await notifyUser(admin, db, target.uid, { title: "New friend request", body: `${myName} wants to be your friend.`, url: "/chat" });
      return generic;
    }

    const other = String(body.uid || "");
    if (!other) throw err("Missing person.");
    const ref = db.collection("friendships").doc(pairId(uid, other));
    const s = await ref.get();

    if (body.action === "respond") {
      if (!s.exists || s.data().status !== "pending" || s.data().requester !== other) throw err("That request is no longer available.", 404);
      if (body.accept) {
        await ref.update({ status: "accepted", acceptedAt: FieldValue.serverTimestamp() });
        await notifyUser(admin, db, other, { title: "Friend request accepted", body: `${myName} accepted your request. Say hi!`, url: "/chat#" + ref.id });
      } else await ref.delete();
      return ok({});
    }

    if (body.action === "remove") {
      if (!s.exists || !s.data().users.includes(uid)) throw err("Friend not found.", 404);
      await ref.delete();
      return ok({});
    }
    throw err("Unknown action.");
  } catch (e) { return fail(e); }
};
