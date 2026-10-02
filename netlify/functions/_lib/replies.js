// Turns one model reply into 1-4 short chat bubbles, the way a person texts.
// The model is asked to separate bubbles with a line containing only "---". If it forgets and sends a long
// block, we fall back to splitting on blank lines so replies never arrive as one wall of text.
const MAX_PARTS = 4;

const clean = (t) => t
  .replace(/\*\*([^*\n]+)\*\*/g, "$1")           // **bold** -> bold (the chat shows plain text)
  .replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=[\s).,!?;:]|$)/g, "$1$2") // *italic* -> italic (not "2 * 3 * 4")
  .replace(/^#{1,6}\s+/gm, "")                    // markdown headings
  .trim();

function splitReplies(raw) {
  const text = String(raw || "").replace(/\r/g, "").trim();
  if (!text) return [];
  let parts = text.split(/\n[ \t]*-{3,}[ \t]*\n/).map((p) => p.replace(/^\s*-{3,}\s*|\s*-{3,}\s*$/g, "").trim()).filter(Boolean);
  if (parts.length === 1 && text.length > 260) {
    const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paras.length > 1) parts = paras;
  }
  parts = parts.map(clean).filter(Boolean);
  if (parts.length > MAX_PARTS) parts = [...parts.slice(0, MAX_PARTS - 1), parts.slice(MAX_PARTS - 1).join("\n\n")];
  return parts.length ? parts : [clean(text)];
}

module.exports = { splitReplies };
