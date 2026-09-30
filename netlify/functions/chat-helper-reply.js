// POST /.netlify/functions/chat-helper-reply   Authorization: Bearer <Firebase ID token>
// Body: { persona, message }  ->  { replies: [string, string] }
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

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") throw err(405, "Method not allowed.");
    await requireActive(event);

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { throw err(400, "Invalid request."); }
    const persona = String(body.persona || "");
    const message = String(body.message || "").trim().slice(0, 2000);
    const systemPrompt = PERSONA_PROMPTS[persona];
    if (!systemPrompt || !message) throw err(400, "Choose a voice and enter a message.");

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw err(503, "Chat helper is temporarily unavailable. Please try again later.");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt + " Give exactly two short reply options, one per line, no numbering, no quotation marks, no preamble.",
        messages: [{ role: "user", content: message }],
      }),
    });
    if (!res.ok) { console.error("Anthropic API", res.status, await res.text().catch(() => "")); throw err(502, "Couldn't get a reply right now. Please try again."); }
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("\n");
    const replies = text.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 2);
    if (!replies.length) throw err(502, "Couldn't get a reply right now. Please try again.");
    return ok({ replies });
  } catch (e) { return fail(e); }
};
