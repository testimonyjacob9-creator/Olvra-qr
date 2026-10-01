// POST /.netlify/functions/persona-chat   Authorization: Bearer <Firebase ID token>
// Actions (body.action):
//   "list"   -> { tier, personas:[public view + locked], limits, usage }
//   "send"   -> { personaId, conversationId?, message, image? } -> { conversationId, reply, usage }
//   "delete" -> { conversationId } -> { ok }
// Access, limits and system prompts are all decided HERE from trusted data.
// The browser only ever sends a persona id, text and an optional image.
const { requireActive } = require("./_lib/guard");
const { admin, db, FieldValue } = require("./_lib/firebase-admin");
const { PERSONAS, getPersona, buildSystemPrompt, publicView } = require("./_lib/personas");
const L = require("./_lib/limits");
const G = require("./_lib/gemini");
const PI = require("./_lib/persona-images");

const E = G.E;
const reply = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });
const usageRef = (uid) => db.collection("aiUsage").doc(`${uid}_${L.dayKey()}`);
const convs = (uid) => db.collection("users").doc(uid).collection("conversations");

// Phase 8 hook: custom personas created from a conversation ("custom:<id>") will
// be resolved here from a server-owned collection. Not enabled yet.
function resolvePersona(_uid, id) { return getPersona(id); }

// Atomically check limits and reserve one message (and one image) before calling Gemini.
async function reserve(uid, tier, hasImage, personaId) {
  const lim = L.LIMITS[tier], ref = usageRef(uid), now = Date.now();
  return db.runTransaction(async (t) => {
    const s = await t.get(ref), u = s.exists ? s.data() : {};
    const inWindow = now - (u.minuteStart || 0) < 60000;
    const minuteCount = inWindow ? u.minuteCount || 0 : 0;
    if (minuteCount >= lim.perMinute) throw E(429, "You're sending messages very fast. Wait a few seconds and try again.", "RATE_LIMITED");
    if ((u.messages || 0) >= lim.dailyMessages) throw E(429, `You've used today's ${lim.dailyMessages} messages. Come back tomorrow${tier === "free" ? " or upgrade for more" : ""}.`, "DAILY_LIMIT");
    if (hasImage && (u.images || 0) >= lim.dailyImages) throw E(429, `You've used today's ${lim.dailyImages} image uploads. Send a text message instead, or try again tomorrow.`, "IMAGE_LIMIT");
    t.set(ref, {
      uid, day: L.dayKey(), messages: FieldValue.increment(1), images: FieldValue.increment(hasImage ? 1 : 0),
      minuteStart: inWindow ? u.minuteStart : now, minuteCount: minuteCount + 1,
      byPersona: { [personaId]: FieldValue.increment(1) }, updatedAt: now,
    }, { merge: true });
    return { messages: (u.messages || 0) + 1, images: (u.images || 0) + (hasImage ? 1 : 0) };
  });
}
const refund = (uid, hasImage, personaId) =>
  usageRef(uid).set({ messages: FieldValue.increment(-1), images: FieldValue.increment(hasImage ? -1 : 0), byPersona: { [personaId]: FieldValue.increment(-1) } }, { merge: true }).catch(() => {});

async function readUsage(uid) {
  const s = await usageRef(uid).get(), u = s.exists ? s.data() : {};
  return { messages: u.messages || 0, images: u.images || 0 };
}
const publicLimits = (lim) => ({ dailyMessages: lim.dailyMessages, dailyImages: lim.dailyImages, maxInputChars: lim.maxInputChars });

async function list(uid, data) {
  const tier = L.tierOf(data);
  const until = L.tierOf(data) === "premium" && data.premiumUntil && data.premiumUntil.toDate ? data.premiumUntil.toDate().toISOString() : null;
  let v = {};
  try { v = await PI.versions(); } catch (e) { console.error("persona images", e && e.message); } // portraits are optional; never block the list
  return { tier, premiumUntil: until,
    personas: PERSONAS.map((p) => ({ ...publicView(p, tier), image: PI.imageUrl(p.id, v[p.id]) || p.image || null })), limits: publicLimits(L.LIMITS[tier]), usage: await readUsage(uid) };
}

