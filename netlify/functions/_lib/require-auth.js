const { admin } = require("./firebase-admin");
async function requireAuth(event) {
  const m = (event.headers.authorization || event.headers.Authorization || "").match(/^Bearer (.+)$/i);
  if (!m) throw Object.assign(new Error("Sign in first."), { statusCode: 401 });
  const decoded = await admin.auth().verifyIdToken(m[1], true).catch(() => null);
  if (!decoded) throw Object.assign(new Error("Session expired. Sign in again."), { statusCode: 401 });
  return decoded;
}
module.exports = { requireAuth };
