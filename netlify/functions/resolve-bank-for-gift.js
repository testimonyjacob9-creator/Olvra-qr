// netlify/functions/resolve-bank-for-gift.js — calls WoodPay's
// partner-resolve-bank with the shared secret, kept server-side.
// Body: { accountNumber, bankCode }
const WOODPAY_BASE = process.env.WOODPAY_BASE_URL || "https://woodpay.netlify.app";
const LUMORA_PARTNER_SECRET = process.env.LUMORA_PARTNER_SECRET || "";
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  let body; try { body = JSON.parse(event.body); } catch (e) { return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Invalid JSON" }) }; }
  const { accountNumber, bankCode } = body;
  if (!accountNumber || !bankCode) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "Missing account number or bank." }) };
  try {
    const res = await fetch(WOODPAY_BASE + "/.netlify/functions/partner-resolve-bank", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: LUMORA_PARTNER_SECRET, accountNumber, bankCode }),
    });
    const data = await res.json();
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "Lookup failed." }) };
  }
};
