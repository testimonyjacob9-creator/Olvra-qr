// Shared header (logo + notification bell) and bottom nav bar, matching the
// look of Olvra Boost / WoodPayVTU. Injects markup + wires the bell to
// users/{uid}/notifications (unread count). Safe to call on public pages —
// the bell/Me link just point to /account, which itself requires sign-in.
import { auth, db } from "/firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { mountThemeToggle } from "/theme.js";
import { mountInstallButton } from "/install.js";

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-9z" stroke-linejoin="round"/></svg>',
  love: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7.5-4.6-10-9.3C.5 8 2.3 4.5 6 4c2-.3 3.7.7 6 3 2.3-2.3 4-3.3 6-3 3.7.5 5.5 4 4 7.7C19.5 16.4 12 21 12 21z" stroke-linejoin="round"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke-linecap="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H10l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" stroke-linejoin="round"/></svg>',
  personas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.2 2.9-5.5 6.5-5.5s6.5 2.3 6.5 5.5" stroke-linecap="round"/><path d="M16 4.5a3.5 3.5 0 010 7M18.5 14.8c1.7.7 3 2.4 3 5.2" stroke-linecap="round"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.3" stroke-linecap="round"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/></svg>',
};
const ITEMS = [
  ["/", "home", "Home"],
  ["/love", "love", "Love"],
  ["/chat", "chat", "Chat"],
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
    bar.innerHTML = `<a class="logo" href="/">lum<span>ora</span><small class="by">OLVRA</small></a>
      <div class="appbar-r"><a class="plan-pill free" id="navPlan" href="/account" hidden></a><span id="navTheme"></span><a class="bellbtn" id="navBell" href="/notifications" aria-label="Notifications"><svg viewBox="0 0 24 24" width="20px" height="20px" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 7H4c0-1 2-2 2-7z"/><path d="M10 20a2 2 0 004 0"/></svg><span class="bell-badge" id="navBellBadge"></span></a></div>`;
    document.body.prepend(bar);
    mountThemeToggle(document.getElementById("navTheme"));
    mountInstallButton(document.getElementById("navTheme"));
  }

  let path = location.pathname.replace(/\/$/, "") || "/";
  if (path === "/helper" || path === "/personas") path = "/chat";
  const nav = document.createElement("div");
  nav.className = "bottom-nav";
  nav.innerHTML = `<div class="bottom-nav-inner">${ITEMS.map(([href, key, label]) => {
    const active = href === path || (href !== "/" && path.startsWith(href + "/"));
    return `<a class="nav-item${active ? " active" : ""}" href="${href}">${ICONS[key]}<span>${label}</span></a>`;
  }).join("")}</div>`;
  document.body.appendChild(nav);

  let unsub = null;
  onAuthStateChanged(auth, (u) => {
    if (unsub) { unsub(); unsub = null; }
    // Once per session: make sure the account record exists; sign out if it was suspended.
    if (u && !sessionStorage.getItem("lumora_ok_" + u.uid)) {
      u.getIdToken().then((t) => fetch("/.netlify/functions/ensure-user", { method: "POST", headers: { Authorization: "Bearer " + t } }))
        .then((r) => { if (r.ok) sessionStorage.setItem("lumora_ok_" + u.uid, "1"); else if (r.status === 401 || r.status === 403) signOut(auth); })
        .catch(() => {});
    }
    const badge = document.getElementById("navBellBadge");
    if (!badge) return;
    if (!u) { badge.classList.remove("on"); const p = document.getElementById("navPlan"); if (p) p.hidden = true; return; }
    const planEl = document.getElementById("navPlan");
    if (planEl) onSnapshot(doc(db, "users", u.uid), (s) => {
      const d = s.exists() ? s.data() : {}, until = d.premiumUntil && d.premiumUntil.toDate ? d.premiumUntil.toDate() : null;
      const left = until ? Math.ceil((until - Date.now()) / 86400000) : 0;
      planEl.hidden = false;
      const trial = d.trialEndsAt && until && until.getTime() <= d.trialEndsAt.toDate().getTime() + 1000;
      planEl.className = "plan-pill" + (left > 0 ? "" : " free");
      planEl.innerHTML = left > 0 ? (trial ? "Trial · " : "Premium · ") + left + `<span class="pl-full"> ${left === 1 ? "day" : "days"} left</span><span class="pl-short">d</span>` : "Free plan";
    }, () => {});
    const q = query(collection(db, "users", u.uid, "notifications"), where("read", "==", false));
    unsub = onSnapshot(q, (snap) => {
      const n = snap.size;
      badge.textContent = n > 9 ? "9+" : String(n);
      badge.classList.toggle("on", n > 0);
    }, () => {});
  });
}
