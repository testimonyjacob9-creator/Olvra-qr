// PWA install prompt.
//  - Chrome/Edge/Android: captures `beforeinstallprompt`, shows a bottom-sheet
//    popup ("Install Lumora") and keeps a small install button in the app bar.
//  - iOS Safari never fires that event, so the popup shows the manual steps
//    (Share > Add to Home Screen) instead.
// The popup is shown at most once per week after "Not now", never when the
// app is already installed/standalone, and never on top of the sign-in gate.
let deferred = null;
const KEY_DISMISS = 'lumora_install_dismissed';
const KEY_INSTALLED = 'lumora_installed';
const WEEK = 7 * 24 * 3600 * 1000;

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

function recentlyDismissed() {
  const t = +get(KEY_DISMISS);
  return t && Date.now() - t < WEEK;
}

function injectStyles() {
  if (document.getElementById('installStyles')) return;
  const s = document.createElement('style');
  s.id = 'installStyles';
  s.textContent = `
  #installSheet{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);opacity:0;transition:opacity .2s}
  #installSheet.on{opacity:1}
  #installSheet .box{width:100%;max-width:460px;background:var(--bg,#fff);color:var(--ink,#15161a);border:1px solid var(--line,#e6e7eb);border-radius:20px 20px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom));transform:translateY(24px);transition:transform .25s;box-shadow:0 -12px 40px rgba(0,0,0,.25)}
  #installSheet.on .box{transform:none}
  #installSheet .row{display:flex;gap:14px;align-items:center;margin-bottom:12px}
  #installSheet img{width:56px;height:56px;border-radius:14px;flex:none}
  #installSheet h3{margin:0 0 2px;font-size:1.1rem}
  #installSheet p{margin:0;color:var(--dim,#6b6f7a);font-size:.9rem;line-height:1.45}
  #installSheet ol{margin:10px 0 0;padding-left:20px;color:var(--dim,#6b6f7a);font-size:.9rem;line-height:1.6}
  #installSheet .acts{display:flex;gap:10px;margin-top:18px}
  #installSheet button{flex:1;padding:13px 16px;border-radius:12px;font:inherit;font-weight:700;cursor:pointer;border:1px solid var(--line,#e6e7eb);background:var(--bg-2,#f4f5f7);color:var(--ink,#15161a)}
  #installSheet button.pri{background:var(--accent,#d61f69);border:0;color:#fff}
  `;
  document.head.appendChild(s);
}

function closeSheet(remember) {
  const el = document.getElementById('installSheet');
  if (remember) set(KEY_DISMISS, String(Date.now()));
  if (!el) return;
  el.classList.remove('on');
  setTimeout(() => el.remove(), 250);
}

async function doInstall() {
  if (deferred) {
    const d = deferred;
    deferred = null;
    closeSheet(false);
    d.prompt();
    try { await d.userChoice; } catch (e) {}
    document.querySelectorAll('.installbtn').forEach((b) => (b.hidden = true));
  }
}

function showSheet() {
  if (isStandalone || get(KEY_INSTALLED) || document.getElementById('installSheet')) return;
  if (!deferred && !isIOS) return;
  injectStyles();
  const el = document.createElement('div');
  el.id = 'installSheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Install Lumora OLVRA');
  const body = deferred
    ? '<p>Add Lumora OLVRA to your home screen for quick access, full-screen and faster loading.</p>'
    : '<ol><li>Tap the <b>Share</b> icon in Safari</li><li>Choose <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li></ol>';
  el.innerHTML = `<div class="box">
    <div class="row"><img src="/icon-192.png" alt=""><div><h3>Install Lumora OLVRA</h3><p>Use it like a real app.</p></div></div>
    ${body}
    <div class="acts">
      <button type="button" id="installNo">Not now</button>
      <button type="button" class="pri" id="installYes">${deferred ? 'Install' : 'Got it'}</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  el.addEventListener('click', (e) => { if (e.target === el) closeSheet(true); });
  el.querySelector('#installNo').onclick = () => closeSheet(true);
  el.querySelector('#installYes').onclick = () => (deferred ? doInstall() : closeSheet(true));
}

// Show the popup a moment after the page settles. Skip while the sign-in gate is up
// (two stacked popups is bad); retry a few times in case auth is still resolving.
function scheduleSheet(tries = 0) {
  if (isStandalone || get(KEY_INSTALLED) || recentlyDismissed()) return;
  setTimeout(() => {
    const gate = document.getElementById('gateScreen');
    if (gate && !gate.hidden) { if (tries < 6) scheduleSheet(tries + 1); return; }
    showSheet();
  }, tries ? 2500 : 2000);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  document.querySelectorAll('.installbtn').forEach((b) => (b.hidden = false));
  scheduleSheet();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  document.querySelectorAll('.installbtn').forEach((b) => (b.hidden = true));
  closeSheet(false);
  set(KEY_INSTALLED, '1');
});

// iOS has no event, so trigger the instructions popup directly.
if (isIOS) {
  if (document.readyState === 'complete') scheduleSheet();
  else window.addEventListener('load', () => scheduleSheet());
}

export function mountInstallButton(container) {
  if (isStandalone) return;
  const btn = document.createElement('button');
  btn.className = 'themebtn installbtn';
  btn.setAttribute('aria-label', 'Install app');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke-linecap="round"/></svg>';
  // If the browser event already fired before this button existed, show it right away.
  btn.hidden = !(isIOS || deferred);
  btn.onclick = () => {
    // Re-open the popup on demand (native prompt on Android/desktop, steps on iOS).
    if (deferred && !document.getElementById('installSheet')) doInstall();
    else showSheet();
  };
  container.appendChild(btn);
}
