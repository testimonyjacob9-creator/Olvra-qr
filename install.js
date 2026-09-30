// Adds an "Install" button to the app bar when the browser can install the
// PWA (Chrome/Edge/Android). Safari/iOS never fires this event, so there we
// show a one-time tip instead, since iOS installs via Share > Add to Home
// Screen with no programmatic prompt available.
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  document.querySelectorAll('.installbtn').forEach(b => b.hidden = false);
});
window.addEventListener('appinstalled', () => {
  document.querySelectorAll('.installbtn').forEach(b => b.hidden = true);
  try { localStorage.setItem('lumora_installed', '1'); } catch (e) {}
});

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

export function mountInstallButton(container) {
  if (isStandalone) return;
  const btn = document.createElement('button');
  btn.className = 'themebtn installbtn';
  btn.setAttribute('aria-label', 'Install app');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke-linecap="round"/></svg>';
  btn.hidden = !isIOS; // shown immediately on iOS (tip), hidden elsewhere until the event fires
  btn.onclick = async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.hidden = true;
    } else if (isIOS) {
      alert('To install Lumora: tap the Share icon, then "Add to Home Screen".');
    }
  };
  container.appendChild(btn);
}