async function send(uid, data, body) {
  const tier = L.tierOf(data), lim = L.LIMITS[tier];
  const persona = resolvePersona(uid, body.personaId);
  if (!persona) throw E(404, "That persona doesn't exist.", "NO_PERSONA");
  if (!L.canAccess(tier, persona.accessLevel)) {
    throw Object.assign(E(403, `${persona.name} is a ${L.BADGE[persona.accessLevel]} persona. Upgrade to chat with ${persona.name}.`, "PREMIUM_REQUIRED"), { upgradeUrl: "/account" });
  }
  const text = typeof body.message === "string" ? body.message.trim() : "";
  if (text.length > lim.maxInputChars) throw E(413, `That message is too long. Keep it under ${lim.maxInputChars} characters.`, "TOO_LONG");
  const image = body.image ? G.parseImage(body.image, lim.maxImageChars) : null;
  if (body.image && !image) throw E(422, "That image type isn't supported. Use a JPG, PNG or WebP.", "BAD_IMAGE");
  if (image && !(persona.capabilities && persona.capabilities.images)) throw E(422, `${persona.name} can't look at images.`, "NO_IMAGES");
  if (!text && !image) throw E(400, "Say something to get started.", "EMPTY");
  if (!process.env.GEMINI_API_KEY) throw E(503, "AI Personas are temporarily unavailable. Please try again later.", "NOT_CONFIGURED");

  // Existing conversation must belong to this user and this persona.
  let convRef = null, isNew = true;
  if (body.conversationId) {
    convRef = convs(uid).doc(String(body.conversationId));
    const cs = await convRef.get();
    if (!cs.exists) throw E(404, "That conversation no longer exists. Start a new one.", "NO_CONVERSATION");
    if (cs.data().personaId !== persona.id) throw E(400, "That conversation belongs to a different persona.", "WRONG_PERSONA");
    isNew = false;
  } else convRef = convs(uid).doc();

  const used = await reserve(uid, tier, !!image, persona.id);
  try {
    let history = [];
    if (!isNew) {
      const snap = await convRef.collection("messages").orderBy("createdAt", "desc").limit(lim.historyMessages).get();
      history = snap.docs.map((d) => d.data()).reverse();
    }
    const out = await G.generate({
      system: buildSystemPrompt(persona), contents: G.buildContents(history, text, image), maxOutputTokens: lim.maxOutputTokens,
    });

    const now = Date.now(), batch = db.batch();
    batch.set(convRef.collection("messages").doc(), { role: "user", text, hasImage: !!image, createdAt: now });
    batch.set(convRef.collection("messages").doc(), { role: "model", text: out.text, createdAt: now + 1 });
    const preview = out.text.slice(0, 80);
    if (isNew) batch.set(convRef, { personaId: persona.id, title: (text || "Screenshot chat").slice(0, 40), createdAt: now, updatedAt: now + 1, messageCount: 2, preview });
    else batch.update(convRef, { updatedAt: now + 1, messageCount: FieldValue.increment(2), preview });
    await batch.commit();
    usageRef(uid).set({ tokensIn: FieldValue.increment(out.tokensIn), tokensOut: FieldValue.increment(out.tokensOut) }, { merge: true }).catch(() => {});

    return { conversationId: convRef.id, reply: out.text, usage: { messages: used.messages, images: used.images, dailyMessages: lim.dailyMessages, dailyImages: lim.dailyImages } };
  } catch (e) {
    await refund(uid, !!image, persona.id);
    throw e;
  }
}

async function remove(uid, body) {
  if (!body.conversationId) throw E(400, "Missing conversation.", "EMPTY");
  const ref = convs(uid).doc(String(body.conversationId));
  if (!(await ref.get()).exists) throw E(404, "That conversation no longer exists.", "NO_CONVERSATION");
  await db.recursiveDelete(ref);
  return { ok: true };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") throw E(405, "Method not allowed.");
    if ((event.body || "").length > L.MAX_BODY_CHARS) throw E(413, "That request is too large.", "TOO_LARGE");
    const { decoded, data } = await requireActive(event);
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { throw E(400, "Invalid request."); }
    const action = body.action || "send";
    if (action === "list") return reply(200, await list(decoded.uid, data));
    if (action === "send") return reply(200, await send(decoded.uid, data, body));
    if (action === "delete") return reply(200, await remove(decoded.uid, body));
    throw E(400, "Unknown action.");
  } catch (e) {
    if (e && e.statusCode && e.statusCode < 500 || (e && e.code)) return reply(e.statusCode || 500, { error: e.message, code: e.code || null, upgradeUrl: e.upgradeUrl || null });
    console.error("persona-chat", e);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
};
