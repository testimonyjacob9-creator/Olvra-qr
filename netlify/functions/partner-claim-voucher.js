// netlify/functions/partner-claim-voucher.js
// Called by WoodPay (claim-gift-to-wallet.js) when a signed-in WoodPay user
// saves a gift to their wallet. Atomically flips the voucher from
// 'unredeemed' to 'redeemed' (as wallet) and returns its amount so WoodPay
// can credit it. Retrying with the same claimer is safe (returns the same
// amount); a different claimer is refused. If WoodPay then fails to credit,
// it calls partner-refund-voucher to re-open the voucher.
// Body: { secret, reference, claimedBy }
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!raw) throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables.");
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
}
const db = admin.firestore();
const out = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const LUMORA_PARTNER_SECRET = process.env.LUMORA_PARTNER_SECRET || "";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { ok: false, error: "Method not allowed." });
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return out(400, { ok: false, error: "Invalid JSON" }); }
  if (!LUMORA_PARTNER_SECRET || body.secret !== LUMORA_PARTNER_SECRET) return out(401, { ok: false, error: "Unauthorized" });
  const { reference, claimedBy } = body;
  if (!reference || !claimedBy) return out(400, { ok: false, error: "Missing reference or claimer." });

  const voucherRef = db.collection("vouchers").doc(String(reference));
  try {
    const result = await db.runTransaction(async (t) => {
      const snap = await t.get(voucherRef);
      if (!snap.exists) throw new Error("NOT_FOUND");
      const v = snap.data();
      if (v.status === "redeemed" && v.redeemedAs === "wallet" && v.walletClaimedBy === String(claimedBy)) {
        return { amount: v.amount, repeat: true }; // same person retrying
      }
      if (v.status !== "unredeemed") throw Object.assign(new Error("NOT_AVAILABLE"), { status: v.status });
      if (v.expiresAt && v.expiresAt.toDate() < new Date()) throw new Error("EXPIRED");
      t.update(voucherRef, {
        status: "redeemed", redeemedAs: "wallet", walletClaimedBy: String(claimedBy),
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { amount: v.amount, repeat: false };
    });
    return out(200, { ok: true, amount: result.amount, repeat: result.repeat });
  } catch (e) {
    if (e.message === "NOT_FOUND") return out(200, { ok: false, error: "This gift link isn't valid." });
    if (e.message === "EXPIRED") return out(200, { ok: false, error: "This gift has expired." });
    if (e.message === "NOT_AVAILABLE") return out(200, { ok: false, error: e.status === "redeemed" ? "This gift has already been redeemed." : "This gift is being redeemed right now. Try again in a moment." });
    console.error("partner-claim-voucher", e);
    return out(500, { ok: false, error: "Something went wrong. Please try again." });
  }
};
