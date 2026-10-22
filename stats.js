// Records, standings, power rankings, title history and leaderboards.
// Everything here is computed from match results — nothing is stored twice.

import { sortedEvents, MATCH_FORMATS, STANDALONE_TYPES, NON_TITLE_CHANGE_METHODS, uid } from './store.js';

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function daysBetween(a, b) {
  const da = parseDate(a), db = parseDate(b);
  if (!da || !db) return 0;
  return Math.max(0, Math.round((db - da) / 86400000));
}

export function hasResult(seg) {
  const r = seg && seg.result;
  return !!(r && (r.draw || r.nc || (r.winnerSide !== null && r.winnerSide !== undefined && r.winnerSide !== '')));
}

const NO_SUFFIX = new Set(['Royal Rumble', 'Battle Royal', 'WarGames', 'Money in the Bank', 'Elimination Chamber']);

export function matchName(seg) {
  if (!seg) return '';
  if (seg.name) return seg.name;
  const fmt = MATCH_FORMATS.find((f) => f.id === seg.format) || MATCH_FORMATS[0];
  const type = seg.type || 'Normal';
  if (STANDALONE_TYPES.has(type)) return NO_SUFFIX.has(type) ? type : `${type} Match`;
  if (type === 'Normal') return fmt.id === 'multi' ? 'Multi-Person Match' : `${fmt.name} Match`;
  if (fmt.id === 'singles') return `${type} Match`;
  if (fmt.id === 'multi') return `${type} Match`;
  return `${fmt.name} ${type} Match`;
}

// Every match with a result, in the order it happened.
export function completedMatches(data, { season = null } = {}) {
  const out = [];
  for (const ev of sortedEvents(data)) {
    if (season && Number(ev.season) !== Number(season)) continue;
    ev.card.forEach((seg, idx) => {
      if (seg.kind === 'match' && hasResult(seg)) out.push({ ev, seg, idx });
    });
  }
  return out;
}

export function pendingMatches(data) {
  const out = [];
  for (const ev of sortedEvents(data)) {
    ev.card.forEach((seg, idx) => {
      if (seg.kind === 'match' && !hasResult(seg) && (seg.sides || []).some((s) => s.ids.length)) out.push({ ev, seg, idx });
    });
  }
  return out;
}

export function participants(seg) {
  return (seg.sides || []).flatMap((s) => s.ids);
}

function emptyRec(id) {
  return { id, w: 0, l: 0, d: 0, nc: 0, streak: 0, bestStreak: 0, form: [], ratingSum: 0, rated: 0, titleWins: 0, matches: 0 };
}

// Win/loss records for every superstar (optionally for one season).
export function records(data, opts = {}) {
  const recs = new Map();
  const get = (id) => { if (!recs.has(id)) recs.set(id, emptyRec(id)); return recs.get(id); };
  for (const { seg } of completedMatches(data, opts)) {
    const r = seg.result;
    seg.sides.forEach((side, si) => {
      for (const id of side.ids) {
        const rec = get(id);
        rec.matches++;
        if (r.rating) { rec.ratingSum += Number(r.rating); rec.rated++; }
        let res;
        if (r.nc) res = 'NC';
        else if (r.draw) res = 'D';
        else res = Number(r.winnerSide) === si ? 'W' : 'L';
        if (res === 'W') { rec.w++; rec.streak = rec.streak > 0 ? rec.streak + 1 : 1; if (seg.titleId && r.titleChange) rec.titleWins++; }
        else if (res === 'L') { rec.l++; rec.streak = rec.streak < 0 ? rec.streak - 1 : -1; }
        else if (res === 'D') { rec.d++; rec.streak = 0; }
        else rec.nc++;
        rec.bestStreak = Math.max(rec.bestStreak, rec.streak);
        rec.form.push(res);
      }
    });
  }
  return recs;
}

export function recordOf(recs, id) {
  return recs.get(id) || emptyRec(id);
}

export function points(data, rec) {
  const p = data.settings.points;
  return rec.w * Number(p.win || 0) + rec.d * Number(p.draw || 0) + rec.l * Number(p.loss || 0);
}

