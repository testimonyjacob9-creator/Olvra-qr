// POST /.netlify/functions/contact-support   Authorization: Bearer <ID token>
// Body: { message }
// Used by the Olives widget's escalate-to-a-human flow. Emails SUPPORT_EMAIL
// with replyTo set to the user's own address, and always saves a copy to
// Firestore `support_messages` even if the email fails to send.
const { db, FieldValue } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { ok, fail } = require("./_lib/respond");
const { sendEmail, supportEscalationEmail } = require("./_lib/brevo");

const SUPPORT_EMAIL = "vtusupport@gmail.com";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(Object.assign(new Error("Method not allowed"), { statusCode: 405 }));
  try {
    const decoded = await requireAuth(event);
    const userEmail = decoded.email || "unknown@user.com";
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { throw Object.assign(new Error("Invalid JSON body."), { statusCode: 400 }); }
    const { message } = body;
    if (!message) throw Object.assign(new Error("message is required."), { statusCode: 400 });

    const docRef = await db.collection("support_messages").add({
      uid: decoded.uid, email: userEmail, message, created_at: FieldValue.serverTimestamp(),
    });

    let emailed = true;
    try {
      const { subject, html } = supportEscalationEmail({ userEmail, message });
      await sendEmail({ to: SUPPORT_EMAIL, subject, html, replyTo: userEmail });
    } catch (emailErr) {
      console.error("contact-support email failed:", emailErr.message);
      emailed = false;
      await db.collection("support_messages").doc(docRef.id).update({ email_failed: true }).catch(() => {});
    }
    return ok({ received: true, emailed });
  } catch (err) { return fail(err); }
};
