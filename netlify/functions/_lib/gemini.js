// Thin Gemini wrapper. The ONLY file that knows about Google's API, so the
// provider/model can be swapped later without touching persona-chat.js.
// Key comes from the GEMINI_API_KEY Netlify env var, sent in a header, never in a URL.
const { IMAGE_TYPES } = require("./limits");

const E = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });
const MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
const TIMEOUT_MS = 24000;

// "data:image/jpeg;base64,...." -> { type, data } or null
function parseImage(v, maxChars) {
  if (typeof v !== "string" || !v.startsWith("data:")) return null;
  if (v.length > maxChars) throw E(413, "That image is too large. Try a smaller screenshot.", "IMAGE_TOO_LARGE");
  const i = v.indexOf(";base64,");
  if (i < 0) return null;
  const type = v.slice(5, i), data = v.slice(i + 8);
  if (!IMAGE_TYPES.includes(type) || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 100) return null;
  return { type, data };
}

// history: [{role:"user"|"model", text, hasImage}] oldest first. Only the newest
// turn carries its image; earlier images are noted in text so the same image is
// never re-sent (cost control).
function buildContents(history, text, image) {
  const turns = [];
  const push = (role, parts) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.parts.push(...parts); else turns.push({ role, parts });
  };
  for (const m of history) {
    const role = m.role === "model" ? "model" : "user";
    const t = `${m.text || ""}${m.hasImage ? "\n[The user shared a screenshot here earlier. It is not attached again.]" : ""}`.trim();
    if (!t) continue;
    if (!turns.length && role !== "user") continue; // must start with a user turn
    push(role, [{ text: t }]);
  }
  const parts = [];
  if (image) parts.push({ inlineData: { mimeType: image.type, data: image.data } });
  parts.push({ text: text || "Here is a screenshot. Please take a look." });
  push("user", parts);
  return turns;
}

async function generate({ system, contents, maxOutputTokens, temperature = 0.9 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw E(503, "AI Personas are temporarily unavailable. Please try again later.", "NOT_CONFIGURED");
  const model = MODEL();
  const generationConfig = { maxOutputTokens, temperature };
  // 2.5 Flash "thinking" tokens count against maxOutputTokens; turn them off for fast, cheap chat.
  const tb = process.env.GEMINI_THINKING_BUDGET;
  if (tb !== undefined && tb !== "") generationConfig.thinkingConfig = { thinkingBudget: Number(tb) };
  else if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig }),
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw E(504, "That took too long. Please try again.", "TIMEOUT");
    console.error("gemini network", e && e.message);
    throw E(502, "Couldn't reach the AI right now. Please try again.", "NETWORK");
  } finally { clearTimeout(timer); }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Gemini API", res.status, detail.slice(0, 500)); // logged server-side only
    if (res.status === 429) throw E(429, "The AI is busy right now. Please try again in a minute.", "AI_BUSY");
    if (res.status === 400 && /image|inline|mime/i.test(detail)) throw E(422, "I couldn't read that image. Try a clearer screenshot or a JPG/PNG.", "BAD_IMAGE");
    if (res.status === 401 || res.status === 403 || res.status === 404) throw E(503, "AI Personas are temporarily unavailable. Please try again later.", "AI_CONFIG");
    throw E(502, "Couldn't get a reply right now. Please try again.", "AI_ERROR");
  }
  const data = await res.json().catch(() => ({}));
  const cand = data.candidates && data.candidates[0];
  const blocked = (data.promptFeedback && data.promptFeedback.blockReason) || (cand && ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"].includes(cand.finishReason));
  const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map((p) => p.text || "").join("").trim() : "";
  if (blocked && !text) throw E(422, "I can't help with that one. Try rephrasing, or a different image.", "BLOCKED");
  if (!text) throw E(502, "Couldn't get a reply right now. Please try again.", "EMPTY");
  const u = data.usageMetadata || {};
  return { text, tokensIn: u.promptTokenCount || 0, tokensOut: u.candidatesTokenCount || 0, model };
}

module.exports = { parseImage, buildContents, generate, E };
