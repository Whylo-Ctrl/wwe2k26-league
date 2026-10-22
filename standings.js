import { state, isAdmin, refresh, getBrand, getTitle } from './store.js';
import { standings, powerRankings, memberStandings, leaderboards, formatRecord, formatStreak, winPct, matchName } from './stats.js';
import { esc, avatar, brandChip, options, pageHead, emptyState, stars, sideText } from './ui.js';
import { post, standingsMessage, powerRankingsMessage, savePowerRankingsSnapshot } from './discord.js';

const ui = { season: null, brand: '', gender: '' };

function formDots(form, n = 5) {
  return `<span class="form-dots">${form.slice(-n).map((r) => `<i class="dot dot-${r.toLowerCase()}" title="${r}"></i>`).join('')}</span>`;
}

function board(title, rows, valueFn) {
  return `<div class="card board"><h3>${esc(title)}</h3>${rows.length ? `<ol>${rows.map((r) => `<li>${avatar(r.s, 'sm')}<a href="#/superstar/${esc(r.s.id)}" class="grow">${esc(r.s.name)}</a><span class="mono">${valueFn(r)}</span></li>`).join('')}</ol>` : '<p class="muted small">Not enough matches yet.</p>'}</div>`;
}

export default {
  render() {
    const d = state.data;
    if (ui.season === null) ui.season = d.league.season;
    const seasons = [...new Set([d.league.season, ...d.events.map((e) => Number(e.season))])].filter(Boolean).sort((a, b) => b - a);
    const season = ui.season === 'all' ? null : ui.season;
    const rows = standings(d, { season, brandId: ui.brand || null, gender: ui.gender || null });
    const pr = powerRankings(d, { season: season || d.league.season, limit: 10 });
    const prev = (d.prHistory && d.prHistory.ids) || [];
    const members = memberStandings(d, { season }).filter((r) => r.rec.matches);
    const lb = leaderboards(d, { season });
    const actions = isAdmin() ? `<a class="btn btn-ghost" href="#/awards">🏆 Awards</a><button class="btn btn-ghost" data-act="st-post-standings">Post standings</button><button class="btn btn-primary" data-act="st-post-pr">Post power rankings</button>` : '';

    return `
      ${pageHead('Standings', `${season ? `Season ${esc(season)}` : 'All-time'} · ${esc(d.settings.points.win)} pts for a win, ${esc(d.settings.points.draw)} for a draw`, actions)}
      <div class="filters">
        <select data-change="st-f" data-f="season">${options([...seasons.map((s) => ({ value: s, label: `Season ${s}` })), { value: 'all', label: 'All-time' }], ui.season)}</select>
        <select data-change="st-f" data-f="brand">${options(d.brands.map((b) => ({ value: b.id, label: b.name })), ui.brand, { empty: 'All brands' })}</select>
        <select data-change="st-f" data-f="gender">${options([{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }], ui.gender, { empty: 'All divisions' })}</select>
      </div>

      <div class="grid-2 align-start">
        <section class="card">
          <div class="section-head"><h2>⚡ Power rankings</h2></div>
          ${pr.length ? `<ol class="rank-list big">${pr.map((r, i) => {
            const was = prev.indexOf(r.s.id);
            const move = !prev.length ? '' : was === -1 ? '<span class="move new">NEW</span>' : was > i ? `<span class="move up">▲${was - i}</span>` : was < i ? `<span class="move down">▼${i - was}</span>` : '<span class="move">–</span>';
            return `<li><span class="rank">${i + 1}</span>${avatar(r.s, 'sm')}<div class="grow"><a href="#/superstar/${esc(r.s.id)}">${esc(r.s.name)}</a>${r.champ ? ' 🏆' : ''}<div class="muted tiny">${formatRecord(r.rec)} · ${formatStreak(r.rec.streak)} ${formDots(r.rec.form)}</div></div>${move}<span class="score">${r.score}</span></li>`;
          }).join('')}</ol>
          <p class="muted tiny">Score = points + 2 × recent form (last ${esc(d.settings.formMatches)} matches) + ${esc(d.settings.champBonus)} if champion + current win streak.${prev.length ? ` Arrows compare to the rankings posted ${esc(d.prHistory.date)}.` : ''}</p>`
          : '<p class="muted">Rankings appear once matches have results.</p>'}
        </section>

        <section class="card">
          <h2>Members</h2>
          ${members.length ? `<div class="table-wrap"><table class="table compact">
            <thead><tr><th>#</th><th>Member</th><th class="num">W-L-D</th><th class="num">Pts</th></tr></thead>
            <tbody>${members.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.m.name)}</td><td class="num mono">${r.rec.w}-${r.rec.l}-${r.rec.d}</td><td class="num"><strong>${r.pts}</strong></td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="muted">Member totals add up every superstar a member plays.</p>'}
        </section>
      </div>

      <section class="card">
        <h2>Superstar standings</h2>
        ${rows.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th class="num">#</th><th>Superstar</th><th class="hide-sm">Brand</th><th class="num">W</th><th class="num">L</th><th class="num">D</th><th class="num">Win %</th><th class="num">Pts</th><th class="num hide-sm">Streak</th><th class="hide-sm">Form</th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td><a class="person" href="#/superstar/${esc(r.s.id)}">${avatar(r.s, 'xs')}<span>${esc(r.s.name)}</span></a></td>
            <td class="hide-sm">${brandChip(r.s.brandId)}</td>
            <td class="num">${r.rec.w}</td><td class="num">${r.rec.l}</td><td class="num">${r.rec.d}</td>
            <td class="num">${r.rec.w + r.rec.l + r.rec.d ? `${Math.round(r.pct * 100)}%` : '—'}</td>
            <td class="num"><strong>${r.pts}</strong></td>
            <td class="num hide-sm"><span class="streak ${r.rec.streak > 0 ? 'up' : r.rec.streak < 0 ? 'down' : ''}">${formatStreak(r.rec.streak)}</span></td>
            <td class="hide-sm">${formDots(r.rec.form)}</td>
          </tr>`).join('')}</tbody></table></div>` : emptyState('No standings yet', 'Standings fill in as results are recorded.')}
      </section>

      <h2 class="list-title">Leaderboards</h2>
      <div class="grid-3">
        ${board('Most wins', lb.byWins, (r) => r.rec.w)}
        ${board('Best win %', lb.byPct, (r) => `${Math.round(winPct(r.rec) * 100)}%`)}
        ${board('Longest win streak', lb.byStreak, (r) => r.rec.bestStreak)}
        ${board('Best avg. match rating', lb.byRating, (r) => (r.rec.ratingSum / r.rec.rated).toFixed(2))}
        ${board('Most title reigns (all-time)', lb.byReigns, (r) => `${r.n} · ${r.days}d`)}
        <div class="card board"><h3>Highest-rated matches</h3>${lb.topMatches.length ? `<ol>${lb.topMatches.map(({ ev, seg }) => `<li><div class="grow"><a href="#/show/${esc(ev.id)}">${esc(seg.sides.filter((s) => s.ids.length).map((s) => sideText(s)).join(' vs '))}</a><div class="muted tiny">${esc(matchName(seg))} · ${esc(ev.name)}</div></div><span class="text-gold">${stars(seg.result.rating)}</span></li>`).join('')}</ol>` : '<p class="muted small">Rate matches when entering results.</p>'}</div>
      </div>`;
  },
  onChange: {
    'st-f': (el) => { const k = el.dataset.f; ui[k] = k === 'season' && el.value !== 'all' ? Number(el.value) : el.value; refresh(); },
  },
  actions: {
    'st-post-standings': () => post(standingsMessage({ season: ui.season === 'all' ? null : ui.season, brandId: ui.brand || null })),
    'st-post-pr': () => post(powerRankingsMessage(() => savePowerRankingsSnapshot())),
  },
};
