// Shared header (logo + notification bell) and bottom nav bar, matching the
// look of Olvra Boost / WoodPayVTU. Injects markup + wires the bell to
// users/{uid}/notifications (unread count). Safe to call on public pages —
// the bell/Me link just point to /account, which itself requires sign-in.
import { auth, db } from "/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-9z" stroke-linejoin="round"/></svg>',
  love: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7.5-4.6-10-9.3C.5 8 2.3 4.5 6 4c2-.3 3.7.7 6 3 2.3-2.3 4-3.3 6-3 3.7.5 5.5 4 4 7.7C19.5 16.4 12 21 12 21z" stroke-linejoin="round"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke-linecap="round"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.3" stroke-linecap="round"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/></svg>',
};
const ITEMS = [
  ["/", "home", "Home"],
  ["/love", "love", "Love"],
  ["/account", "me", "Me"],
  ["/help", "help", "Help"],
];

export function mountNav({ showLogo = true } = {}) {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "/nav.css";
  document.head.appendChild(link);

  if (showLogo) {
    const bar = document.createElement("div");
    bar.className = "appbar";
    bar.innerHTML = `<a class="logo" href="/">lum<span>ora</span></a>
      <div class="appbar-r"><a class="bellbtn" id="navBell" href="/account#notifications" aria-label="Notifications">🔔<span class="bell-badge" id="navBellBadge"></span></a></div>`;
    document.body.prepend(bar);
  }

  const path = location.pathname.replace(/\/$/, "") || "/";
  const nav = document.createElement("div");
  nav.className = "bottom-nav";
  nav.innerHTML = `<div class="bottom-nav-inner">${ITEMS.map(([href, key, label]) => {
    const active = href === path || (href !== "/" && path.startsWith(href));
    return `<a class="nav-item${active ? " active" : ""}" href="${href}">${ICONS[key]}<span>${label}</span></a>`;
  }).join("")}</div>`;
  document.body.appendChild(nav);

  let unsub = null;
  onAuthStateChanged(auth, (u) => {
    if (unsub) { unsub(); unsub = null; }
    const badge = document.getElementById("navBellBadge");
    if (!badge) return;
    if (!u) { badge.classList.remove("on"); return; }
    const q = query(collection(db, "users", u.uid, "notifications"), where("read", "==", false));
    unsub = onSnapshot(q, (snap) => {
      const n = snap.size;
      badge.textContent = n > 9 ? "9+" : String(n);
      badge.classList.toggle("on", n > 0);
    }, () => {});
  });
}
