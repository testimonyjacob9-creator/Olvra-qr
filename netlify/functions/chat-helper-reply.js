// netlify/functions/chat-helper-reply.js
//
// Server-side endpoint for Chat helper. Keeps the Anthropic API key off
// the client. Wire this up once an API key is available:
//   1. Set ANTHROPIC_API_KEY in Netlify's environment variables.
//   2. Fill in PERSONA_PROMPTS below with each persona's system prompt.
//   3. Uncomment the fetch() call and remove the stub response.
//   4. In helper.html, point getReplies() at this function (see the
//      commented-out fetch() there for the exact shape).
//
// Body: { persona, message }
// Returns: { ok, replies: [string, string] } or { ok:false, error }

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid JSON' }) }; }

  const { persona, message } = body;
  const systemPrompt = PERSONA_PROMPTS[persona];
  if (!systemPrompt || !message) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Missing or unknown persona, or missing message.' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
  if (!ANTHROPIC_API_KEY) {
    // Stub: no key configured yet. Returns a clearly-labelled placeholder
    // instead of a real generation, so the front end keeps working.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        replies: [
          `[Stub] ANTHROPIC_API_KEY is not set yet — this is a placeholder ${persona} reply.`,
          `[Stub] Add the key in Netlify env vars to get real replies.`
        ]
      })
    };
  }

  try {
    // const res = await fetch('https://api.anthropic.com/v1/messages', {
    //   method: 'POST',
    //   headers: {
    //     'x-api-key': ANTHROPIC_API_KEY,
    //     'anthropic-version': '2023-06-01',
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     model: 'claude-sonnet-4-6',
    //     max_tokens: 400,
    //     system: systemPrompt + " Give exactly two short reply options, one per line, no numbering, no preamble.",
    //     messages: [{ role: 'user', content: message }]
    //   })
    // });
    // const data = await res.json();
    // const text = (data.content || []).map(b => b.text || '').join('\n');
    // const replies = text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 2);
    // return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, replies }) };

    return { statusCode: 501, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Not yet wired to Anthropic API.' }) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