export function winPct(rec) {
  const games = rec.w + rec.l + rec.d;
  return games ? (rec.w + rec.d * 0.5) / games : 0;
}

export function standings(data, { season = null, brandId = null, gender = null } = {}) {
  const recs = records(data, { season });
  return data.superstars
    .filter((s) => (!brandId || s.brandId === brandId) && (!gender || s.gender === gender))
    .map((s) => {
      const rec = recordOf(recs, s.id);
      return { s, rec, pts: points(data, rec), pct: winPct(rec) };
    })
    .filter((row) => row.rec.matches > 0 || (row.s.status || 'Active') === 'Active')
    .sort((a, b) => b.pts - a.pts || b.pct - a.pct || b.rec.w - a.rec.w || a.rec.l - b.rec.l || a.s.name.localeCompare(b.s.name));
}

// Power score = season points + 2 × recent form + champion bonus + current win streak.
export function powerRankings(data, { season = data.league.season, limit = 10 } = {}) {
  const recs = records(data, { season });
  const n = Number(data.settings.formMatches) || 5;
  const champs = new Set(currentChampionIds(data));
  return data.superstars
    .filter((s) => (s.status || 'Active') !== 'Inactive')
    .map((s) => {
      const rec = recordOf(recs, s.id);
      const recent = rec.form.slice(-n);
      const form = recent.reduce((t, r) => t + (r === 'W' ? 2 : r === 'D' ? 1 : 0), 0);
      const champ = champs.has(s.id);
      const score = points(data, rec) + form * 2 + (champ ? Number(data.settings.champBonus || 0) : 0) + Math.max(0, rec.streak);
      return { s, rec, score, champ, recent };
    })
    .filter((r) => r.rec.matches > 0 || r.champ)
    .sort((a, b) => b.score - a.score || b.rec.w - a.rec.w || a.s.name.localeCompare(b.s.name))
    .slice(0, limit);
}

export function memberStandings(data, { season = null } = {}) {
  const recs = records(data, { season });
  return data.members
    .map((m) => {
      const tot = emptyRec(m.id);
      for (const s of data.superstars.filter((x) => x.memberId === m.id)) {
        const r = recordOf(recs, s.id);
        tot.w += r.w; tot.l += r.l; tot.d += r.d; tot.nc += r.nc; tot.matches += r.matches;
      }
      return { m, rec: tot, pts: points(data, tot), pct: winPct(tot) };
    })
    .sort((a, b) => b.pts - a.pts || b.pct - a.pct || a.m.name.localeCompare(b.m.name));
}

// ---------- titles ----------
export function reignsFor(data, titleId) {
  return data.reigns
    .filter((r) => r.titleId === titleId)
    .sort((a, b) => (b.wonAt || '').localeCompare(a.wonAt || '') || (a.lostAt ? 1 : 0) - (b.lostAt ? 1 : 0));
}

export function currentReign(data, titleId) {
  return reignsFor(data, titleId).find((r) => !r.lostAt) || null;
}

export function reignLength(reign) {
  return daysBetween(reign.wonAt, reign.lostAt || today());
}

export function defenses(data, reignId) {
  let n = 0;
  for (const ev of data.events) for (const seg of ev.card) if (seg.result && seg.result.retainedReignId === reignId) n++;
  return n;
}

export function currentChampionIds(data) {
  const ids = [];
  for (const t of data.championships) {
    if (t.retired) continue;
    const r = currentReign(data, t.id);
    if (r) ids.push(...r.holders);
  }
  return ids;
}

