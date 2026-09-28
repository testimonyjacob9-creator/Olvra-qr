// Shared sign-in gate for pages that require an account (QR, Card, Love).
// The recipient-facing /l/<code> page must NOT use this — messages are for anyone with the link.
import { auth } from '/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function requireAuth(onReady) {
  const g = document.createElement('div');
  g.id = 'authGate';
  g.style.cssText = 'position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;text-align:center;padding:28px;background:var(--bg,#e4e9f3);font-family:"Plus Jakarta Sans",system-ui,sans-serif';
  g.innerHTML = `<div>
    <div style="font-size:44px;margin-bottom:6px">💌</div>
    <p style="font-weight:800;font-size:1.25rem;margin-bottom:8px;color:var(--ink,#1f2540)">Sign in to continue</p>
    <p style="color:var(--dim,#5d6684);margin-bottom:20px;max-width:34ch">Create a free Lumora account. It only takes a moment.</p>
    <a href="/account?next=${encodeURIComponent(location.pathname)}" style="display:inline-block;background:#2b3cff;color:#fff;padding:14px 26px;border-radius:14px;text-decoration:none;font-weight:700">Sign in or create account</a>
  </div>`;
  document.body.appendChild(g);
  onAuthStateChanged(auth, (u) => {
    if (u) { g.remove(); onReady && onReady(u); }
  });
}
