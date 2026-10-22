// The automatic General Manager.
//
// Give it a roster, titles and results, and it books the next week:
// title defenses, #1 contender matches, feud matches that escalate, rematches
// for DQ / count-out / draw finishes, PLE cards every few weeks, and a match for
// every member. Every match comes with a short "why" so it reads like real booking.
//
// Everything here takes `data` explicitly so it can also run outside the browser.

import { uid, sortedEvents } from './store.js';
import {
  records, recordOf, powerRankings, currentReign, completedMatches, hasResult, participants, today, parseDate,
  daysBetween, applyResult, matchName,
} from './stats.js';

export const PLE_NAMES = [
  'Royal Rumble', 'Elimination Chamber', 'WrestleMania', 'Backlash', 'Money in the Bank', 'King & Queen of the Ring',
  'SummerSlam', 'Clash in Paris', 'Crown Jewel', 'Survivor Series', "Saturday Night's Main Event",
];

// PLEs with something special on the card (matched by name, so renamed PLEs still work if the name fits).
export function pleKind(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('rumble')) return 'rumble';
  if (n.includes('money in the bank')) return 'mitb';
  if (n.includes('of the ring')) return 'kotr';
  return null;
}

export const GM_DEFAULTS = {
  matchesPerShow: 4,
  pleEvery: 4,
  pleMatches: 6,
  pleNames: PLE_NAMES,
  tvTitleEvery: 2,
  everyMemberWeekly: true,
  allowCpuOpponents: true,
  allowCpuVsCpu: false,
  stipulationChance: 0.15,
  promos: true,
  autoStorylines: true,
  autopilot: false,
  autoSimOverdue: false,
  showDays: {},
};

const BIG_STIPS = ['Ladder', 'Steel Cage', 'Hell in a Cell', 'Last Man Standing', 'Extreme Rules', 'TLC', 'I Quit', 'No Holds Barred', 'Iron Man', 'Falls Count Anywhere', 'Inferno', '3 Stages of Hell'];
const TV_STIPS = ['No Holds Barred', 'Falls Count Anywhere', 'Tables', 'Extreme Rules', 'Backstage Brawl', 'Submission', 'Dumpster'];
const TAG_STIPS = ['Tables', 'TLC', 'Ladder', 'Extreme Rules', 'Steel Cage'];
const FIX_FINISH = {
  Disqualification: ['No Holds Barred', 'Extreme Rules'],
  'Count-out': ['Falls Count Anywhere', 'Steel Cage'],
  draw: ['Last Man Standing', 'Iron Man'],
  nc: ['Steel Cage', 'Hell in a Cell'],
};
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function gmSettings(data) {
  const s = { ...GM_DEFAULTS, ...((data.settings && data.settings.gm) || {}) };
  if (!Array.isArray(s.pleNames) || !s.pleNames.length) s.pleNames = PLE_NAMES;
  s.showDays = { ...(s.showDays || {}) };
  return s;
}

export function defaultShowDay(brand) {
  const n = (brand && brand.name || '').toLowerCase();
  if (n.includes('raw')) return 1;
  if (n.includes('nxt')) return 2;
  if (n.includes('smack')) return 5;
  return 3;
}

export function showDay(data, brand) {
  const s = gmSettings(data);
  const v = s.showDays[brand.id];
  return v === undefined || v === '' || v === null ? defaultShowDay(brand) : Number(v);
}

export { DAY_NAMES };

// ---------- random ----------
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---------- dates ----------
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(s, n) { const d = parseDate(s) || new Date(); d.setDate(d.getDate() + n); return ymd(d); }
function nextWeekday(from, dow) {
  const d = parseDate(from) || new Date();
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return ymd(d);
}

// ---------- weeks ----------
export function currentWeek(data) {
  return data.events.reduce((m, e) => Math.max(m, Number(e.week) || 0), 0);
}
export function weekEvents(data, w) {
  return sortedEvents(data).filter((e) => Number(e.week) === Number(w));
}
export function weekStatus(data, w) {
  const all = weekEvents(data, w).flatMap((ev) => ev.card.filter((s) => s.kind === 'match' && s.sides.some((x) => x.ids.length)).map((seg) => ({ ev, seg })));
  const pending = all.filter((m) => !hasResult(m.seg));
  return { total: all.length, done: all.length - pending.length, pending, complete: all.length > 0 && pending.length === 0 };
}
export function isPLEWeek(data, w) {
  const s = gmSettings(data);
  return Number(s.pleEvery) > 0 && w > 0 && w % Number(s.pleEvery) === 0;
}
export function pleNameFor(data, w) {
  const s = gmSettings(data);
  const every = Number(s.pleEvery) || 4;
  const idx = Math.max(0, Math.floor(w / every) - 1);
  return s.pleNames[idx % s.pleNames.length];
}
export function nextPLEWeek(data, w) {
  const every = Number(gmSettings(data).pleEvery) || 0;
  if (!every) return null;
  return Math.ceil((w + 0.5) / every) * every;
}

export function findPleWeek(data, fromWeek, pattern) {
  const every = Number(gmSettings(data).pleEvery) || 0;
  if (!every) return null;
  for (let w = fromWeek + 1; w <= fromWeek + every * 12; w++) {
    if (isPLEWeek(data, w) && pattern.test(pleNameFor(data, w))) return w;
  }
  return nextPLEWeek(data, fromWeek + 1);
}

// ---------- titles ----------
export function titleTier(data, t) {
  if (t.tier && t.tier !== 'auto') return t.tier;
  if (t.kind === 'tag') return 'tag';
  const same = data.championships
    .filter((x) => !x.retired && x.kind !== 'tag' && (x.brandId || '') === (t.brandId || '') && x.division === t.division)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return same[0] && same[0].id === t.id ? 'world' : 'secondary';
}
const divisionOf = (t) => (t.division === 'women' ? 'F' : t.division === 'men' ? 'M' : null);

// ---------- context ----------
function buildCtx(data, week, rng) {
  const s = gmSettings(data);
  const season = data.league.season;
  const recs = records(data, { season });
  const pr = powerRankings(data, { season, limit: 9999 });
  const prScore = new Map(pr.map((r) => [r.s.id, r.score]));
  const ss = new Map(data.superstars.map((x) => [x.id, x]));
  const memberIds = new Set(data.members.map((m) => m.id));
  const val = (id) => (prScore.get(id) || 0) * 10 + (Number(ss.get(id) && ss.get(id).overall) || 70) / 10;
  const order = data.superstars.slice().sort((a, b) => val(b.id) - val(a.id));
  const rankPos = new Map(order.map((x, i) => [x.id, i + 1]));
  const champs = new Map();
  for (const t of data.championships) if (!t.retired) { const r = currentReign(data, t.id); if (r) champs.set(t.id, r); }
  const champTitles = new Map();
  for (const [tid, r] of champs) for (const id of r.holders) champTitles.set(id, [...(champTitles.get(id) || []), tid]);

  const planDate = (() => {
    const last = data.events.filter((e) => e.week).map((e) => e.date || '').sort().pop();
    const t = today();
    return last && addDays(last, 1) > t ? addDays(last, 1) : t;
  })();

  // pairs that met recently (avoid repeating the same match week after week)
  const recentPairs = new Set();
  const recentCut = addDays(planDate, -15);
  for (const ev of data.events) {
    const recent = (ev.week && Number(ev.week) >= week - 2) || ((ev.date || '') >= recentCut);
    if (!recent) continue;
    for (const seg of ev.card) if (seg.kind === 'match') pairKeys(seg).forEach((k) => recentPairs.add(k));
  }
  const lastMatch = new Map();
  const done = completedMatches(data);
  for (const m of done) for (const id of participants(m.seg)) lastMatch.set(id, m);

  // titles with a booked match still waiting for a result
  const pendingTitle = new Set();
  for (const ev of data.events) for (const seg of ev.card) if (seg.kind === 'match' && seg.titleId && !hasResult(seg)) pendingTitle.add(seg.titleId);

  return {
    data, s, week, rng, recs, ss, val, rankPos, champs, champTitles, planDate, recentPairs, lastMatch, done, pendingTitle,
    hasMember: (id) => { const x = ss.get(id); return !!(x && x.memberId && memberIds.has(x.memberId)); },
    memberOf: (id) => { const x = ss.get(id); return x && memberIds.has(x.memberId) ? x.memberId : null; },
    name: (id) => (ss.get(id) ? ss.get(id).name : 'Unknown'),
    rec: (id) => recordOf(recs, id),
    types: new Set(data.settings.matchTypes || []),
  };
}

