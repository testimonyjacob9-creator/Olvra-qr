// netlify/functions/list-banks-proxy.js — server-to-server passthrough to
// WoodPay's public bank list, so the browser only ever talks to Lumora's
// own domain (avoids CORS entirely).
const WOODPAY_BASE = process.env.WOODPAY_BASE_URL || "https://woodpay.netlify.app";
exports.handler = async () => {
  try {
    const res = await fetch(WOODPAY_BASE + "/.netlify/functions/list-banks");
    const data = await res.json();
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "Could not load bank list." }) };
  }
};
