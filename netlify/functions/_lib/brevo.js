// Thin Brevo (Sendinblue) email sender. Requires BREVO_API_KEY and
// BREVO_SENDER_EMAIL in the environment. Self-contained (no cross-repo deps).
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

async function sendEmail({ to, toName, subject, html, replyTo }) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) throw new Error("BREVO_API_KEY / BREVO_SENDER_EMAIL not set.");
  const r = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      sender: { email: sender, name: "Lumora" },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent: html,
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Brevo send failed (${r.status}): ${t.slice(0, 300)}`);
  }
}

function shell(kicker, title, bodyHtml) {
  return `<div style="background:#e4e9f3;padding:36px 16px;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(31,37,64,.12)">
    <div style="background:linear-gradient(135deg,#2b3cff,#e11d48);padding:28px 28px 22px;color:#fff">
      <div style="font-weight:800;font-size:18px;letter-spacing:-.02em">lum<span style="opacity:.85">ora</span></div>
      <div style="opacity:.85;font-size:12px;margin-top:2px;text-transform:uppercase;letter-spacing:.08em">${kicker}</div>
    </div>
    <div style="padding:28px">
      <h1 style="margin:0 0 14px;font-size:20px;color:#1f2540">${title}</h1>
      ${bodyHtml}
      <p style="margin-top:26px;color:#5d6684;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div style="padding:16px 28px;background:#f4f6fb;color:#5d6684;font-size:12px;text-align:center">Sent with ❤️ by Lumora</div>
  </div>
</div>`;
}

function codeBlock(code) {
  return `<div style="text-align:center;margin:18px 0">
    <span style="display:inline-block;font-size:30px;font-weight:800;letter-spacing:8px;color:#1f2540;background:#eef1fb;border:1px solid #dbe1f2;padding:14px 22px;border-radius:14px">${code}</span>
  </div>`;
}

function resetCodeEmail({ name, code }) {
  return {
    subject: "Your Lumora password reset code",
    html: shell("Account security", "Reset your password", `<p style="color:#1f2540">Hi ${name || "there"},</p><p style="color:#1f2540">Use this code to reset your Lumora password. It expires in 10 minutes.</p>${codeBlock(code)}`),
  };
}

function verifyCodeEmail({ name, code }) {
  return {
    subject: "Verify your Lumora email",
    html: shell("Welcome to Lumora", "Verify your email", `<p style="color:#1f2540">Hi ${name || "there"},</p><p style="color:#1f2540">One more step — use this code to verify your email address. It expires in 10 minutes.</p>${codeBlock(code)}`),
  };
}


function supportEscalationEmail({ userEmail, message }) {
  return {
    subject: "New Lumora support message",
    html: shell("Support", "New message from " + userEmail, `<p style="color:#1f2540;white-space:pre-wrap">${String(message || "").replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}</p><p style="color:#5d6684;font-size:13px;margin-top:18px">Reply directly to this email to answer ${userEmail}.</p>`),
  };
}

module.exports = { sendEmail, resetCodeEmail, verifyCodeEmail, supportEscalationEmail };