function pairKeys(seg) {
  const keys = [];
  const sides = (seg.sides || []).filter((x) => x.ids.length);
  for (let i = 0; i < sides.length; i++) for (let j = i + 1; j < sides.length; j++) {
    for (const a of sides[i].ids) for (const b of sides[j].ids) keys.push(a < b ? `${a}|${b}` : `${b}|${a}`);
  }
  return keys;
}
const pk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function stipFrom(ctx, list) {
  const ok = list.filter((t) => ctx.types.has(t));
  return ok.length ? pick(ctx.rng, ok) : 'Normal';
}

function bookable(ctx, id) {
  const x = ctx.ss.get(id);
  return !!(x && (x.status || 'Active') === 'Active');
}

function inconclusive(r) {
  if (!r) return null;
  if (r.draw) return 'draw';
  if (r.nc) return 'nc';
  if (r.method === 'Disqualification' || r.method === 'Count-out') return r.method;
  return null;
}
const FINISH_WORDS = { draw: 'a draw', nc: 'a no contest', Disqualification: 'a disqualification', 'Count-out': 'a count-out' };

function mkMatch(format, type, sides, gm, extra = {}) {
  return {
    id: uid('m'), kind: 'match', format, type: type || 'Normal', name: '', titleId: null, stipulation: '', deadline: null,
    sides: sides.map((sd) => ({ ids: [...sd.ids], teamId: sd.teamId || null })), result: null, gm, ...extra,
  };
}

// ---------- the booking ----------
function poolFor(ctx, show, booked, { division = null, brandId } = {}) {
  const b = brandId === undefined ? show.brandId : brandId;
  return ctx.data.superstars.filter((x) => bookable(ctx, x.id) && !booked.has(x.id)
    && (b ? x.brandId === b : !!x.brandId)
    && (!division || x.gender === division)
    && (ctx.hasMember(x.id) || ctx.s.allowCpuOpponents));
}

