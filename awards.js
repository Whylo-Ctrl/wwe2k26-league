// End-of-season awards and the Hall of Fame.

import { state, commit, refresh, uid, getSuperstar } from './store.js';
import { records, recordOf, powerRankings, completedMatches, winPct, memberStandings, matchName, formatRecord, reignLength } from './stats.js';
import { esc, avatar, stars, fmtDate, field, textarea, formModal, confirmDialog, toast, pageHead, emptyState, sideText, superstarOptions } from './ui.js';
import { post, awardsMessage } from './discord.js';

const ui = { season: null };

function decisive(r) { return r && !r.draw && !r.nc && r.winnerSide !== null && r.winnerSide !== undefined; }

// Work out every award for a season from the results.
export function computeAwards(data, season) {
  const out = [];
  const nm = (id) => (data.superstars.find((x) => x.id === id) || {}).name || 'Unknown';
  const matches = completedMatches(data, { season });
  const pr = powerRankings(data, { season, limit: 9999 }).filter((r) => r.rec.matches > 0);
  const recs = records(data, { season });

  const top = pr[0];
  if (top) out.push({ key: 'sotY', icon: '🏆', title: 'Superstar of the Year', ids: [top.s.id], label: top.s.name, detail: `${formatRecord(top.rec)} record · ${top.score} power points${top.champ ? ' · champion' : ''}` });
  const topW = pr.find((r) => r.s.gender === 'F');
  if (topW) out.push({ key: 'wotY', icon: '👑', title: "Women's Superstar of the Year", ids: [topW.s.id], label: topW.s.name, detail: `${formatRecord(topW.rec)} record · ${topW.score} power points` });

  const rated = matches.filter((m) => Number(m.seg.result.rating) > 0)
    .sort((a, b) => Number(b.seg.result.rating) - Number(a.seg.result.rating) || (b.ev.type === 'ple') - (a.ev.type === 'ple') || (!!b.seg.titleId) - (!!a.seg.titleId));
  if (rated[0]) {
    const m = rated[0];
    out.push({ key: 'motY', icon: '⭐', title: 'Match of the Year', ids: m.seg.sides.flatMap((s) => s.ids).slice(0, 4), label: m.seg.sides.filter((s) => s.ids.length).map((s) => sideText(s)).slice(0, 4).join(' vs '), detail: `${matchName(m.seg)} at ${m.ev.name} · ${stars(m.seg.result.rating)}` });
  }

  const feuds = data.storylines.map((sl) => {
    const set = new Set(sl.superstarIds);
    const n = matches.filter((m) => m.seg.sides.map((sd) => sd.ids.filter((id) => set.has(id)).length).filter(Boolean).length >= 2).length;
    const k = Math.max(2, sl.superstarIds.length);
    return { sl, n, score: n / ((k * (k - 1)) / 2) };
  }).filter((f) => f.n > 0).sort((a, b) => b.score - a.score || b.n - a.n || (b.sl.heat || 0) - (a.sl.heat || 0));
  if (feuds[0]) out.push({ key: 'feud', icon: '🔥', title: 'Feud of the Year', ids: feuds[0].sl.superstarIds.slice(0, 4), label: feuds[0].sl.title, detail: `${feuds[0].n} match${feuds[0].n === 1 ? '' : 'es'} between them this season` });

  const teams = data.teams.map((t) => {
    let w = 0, l = 0;
    for (const m of matches) {
      const i = m.seg.sides.findIndex((sd) => sd.teamId === t.id);
      if (i < 0 || !decisive(m.seg.result)) continue;
      if (Number(m.seg.result.winnerSide) === i) w++; else l++;
    }
    return { t, w, l };
  }).filter((x) => x.w > 0).sort((a, b) => b.w - a.w || a.l - b.l);
  if (teams[0]) out.push({ key: 'tag', icon: '🤝', title: 'Tag Team of the Year', ids: teams[0].t.superstarIds.slice(0, 2), label: teams[0].t.name, detail: `${teams[0].w}-${teams[0].l} as a team` });

  const ovr = (id) => Number((data.superstars.find((x) => x.id === id) || {}).overall) || 75;
  const upsets = matches.filter((m) => m.seg.sides.length === 2 && m.seg.sides.every((sd) => sd.ids.length === 1) && decisive(m.seg.result))
    .map((m) => {
      const w = Number(m.seg.result.winnerSide);
      const winner = m.seg.sides[w].ids[0], loser = m.seg.sides[1 - w].ids[0];
      return { m, winner, loser, gap: ovr(loser) - ovr(winner) };
    }).filter((u) => u.gap >= 3).sort((a, b) => b.gap - a.gap);
  if (upsets[0]) {
    const u = upsets[0];
    out.push({ key: 'upset', icon: '😱', title: 'Upset of the Year', ids: [u.winner, u.loser], label: `${nm(u.winner)} def. ${nm(u.loser)}`, detail: `${u.gap} overall points lower and still won · ${u.m.ev.name}` });
  }

  const reigns = data.reigns.map((r) => ({ r, n: matches.filter((m) => m.seg.result.retainedReignId === r.id).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n || reignLength(b.r) - reignLength(a.r));
  if (reigns[0]) {
    const x = reigns[0];
    const t = data.championships.find((c) => c.id === x.r.titleId);
    out.push({ key: 'reign', icon: '🥇', title: 'Title Reign of the Year', ids: x.r.holders, label: x.r.holders.map(nm).join(' & '), detail: `${t ? t.name : 'Title'} · ${x.n} successful defense${x.n === 1 ? '' : 's'} · ${reignLength(x.r)} days` });
  }

  const sorted = data.superstars.map((x) => Number(x.overall) || 75).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 75;
  const breakout = data.superstars.filter((x) => (Number(x.overall) || 75) <= median)
    .map((x) => ({ x, rec: recordOf(recs, x.id) }))
    .filter((y) => y.rec.w + y.rec.l + y.rec.d >= 3)
    .sort((a, b) => winPct(b.rec) - winPct(a.rec) || b.rec.w - a.rec.w);
  if (breakout[0] && winPct(breakout[0].rec) >= 0.5 && (!top || breakout[0].x.id !== top.s.id)) out.push({ key: 'breakout', icon: '🚀', title: 'Breakout Star', ids: [breakout[0].x.id], label: breakout[0].x.name, detail: `${formatRecord(breakout[0].rec)} (${Math.round(winPct(breakout[0].rec) * 100)}%) with a lower overall rating than most of the roster` });

  const mem = memberStandings(data, { season }).filter((r) => r.rec.matches > 0);
  if (mem[0]) out.push({ key: 'member', icon: '🎮', title: 'Player of the Year', ids: [], label: mem[0].m.name, detail: `${mem[0].rec.w}-${mem[0].rec.l}-${mem[0].rec.d} across all their superstars · ${mem[0].pts} points` });

  const crowns = (data.royalty || []).filter((r) => Number(r.season) === Number(season));
  for (const c of crowns) out.push({ key: `crown-${c.id}`, icon: '👑', title: c.title, ids: [c.holder], label: nm(c.holder), detail: 'Tournament winner' });
  return out;
}

export function endSeason() {
  const d = state.data;
  const season = Number(d.league.season);
  const list = computeAwards(d, season);
  commit((data) => {
    data.awards[season] = { list, savedAt: new Date().toISOString() };
    data.league.season = season + 1;
    data.prHistory = null;
  });
  ui.season = season;
  return { season, list };
}

function awardCard(a) {
  const people = (a.ids || []).map((id) => getSuperstar(id)).filter(Boolean);
  return `<article class="award">
    <div class="award-icon">${a.icon}</div>
    <div class="eyebrow">${esc(a.title)}</div>
    <div class="award-winner">${esc(a.label)}</div>
    ${people.length ? `<div class="avatar-row">${people.map((p) => avatar(p, 'sm')).join('')}</div>` : ''}
    <div class="muted small">${esc(a.detail)}</div>
  </article>`;
}

export default {
  render() {
    const d = state.data;
    const cur = Number(d.league.season);
    const past = Object.keys(d.awards || {}).map(Number).filter(Boolean).sort((a, b) => b - a);
    if (ui.season === null || (ui.season !== cur && !past.includes(ui.season))) ui.season = cur;
    const isLive = ui.season === cur;
    const list = isLive ? computeAwards(d, cur) : (d.awards[ui.season] || {}).list || [];
    const hof = (d.hallOfFame || []).slice().sort((a, b) => (b.season || 0) - (a.season || 0));
    return `
      ${pageHead('Awards', 'End-of-season awards and the Hall of Fame', `<button class="btn btn-ghost" data-act="aw-post">Post to Discord</button>${isLive ? `<button class="btn btn-primary" data-act="aw-end">🏁 End Season ${cur}</button>` : ''}`)}
      <div class="tabs" role="tablist">
        <button class="tab${isLive ? ' active' : ''}" role="tab" data-act="aw-season" data-season="${cur}">Season ${cur} (so far)</button>
        ${past.filter((p) => p !== cur).map((p) => `<button class="tab${ui.season === p ? ' active' : ''}" role="tab" data-act="aw-season" data-season="${p}">Season ${p}</button>`).join('')}
      </div>
      ${isLive ? '<p class="muted small">These update as results come in. When the season is over, tap <strong>End Season</strong> to lock them in, post them, and start the next season.</p>' : `<p class="muted small">Final awards for Season ${esc(ui.season)}.</p>`}
      ${list.length ? `<div class="award-grid">${list.map(awardCard).join('')}</div>` : emptyState('No awards yet', 'Awards appear once matches have results.')}

      <section class="card hof">
        <div class="section-head"><h2>🏛️ Hall of Fame</h2><button class="btn btn-sm btn-primary" data-act="aw-induct">+ Induct a legend</button></div>
        ${hof.length ? `<div class="hof-grid">${hof.map((h) => {
          const s = getSuperstar(h.superstarId);
          return `<div class="hof-item">${avatar(s, 'lg')}<div class="grow"><div class="hof-name">${esc(s ? s.name : h.name || 'Legend')}</div><div class="muted small">Inducted Season ${esc(h.season)}</div>${h.note ? `<p class="small">${esc(h.note)}</p>` : ''}</div><button class="icon-btn" title="Remove" data-act="aw-uninduct" data-id="${esc(h.id)}">✕</button></div>`;
        }).join('')}</div>` : '<p class="muted">Nobody yet. Induct the legends of your league here.</p>'}
      </section>`;
  },
  actions: {
    'aw-season': (el) => { ui.season = Number(el.dataset.season); refresh(); },
    'aw-post': () => {
      const d = state.data;
      const list = ui.season === Number(d.league.season) ? computeAwards(d, ui.season) : (d.awards[ui.season] || {}).list || [];
      post(awardsMessage(ui.season, list, ui.season === Number(d.league.season)));
    },
    'aw-end': async () => {
      const d = state.data;
      const cur = Number(d.league.season);
      if (!(await confirmDialog(`End <strong>Season ${cur}</strong>? The awards get locked in, standings and power rankings reset for Season ${cur + 1}, and champions keep their titles.`, { okLabel: `End Season ${cur}` }))) return;
      const { season, list } = endSeason();
      toast(`Season ${season} is in the books! Welcome to Season ${season + 1}.`, 'ok', 5000);
      setTimeout(() => post(awardsMessage(season, list, false)), 60);
    },
    'aw-induct': () => {
      formModal({
        title: 'Induct into the Hall of Fame',
        html: `${field('Superstar', `<select name="superstarId">${superstarOptions('', { empty: 'Choose…' })}</select>`)}
          ${field('Why they belong (optional)', textarea('note', '', 'rows="3" placeholder="e.g. 3-time world champion, never lost at a PLE"'))}`,
        submitLabel: 'Induct',
        onSubmit(v) {
          if (!v.superstarId) { toast('Choose a superstar', 'error'); return false; }
          if ((state.data.hallOfFame || []).some((h) => h.superstarId === v.superstarId)) { toast('Already in the Hall of Fame', 'error'); return false; }
          const s = getSuperstar(v.superstarId);
          commit((d) => d.hallOfFame.push({ id: uid('hof'), superstarId: v.superstarId, name: s ? s.name : '', season: d.league.season, note: v.note, date: fmtDate(new Date().toISOString().slice(0, 10)) }));
          toast(`🏛️ ${s ? s.name : 'They'} joins the Hall of Fame!`);
        },
      });
    },
    'aw-uninduct': async (el) => {
      if (!(await confirmDialog('Remove this Hall of Famer?', { okLabel: 'Remove', danger: true }))) return;
      commit((d) => { d.hallOfFame = d.hallOfFame.filter((h) => h.id !== el.dataset.id); });
    },
  },
};
