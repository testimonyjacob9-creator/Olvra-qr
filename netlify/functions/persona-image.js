// GET /.netlify/functions/persona-image?id=<personaId>&v=<version>
// Public (portraits are marketing images). Serves only images an admin uploaded for one of the 10 known persona ids.
// The URL is versioned (v), so browsers and the CDN can cache it for a year; a new upload changes v.
const { PERSONAS } = require("./_lib/personas");
const { IMAGES } = require("./_lib/persona-images");

const plain = (code, msg) => ({ statusCode: code, headers: { "content-type": "text/plain", "cache-control": "no-store" }, body: msg });

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") return plain(405, "Method not allowed");
  const id = (event.queryStringParameters || {}).id;
  if (!PERSONAS.some((p) => p.id === id)) return plain(404, "Not found");
  try {
    const s = await IMAGES().doc(id).get();
    if (!s.exists) return plain(404, "Not found");
    const d = s.data();
    return {
      statusCode: 200, isBase64Encoded: true, body: d.data,
      headers: {
        "content-type": d.mime, "x-content-type-options": "nosniff", "x-robots-tag": "noindex", "content-security-policy": "default-src 'none'",
        "cache-control": "public, max-age=31536000, immutable",
      },
    };
  } catch (e) { console.error("persona-image", e && e.message); return plain(500, "Error"); }
};