export function titlesHeldBy(data, superstarId) {
  return data.championships.filter((t) => {
    if (t.retired) return false;
    const r = currentReign(data, t.id);
    return r && r.holders.includes(superstarId);
  });
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// Remove any title history this match created, so its result can be re-applied.
export function undoTitleEffects(data, seg) {
  data.reigns = data.reigns.filter((r) => r.wonMatchId !== seg.id);
  for (const r of data.reigns) {
    if (r.lostMatchId === seg.id) { r.lostAt = null; r.lostEventId = null; r.lostMatchId = null; }
  }
  if (seg.result) { delete seg.result.retainedReignId; delete seg.result.titleChange; }
}

// Save a match result and update title history. Returns what happened to the title.
export function applyResult(data, ev, seg, result) {
  undoTitleEffects(data, seg);
  seg.result = result;
  if (!result || !seg.titleId) return null;
  const cur = currentReign(data, seg.titleId);
  const champInMatch = cur && cur.holders.length && cur.holders.every((id) => participants(seg).includes(id));
  if (result.nc || result.draw) {
    if (champInMatch) { result.retainedReignId = cur.id; return { kind: 'retain', reign: cur, reason: result.draw ? 'draw' : 'no contest' }; }
    return null;
  }
  const side = seg.sides[Number(result.winnerSide)];
  if (!side || !side.ids.length) return null;
  if (cur && sameSet(cur.holders, side.ids)) {
    result.retainedReignId = cur.id;
    return { kind: 'retain', reign: cur };
  }
  if (cur && champInMatch && NON_TITLE_CHANGE_METHODS.has(result.method)) {
    result.retainedReignId = cur.id;
    return { kind: 'retain', reign: cur, reason: `won by ${result.method.toLowerCase()} — titles don't change hands` };
  }
  if (cur) { cur.lostAt = ev.date; cur.lostEventId = ev.id; cur.lostMatchId = seg.id; }
  const reign = {
    id: uid('reign'), titleId: seg.titleId, holders: [...side.ids], teamId: side.teamId || null,
    wonAt: ev.date, wonEventId: ev.id, wonMatchId: seg.id, lostAt: null, lostEventId: null, lostMatchId: null, notes: '',
  };
  data.reigns.push(reign);
  result.titleChange = true;
  return { kind: 'change', reign, prev: cur };
}

// ---------- leaderboards ----------
export function leaderboards(data, { season = null } = {}) {
  const recs = records(data, { season });
  const rows = data.superstars.map((s) => ({ s, rec: recordOf(recs, s.id) }));
  const minM = Number(data.settings.minMatchesForPct) || 3;
  const byWins = [...rows].filter((r) => r.rec.w).sort((a, b) => b.rec.w - a.rec.w || a.rec.l - b.rec.l).slice(0, 5);
  const byPct = [...rows].filter((r) => r.rec.w + r.rec.l + r.rec.d >= minM).sort((a, b) => winPct(b.rec) - winPct(a.rec) || b.rec.w - a.rec.w).slice(0, 5);
  const byStreak = [...rows].filter((r) => r.rec.bestStreak > 1).sort((a, b) => b.rec.bestStreak - a.rec.bestStreak).slice(0, 5);
  const byRating = [...rows].filter((r) => r.rec.rated >= 2).sort((a, b) => b.rec.ratingSum / b.rec.rated - a.rec.ratingSum / a.rec.rated).slice(0, 5);

  // title stats are all-time
  const reignCount = new Map(), reignDays = new Map();
  for (const r of data.reigns) for (const id of r.holders) {
    reignCount.set(id, (reignCount.get(id) || 0) + 1);
    reignDays.set(id, (reignDays.get(id) || 0) + reignLength(r));
  }
  const byReigns = data.superstars.filter((s) => reignCount.get(s.id)).map((s) => ({ s, n: reignCount.get(s.id), days: reignDays.get(s.id) }))
    .sort((a, b) => b.n - a.n || b.days - a.days).slice(0, 5);

  const topMatches = completedMatches(data, { season })
    .filter((m) => Number(m.seg.result.rating) > 0)
    .sort((a, b) => Number(b.seg.result.rating) - Number(a.seg.result.rating))
    .slice(0, 5);
  return { byWins, byPct, byStreak, byRating, byReigns, topMatches };
}

export function plural(n, word) {
  return `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
}

export function formatRecord(rec) {
  return `${rec.w}-${rec.l}${rec.d ? `-${rec.d}` : ''}`;
}

export function formatStreak(n) {
  if (!n) return '—';
  return n > 0 ? `W${n}` : `L${-n}`;
}
