// GET /.netlify/functions/get-vapid-key
// Returns the VAPID public key the server actually signs pushes with, so
// the client never has its own hardcoded copy that could drift out of sync
// with VAPID_PRIVATE_KEY on the server (same fix WoodPayVTU applied).
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed." }) };
  if (!VAPID_PUBLIC) return { statusCode: 500, body: JSON.stringify({ error: "Push is not configured yet." }) };
  return { statusCode: 200, headers: { "content-type": "application/json", "Cache-Control": "public, max-age=300" }, body: JSON.stringify({ publicKey: VAPID_PUBLIC }) };
};
