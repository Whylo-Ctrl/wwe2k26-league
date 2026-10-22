// App shell: routing, layout, and click/change delegation.

import { state, init, subscribe, isAdmin, runHooks } from './store.js';
import { esc, safeUrl, initials, toast } from './ui.js';

import home from './home.js';
import { rosterView, profileView } from './roster.js';
import { titlesView, titleView } from './titles.js';
import { showsView, showView } from './shows.js';
import standings from './standings.js';
import storylines from './storylines.js';
import draft from './draft.js';
import settings from './settings.js';
import gmPage from './gm-page.js';
import setup, { needsSetup } from './setup.js';
import awards from './awards.js';
import help from './help.js';

const ROUTES = [
  { path: '', view: home, nav: 'home' },
  { path: 'roster', view: rosterView, nav: 'roster' },
  { path: 'superstar/:id', view: profileView, nav: 'roster' },
  { path: 'titles', view: titlesView, nav: 'titles' },
  { path: 'title/:id', view: titleView, nav: 'titles' },
  { path: 'shows', view: showsView, nav: 'shows' },
  { path: 'show/:id', view: showView, nav: 'shows' },
  { path: 'standings', view: standings, nav: 'standings' },
  { path: 'storylines', view: storylines, nav: 'storylines' },
  { path: 'draft', view: draft, nav: 'draft' },
  { path: 'settings', view: settings, nav: 'settings' },
  { path: 'gm', view: gmPage, nav: 'gm' },
  { path: 'setup', view: setup, nav: 'setup' },
  { path: 'awards', view: awards, nav: 'awards' },
  { path: 'help', view: help, nav: 'help' },
];

const NAV = [
  { id: 'home', href: '#/', label: 'Home' },
  { id: 'gm', href: '#/gm', label: 'GM' },
  { id: 'shows', href: '#/shows', label: 'Shows' },
  { id: 'standings', href: '#/standings', label: 'Standings' },
  { id: 'titles', href: '#/titles', label: 'Titles' },
  { id: 'roster', href: '#/roster', label: 'Roster' },
  { id: 'storylines', href: '#/storylines', label: 'Storylines' },
  { id: 'awards', href: '#/awards', label: 'Awards' },
  { id: 'draft', href: '#/draft', label: 'Draft', show: () => state.data.drafts.length > 0 },
  { id: 'settings', href: '#/settings', label: 'Settings' },
  { id: 'help', href: '#/help', label: 'Help' },
];

// Collect every view's action handlers into one registry.
const actions = {};
const changeHandlers = {};
const inputHandlers = {};
for (const r of ROUTES) {
  Object.assign(actions, r.view.actions || {});
  Object.assign(changeHandlers, r.view.onChange || {});
  Object.assign(inputHandlers, r.view.onInput || {});
}

Object.assign(actions, {});

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  for (const r of ROUTES) {
    const rp = r.path.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params = { ...query };
    let ok = true;
    rp.forEach((seg, i) => {
      if (seg.startsWith(':')) params[seg.slice(1)] = parts[i];
      else if (seg !== parts[i]) ok = false;
    });
    if (ok) return { route: r, params };
  }
  return { route: null, params: {} };
}

function header(simple = false) {
  const L = state.data.league;
  const logo = safeUrl(L.logoUrl);
  const navItems = simple ? [] : NAV.filter((n) => !n.show || n.show());
  return `
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#/">
        ${logo ? `<img class="brand-logo" src="${esc(logo)}" alt="">` : `<span class="brand-logo brand-initials">${esc(initials(L.shortName || L.name))}</span>`}
        <span class="brand-text"><span class="brand-name">${esc(L.name)}</span><span class="brand-sub">Season ${esc(L.season)}${state.storageOk ? ' · <span class="save-pill ok">Saved on this device</span>' : ' · <span class="save-pill warn">⚠ Not saving</span>'}</span></span>
      </a>
    </div>
    ${simple ? '' : `<nav class="site-nav" aria-label="Main">
      ${navItems.map((n) => `<a href="${n.href}" data-nav="${n.id}">${esc(n.label)}</a>`).join('')}
    </nav>`}
  </header>`;
}

function banner() {
  if (state.storageOk) return '';
  return `<div class="banner banner-warn"><span>⚠️ This browser isn't letting the site save (private browsing or storage turned off). Your league will be lost when you close it. <a href="#/settings?tab=backup">Download a backup</a>.</span></div>`;
}

function footer() {
  const L = state.data.league;
  const invite = safeUrl(L.discordInvite);
  return `<footer class="site-footer">
    <span>${esc(L.name)} · WWE 2K26 league · saved on this device</span>
    ${invite ? `<a href="${esc(invite)}" target="_blank" rel="noopener">Join the Discord</a>` : ''}
  </footer>`;
}

let lastHash = null;
function render() {
  const app = document.getElementById('app');
  const { route, params } = parseHash();
  // brand-new league: walk the commissioner through setup first
  if (needsSetup() && (!route || !['setup', 'settings'].includes(route.path))) { location.hash = '#/setup'; return; }
  const inSetup = !!(route && route.path === 'setup');
  const sameRoute = lastHash === location.hash;
  const scroll = window.scrollY;
  let html;
  try {
    html = route ? route.view.render(params) : `<div class="page"><h1>Page not found</h1><p><a href="#/">Go home</a></p></div>`;
  } catch (e) {
    console.error(e);
    html = `<div class="page"><h1>Something went wrong</h1><pre class="error">${esc(e.stack || e.message)}</pre></div>`;
  }
  app.innerHTML = `${header(inSetup)}${banner()}<main id="main" class="container">${html}</main>${inSetup ? '' : footer()}`;
  const active = route ? route.nav : '';
  app.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  if (route && route.view.mount) route.view.mount(document.getElementById('main'), params);
  document.title = `${state.data.league.name}`;
  if (sameRoute) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
  lastHash = location.hash;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) { console.warn('No action', el.dataset.act); return; }
  e.preventDefault();
  Promise.resolve(fn(el, e)).catch((err) => { console.error(err); toast(err.message || String(err), 'error', 6000); });
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && changeHandlers[el.dataset.change]) changeHandlers[el.dataset.change](el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && inputHandlers[el.dataset.input]) inputHandlers[el.dataset.input](el, e);
});

window.addEventListener('hashchange', render);

subscribe(render);

document.getElementById('app').innerHTML = '<div class="loading">Loading league…</div>';
init().then(() => runHooks('afterLoad')).catch((e) => { console.error(e); toast('Could not load the league data', 'error'); render(); });
