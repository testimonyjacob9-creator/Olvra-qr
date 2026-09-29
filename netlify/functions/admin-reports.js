// GET  /.netlify/functions/admin-reports  -> { reports:[...] } chat reports + love-message reports
// POST { source: "reports"|"loveReports", id, action: "resolve"|"dismiss"|"remove-love" }
const { db } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { assertAdmin } = require("./_lib/notify");
const { ok, fail } = require("./_lib/respond");
const err = (m, c = 400) => Object.assign(new Error(m), { statusCode: c });
const iso = (t) => (t && t.toDate ? t.toDate().toISOString() : null);

exports.handler = async (event) => {
  try {
    const decoded = await requireAuth(event);
    await assertAdmin(db, decoded.uid);

    if (event.httpMethod === "POST") {
      const { source, id, action } = JSON.parse(event.body || "{}");
      if (!["reports", "loveReports"].includes(source) || !id) throw err("Missing report.");
      const ref = db.collection(source).doc(String(id));
      const s = await ref.get();
      if (!s.exists) throw err("Report not found.", 404);
      if (action === "remove-love") {
        if (source !== "loveReports") throw err("Only love-message reports can remove a message.");
        await db.collection("love").doc(String(s.data().id)).delete();
        await ref.update({ status: "actioned", reviewedBy: decoded.uid });
      } else if (action === "resolve" || action === "dismiss") {
        await ref.update({ status: action === "resolve" ? "resolved" : "dismissed", reviewedBy: decoded.uid });
      } else throw err("Unknown action.");
      return ok({});
    }

    const [a, b] = await Promise.all([
      db.collection("reports").orderBy("createdAt", "desc").limit(100).get(),
      db.collection("loveReports").orderBy("at", "desc").limit(100).get(),
    ]);
    const loves = await Promise.all(b.docs.map((d) => db.collection("love").doc(String(d.data().id)).get()));
    const reports = [
      ...a.docs.map((d) => { const r = d.data(); return { source: "reports", id: d.id, kind: "chat", status: r.status || "open", at: iso(r.createdAt), reason: r.reason, reporterEmail: r.reporterEmail, targetUid: r.targetUid, targetEmail: r.targetEmail, context: r.context || [] }; }),
      ...b.docs.map((d, i) => { const r = d.data(), l = loves[i]; return { source: "loveReports", id: d.id, kind: "love", status: r.status || "open", at: iso(r.at), loveId: r.id, love: l.exists ? { to: l.data().to, from: l.data().from, msg: l.data().msg, uid: l.data().uid || null } : null }; }),
    ].sort((x, y) => String(y.at).localeCompare(String(x.at)));
    return ok({ reports });
  } catch (e) { return fail(e); }
};
