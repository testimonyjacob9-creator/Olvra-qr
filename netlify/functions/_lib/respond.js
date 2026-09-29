const j = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ok = (body = {}) => j(200, body);
const fail = (err) => { console.error(err); return j(err.statusCode || 500, { error: err.message || "Something went wrong." }); };
module.exports = { ok, fail };
