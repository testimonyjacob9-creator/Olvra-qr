// POST /.netlify/functions/chat-helper-reply   Authorization: Bearer <Firebase ID token>
// Body: { persona, messages: [{role:"user"|"assistant", content}] }  ->  { reply: string }
// Requires ANTHROPIC_API_KEY in Netlify env vars. Messages are sent to the AI
// provider to generate replies and are not stored by Lumora.
const { requireActive } = require("./_lib/guard");
const { ok, fail } = require("./_lib/respond");

const PERSONA_PROMPTS = {
  nonchalant: "You write cool, short replies that don't try too hard.",
  observer: "You are a sharp observer, mentalist-style: you spot what doesn't add up in a conversation and tell the user what to ask next, rather than writing a reply for them.",
  confident: "You write calm, self-assured replies. Never desperate, never over-explaining.",
  charming: "You write warm, smooth, a little flirty replies.",
  funny: "You write playful replies and light jokes that keep the chat fun.",
  straight: "You write clear, honest, direct replies. No games, no hidden meaning.",
  romantic: "You write sweet, heartfelt replies.",
  peacemaker: "You help calm an argument and word an apology the right way.",
  boundary: "You write replies that politely say no and hold a boundary without starting a fight.",
  confrontation: "You roleplay as the other person in a hard conversation the user needs to practise — you deflect and deny plausibly — then give a short, honest red-flags recap at the end.",
};

const MODEL = process.env.HELPER_MODEL || "claude-haiku-4-5-20251001";
const err = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const BASE = "You are Lumora's Chat helper: a warm, sharp assistant that helps people with texting, dating, friendships, family and hard conversations. Talk like a friend in a normal chat: natural, concise (under 120 words unless asked for more), no headings, no bullet lists. " +
  "When the user shares a message they received or asks what to say, give one to three ready-to-send replies. Put each sendable reply on its own line starting with '> ' (and nothing else on that line), with at most a sentence or two of context around them. " +
  "Stay honest and respectful: never help harass, threaten, manipulate or deceive someone; steer toward clear, kind communication instead. If someone seems in danger or in crisis, respond with care and encourage them to reach a trusted person or local emergency help. Your voice: ";

function clean(list) {
  const out = [];
  for (const m of (Array.isArray(list) ? list : []).slice(-20)) {
    const role = m && m.role === "assistant" ? "assistant" : m && m.role === "user" ? "user" : null;
    const content = String((m && m.content) || "").trim().slice(0, 2000);
    if (!role || !content) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n" + content;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") throw err(405, "Method not allowed.");
    await requireActive(event);
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { throw err(400, "Invalid request."); }
    const persona = PERSONA_PROMPTS[String(body.persona || "")];
    const messages = clean(body.messages || (body.message ? [{ role: "user", content: body.message }] : []));
    if (!persona || !messages.length || messages[messages.length - 1].role !== "user") throw err(400, "Say something to get started.");

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw err(503, "Chat helper is temporarily unavailable. Please try again later.");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, system: BASE + persona, messages }),
    });
    if (!res.ok) { console.error("Anthropic API", res.status, await res.text().catch(() => "")); throw err(502, "Couldn't get a reply right now. Please try again."); }
    const data = await res.json();
    const reply = (data.content || []).map((b) => b.text || "").join("\n").trim();
    if (!reply) throw err(502, "Couldn't get a reply right now. Please try again.");
    return ok({ reply });
  } catch (e) { return fail(e); }
};
