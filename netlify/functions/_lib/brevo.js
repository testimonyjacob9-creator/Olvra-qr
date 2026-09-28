// Thin Brevo (Sendinblue) email sender. Requires BREVO_API_KEY and
// BREVO_SENDER_EMAIL in the environment. Mirrors the Olvra Boost helper
// but kept self-contained so this repo has no cross-project dependency.
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

async function sendEmail({ to, toName, subject, html }) {
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
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Brevo send failed (${r.status}): ${t.slice(0, 300)}`);
  }
}

function shell(title, bodyHtml) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1f2540">
    <h2 style="margin:0 0 16px">${title}</h2>${bodyHtml}
    <p style="margin-top:28px;color:#5d6684;font-size:13px">If you didn't request this, you can ignore this email.</p>
    <p style="margin-top:4px;color:#5d6684;font-size:13px">— Lumora</p></div>`;
}

function codeBlock(code) {
  return `<p style="font-size:32px;font-weight:800;letter-spacing:6px;background:#e4e9f3;padding:16px 20px;border-radius:14px;display:inline-block">${code}</p>`;
}

function resetCodeEmail({ name, code }) {
  return {
    subject: "Your Lumora password reset code",
    html: shell("Reset your password", `<p>Hi ${name || "there"},</p><p>Use this code to reset your Lumora password. It expires in 10 minutes.</p>${codeBlock(code)}`),
  };
}

function verifyCodeEmail({ name, code }) {
  return {
    subject: "Verify your Lumora email",
    html: shell("Verify your email", `<p>Hi ${name || "there"},</p><p>Use this code to verify your email address. It expires in 10 minutes.</p>${codeBlock(code)}`),
  };
}

module.exports = { sendEmail, resetCodeEmail, verifyCodeEmail };
