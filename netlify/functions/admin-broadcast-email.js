// POST /.netlify/functions/admin-broadcast-email   Authorization: Bearer <ID token, admin>
// Body: { subject, message }  -- sends a branded email to every user with an email on file.
const { db } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { assertAdmin } = require("./_lib/notify");
const { ok, fail } = require("./_lib/respond");
const { sendEmail } = require("./_lib/brevo");

function escapeHtml(s) { return String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function shell(kicker, title, bodyHtml) {
  return `<div style="background:#e4e9f3;padding:36px 16px;font-family:Arial,sans-serif"><div style="max-width:460px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(31,37,64,.12)"><div style="background:linear-gradient(135deg,#2b3cff,#e11d48);padding:28px;color:#fff"><div style="font-weight:800;font-size:18px">lumora</div><div style="opacity:.85;font-size:12px;margin-top:2px;text-transform:uppercase;letter-spacing:.08em">${kicker}</div></div><div style="padding:28px"><h1 style="margin:0 0 14px;font-size:20px;color:#1f2540">${title}</h1>${bodyHtml}</div><div style="padding:16px 28px;background:#f4f6fb;color:#5d6684;font-size:12px;text-align:center">Sent with ❤️ by Lumora</div></div></div>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(Object.assign(new Error("Method not allowed"), { statusCode: 405 }));
  try {
    const decoded = await requireAuth(event);
    await assertAdmin(db, decoded.uid);
    const { subject, message } = JSON.parse(event.body || "{}");
    if (!subject || !message) throw Object.assign(new Error("subject and message are required."), { statusCode: 400 });

    const snap = await db.collection("users").get();
    const recipients = snap.docs.map((d) => d.data()).filter((u) => u.email);
    const html = shell("Update", subject, `<p style="color:#1f2540;white-space:pre-wrap">${escapeHtml(message)}</p>`);

    let sent = 0, failed = 0;
    for (const r of recipients) {
      try { await sendEmail({ to: r.email, toName: r.displayName, subject, html }); sent++; }
      catch (e) { failed++; }
    }
    return ok({ sent, failed, total: recipients.length });
  } catch (err) { return fail(err); }
};
