// GET /api/geo -> { country: "NG" } from the visitor's IP (Netlify geolocation).
export default async (request, context) =>
  new Response(JSON.stringify({ country: (context.geo && context.geo.country && context.geo.country.code) || null }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const config = { path: "/api/geo" };
