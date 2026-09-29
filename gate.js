// Shared sign-in gate for pages that require an account. Content is hidden
// from the very first paint (inline CSS in each page, before any script
// runs) so a signed-out visitor never sees a flash of the real tool.
import { auth } from '/firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function requireAuth() {
  onAuthStateChanged(auth, (u) => {
    const app = document.getElementById('gatedApp');
    const gate = document.getElementById('gateScreen');
    if (u) {
      if (app) app.hidden = false;
      if (gate) gate.hidden = true;
    } else {
      const next = encodeURIComponent(location.pathname);
      const link = document.getElementById('gateLink');
      if (link) link.href = '/account?next=' + next;
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
    }
  });
}
