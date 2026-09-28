// Adds a per-message preview card (WhatsApp, Telegram, X, etc.) to /l/<code>.
// Only the sender and recipient names are shown. The message text is never exposed.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async (request, context) => {
  const url = new URL(request.url);
  const id = url.pathname.split('/').filter(Boolean).pop() || '';
  const res = await context.rewrite('/view.html');
  if (!/^[a-z2-9]{12,20}$/.test(id)) return res;
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/olvraqr/databases/(default)/documents/love/${id}`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return res;
    const f = (await r.json()).fields || {};
    const from = f.from && f.from.stringValue, to = f.to && f.to.stringValue;
    if (!from || !to) return res;
    const theme = Math.min(2, Math.max(0, parseInt((f.theme && f.theme.integerValue) || '0', 10) || 0));
    const title = `${from} sent you a message 💌`;
    const desc = `A private message for ${to}. Tap to open it.`;
    const img = `${url.origin}/love-og-${theme}.jpg`;
    const tags = `<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="${url.origin}${url.pathname}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${img}">`;
    let html = await res.clone().text();
    html = html.replace(/<title>.*?<\/title>/, () => `<title>${esc(title)}</title>`).replace('</head>', () => tags + '</head>');
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    headers.set('content-type', 'text/html; charset=utf-8');
    return new Response(html, { status: res.status, headers });
  } catch (e) {
    return res;
  }
};

export const config = { path: '/l/*' };
