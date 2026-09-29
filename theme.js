// Shared light/dark/system theme toggle. localStorage 'lumora_theme' is
// 'light' | 'dark' | 'system' (default). Applying the stored choice happens
// inline in <head> on every page (see THEME_HINT below) so there is no
// flash; this module only wires up the toggle button itself.
export const THEME_HINT = `try{var t=localStorage.getItem('lumora_theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

const ICONS = {
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke-linejoin="round"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4" stroke-linecap="round"/></svg>',
};
const ORDER = ['system', 'light', 'dark'];

export function mountThemeToggle(container) {
  const btn = document.createElement('button');
  btn.className = 'themebtn';
  btn.setAttribute('aria-label', 'Theme');
  const apply = (mode) => {
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    btn.innerHTML = ICONS[mode];
    try { localStorage.setItem('lumora_theme', mode); } catch (e) {}
  };
  let mode = 'system';
  try { mode = localStorage.getItem('lumora_theme') || 'system'; } catch (e) {}
  apply(mode);
  btn.onclick = () => { mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]; apply(mode); };
  container.appendChild(btn);
}