function bestOpponent(ctx, aId, candidates, exclude = new Set()) {
  const a = ctx.ss.get(aId);
  let best = null, bestScore = -Infinity;
  for (const b of candidates) {
    if (b.id === aId || exclude.has(b.id)) continue;
    const aM = ctx.memberOf(aId), bM = ctx.memberOf(b.id);
    if (aM && bM && aM === bM) continue;
    if (!aM && !bM && !ctx.s.allowCpuVsCpu) continue;
    if (!bM && !ctx.s.allowCpuOpponents) continue;
    let score = -Math.abs((ctx.rankPos.get(aId) || 50) - (ctx.rankPos.get(b.id) || 50)) * 0.6;
    if (a.alignment && b.alignment && a.alignment !== b.alignment) score += 2;
    if (bM) score += 4;
    if (ctx.recentPairs.has(pk(aId, b.id))) score -= 8;
    score += ctx.rng() * 2.5;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return best;
}

function fillerReason(ctx, a, b) {
  const ra = ctx.rec(a), rb = ctx.rec(b);
  const A = ctx.name(a), B = ctx.name(b);
  const pa = ctx.rankPos.get(a) || 99, pb = ctx.rankPos.get(b) || 99;
  const sa = ctx.ss.get(a), sb = ctx.ss.get(b);
  const opts = [];
  if (ra.streak >= 3) opts.push(`${A} puts a ${ra.streak}-match win streak on the line. Can ${B} end it?`);
  if (rb.streak >= 3) opts.push(`${B} puts a ${rb.streak}-match win streak on the line. Can ${A} end it?`);
  if (ra.streak <= -2) opts.push(`${A} needs a win badly after ${-ra.streak} straight losses.`);
  if (rb.streak <= -2) opts.push(`${B} needs a win badly after ${-rb.streak} straight losses.`);
  if (pa <= 5 && pb <= 5) opts.push(`Top-five showdown in the power rankings.`);
  if (Math.abs(pa - pb) >= 6) opts.push(`${pa > pb ? A : B} gets a chance to make a name against ${pa > pb ? B : A}.`);
  if (sa && sb && sa.alignment !== sb.alignment && ['Face', 'Heel'].includes(sa.alignment) && ['Face', 'Heel'].includes(sb.alignment)) {
    const face = sa.alignment === 'Face' ? A : B, heel = sa.alignment === 'Face' ? B : A;
    opts.push(`${face} has heard enough from ${heel}.`);
  }
  if (!ra.matches && !rb.matches) opts.push(`${A} and ${B} make their league debuts.`);
  if (!ctx.recentPairs.has(pk(a, b)) && !opts.length) opts.push(`First time we've seen ${A} and ${B} go one-on-one in a while.`);
  opts.push('Both are looking to climb the rankings.', 'A big chance to make a statement this week.');
  return pick(ctx.rng, opts.slice(0, Math.max(1, opts.length - (opts.length > 3 ? 2 : 0))));
}

function holderText(ctx, ids, teamId) {
  const team = teamId && ctx.data.teams.find((t) => t.id === teamId);
  return team ? team.name : ids.map((i) => ctx.name(i)).join(' & ');
}

// Book a title match for title `t` on `show`. Returns the segment or null.
function bookTitleMatch(ctx, show, t, booked, { isPLE, forcedChallenger = null, excludeChallenger = null } = {}) {
  // a contender saved for a specific PLE (Royal Rumble / King of the Ring winners) waits for that week
  const reserved = !!(t.contender && t.contender.forWeek && ctx.week < Number(t.contender.forWeek));
  const reservedIds = new Set(reserved ? t.contender.ids || [] : []);
  const tier = titleTier(ctx.data, t);
  const reign = ctx.champs.get(t.id);
  const div = divisionOf(t);
  const brandId = t.brandId || undefined;
  if (t.kind === 'tag') {
    const champIds = reign ? reign.holders : [];
    if (reign && (!champIds.every((id) => bookable(ctx, id)) || champIds.some((id) => booked.has(id)))) return null;
    const teams = ctx.data.teams
      .filter((tm) => (!t.brandId || tm.brandId === t.brandId || !tm.brandId) && tm.id !== (reign && reign.teamId))
      .map((tm) => ({ tm, ids: tm.superstarIds.filter((id) => bookable(ctx, id) && !booked.has(id) && !champIds.includes(id)).slice(0, 2) }))
      .filter((x) => x.ids.length === 2 && (!div || x.ids.every((id) => ctx.ss.get(id).gender === div)))
      .filter((x) => !excludeChallenger || x.tm.id !== excludeChallenger)
      .filter((x) => !x.ids.some((id) => ctx.memberOf(id) && champIds.some((c) => ctx.memberOf(c) === ctx.memberOf(id))))
      .sort((a, b) => b.ids.reduce((s, id) => s + ctx.val(id), 0) - a.ids.reduce((s, id) => s + ctx.val(id), 0));
    let chal = null;
    if (t.contender && t.contender.teamId) chal = teams.find((x) => x.tm.id === t.contender.teamId) || null;
    if (!chal) chal = teams[0] || null;
    if (!chal) return null;
    if (!reign) {
      const other = teams.find((x) => x !== chal);
      if (!other) return null;
      const seg = mkMatch('tag', isPLE ? stipFrom(ctx, TAG_STIPS) : 'Normal', [{ ids: chal.ids, teamId: chal.tm.id }, { ids: other.ids, teamId: other.tm.id }],
        { kind: 'title', reason: `The ${t.name} is vacant. ${chal.tm.name} and ${other.tm.name} fight to claim it.`, stakes: 70 }, { titleId: t.id });
      [...chal.ids, ...other.ids].forEach((id) => booked.add(id));
      return seg;
    }
    const type = isPLE && ctx.rng() < 0.5 ? stipFrom(ctx, TAG_STIPS) : 'Normal';
    const contender = t.contender && t.contender.teamId === chal.tm.id;
    const seg = mkMatch('tag', type, [{ ids: reign.holders, teamId: reign.teamId }, { ids: chal.ids, teamId: chal.tm.id }], {
      kind: 'title',
      reason: contender ? `${chal.tm.name} earned this shot as #1 contenders.` : `${chal.tm.name} are the top-ranked team. ${holderText(ctx, reign.holders, reign.teamId)} have to get through them.`,
      stakes: isPLE ? 80 : 65, challenger: chal.tm.id,
    }, { titleId: t.id });
    [...reign.holders, ...chal.ids].forEach((id) => booked.add(id));
    return seg;
  }

  // singles
  const pool = poolFor(ctx, show, booked, { division: div, brandId: brandId === undefined ? (show.type === 'ple' ? null : show.brandId) : brandId })
    .filter((x) => !(reign && reign.holders.includes(x.id)));
  if (!reign) {
    const top = pool.sort((a, b) => ctx.val(b.id) - ctx.val(a.id)).slice(0, 2);
    if (top.length < 2) return null;
    const seg = mkMatch('singles', isPLE ? stipFrom(ctx, BIG_STIPS) : 'Normal', top.map((x) => ({ ids: [x.id] })), {
      kind: 'title', reason: `The ${t.name} is vacant. The two highest-ranked contenders battle for the gold.`, stakes: tier === 'world' ? 100 : 70,
    }, { titleId: t.id });
    top.forEach((x) => booked.add(x.id));
    return seg;
  }
  const champ = reign.holders[0];
  if (!bookable(ctx, champ) || booked.has(champ)) return null;
  const champMember = ctx.memberOf(champ);
  const candidates = pool.filter((x) => x.id !== excludeChallenger && !reservedIds.has(x.id) && !(champMember && ctx.memberOf(x.id) === champMember)
    && (ctx.hasMember(x.id) || champMember || ctx.s.allowCpuVsCpu));
  let chalId = null, reason = '', type = 'Normal';
  // 1) a #1 contender who earned it
  if (forcedChallenger && candidates.some((x) => x.id === forcedChallenger)) chalId = forcedChallenger;
  if (!chalId && !reserved && t.contender && t.contender.ids && t.contender.ids.length === 1 && candidates.some((x) => x.id === t.contender.ids[0])) {
    chalId = t.contender.ids[0];
    reason = t.contender.reason
      ? `${ctx.name(chalId)} earned this shot as the ${t.contender.reason}. Now it's time to collect.`
      : `${ctx.name(chalId)} earned this as the #1 contender. Now it's time to cash in.`;
  }
  // 2) unfinished business from the last title match
  if (!chalId) {
    const lastTitle = [...ctx.done].reverse().find((m) => m.seg.titleId === t.id);
    const fin = lastTitle && inconclusive(lastTitle.seg.result);
    if (fin && participants(lastTitle.seg).includes(champ)) {
      const other = participants(lastTitle.seg).find((id) => id !== champ && candidates.some((x) => x.id === id));
      if (other) {
        chalId = other;
        type = stipFrom(ctx, FIX_FINISH[fin] || BIG_STIPS);
        reason = `Last time ended in ${FINISH_WORDS[fin]}. Rematch, and this time it's ${type === 'Normal' ? 'for real' : `a ${type} match`}.`;
      }
    }
  }
  // 3) rematch clause: the champion they just took it from gets one more shot
  if (!chalId && defensesOf(ctx, reign.id) === 0) {
    const prev = ctx.data.reigns.find((r) => r.titleId === t.id && r.lostMatchId && r.lostMatchId === reign.wonMatchId);
    const prevChamp = prev && prev.holders.length === 1 ? prev.holders[0] : null;
    if (prevChamp && candidates.some((x) => x.id === prevChamp)) {
      chalId = prevChamp;
      reason = `Rematch clause: ${ctx.name(prevChamp)} wants the ${t.name} back from ${ctx.name(champ)}.`;
    }
  }
  // 4) the best-ranked challenger (skip whoever just lost clean to this champ, if possible)
  if (!chalId) {
    const lastLoss = [...ctx.done].reverse().find((m) => m.seg.titleId === t.id && m.seg.result && m.seg.result.retainedReignId === reign.id && !inconclusive(m.seg.result));
    const justLost = new Set(lastLoss ? participants(lastLoss.seg).filter((id) => id !== champ) : []);
    const sorted = candidates.slice().sort((a, b) => {
      const ma = (champMember ? (ctx.hasMember(a.id) ? 1 : 0) : 0) - (champMember ? (ctx.hasMember(b.id) ? 1 : 0) : 0);
      return -ma || ctx.val(b.id) - ctx.val(a.id);
    });
    const choice = sorted.find((x) => !justLost.has(x.id)) || sorted[0];
    if (!choice) return null;
    chalId = choice.id;
    const r = ctx.rec(chalId);
    const pos = ctx.rankPos.get(chalId);
    if (r.streak >= 3) reason = `${ctx.name(chalId)}'s ${r.streak}-match win streak earned a shot at ${ctx.name(champ)}.`;
    else if (pos <= 5) reason = `${ctx.name(chalId)} is #${pos} in the power rankings and gets a crack at ${ctx.name(champ)}.`;
    else if (!r.matches) reason = `${ctx.name(chalId)} gets a title shot right out of the gate. Can they shock ${ctx.name(champ)}?`;
    else reason = pick(ctx.rng, [
      `${ctx.name(chalId)} gets the opportunity of a lifetime against ${ctx.name(champ)}.`,
      `${ctx.name(champ)} issued an open challenge, and ${ctx.name(chalId)} answered it.`,
      `${ctx.name(chalId)} has been calling out ${ctx.name(champ)} for weeks. Now they get their shot.`,
    ]);
  }
  if (type === 'Normal' && isPLE && ctx.rng() < (tier === 'world' ? 0.5 : 0.35)) type = stipFrom(ctx, BIG_STIPS);
  if (type === 'Normal' && !isPLE && ctx.rng() < ctx.s.stipulationChance / 2) type = stipFrom(ctx, TV_STIPS);
  const seg = mkMatch('singles', type, [{ ids: [champ] }, { ids: [chalId] }], {
    kind: 'title', reason, stakes: (tier === 'world' ? 100 : 70) + (isPLE ? 10 : 0), challenger: chalId,
  }, { titleId: t.id });
  booked.add(champ); booked.add(chalId);
  return seg;
}

function defensesOf(ctx, reignId) {
  return ctx.done.filter((m) => m.seg.result && m.seg.result.retainedReignId === reignId).length;
}

function bookFeud(ctx, show, sl, booked, { isPLE }) {
  const inPool = new Set(poolFor(ctx, show, booked, { brandId: show.type === 'ple' ? null : show.brandId }).map((x) => x.id));
  let parts = sl.superstarIds.filter((id) => inPool.has(id));
  if (parts.length < 2) return null;
  parts.sort((a, b) => ctx.val(b) - ctx.val(a));
  // avoid putting two superstars of the same member against each other
  const chosen = [];
  for (const id of parts) {
    const m = ctx.memberOf(id);
    if (m && chosen.some((c) => ctx.memberOf(c) === m)) continue;
    chosen.push(id);
    if (chosen.length >= (parts.length >= 4 && ctx.rng() < 0.4 ? 4 : parts.length === 3 ? 3 : 2)) break;
  }
  if (chosen.length < 2) return null;
  if (!chosen.some((id) => ctx.hasMember(id)) && !ctx.s.allowCpuVsCpu) return null;
  const set = new Set(sl.superstarIds);
  const meetings = ctx.done.filter((m) => {
    const sides = m.seg.sides.map((sd) => sd.ids.filter((id) => set.has(id)).length).filter(Boolean);
    return sides.length >= 2;
  }).length;
  let type = 'Normal', blowoff = false, reason;
  if (meetings >= 3 && isPLE) { type = stipFrom(ctx, BIG_STIPS); blowoff = true; reason = `${sl.title}: after ${meetings} battles, this ${type === 'Normal' ? 'match' : `${type} match`} ends it.`; }
  else if (meetings >= 2) { type = stipFrom(ctx, isPLE ? BIG_STIPS : TV_STIPS); reason = `${sl.title} keeps escalating. Meeting #${meetings + 1}, and the rules are out the window.`; }
  else if (isPLE && ctx.rng() < 0.5) { type = stipFrom(ctx, BIG_STIPS); reason = `${sl.title} comes to a head on the big stage.`; }
  else reason = meetings ? `${sl.title}: the rematch.` : `${sl.title}: they finally settle it in the ring.`;
  const format = chosen.length === 4 ? 'fatal4' : chosen.length === 3 ? 'triple' : 'singles';
  const seg = mkMatch(format, type, chosen.map((id) => ({ ids: [id] })), { kind: 'feud', reason, stakes: 50 + (blowoff ? 30 : 0) + (isPLE ? 10 : 0), storylineId: sl.id, blowoff });
  chosen.forEach((id) => booked.add(id));
  return seg;
}

function bookRematch(ctx, show, booked) {
  const pool = poolFor(ctx, show, booked, { brandId: show.type === 'ple' ? null : show.brandId });
  const ids = new Set(pool.map((x) => x.id));
  for (const x of pool.sort((a, b) => ctx.val(b.id) - ctx.val(a.id))) {
    const lm = ctx.lastMatch.get(x.id);
    if (!lm || lm.seg.titleId) continue;
    if (lm.ev.week && Number(lm.ev.week) < ctx.week - 2) continue;
    const fin = inconclusive(lm.seg.result);
    if (!fin) continue;
    const opp = participants(lm.seg).filter((id) => id !== x.id && ids.has(id) && !booked.has(id));
    if (!opp.length || participants(lm.seg).length !== 2) continue;
    const o = opp[0];
    if (!ctx.hasMember(x.id) && !ctx.hasMember(o) && !ctx.s.allowCpuVsCpu) continue;
    const m1 = ctx.memberOf(x.id), m2 = ctx.memberOf(o);
    if (m1 && m1 === m2) continue;
    const type = stipFrom(ctx, FIX_FINISH[fin] || TV_STIPS);
    const seg = mkMatch('singles', type, [{ ids: [x.id] }, { ids: [o] }], {
      kind: 'rematch',
      reason: `Unfinished business: their last match ended in ${FINISH_WORDS[fin]}. ${type === 'Normal' ? 'Rematch.' : `This time it's ${type}. No excuses.`}`,
      stakes: 45,
    });
    booked.add(x.id); booked.add(o);
    return seg;
  }
  return null;
}

function bookContender(ctx, show, t, booked, pleName) {
  const reign = ctx.champs.get(t.id);
  if (!reign || t.kind === 'tag') return null;
  if (t.contender) return null;
  const div = divisionOf(t);
  const champMember = ctx.memberOf(reign.holders[0]);
  const pool = poolFor(ctx, show, booked, { division: div, brandId: t.brandId || show.brandId })
    .filter((x) => !reign.holders.includes(x.id) && !(champMember && ctx.memberOf(x.id) === champMember))
    .sort((a, b) => ctx.val(b.id) - ctx.val(a.id));
  const top = [];
  for (const x of pool) {
    if (top.some((y) => ctx.memberOf(y.id) && ctx.memberOf(y.id) === ctx.memberOf(x.id))) continue;
    if (top.length === 1 && !ctx.hasMember(top[0].id) && !ctx.hasMember(x.id) && !ctx.s.allowCpuVsCpu) continue;
    top.push(x);
    if (top.length === 2) break;
  }
  if (top.length < 2) return null;
  const seg = mkMatch('singles', 'Normal', top.map((x) => ({ ids: [x.id] })), {
    kind: 'contender', reason: `#1 Contender's match. The winner faces ${ctx.name(reign.holders[0])} for the ${t.name}${pleName ? ` at ${pleName}` : ''}.`, stakes: 55,
  }, { contenderFor: t.id, stipulation: `Winner becomes #1 contender to the ${t.name}` });
  top.forEach((x) => booked.add(x.id));
  return seg;
}

function bookFiller(ctx, show, aId, booked, { isPLE, exclude = new Set() } = {}) {
  const a = ctx.ss.get(aId);
  const pool = poolFor(ctx, show, booked, { division: a.gender, brandId: show.type === 'ple' ? null : show.brandId }).filter((x) => x.id !== aId);
  const b = bestOpponent(ctx, aId, pool, exclude);
  if (!b) return null;
  let type = 'Normal';
  if (ctx.rng() < ctx.s.stipulationChance * (isPLE ? 2 : 1)) type = stipFrom(ctx, isPLE ? BIG_STIPS : TV_STIPS);
  const seg = mkMatch('singles', type, [{ ids: [aId] }, { ids: [b.id] }], { kind: 'filler', reason: fillerReason(ctx, aId, b.id), stakes: 10 + Math.max(0, 20 - Math.min(ctx.rankPos.get(aId) || 20, ctx.rankPos.get(b.id) || 20)) });
  booked.add(aId); booked.add(b.id);
  return seg;
}

function bookTagFiller(ctx, show, booked) {
  const teams = ctx.data.teams
    .filter((tm) => tm.brandId === show.brandId || (show.type === 'ple' && tm.brandId))
    .map((tm) => ({ tm, ids: tm.superstarIds.filter((id) => bookable(ctx, id) && !booked.has(id)).slice(0, 2) }))
    .filter((x) => x.ids.length === 2 && x.ids.some((id) => ctx.hasMember(id)));
  if (teams.length < 2) return null;
  const a = teams[Math.floor(ctx.rng() * teams.length)];
  const others = teams.filter((x) => x !== a && !x.ids.some((id) => a.ids.includes(id)));
  if (!others.length) return null;
  const b = others[Math.floor(ctx.rng() * others.length)];
  const type = ctx.rng() < ctx.s.stipulationChance ? stipFrom(ctx, TAG_STIPS) : 'Normal';
  const seg = mkMatch('tag', type, [{ ids: a.ids, teamId: a.tm.id }, { ids: b.ids, teamId: b.tm.id }], {
    kind: 'tag', reason: `Tag team action: ${a.tm.name} and ${b.tm.name} both want to climb toward the tag titles.`, stakes: 30,
  });
  [...a.ids, ...b.ids].forEach((id) => booked.add(id));
  return seg;
}

function openingPromo(ctx, show) {
  const top = show.card.filter((s) => s.kind === 'match').sort((a, b) => (b.gm.stakes || 0) - (a.gm.stakes || 0))[0];
  if (!top || (top.gm.stakes || 0) < 45) return null;
  const ids = top.sides.flatMap((s) => s.ids).slice(0, 4);
  const names = ids.map((id) => ctx.name(id));
  const title = top.titleId && ctx.data.championships.find((t) => t.id === top.titleId);
  let titleText, text;
  if (title && top.gm.kind === 'title') {
    titleText = `${names[0]} opens the show with the ${title.name}`;
    text = `${names[0]} comes out with the ${title.name} over the shoulder, and ${names[1] || 'the challenger'} interrupts. Words are exchanged before tonight's title match.`;
  } else if (top.gm.kind === 'contender') {
    titleText = 'Contract signing gone wrong';
    text = `${names.join(' and ')} meet to make tonight's #1 contender's match official. It turns physical before the ink is dry.`;
  } else {
    titleText = `${names.slice(0, 2).join(' and ')} come face to face`;
    text = `${names.slice(0, 2).join(' and ')} get in each other's faces before their match. Security has to step in.`;
  }
  return { id: uid('p'), kind: 'promo', title: titleText, superstarIds: ids.slice(0, 2), text, link: '', gm: { kind: 'promo', stakes: 0 } };
}


// ---------- big-event specials ----------
const DIV_WORD = { M: "Men's", F: "Women's" };

function specialPool(ctx, booked, div) {
  const holders = new Set((ctx.data.briefcases || []).map((b) => b.holder));
  return ctx.data.superstars.filter((x) => bookable(ctx, x.id) && !booked.has(x.id) && x.brandId && x.gender === div
    && !ctx.champTitles.has(x.id) && (ctx.hasMember(x.id) || ctx.s.allowCpuOpponents))
    .map((x) => ({ x, holder: holders.has(x.id) }));
}

// Royal Rumble or Money in the Bank ladder match for one division.
function bookMultiSpecial(ctx, show, booked, div, kind) {
  let pool = specialPool(ctx, booked, div);
  if (kind === 'mitb') pool = pool.filter((p) => !p.holder);
  const list = pool.map((p) => p.x).sort((a, b) => (ctx.hasMember(b.id) ? 1 : 0) - (ctx.hasMember(a.id) ? 1 : 0) || ctx.val(b.id) - ctx.val(a.id));
  const max = kind === 'rumble' ? 30 : 8;
  // one entrant per member (nobody can control two wrestlers in the same match)
  const usedMembers = new Set();
  const entrants = [];
  for (const x of list) {
    const m = ctx.memberOf(x.id);
    if (m && usedMembers.has(m)) continue;
    if (m) usedMembers.add(m);
    entrants.push(x);
    if (entrants.length >= max) break;
  }
  if (entrants.length < 4 || (!entrants.some((x) => ctx.hasMember(x.id)))) return null;
  const word = DIV_WORD[div];
  const wm = kind === 'rumble' ? pleNameFor(ctx.data, findPleWeek(ctx.data, ctx.week, /wrestlemania/i) || ctx.week) : '';
  const seg = mkMatch('multi', kind === 'rumble' ? 'Royal Rumble' : 'Money in the Bank', entrants.map((x) => ({ ids: [x.id] })), {
    kind: 'special',
    reason: kind === 'rumble'
      ? `${entrants.length} superstars, one winner. The winner earns a world title match at ${wm || 'the next big PLE'}.`
      : `${entrants.length} superstars climb for the briefcase: a guaranteed title shot, any time, anywhere, for the next 12 weeks.`,
    stakes: kind === 'rumble' ? 95 : 90,
  }, { name: kind === 'rumble' ? `${word} Royal Rumble` : `${word} Money in the Bank Ladder Match`, special: { kind, division: div } });
  entrants.forEach((x) => booked.add(x.id));
  return seg;
}

// King & Queen of the Ring: semifinals the week before, the final at the PLE.
function bookKotrSemis(ctx, shows, booked, div, pleWeek) {
  const list = specialPool(ctx, booked, div).map((p) => p.x)
    .sort((a, b) => (ctx.hasMember(b.id) ? 1 : 0) - (ctx.hasMember(a.id) ? 1 : 0) || ctx.val(b.id) - ctx.val(a.id));
  // pick 4, avoiding two superstars of the same member in the same semifinal where possible
  const four = list.slice(0, 4);
  if (four.length < 4) return [];
  const clash = ([a, b]) => { const m = ctx.memberOf(a.id); return m && m === ctx.memberOf(b.id); };
  const options = [[[0, 3], [1, 2]], [[0, 2], [1, 3]], [[0, 1], [2, 3]]].map((o) => o.map(([i, j]) => [four[i], four[j]]));
  const pairs = options.find((o) => !o.some(clash)) || options[0];
  const crown = div === 'F' ? 'Queen' : 'King';
  const out = [];
  pairs.forEach(([a, b], slot) => {
    const show = shows.find((sh) => sh.brandId === a.brandId) || shows[0];
    const seg = mkMatch('singles', 'Normal', [{ ids: [a.id] }, { ids: [b.id] }], {
      kind: 'special', reason: `${crown} of the Ring semifinal. The winner goes to the final at ${pleNameFor(ctx.data, pleWeek)}.`, stakes: 60,
    }, { name: `${crown} of the Ring Semifinal`, special: { kind: 'kotr', round: 'semi', division: div, pleWeek, slot } });
    booked.add(a.id); booked.add(b.id);
    show.card.push(seg);
    out.push(seg);
  });
  return out;
}

function bookKotrFinal(ctx, show, booked, div) {
  const semis = [];
  for (const ev of ctx.data.events) for (const seg of ev.card) {
    const sp = seg.special;
    if (sp && sp.kind === 'kotr' && sp.round === 'semi' && sp.division === div && Number(sp.pleWeek) === ctx.week) semis.push(seg);
  }
  let finalists = semis.filter((sg) => decisive(sg.result)).map((sg) => sg.sides[Number(sg.result.winnerSide)].ids[0]).filter((id) => bookable(ctx, id) && !booked.has(id));
  const crown = div === 'F' ? 'Queen' : 'King';
  let reason = `The ${crown} of the Ring final. The winner is crowned and earns a world title shot at ${pleNameFor(ctx.data, findPleWeek(ctx.data, ctx.week, /summerslam/i) || ctx.week)}.`;
  if (finalists.length < 2) {
    // no semifinals on record: crown it in one night between the top two
    const top = specialPool(ctx, booked, div).map((p) => p.x).filter((x) => !finalists.includes(x.id))
      .sort((a, b) => (ctx.hasMember(b.id) ? 1 : 0) - (ctx.hasMember(a.id) ? 1 : 0) || ctx.val(b.id) - ctx.val(a.id));
    while (finalists.length < 2 && top.length) finalists.push(top.shift().id);
    if (semis.length) reason += ' (Semifinal results were missing, so the GM picked the finalists.)';
  }
  if (finalists.length < 2) return null;
  const m1 = ctx.memberOf(finalists[0]), m2 = ctx.memberOf(finalists[1]);
  if (m1 && m1 === m2) reason += ' Both finalists belong to the same member, so sim this one.';
  const seg = mkMatch('singles', 'Normal', finalists.map((id) => ({ ids: [id] })), { kind: 'special', reason, stakes: 92 },
    { name: `${crown} of the Ring Final`, special: { kind: 'kotr', round: 'final', division: div } });
  finalists.forEach((id) => booked.add(id));
  return seg;
}

// ---------- match simulator ----------
const NO_DQ = new Set(['Extreme Rules', 'No Holds Barred', 'Falls Count Anywhere', 'Hell in a Cell', 'Steel Cage', 'Tables', 'Ladder', 'TLC',
  'Backstage Brawl', 'Bloodline Rules', 'Underground', 'Last Man Standing', 'I Quit', 'Inferno', 'Dumpster', 'Casket', 'Ambulance',
  'Money in the Bank', 'Royal Rumble', 'Battle Royal', 'Elimination Chamber', 'WarGames', '3 Stages of Hell', 'Iron Man']);

function simMethod(type, rng) {
  if (['Ladder', 'TLC', 'Money in the Bank'].includes(type)) return 'Item retrieval';
  if (['Royal Rumble', 'Battle Royal', 'Elimination Chamber', 'Gauntlet', 'Gauntlet Turmoil', 'Gauntlet Eliminator'].includes(type)) return 'Elimination';
  if (['Submission', 'I Quit'].includes(type)) return 'Submission';
  if (type === 'Last Man Standing') return 'Knockout';
  if (['Ambulance', 'Casket', 'Inferno', 'Dumpster', 'Tables'].includes(type)) return 'Other';
  if (type === 'Steel Cage' && rng() < 0.4) return 'Escape';
  const x = rng();
  if (x < 0.78) return 'Pinfall';
  if (x < 0.92) return 'Submission';
  if (NO_DQ.has(type)) return 'Pinfall';
  return x < 0.97 ? 'Disqualification' : type === 'Normal' ? 'Count-out' : 'Pinfall';
}

// Pick a believable winner, finish and star rating for a match nobody played.
export function simulateMatch(data, ev, seg, rng = Math.random) {
  const recs = records(data, { season: data.league.season });
  const champs = new Set();
  for (const t of data.championships) { const r = currentReign(data, t.id); if (r) r.holders.forEach((id) => champs.add(id)); }
  const strength = (id) => {
    const x = data.superstars.find((y) => y.id === id) || {};
    const rec = recordOf(recs, id);
    const form = rec.form.slice(-5).filter((f) => f === 'W').length;
    return (Number(x.overall) || 75) + Math.max(-4, Math.min(4, rec.streak)) + form * 0.5 + (champs.has(id) ? 2 : 0);
  };
  const sides = seg.sides.map((sd, i) => ({ i, ids: sd.ids, str: sd.ids.length ? sd.ids.reduce((t, id) => t + strength(id), 0) / sd.ids.length + (sd.teamId ? 2 : 0) : -Infinity }))
    .filter((sd) => sd.ids.length);
  if (sides.length < 2) return null;
  const weights = sides.map((sd) => Math.exp(sd.str / 9));
  const total = weights.reduce((a, b) => a + b, 0);
  const type = seg.type || 'Normal';
  // the occasional draw in a regular one-on-one
  if (sides.length === 2 && type === 'Normal' && !seg.special && !seg.titleId && !seg.contenderFor && rng() < 0.02) {
    return { winnerSide: null, draw: true, nc: false, method: '', rating: Math.round((2.5 + rng() * 1.5) * 4) / 4, link: '', notes: 'Simulated: time-limit draw.', simulated: true };
  }
  let roll = rng() * total, win = sides[0];
  for (let k = 0; k < sides.length; k++) { roll -= weights[k]; if (roll <= 0) { win = sides[k]; break; } }
  const pWin = weights[sides.indexOf(win)] / total;
  let rating = 2.75;
  if (seg.titleId) rating += 0.5;
  if (ev.type === 'ple') rating += 0.5;
  if (type !== 'Normal') rating += 0.4;
  if (sides.length === 2) rating += 0.5 * (1 - Math.abs(pWin - 0.5) * 2);
  rating += rng() * 1.25 - 0.6;
  rating = Math.max(1, Math.min(5, Math.round(rating * 4) / 4));
  const upset = sides.length === 2 && pWin < 0.35;
  return {
    winnerSide: win.i, draw: false, nc: false, method: simMethod(type, rng), rating, link: '',
    notes: upset ? 'Simulated: an upset!' : 'Simulated.', simulated: true,
  };
}

// Plan (but don't save) the next week. Returns { week, isPLE, shows, notes, seed }.
export function planWeek(data, { week = currentWeek(data) + 1, seed = Date.now() } = {}) {
  const rng = rngFrom(seed);
  const ctx = buildCtx(data, week, rng);
  const s = ctx.s;
  const isPLE = isPLEWeek(data, week);
  const pleSoon = !isPLE && isPLEWeek(data, week + 1);
  const nextPle = pleSoon ? pleNameFor(data, week + 1) : null;
  const booked = new Set();
  const notes = [];
  const deadlineDays = Number(data.settings.defaultDeadlineDays) || 7;

  // shows this week
  const brandsWithRoster = data.brands.filter((b) => data.superstars.filter((x) => x.brandId === b.id && bookable(ctx, x.id)).length >= 2);
  let shows;
  if (isPLE) {
    const date = nextWeekday(ctx.planDate, 6);
    shows = [{ key: 'ple', name: pleNameFor(data, week), type: 'ple', brandId: null, date, deadline: addDays(date, deadlineDays), season: data.league.season, week, card: [] }];
  } else {
    shows = brandsWithRoster.map((b) => {
      const date = nextWeekday(ctx.planDate, showDay(data, b));
      return { key: b.id, name: `${b.name} Week ${week}`, type: 'weekly', brandId: b.id, date, deadline: addDays(date, deadlineDays), season: data.league.season, week, card: [] };
    });
  }
  if (!shows.length) return { week, isPLE, shows, notes: ['Add at least two active superstars to a brand so the GM has someone to book.'], seed };
  const showFor = (brandId) => (isPLE ? shows[0] : shows.find((sh) => sh.brandId === brandId));
  const add = (show, seg) => { if (seg) show.card.push(seg); return seg; };

  // 0) King & Queen of the Ring: semifinals the week before, finals at the PLE (booked first so the entrants stay free)
  if (isPLE && pleKind(shows[0].name) === 'kotr') for (const div of ['M', 'F']) add(shows[0], bookKotrFinal(ctx, shows[0], booked, div));
  // Money in the Bank ladder matches headline their PLE, so they get first pick of the roster
  if (isPLE && pleKind(shows[0].name) === 'mitb') {
    for (const div of ['M', 'F']) if (!add(shows[0], bookMultiSpecial(ctx, shows[0], booked, div, 'mitb')) && div === 'M') notes.push("Not enough available superstars for a Money in the Bank ladder match.");
  }
  if (pleSoon && pleKind(nextPle) === 'kotr') for (const div of ['M', 'F']) bookKotrSemis(ctx, shows, booked, div, week + 1);

  // 1) championships
  const titles = data.championships.filter((t) => !t.retired && !ctx.pendingTitle.has(t.id));
  for (const t of titles.sort((a, b) => (a.order || 0) - (b.order || 0))) {
    const tier = titleTier(data, t);
    const reign = ctx.champs.get(t.id);
    const champBrand = reign && ctx.ss.get(reign.holders[0]) ? ctx.ss.get(reign.holders[0]).brandId : null;
    const show = showFor(t.brandId || champBrand) || (isPLE ? shows[0] : null);
    if (!show) continue;
    if (isPLE) { add(show, bookTitleMatch(ctx, show, t, booked, { isPLE: true })); continue; }
    if (tier === 'world') { // world titles are defended at PLEs
      if (!reign) { const pw = nextPLEWeek(data, week); notes.push(`The ${t.name} is vacant. ${pw ? `It will be decided at ${pleNameFor(data, pw)} (Week ${pw}), or` : 'You can'} crown a champion now with Titles → Award.`); }
      continue;
    }
    const lastDef = [...ctx.done].reverse().find((m) => m.seg.titleId === t.id);
    const since = lastDef ? lastDef.ev.date : reign ? reign.wonAt : null;
    const weeks = since ? daysBetween(since, ctx.planDate) / 7 : 99;
    if (!reign || weeks >= Number(s.tvTitleEvery || 2) - 0.2) add(show, bookTitleMatch(ctx, show, t, booked, { isPLE: false }));
  }

  // 1b) big-event specials
  if (isPLE) {
    const kind = pleKind(shows[0].name);
    if (kind === 'rumble') for (const div of ['M', 'F']) if (!add(shows[0], bookMultiSpecial(ctx, shows[0], booked, div, kind)) && div === 'M') notes.push('Not enough available superstars left for a Royal Rumble.');
  }

  // 2) #1 contender matches the week before a PLE
  if (pleSoon) {
    for (const t of titles.filter((x) => x.kind !== 'tag')) {
      const reign = ctx.champs.get(t.id);
      const champBrand = reign && ctx.ss.get(reign.holders[0]) ? ctx.ss.get(reign.holders[0]).brandId : null;
      const show = showFor(t.brandId || champBrand);
      if (show && show.card.filter((x) => x.gm.kind === 'contender').length < 2) add(show, bookContender(ctx, show, t, booked, nextPle));
    }
  }

  // 3) unfinished business, then feuds
  for (const show of shows) {
    let r;
    let guard = 0;
    while ((r = bookRematch(ctx, show, booked)) && guard++ < 3) add(show, r);
  }
  const stories = data.storylines.filter((x) => x.status !== 'concluded').sort((a, b) => (b.heat || 0) - (a.heat || 0));
  for (const sl of stories) {
    for (const show of shows) {
      if (add(show, bookFeud(ctx, show, sl, booked, { isPLE }))) break;
    }
  }

  // 4) every member gets a match this week
  const cap = isPLE ? Number(s.pleMatches) || 6 : Number(s.matchesPerShow) || 4;
  if (s.everyMemberWeekly) {
    const members = data.members.slice().sort(() => rng() - 0.5);
    for (const m of members) {
      const mine = data.superstars.filter((x) => x.memberId === m.id && bookable(ctx, x.id) && x.brandId && showFor(x.brandId));
      if (!mine.length || mine.some((x) => booked.has(x.id))) continue;
      mine.sort((p, q) => ctx.val(q.id) - ctx.val(p.id));
      let ok = false;
      for (const x of mine) { if (add(showFor(x.brandId), bookFiller(ctx, showFor(x.brandId), x.id, booked, { isPLE }))) { ok = true; break; } }
      const a = mine[0];
      const show = showFor(a.brandId);
      if (!ok) {
        // no opponent left: turn an existing filler singles into a triple threat
        // no opponent left: add them to an existing singles match to make it a Triple Threat
        let host = null, who = null;
        for (const x of mine) {
          const sh = showFor(x.brandId);
          const cands = sh.card.filter((sg) => sg.kind === 'match' && sg.format === 'singles' && ['filler', 'rematch', 'feud'].includes(sg.gm.kind) && !sg.gm.blowoff
            && sg.sides.every((sd) => sd.ids.every((id) => ctx.ss.get(id).gender === x.gender && ctx.memberOf(id) !== m.id)));
          host = cands.find((sg) => sg.gm.kind === 'filler') || cands[0];
          if (host) { who = x; break; }
        }
        if (host) {
          host.format = 'triple';
          host.sides.push({ ids: [who.id], teamId: null });
          host.gm.reason = host.gm.kind === 'filler'
            ? `${ctx.name(who.id)} is added to make it a Triple Threat.`
            : `${host.gm.reason} ${ctx.name(who.id)} inserts themselves into it, making it a Triple Threat.`;
          booked.add(who.id);
        } else notes.push(`No opponent available for ${m.name} (${a.name}) this week.`);
      }
    }
  }

  // 5) fill each show up to the target size
  for (const show of shows) {
    let guard = 0;
    while (show.card.filter((x) => x.kind === 'match').length < cap && guard++ < 20) {
      if (!isPLE && ctx.rng() < 0.3 && add(show, bookTagFiller(ctx, show, booked))) continue;
      const pool = poolFor(ctx, show, booked, { brandId: isPLE ? null : show.brandId })
        .sort((a, b) => (ctx.hasMember(b.id) ? 1 : 0) - (ctx.hasMember(a.id) ? 1 : 0) || ctx.val(b.id) - ctx.val(a.id));
      let made = null;
      for (const a of pool) { if ((made = bookFiller(ctx, show, a.id, booked, { isPLE }))) break; }
      if (!made) break;
      add(show, made);
    }
  }

  // 6) running order (biggest match last) + an opening segment
  for (const show of shows) {
    show.card.sort((a, b) => (a.gm.stakes || 0) - (b.gm.stakes || 0));
    if (show.card.length > 2) { // strong opener: move the 2nd-biggest match to the top
      const second = show.card.splice(show.card.length - 2, 1)[0];
      show.card.unshift(second);
    }
    if (s.promos && !isPLE) { const p = openingPromo(ctx, show); if (p) show.card.unshift(p); }
    for (const seg of show.card) if (seg.kind === 'match') seg.deadline = show.deadline;
    if (!show.card.some((x) => x.kind === 'match')) notes.push(`${show.name}: not enough available superstars to book a match.`);
  }
  shows = shows.filter((sh) => sh.card.some((x) => x.kind === 'match'));
  return { week, isPLE, shows, notes, seed };
}

// Add one more match to a planned show (for the "add match" button on a proposal).
export function addMatchToPlan(data, plan, showIdx, seed = Date.now()) {
  const ctx = buildCtx(data, plan.week, rngFrom(seed));
  const booked = new Set(plan.shows.flatMap((sh) => sh.card.flatMap((sg) => (sg.kind === 'match' ? participants(sg) : []))));
  const show = plan.shows[showIdx];
  const pool = poolFor(ctx, show, booked, { brandId: show.type === 'ple' ? null : show.brandId })
    .sort((a, b) => (ctx.hasMember(b.id) ? 1 : 0) - (ctx.hasMember(a.id) ? 1 : 0) || ctx.rng() - 0.5);
  for (const a of pool) {
    const seg = bookFiller(ctx, show, a.id, booked, { isPLE: show.type === 'ple' });
    if (seg) { seg.deadline = show.deadline; show.card.push(seg); return seg; }
  }
  return null;
}

// Save a plan as real shows.
export function bookPlan(data, plan) {
  const ids = [];
  for (const sh of plan.shows) {
    const id = uid('ev');
    ids.push(id);
    data.events.push({
      id, name: sh.name, type: sh.type, brandId: sh.brandId, date: sh.date, deadline: sh.deadline, season: sh.season, week: plan.week,
      posterUrl: '', notes: sh.type === 'ple' ? `Week ${plan.week} Premium Live Event. Booked by the GM.` : '', card: sh.card, gm: true,
    });
  }
  data.gm = { ...(data.gm || {}), week: plan.week, lastBooked: new Date().toISOString() };
  return ids;
}

// ---------- results: contenders + storylines ----------
function decisive(r) { return r && !r.draw && !r.nc && r.winnerSide !== null && r.winnerSide !== undefined; }

function resultSentence(data, ev, seg) {
  const nm = (id) => (data.superstars.find((x) => x.id === id) || {}).name || '?';
  const side = (sd) => sd.ids.map(nm).join(' & ');
  const r = seg.result;
  if (r.draw) return `${seg.sides.map(side).join(' and ')} fought to a draw at ${ev.name}.`;
  if (r.nc) return `${seg.sides.map(side).join(' vs ')} ended in a no contest at ${ev.name}.`;
  const w = Number(r.winnerSide);
  return `${side(seg.sides[w])} def. ${seg.sides.filter((_, i) => i !== w).map(side).join(', ')}${r.method ? ` by ${r.method.toLowerCase()}` : ''} at ${ev.name}.`;
}

export function undoGmEffects(data, seg) {
  const fx = seg.gmFx;
  if (!fx) return;
  for (const sl of data.storylines) sl.updates = sl.updates.filter((u) => u.matchId !== seg.id);
  if (fx.createdStoryline) data.storylines = data.storylines.filter((sl) => sl.id !== fx.createdStoryline);
  if (fx.concluded) { const sl = data.storylines.find((x) => x.id === fx.concluded); if (sl) sl.status = 'active'; }
  if (fx.contenderSet) { const t = data.championships.find((x) => x.id === fx.contenderSet); if (t && t.contender && t.contender.matchId === seg.id) t.contender = fx.contenderPrev || null; }
  if (fx.contenderCleared) { const t = data.championships.find((x) => x.id === fx.contenderCleared.titleId); if (t && !t.contender) t.contender = fx.contenderCleared.prev; }
  if (fx.briefcase) data.briefcases = (data.briefcases || []).filter((b) => b.id !== fx.briefcase);
  if (fx.royalty) data.royalty = (data.royalty || []).filter((r) => r.id !== fx.royalty);
  if (fx.cashIn) {
    // take back the surprise cash-in match and give the briefcase back
    for (const ev of data.events) {
      const c = ev.card.find((x) => x.id === fx.cashIn.segId);
      if (c) { undoGmEffects(data, c); applyResult(data, ev, c, null); ev.card = ev.card.filter((x) => x.id !== c.id); }
    }
    if (!(data.briefcases || []).some((b) => b.id === fx.cashIn.briefcase.id)) (data.briefcases ||= []).push(fx.cashIn.briefcase);
  }
  delete seg.gmFx;
}

function worldTitleFor(data, superstarId) {
  const x = data.superstars.find((y) => y.id === superstarId);
  if (!x) return null;
  const div = x.gender === 'F' ? 'women' : 'men';
  const worlds = data.championships.filter((t) => !t.retired && t.kind !== 'tag' && (t.division === div || t.division === 'open') && titleTier(data, t) === 'world');
  return worlds.find((t) => t.brandId === x.brandId) || worlds.find((t) => !t.brandId) || worlds[0] || null;
}

function setContender(data, t, ids, seg, ev, fx, extra = {}) {
  fx.contenderSet = t.id;
  fx.contenderPrev = t.contender || null;
  t.contender = { ids: [...ids], teamId: null, matchId: seg.id, since: ev.date, ...extra };
}

// Chance that a briefcase holder cashes in right after a world title match.
function maybeCashIn(data, ev, seg, fx) {
  const r = seg.result;
  const t = data.championships.find((x) => x.id === seg.titleId);
  if (!t || t.kind === 'tag' || seg.cashIn || !decisive(r) || titleTier(data, t) !== 'world') return;
  const div = t.division === 'women' ? 'F' : t.division === 'men' ? 'M' : null;
  const inMatch = new Set(participants(seg));
  const week = Number(ev.week) || currentWeek(data);
  const cases = (data.briefcases || []).filter((b) => (!div || b.division === div) && !inMatch.has(b.holder)
    && data.superstars.some((x) => x.id === b.holder && (x.status || 'Active') === 'Active' && (!t.brandId || x.brandId === t.brandId)));
  for (const b of cases) {
    const held = Math.max(0, week - (Number(b.week) || week));
    let p = 0.12 + 0.07 * held + ((seg.type || 'Normal') !== 'Normal' ? 0.2 : 0);
    if (held >= 12) p = 1;
    if (Math.random() >= Math.min(p, 0.85)) continue;
    const champSide = seg.sides[Number(r.winnerSide)];
    const nm = (id) => (data.superstars.find((x) => x.id === id) || {}).name || '?';
    const c = {
      id: uid('m'), kind: 'match', format: 'singles', type: 'Normal', name: 'Money in the Bank Cash-In', titleId: t.id, stipulation: '',
      deadline: ev.deadline || null, sides: [{ ids: [...champSide.ids], teamId: null }, { ids: [b.holder], teamId: null }], result: null,
      gm: { kind: 'cashin', reason: `💼 ${nm(b.holder)} cashes in Money in the Bank on a worn-out ${champSide.ids.map(nm).join(' & ')} right after the match!`, stakes: 130 },
      cashIn: b.id,
    };
    const idx = ev.card.indexOf(seg);
    ev.card.splice(idx + 1, 0, c);
    data.briefcases = data.briefcases.filter((x) => x.id !== b.id);
    fx.cashIn = { segId: c.id, briefcase: b };
    return;
  }
}

function afterResult(data, ev, seg) {
  const r = seg.result;
  if (!r) return;
  const fx = {};
  const s = gmSettings(data);
  // #1 contender decided
  if (seg.contenderFor && decisive(r)) {
    const t = data.championships.find((x) => x.id === seg.contenderFor);
    const side = seg.sides[Number(r.winnerSide)];
    if (t && side) { setContender(data, t, side.ids, seg, ev, fx); t.contender.teamId = side.teamId || null; }
  }
  // big-event payoffs
  const sp = seg.special;
  if (sp && decisive(r)) {
    const winner = seg.sides[Number(r.winnerSide)].ids[0];
    const week = Number(ev.week) || currentWeek(data);
    if (sp.kind === 'rumble') {
      const t = worldTitleFor(data, winner);
      const fw = findPleWeek(data, week, /wrestlemania/i);
      if (t) setContender(data, t, [winner], seg, ev, fx, { reason: 'Royal Rumble winner', forWeek: fw, forPle: fw ? pleNameFor(data, fw) : '' });
    } else if (sp.kind === 'mitb') {
      const id = uid('case');
      (data.briefcases ||= []).push({ id, holder: winner, division: sp.division, since: ev.date, week, matchId: seg.id, season: data.league.season });
      fx.briefcase = id;
    } else if (sp.kind === 'kotr' && sp.round === 'final') {
      const id = uid('crown');
      (data.royalty ||= []).push({ id, holder: winner, division: sp.division, title: sp.division === 'F' ? 'Queen of the Ring' : 'King of the Ring', season: data.league.season, matchId: seg.id, date: ev.date });
      fx.royalty = id;
      const t = worldTitleFor(data, winner);
      const fw = findPleWeek(data, week, /summerslam/i);
      if (t) setContender(data, t, [winner], seg, ev, fx, { reason: sp.division === 'F' ? 'Queen of the Ring' : 'King of the Ring', forWeek: fw, forPle: fw ? pleNameFor(data, fw) : '' });
    }
  }
  // a briefcase holder might strike
  if (seg.titleId) maybeCashIn(data, ev, seg, fx);
  // contender used their shot
  if (seg.titleId) {
    const t = data.championships.find((x) => x.id === seg.titleId);
    if (t && t.contender && t.contender.matchId !== seg.id) {
      const cids = t.contender.ids || [];
      const inMatch = (cids.length && cids.every((id) => participants(seg).includes(id))) || (t.contender.teamId && seg.sides.some((sd) => sd.teamId === t.contender.teamId));
      if (inMatch) { fx.contenderCleared = { titleId: t.id, prev: t.contender }; t.contender = null; }
    }
  }
  if (s.autoStorylines) {
    const parts = participants(seg);
    const opposing = (sl) => seg.sides.map((sd) => sd.ids.filter((id) => sl.superstarIds.includes(id)).length).filter(Boolean).length >= 2;
    const active = data.storylines.filter((sl) => sl.status !== 'concluded' && opposing(sl));
    for (const sl of active) {
      sl.updates.push({ id: uid('upd'), date: ev.date || today(), text: resultSentence(data, ev, seg), matchId: seg.id });
      if (seg.gm && seg.gm.blowoff && seg.gm.storylineId === sl.id && decisive(r)) { sl.status = 'concluded'; fx.concluded = sl.id; }
    }
    // a messy finish starts a rivalry
    const fin = inconclusive(r);
    if (fin && !active.length && seg.sides.length === 2 && parts.length === 2 && !seg.titleId) {
      const [a, b] = parts.map((id) => data.superstars.find((x) => x.id === id)).filter(Boolean);
      if (a && b) {
        const id = uid('story');
        data.storylines.unshift({
          id, title: `${a.name} vs ${b.name}`, heat: 2, started: ev.date || today(), status: 'active',
          summary: `It started with ${FINISH_WORDS[fin]} at ${ev.name}. Neither of them is letting it go.`,
          superstarIds: [a.id, b.id], updates: [{ id: uid('upd'), date: ev.date || today(), text: resultSentence(data, ev, seg), matchId: seg.id }], createdBy: 'gm',
        });
        fx.createdStoryline = id;
      }
    }
  }
  if (Object.keys(fx).length) seg.gmFx = fx;
  return fx;
}

// Use this (not applyResult) to save or clear a result: it also keeps titles,
// #1 contenders and storylines in sync.
export function recordResult(data, ev, seg, result) {
  undoGmEffects(data, seg);
  const out = applyResult(data, ev, seg, result);
  const fx = result ? afterResult(data, ev, seg) || {} : {};
  const extra = {};
  if (fx.cashIn) extra.cashIn = ev.card.find((x) => x.id === fx.cashIn.segId) || null;
  if (fx.briefcase) extra.briefcase = true;
  if (fx.royalty) extra.royalty = true;
  if (seg.special && seg.special.kind === 'rumble' && fx.contenderSet) extra.rumbleWinner = true;
  return out || Object.keys(extra).length ? { ...(out || {}), ...extra } : null;
}

export function describePlan(plan) {
  return plan.shows.map((sh) => `${sh.name} (${sh.date})\n${sh.card.map((sg, i) => `  ${i + 1}. ${sg.kind === 'promo' ? `[Promo] ${sg.title}` : `${matchName(sg)}${sg.titleId ? ' [TITLE]' : ''}${sg.contenderFor ? ' [#1 CONTENDER]' : ''}`}${sg.gm && sg.gm.reason ? ` — ${sg.gm.reason}` : ''}`).join('\n')}`).join('\n\n');
}
