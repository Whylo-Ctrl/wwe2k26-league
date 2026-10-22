// League data store: loading, local drafts, and publishing to GitHub.
//
// The whole league lives in one JSON file (league.json) in your GitHub repo.
// Everyone who visits the site reads that file. Commissioners edit in the
// browser (changes are kept on their device as a draft) and hit "Publish",
// which commits the new league.json to GitHub using their own access token.

const LS_DRAFT = 'wwe2k-league:draft';
const LS_ADMIN = 'wwe2k-league:admin';
const LS_ME = 'wwe2k-league:me';

export const MATCH_FORMATS = [
  { id: 'singles', name: 'Singles', sides: [1, 1] },
  { id: 'triple', name: 'Triple Threat', sides: [1, 1, 1] },
  { id: 'fatal4', name: 'Fatal 4-Way', sides: [1, 1, 1, 1] },
  { id: 'sixpack', name: '6-Pack Challenge', sides: [1, 1, 1, 1, 1, 1] },
  { id: 'tag', name: 'Tag Team', sides: [2, 2] },
  { id: 'tag3', name: '6-Man Tag', sides: [3, 3] },
  { id: 'tag4', name: '8-Man Tag', sides: [4, 4] },
  { id: 'tag5', name: '5-on-5', sides: [5, 5] },
  { id: 'tripletag', name: 'Triple Threat Tag', sides: [2, 2, 2] },
  { id: 'fatal4tag', name: 'Fatal 4-Way Tag', sides: [2, 2, 2, 2] },
  { id: 'handicap2', name: '2-on-1 Handicap', sides: [1, 2] },
  { id: 'handicap3', name: '3-on-1 Handicap', sides: [1, 3] },
  { id: 'mixedtag', name: 'Mixed Tag', sides: [2, 2] },
  { id: 'multi', name: 'Multi-Person (Rumble / Battle Royal / Gauntlet)', sides: [1, 1, 1, 1, 1, 1, 1, 1] },
];

// Match types available in WWE 2K26 (editable in Settings).
export const DEFAULT_MATCH_TYPES = [
  'Normal', 'Extreme Rules', 'Falls Count Anywhere', 'Hell in a Cell', 'Steel Cage', 'Tables', 'Ladder',
  'TLC', 'Submission', 'Last Man Standing', 'No Holds Barred', 'Iron Man', 'Casket', 'Ambulance', 'I Quit',
  'Inferno', 'Dumpster', '3 Stages of Hell', 'Elimination Chamber', 'WarGames', 'Battle Royal', 'Royal Rumble',
  'Underground', 'Bloodline Rules', 'Backstage Brawl', 'Gauntlet', 'Gauntlet Turmoil', 'Gauntlet Eliminator',
  'Money in the Bank', 'Special Guest Referee',
];

// Types whose name stands on its own ("Royal Rumble", not "Multi-Person Royal Rumble").
export const STANDALONE_TYPES = new Set([
  'Royal Rumble', 'Battle Royal', 'Elimination Chamber', 'WarGames', 'Gauntlet', 'Gauntlet Turmoil',
  'Gauntlet Eliminator', 'Money in the Bank', '3 Stages of Hell', 'Iron Man',
]);

export const WIN_METHODS = [
  'Pinfall', 'Submission', 'Disqualification', 'Count-out', 'Knockout', 'Escape', 'Item retrieval',
  'Elimination', 'Forfeit', 'Referee stoppage', 'Other',
];

// Champion keeps the belt if they lose this way.
export const NON_TITLE_CHANGE_METHODS = new Set(['Disqualification', 'Count-out']);

export function defaultLeague() {
  return {
    version: 1,
    updatedAt: null,
    league: {
      name: 'My WWE 2K26 League',
      shortName: 'W2K26',
      tagline: 'Online league powered by Discord',
      logoUrl: '',
      season: 1,
      discordInvite: '',
      rules: '',
    },
    settings: {
      matchTypes: [...DEFAULT_MATCH_TYPES],
      points: { win: 3, draw: 1, loss: 0 },
      champBonus: 10,
      formMatches: 5,
      minMatchesForPct: 3,
      defaultDeadlineDays: 7,
    },
    brands: [
      { id: 'raw', name: 'Raw', color: '#e3242b' },
      { id: 'smackdown', name: 'SmackDown', color: '#1f6fff' },
      { id: 'nxt', name: 'NXT', color: '#f2c230' },
    ],
    members: [],
    superstars: [],
    teams: [],
    championships: [],
    reigns: [],
    events: [],
    storylines: [],
    promos: [],
    drafts: [],
  };
}

