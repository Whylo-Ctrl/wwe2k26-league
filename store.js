// League data store.
//
// Every device keeps its own league: whoever opens the site sets up and runs
// their own league, and it's saved in that browser (localStorage). Backups can
// be downloaded and restored to move a league to another device.

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
      tagline: '',
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
    briefcases: [],
    royalty: [],
    hallOfFame: [],
    awards: {},
  };
}

const ARRAY_KEYS = ['brands', 'members', 'superstars', 'teams', 'championships', 'reigns', 'events', 'storylines', 'promos', 'drafts', 'briefcases', 'royalty', 'hallOfFame'];

export function normalize(raw) {
  const base = defaultLeague();
  const d = raw && typeof raw === 'object' ? raw : {};
  const out = { ...base, ...d };
  out.league = { ...base.league, ...(d.league || {}) };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.settings.points = { ...base.settings.points, ...((d.settings || {}).points || {}) };
  if (!Array.isArray(out.settings.matchTypes) || !out.settings.matchTypes.length) out.settings.matchTypes = [...DEFAULT_MATCH_TYPES];
  for (const k of ARRAY_KEYS) if (!Array.isArray(out[k])) out[k] = d[k] === undefined && k === 'brands' ? base.brands : [];
  if (!out.awards || typeof out.awards !== 'object' || Array.isArray(out.awards)) out.awards = {};
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

// Each device keeps its own league, saved in this browser.
const LS_LEAGUE = 'wwe2k-league:league';
const LS_BACKUP = 'wwe2k-league:last-backup';

function defaultDeviceSettings() {
  return { webhooks: [], botName: '', pingMembers: true };
}

// ---------- state ----------
export const state = {
  data: normalize(null),
  admin: { ...defaultDeviceSettings(), ...lsGet(LS_ADMIN, {}) }, // this device's settings (Discord channels, etc.)
  me: lsGet(LS_ME, ''),
  storageOk: true,
  lastBackup: lsGet(LS_BACKUP, null),
};

// Other parts of the app can react to events (e.g. the GM books next week once results are in).
export const hooks = { afterResults: new Set(), afterLoad: new Set() };
export function runHooks(name) { for (const fn of hooks[name] || []) { try { fn(); } catch (e) { console.error(e); } } }

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(); }
// Re-draw the page without changing data (e.g. after a filter changes).
export function refresh() { emit(); }

// Whoever opens the site runs their own league, so everyone is the GM.
export function isAdmin() { return true; }

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

export async function init() {
  let saved = lsGet(LS_LEAGUE, null);
  if (!saved) {
    // carry over a league started in the earlier version of the app
    const draft = lsGet(LS_DRAFT, null);
    if (draft && draft.data) saved = draft.data;
  }
  state.data = normalize(saved);
  if (saved) persist();
  emit();
}

function persist() {
  state.storageOk = lsSet(LS_LEAGUE, state.data);
  return state.storageOk;
}

// Apply a change to league data. Every edit in the app goes through here,
// and it's saved on this device straight away.
export function commit(mutator) {
  const result = mutator(state.data);
  state.data.updatedAt = new Date().toISOString();
  persist();
  emit();
  return result;
}

export function replaceData(newData) {
  state.data = normalize(newData);
  state.data.updatedAt = new Date().toISOString();
  persist();
  emit();
}

export function markBackedUp() {
  state.lastBackup = new Date().toISOString();
  lsSet(LS_BACKUP, state.lastBackup);
}

// Ask the browser not to clear this site's storage when space runs low.
export async function keepStorage() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
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
