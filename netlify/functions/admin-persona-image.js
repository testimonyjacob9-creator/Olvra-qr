// POST /.netlify/functions/admin-persona-image   Authorization: Bearer <ID token, admin only>
// Body: { action: "list" } | { action: "set", personaId, image: "data:image/webp;base64,..." } | { action: "reset", personaId }
const { db, FieldValue } = require("./_lib/firebase-admin");
const { requireAuth } = require("./_lib/require-auth");
const { assertAdmin } = require("./_lib/notify");
const { ok, fail } = require("./_lib/respond");
const { PERSONAS } = require("./_lib/personas");
const PI = require("./_lib/persona-images");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return fail(PI.err("Method not allowed.", 405));
  try {
    const decoded = await requireAuth(event);
    await assertAdmin(db, decoded.uid);                       // every action, including "list", is admin-only
    if ((event.body || "").length > 400 * 1024) throw PI.err("That request is too large.", 413);
    let body; try { body = JSON.parse(event.body || "{}"); } catch { throw PI.err("Invalid request."); }
    const action = body.action || "list";

    if (action === "list") {
      const v = await PI.versions();
      return ok({ personas: PERSONAS.map((p) => ({ id: p.id, name: p.name, title: p.title, accessLevel: p.accessLevel, avatar: p.avatar, image: PI.imageUrl(p.id, v[p.id]), custom: !!v[p.id] })) });
    }

    const persona = PERSONAS.find((p) => p.id === body.personaId);   // only the 10 known ids; nothing else can be written
    if (!persona) throw PI.err("Unknown persona.", 404);
    const ts = Date.now();

    if (action === "set") {
      const img = PI.parseUpload(body.image);
      await PI.IMAGES().doc(persona.id).set({ mime: img.mime, data: img.buf.toString("base64"), bytes: img.buf.length, w: img.w, h: img.h, updatedAt: ts, by: decoded.uid });
      await PI.META().set({ v: { [persona.id]: ts } }, { merge: true });
    } else if (action === "reset") {
      await PI.IMAGES().doc(persona.id).delete();
      await PI.META().set({ v: { [persona.id]: FieldValue.delete() } }, { merge: true });
    } else throw PI.err("Unknown action.");

    await db.collection("adminLog").add({ by: decoded.uid, action: "persona-image-" + action, persona: persona.id, at: FieldValue.serverTimestamp() });
    return ok({ id: persona.id, image: action === "set" ? PI.imageUrl(persona.id, ts) : null, custom: action === "set" });
  } catch (e) { return fail(e); }
};