const ARRAY_KEYS = ['brands', 'members', 'superstars', 'teams', 'championships', 'reigns', 'events', 'storylines', 'promos', 'drafts'];

export function normalize(raw) {
  const base = defaultLeague();
  const d = raw && typeof raw === 'object' ? raw : {};
  const out = { ...base, ...d };
  out.league = { ...base.league, ...(d.league || {}) };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.settings.points = { ...base.settings.points, ...((d.settings || {}).points || {}) };
  if (!Array.isArray(out.settings.matchTypes) || !out.settings.matchTypes.length) out.settings.matchTypes = [...DEFAULT_MATCH_TYPES];
  for (const k of ARRAY_KEYS) if (!Array.isArray(out[k])) out[k] = d[k] === undefined && k === 'brands' ? base.brands : [];
  for (const ev of out.events) {
    if (!Array.isArray(ev.card)) ev.card = [];
    if (!ev.season) ev.season = out.league.season;
    for (const seg of ev.card) {
      if (seg.kind === 'match' && !Array.isArray(seg.sides)) seg.sides = [];
      for (const side of seg.sides || []) if (!Array.isArray(side.ids)) side.ids = [];
    }
  }
  for (const s of out.storylines) {
    if (!Array.isArray(s.updates)) s.updates = [];
    if (!Array.isArray(s.superstarIds)) s.superstarIds = [];
  }
  for (const t of out.teams) if (!Array.isArray(t.superstarIds)) t.superstarIds = [];
  for (const r of out.reigns) if (!Array.isArray(r.holders)) r.holders = [];
  return out;
}

export const clone = (x) => JSON.parse(JSON.stringify(x));

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

