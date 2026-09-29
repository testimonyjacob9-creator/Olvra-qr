// Shared sign-in gate. The gate card starts hidden and is only shown once
// Firebase has confirmed the visitor is signed out, so it never flashes.
// A localStorage hint lets returning users see the app on first paint.
import { auth } from '/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function requireAuth() {
  onAuthStateChanged(auth, (u) => {
    const app = document.getElementById('gatedApp');
    const gate = document.getElementById('gateScreen');
    if (u) {
      try { localStorage.setItem('lumora_authed', '1'); } catch (e) {}
      document.documentElement.classList.add('authed');
      if (app) app.hidden = false;
      if (gate) gate.hidden = true;
    } else {
      try { localStorage.removeItem('lumora_authed'); } catch (e) {}
      document.documentElement.classList.remove('authed');
      const next = encodeURIComponent(location.pathname);
      const link = document.getElementById('gateLink');
      if (link) link.href = '/login?next=' + next;
      if (app) app.hidden = true;
      if (gate) gate.hidden = false;
    }
  });
}
