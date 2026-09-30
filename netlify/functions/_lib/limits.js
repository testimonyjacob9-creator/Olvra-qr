// Central access + usage configuration for Lumora AI Personas.
// Change numbers here only. Nothing else in the codebase hardcodes limits.

// Higher rank = more access. "standard" exists so a Standard plan can be added
// later: make tierOf() return "standard" for those subscribers, add their limits
// below, and change BADGE.standard to "STANDARD". No persona code changes needed.
const TIER_RANK = { free: 0, standard: 1, premium: 2 };

// What the UI shows for each persona access level. Until a Standard plan
// exists, "standard" personas are sold as Premium.
const BADGE = { free: "FREE", standard: "PREMIUM", premium: "PREMIUM" };

// Day boundary for daily limits. 1 = resets at midnight West Africa Time (UTC+1).
const RESET_UTC_OFFSET_HOURS = 1;

const LIMITS = {
  free:     { dailyMessages: 15,  dailyImages: 3,  perMinute: 5,  historyMessages: 10, maxInputChars: 1500, maxOutputTokens: 500, maxImageChars: 2000000 },
  standard: { dailyMessages: 60,  dailyImages: 10, perMinute: 8,  historyMessages: 12, maxInputChars: 2000, maxOutputTokens: 700, maxImageChars: 2000000 },
  premium:  { dailyMessages: 150, dailyImages: 25, perMinute: 12, historyMessages: 16, maxInputChars: 3000, maxOutputTokens: 900, maxImageChars: 2500000 },
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BODY_CHARS = 3400000; // reject oversized requests before parsing

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d;
}

// Trusted tier from the users/{uid} document. premiumUntil in the future
// (paid OR the 7-day trial) means premium.
function tierOf(userData, now = new Date()) {
  const until = toDate(userData && userData.premiumUntil);
  if (until && until > now) return "premium";
  return "free";
}

const canAccess = (userTier, requiredLevel) => (TIER_RANK[userTier] || 0) >= (TIER_RANK[requiredLevel] || 0);
const dayKey = (now = Date.now()) => new Date(now + RESET_UTC_OFFSET_HOURS * 3600000).toISOString().slice(0, 10);

module.exports = { TIER_RANK, BADGE, LIMITS, IMAGE_TYPES, MAX_BODY_CHARS, RESET_UTC_OFFSET_HOURS, tierOf, canAccess, dayKey };