// ---------- local storage helpers (all wrapped: storage can be blocked) ----------
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, val) {
  try { if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

function defaultAdmin() {
  return { on: false, token: '', owner: '', repo: '', branch: 'main', path: 'league.json', webhooks: [], botName: '', pingMembers: true, autoSave: true };
}

// ---------- state ----------
export const state = {
  data: normalize(null),
  published: null,      // last known copy of league.json on GitHub/site
  publishedSha: null,
  dirty: false,
  conflict: false,
  source: 'default',    // 'github' | 'site' | 'default'
  admin: { ...defaultAdmin(), ...lsGet(LS_ADMIN, {}) },
  me: lsGet(LS_ME, ''),
};

// Other parts of the app can react to events (e.g. the GM books next week once results are in).
export const hooks = { afterResults: new Set() };
export function runHooks(name) { for (const fn of hooks[name] || []) { try { fn(); } catch (e) { console.error(e); } } }

const listeners = new Set();
const saveListeners = new Set();
export function onSaveChange(fn) { saveListeners.add(fn); }
function emitSave() { for (const fn of saveListeners) fn(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(); }
// Re-draw the page without changing data (e.g. after a filter changes).
export function refresh() { emit(); }

export function isAdmin() { return !!state.admin.on; }

export function saveAdmin(patch) {
  state.admin = { ...state.admin, ...patch };
  lsSet(LS_ADMIN, state.admin);
  emit();
}

export function setMe(memberId) {
  state.me = memberId || '';
  lsSet(LS_ME, state.me);
  emit();
}

export function guessRepo() {
  // https://OWNER.github.io/REPO/ -> {owner, repo}
  const host = location.hostname;
  const m = host.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (!m) return null;
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: seg || `${m[1]}.github.io` };
}

export function tokenUrl(owner) {
  const q = new URLSearchParams({ name: 'WWE League site', description: 'Lets the league website save league.json', expires_in: '366', contents: 'write' });
  if (owner) q.set('target_name', owner);
  return `https://github.com/settings/personal-access-tokens/new?${q}`;
}

export function githubReady() {
  const a = state.admin;
  return !!(a.token && a.owner && a.repo);
}

export async function init() {
  let pub = null;
  if (state.admin.on && githubReady()) {
    try {
      const r = await ghGet();
      if (r) { pub = r.data; state.publishedSha = r.sha; state.source = 'github'; }
    } catch (e) { console.warn('GitHub load failed, falling back to site copy', e); }
  }
  if (!pub) {
    try {
      const res = await fetch(`league.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) { pub = await res.json(); state.source = 'site'; }
    } catch (e) { console.warn('Could not load league.json', e); }
  }
  state.published = normalize(pub);
  const draft = lsGet(LS_DRAFT, null);
  if (draft && draft.data && state.admin.on) {
    state.data = normalize(draft.data);
    state.dirty = true;
    state.conflict = !!(state.published.updatedAt && draft.base !== state.published.updatedAt);
  } else {
    state.data = clone(state.published);
  }
  emit();
  if (state.dirty && !state.conflict) scheduleAutoSave(1500);
}

function saveDraft() {
  lsSet(LS_DRAFT, { data: state.data, base: state.published ? state.published.updatedAt : null, savedAt: new Date().toISOString() });
}

// Apply a change to league data. Every edit in the app goes through here.
export function commit(mutator) {
  const result = mutator(state.data);
  state.data.updatedAt = new Date().toISOString();
  state.dirty = true;
  saveDraft();
  scheduleAutoSave();
  emit();
  return result;
}

export function replaceData(newData) {
  state.data = normalize(newData);
  state.data.updatedAt = new Date().toISOString();
  state.dirty = true;
  saveDraft();
  scheduleAutoSave();
  emit();
}

// ---------- auto-save ----------
// Once GitHub is connected, every change saves itself a few seconds later,
// so everyone who opens the site sees the latest league.
export const saveState = { status: 'idle', error: '' }; // idle | pending | saving | saved | error
let saveTimer = null;
let saving = false;

export function autoSaveOn() {
  return !!(state.admin.on && githubReady() && state.admin.autoSave !== false);
}

export function scheduleAutoSave(delay = 2500) {
  if (!autoSaveOn() || state.conflict) return;
  saveState.status = 'pending';
  emitSave();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(runAutoSave, delay);
}

export async function runAutoSave() {
  if (!autoSaveOn() || !state.dirty) return;
  if (saving) { scheduleAutoSave(1500); return; }
  saving = true;
  saveState.status = 'saving';
  emitSave();
  try {
    const r = await publish({ message: 'League update', quiet: true });
    if (r && r.conflict) {
      state.conflict = true;
      saveState.status = 'error';
      saveState.error = 'Someone else saved a newer version of the league.';
      emit();
    } else {
      saveState.status = state.dirty ? 'pending' : 'saved';
      saveState.error = '';
    }
  } catch (e) {
    saveState.status = 'error';
    saveState.error = e.message === 'Failed to fetch' ? 'Could not reach GitHub. Check your connection.' : e.message;
  }
  saving = false;
  emitSave();
  if (saveState.status === 'pending') scheduleAutoSave(1000);
}

export function discardDraft() {
  lsSet(LS_DRAFT, null);
  state.data = clone(state.published);
  state.dirty = false;
  state.conflict = false;
  emit();
}

export function keepDraftOverPublished() {
  state.conflict = false;
  // re-base the draft so the warning goes away
  lsSet(LS_DRAFT, { data: state.data, base: state.published ? state.published.updatedAt : null, savedAt: new Date().toISOString() });
  emit();
}

// ---------- GitHub API ----------
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function ghUrl() {
  const a = state.admin;
  const path = (a.path || 'league.json').split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${encodeURIComponent(a.owner)}/${encodeURIComponent(a.repo)}/contents/${path}`;
}
function ghHeaders() {
  return {
    Authorization: `Bearer ${state.admin.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
async function ghError(res) {
  let msg = '';
  try { msg = (await res.json()).message || ''; } catch { /* ignore */ }
  if (res.status === 401) return new Error('GitHub rejected the token (401). Check that it is correct and not expired.');
  if (res.status === 403) return new Error(`GitHub refused (403). The token needs "Contents: Read and write" on this repo. ${msg}`);
  if (res.status === 404) return new Error('Repo or branch not found (404). Check owner, repo and branch in Settings, and that the token can see this repo.');
  if (res.status === 409) return new Error('GitHub reported a conflict (409). Someone else published at the same time — reload and try again.');
  return new Error(`GitHub error ${res.status}: ${msg}`);
}

async function ghGet() {
  const res = await fetch(`${ghUrl()}?ref=${encodeURIComponent(state.admin.branch || 'main')}&t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw await ghError(res);
  const j = await res.json();
  return { sha: j.sha, data: JSON.parse(b64decode(j.content)) };
}

export async function testGithub() {
  const a = state.admin;
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(a.owner)}/${encodeURIComponent(a.repo)}`, { headers: ghHeaders(), cache: 'no-store' });
  if (!res.ok) throw await ghError(res);
  const j = await res.json();
  if (j.permissions && !j.permissions.push) throw new Error('Token works, but it does not have write (push) access to this repo.');
  return j.full_name;
}

// Publish the current league data to GitHub. Returns {conflict:true} if the
// file changed on GitHub since you started editing (unless force=true).
export async function publish({ message, force = false, quiet = false } = {}) {
  if (!githubReady()) throw new Error('Set up GitHub publishing in Settings first (owner, repo and token).');
  const remote = await ghGet();
  if (remote && !force) {
    const remoteStamp = remote.data && remote.data.updatedAt;
    const base = state.published ? state.published.updatedAt : null;
    if (remoteStamp && base && remoteStamp !== base && remoteStamp !== state.data.updatedAt) {
      return { conflict: true, remote: normalize(remote.data) };
    }
  }
  if (!state.data.updatedAt) state.data.updatedAt = new Date().toISOString();
  const snapshot = JSON.stringify(state.data);
  const body = {
    message: message || `League update — ${new Date().toLocaleString()}`,
    content: b64encode(JSON.stringify(state.data, null, 2) + '\n'),
    branch: state.admin.branch || 'main',
  };
  if (remote) body.sha = remote.sha;
  const res = await fetch(ghUrl(), { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw await ghError(res);
  const j = await res.json();
  state.publishedSha = j.content && j.content.sha;
  // only what was sent counts as saved; edits made while saving stay pending
  state.published = normalize(JSON.parse(snapshot));
  state.dirty = JSON.stringify(state.data) !== snapshot;
  state.conflict = false;
  state.source = 'github';
  if (state.dirty) saveDraft(); else lsSet(LS_DRAFT, null);
  if (quiet) emitSave(); else emit();
  return { ok: true, commitUrl: j.commit && j.commit.html_url };
}

export async function reloadFromGithub() {
  const r = await ghGet();
  if (!r) throw new Error('league.json was not found in the repo yet. Publish once to create it.');
  state.published = normalize(r.data);
  state.publishedSha = r.sha;
  state.data = clone(state.published);
  state.dirty = false;
  state.conflict = false;
  state.source = 'github';
  lsSet(LS_DRAFT, null);
  emit();
}

// ---------- lookups ----------
export const byId = (list, id) => (id ? list.find((x) => x.id === id) : undefined);
export const getSuperstar = (id) => byId(state.data.superstars, id);
export const getMember = (id) => byId(state.data.members, id);
export const getBrand = (id) => byId(state.data.brands, id);
export const getTeam = (id) => byId(state.data.teams, id);
export const getTitle = (id) => byId(state.data.championships, id);
export const getEvent = (id) => byId(state.data.events, id);
export const getStoryline = (id) => byId(state.data.storylines, id);

export function findSegment(segId) {
  for (const ev of state.data.events) {
    const seg = ev.card.find((s) => s.id === segId);
    if (seg) return { ev, seg };
  }
  return null;
}

export function sortedEvents(data = state.data) {
  return data.events
    .map((ev, i) => ({ ev, i }))
    .sort((a, b) => (a.ev.date || '').localeCompare(b.ev.date || '') || a.i - b.i)
    .map((x) => x.ev);
}
