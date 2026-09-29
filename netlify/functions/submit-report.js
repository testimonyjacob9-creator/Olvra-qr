// POST /.netlify/functions/submit-report   Authorization: Bearer <ID token>
// Body: { chatId, reason }. Attaches the last 10 messages so admins have context.
const { admin, db, FieldValue } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { ok, fail } = require("./_lib/respond");
const err = (m, c = 400) => Object.assign(new Error(m), { statusCode: c });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(err("Method not allowed.", 405));
  try {
    const decoded = await requireAuth(event);
    let body; try { body = JSON.parse(event.body || "{}"); } catch { throw err("Invalid request."); }
    const chatId = String(body.chatId || "");
    const reason = String(body.reason || "").trim();
    if (reason.length < 3) throw err("Tell us briefly what happened.");
    if (reason.length > 500) throw err("Keep the reason under 500 characters.");

    const f = await db.collection("friendships").doc(chatId).get();
    if (!f.exists || !f.data().users.includes(decoded.uid)) throw err("Chat not found.", 404);
    const target = f.data().users.find((u) => u !== decoded.uid);

    const dupe = await db.collection("reports").where("reporter", "==", decoded.uid).where("chatId", "==", chatId).where("status", "==", "open").limit(1).get();
    if (!dupe.empty) return ok({ message: "You've already reported this chat. Our team will review it." });

    const msgs = await db.collection("chats").doc(chatId).collection("messages").orderBy("at", "desc").limit(10).get();
    const context = msgs.docs.reverse().map((d) => { const m = d.data(); return { from: m.from, text: m.text, at: m.at ? m.at.toMillis() : 0 }; });
    let targetEmail = null; try { targetEmail = (await admin.auth().getUser(target)).email || null; } catch {}

    await db.collection("reports").add({
      kind: "chat", chatId, reporter: decoded.uid, reporterEmail: decoded.email || null,
      targetUid: target, targetEmail, reason, context, status: "open", createdAt: FieldValue.serverTimestamp(),
    });
    return ok({ message: "Report sent. Our team will review it." });
  } catch (e) { return fail(e); }
};
