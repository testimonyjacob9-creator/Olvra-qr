// Country list + auto-detection. Names come from the browser (Intl.DisplayNames).
export const CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const names = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
export const nameOf = (c) => { try { return (names && names.of(c)) || c; } catch { return c; } };
export const flag = (c) => /^[A-Z]{2}$/.test(c || "") ? String.fromCodePoint(...[...c].map((x) => 127397 + x.charCodeAt(0))) : "🌍";
export const LIST = CODES.map((c) => ({ code: c, name: nameOf(c) })).sort((a, b) => a.name.localeCompare(b.name));
const TZ = { "Africa/Lagos":"NG","Africa/Accra":"GH","Africa/Nairobi":"KE","Africa/Johannesburg":"ZA","Africa/Kampala":"UG","Africa/Dar_es_Salaam":"TZ","Africa/Cairo":"EG","Africa/Addis_Ababa":"ET","Africa/Abidjan":"CI","Africa/Dakar":"SN","Africa/Kigali":"RW","Africa/Lusaka":"ZM","Africa/Harare":"ZW","Africa/Casablanca":"MA","Africa/Douala":"CM","Europe/London":"GB","Europe/Paris":"FR","Europe/Berlin":"DE","Europe/Madrid":"ES","Europe/Rome":"IT","America/New_York":"US","America/Chicago":"US","America/Denver":"US","America/Los_Angeles":"US","America/Toronto":"CA","America/Sao_Paulo":"BR","Asia/Kolkata":"IN","Asia/Dubai":"AE","Asia/Karachi":"PK","Asia/Manila":"PH","Asia/Singapore":"SG","Asia/Tokyo":"JP","Australia/Sydney":"AU" };
// Server location first (Netlify edge), then browser language, then time zone.
export async function detectCountry() {
  try {
    const r = await fetch("/api/geo", { cache: "no-store" });
    const d = await r.json();
    if (d && CODES.includes(d.country)) return d.country;
  } catch {}
  for (const l of navigator.languages || [navigator.language || ""]) {
    const c = ((l || "").split("-")[1] || "").toUpperCase();
    if (CODES.includes(c)) return c;
  }
  try { const c = TZ[Intl.DateTimeFormat().resolvedOptions().timeZone]; if (c) return c; } catch {}
  return null;
}
