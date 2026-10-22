// App shell: routing, layout, the publish banner, and click/change delegation.

import { state, init, subscribe, isAdmin, githubReady, publish, discardDraft, keepDraftOverPublished, reloadFromGithub } from './store.js';
import { esc, safeUrl, initials, formModal, field, input, toast, confirmDialog } from './ui.js';

import home from './home.js';
import { rosterView, profileView } from './roster.js';
import { titlesView, titleView } from './titles.js';
import { showsView, showView } from './shows.js';
import standings from './standings.js';
import storylines from './storylines.js';
import draft from './draft.js';
import { submitView, inboxView } from './submit.js';
import settings from './settings.js';

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
  { path: 'submit', view: submitView, nav: 'submit' },
  { path: 'inbox', view: inboxView, nav: 'inbox' },
  { path: 'settings', view: settings, nav: 'settings' },
];

const NAV = [
  { id: 'home', href: '#/', label: 'Home' },
  { id: 'shows', href: '#/shows', label: 'Shows' },
  { id: 'standings', href: '#/standings', label: 'Standings' },
  { id: 'titles', href: '#/titles', label: 'Titles' },
  { id: 'roster', href: '#/roster', label: 'Roster' },
  { id: 'storylines', href: '#/storylines', label: 'Storylines' },
  { id: 'draft', href: '#/draft', label: 'Draft', show: () => isAdmin() || state.data.drafts.length > 0 },
  { id: 'submit', href: '#/submit', label: 'Submit' },
  { id: 'inbox', href: '#/inbox', label: 'Inbox', show: () => isAdmin() },
  { id: 'settings', href: '#/settings', label: 'Settings', show: () => isAdmin() },
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

Object.assign(actions, {
  'app-publish': () => openPublish(),
  'app-discard': async () => {
    if (await confirmDialog('Throw away all unpublished changes on this device?', { okLabel: 'Discard changes', danger: true })) {
      discardDraft();
      toast('Changes discarded');
    }
  },
  'app-keep-mine': () => keepDraftOverPublished(),
  'app-load-published': async () => {
    if (!(await confirmDialog('Load the published league and throw away your local changes?', { okLabel: 'Load published', danger: true }))) return;
    try { if (githubReady()) await reloadFromGithub(); else discardDraft(); toast('Loaded the published league'); }
    catch (e) { toast(e.message, 'error', 6000); }
  },
});

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

function header() {
  const L = state.data.league;
  const logo = safeUrl(L.logoUrl);
  const navItems = NAV.filter((n) => !n.show || n.show());
  return `
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#/">
        ${logo ? `<img class="brand-logo" src="${esc(logo)}" alt="">` : `<span class="brand-logo brand-initials">${esc(initials(L.shortName || L.name))}</span>`}
        <span class="brand-text"><span class="brand-name">${esc(L.name)}</span><span class="brand-sub">Season ${esc(L.season)}${isAdmin() ? ' · <span class="admin-pill">Commissioner</span>' : ''}</span></span>
      </a>
    </div>
    <nav class="site-nav" aria-label="Main">
      ${navItems.map((n) => `<a href="${n.href}" data-nav="${n.id}">${esc(n.label)}</a>`).join('')}
    </nav>
  </header>`;
}

function banner() {
  if (!isAdmin()) return '';
  if (state.conflict) {
    return `<div class="banner banner-warn"><span>⚠️ The published league changed since you started editing on this device.</span>
      <span class="banner-actions"><button class="btn btn-sm" data-act="app-load-published">Load published</button><button class="btn btn-sm btn-ghost" data-act="app-keep-mine">Keep my version</button></span></div>`;
  }
  if (state.dirty) {
    return `<div class="banner"><span><strong>Unpublished changes</strong> — saved on this device only. Publish so everyone sees them.</span>
      <span class="banner-actions">${githubReady() ? '<button class="btn btn-sm btn-primary" data-act="app-publish">Publish</button>' : '<a class="btn btn-sm btn-primary" href="#/settings?tab=github">Set up publishing</a>'}<button class="btn btn-sm btn-ghost" data-act="app-discard">Discard</button></span></div>`;
  }
  return '';
}

function footer() {
  const L = state.data.league;
  const invite = safeUrl(L.discordInvite);
  return `<footer class="site-footer">
    <span>${esc(L.name)} · WWE 2K26 league</span>
    ${invite ? `<a href="${esc(invite)}" target="_blank" rel="noopener">Join the Discord</a>` : ''}
    ${isAdmin() ? '' : '<a href="#/settings">Commissioner login</a>'}
  </footer>`;
}

let lastHash = null;
function render() {
  const app = document.getElementById('app');
  const { route, params } = parseHash();
  const sameRoute = lastHash === location.hash;
  const scroll = window.scrollY;
  let html;
  try {
    html = route ? route.view.render(params) : `<div class="page"><h1>Page not found</h1><p><a href="#/">Go home</a></p></div>`;
  } catch (e) {
    console.error(e);
    html = `<div class="page"><h1>Something went wrong</h1><pre class="error">${esc(e.stack || e.message)}</pre></div>`;
  }
  app.innerHTML = `${header()}${banner()}<main id="main" class="container">${html}</main>${footer()}`;
  const active = route ? route.nav : '';
  app.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  if (route && route.view.mount) route.view.mount(document.getElementById('main'), params);
  document.title = `${state.data.league.name}`;
  if (sameRoute) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
  lastHash = location.hash;
}

function openPublish() {
  formModal({
    title: 'Publish league',
    submitLabel: 'Publish',
    html: `<p class="muted">This saves the league to GitHub so everyone sees the update. The site refreshes for visitors within about a minute.</p>
      ${field('What changed? (optional)', input('message', '', 'placeholder="e.g. Raw Week 4 results"'))}`,
    async onSubmit(v) {
      let res = await publish({ message: v.message || undefined });
      if (res.conflict) {
        const ok = await confirmDialog('Someone else published a newer version since you loaded the league. Publishing now will overwrite their changes.', { okLabel: 'Overwrite and publish', danger: true, title: 'Newer version on GitHub' });
        if (!ok) return false;
        res = await publish({ message: v.message || undefined, force: true });
      }
      toast('Published! Visitors will see it within a minute.');
      return true;
    },
  });
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
init().catch((e) => { console.error(e); toast('Could not load the league data', 'error'); render(); });
