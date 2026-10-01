// Persona portraits uploaded by admins. Stored server-side in Firestore (no Storage bucket needed):
//   personaImages/{personaId}   { mime, data(base64), bytes, w, h, updatedAt, by }   (read only by the persona-image function)
//   appConfig/personaImages     { v: { <personaId>: <version timestamp> } }           (tiny; read by persona-chat "list")
// Both collections are denied to browsers by the Firestore catch-all rule; only the admin SDK touches them.
const { db } = require("./firebase-admin");
const IMAGES = () => db.collection("personaImages");
const META = () => db.collection("appConfig").doc("personaImages");
const MAX_BYTES = 200 * 1024, MIN_SIDE = 256, MAX_SIDE = 1024;

const err = (m, c = 400) => Object.assign(new Error(m), { statusCode: c });

// Reads the real pixel size from the file header (no image library needed).
function dimensions(b, mime) {
  try {
    if (mime === "image/png") return b.toString("ascii", 12, 16) === "IHDR" ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
    if (mime === "image/webp") {
      if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
      const t = b.toString("ascii", 12, 16);
      if (t === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (t === "VP8L") return { w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
      if (t === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      return null;
    }
    if (mime === "image/jpeg") {
      if (b[0] !== 0xff || b[1] !== 0xd8) return null;
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch {}
  return null;
}

// Accepts only a data: URL of a JPEG/PNG/WebP whose header, size and dimensions all check out.
function parseUpload(s) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof s === "string" ? s : "");
  if (!m) throw err("Upload a JPG, PNG or WebP image.", 422);
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length || buf.length > MAX_BYTES) throw err(`That image is too large after optimizing (max ${MAX_BYTES / 1024} KB).`, 413);
  const d = dimensions(buf, m[1]);
  if (!d) throw err("That file isn't a valid image of the type it claims to be.", 422);
  if (d.w < MIN_SIDE || d.h < MIN_SIDE || d.w > MAX_SIDE || d.h > MAX_SIDE) throw err(`Image must be between ${MIN_SIDE} and ${MAX_SIDE}px on each side.`, 422);
  if (Math.abs(d.w - d.h) > Math.max(d.w, d.h) * 0.05) throw err("Portraits must be square.", 422);
  return { mime: m[1], buf, w: d.w, h: d.h };
}

async function versions() {
  const s = await META().get();
  return (s.exists && s.data().v) || {};
}
const imageUrl = (id, v) => (v ? `/.netlify/functions/persona-image?id=${encodeURIComponent(id)}&v=${Number(v)}` : null);

module.exports = { IMAGES, META, parseUpload, versions, imageUrl, err, MAX_BYTES };
