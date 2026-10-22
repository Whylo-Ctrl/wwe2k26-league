import { state, isAdmin, setMe, getMember, getSuperstar, getTitle, getBrand, sortedEvents } from './store.js';
import { currentReign, reignLength, powerRankings, pendingMatches, hasResult, matchName, formatRecord, formatStreak, today, participants } from './stats.js';
import { esc, safeUrl, avatar, holderText, matchupText, fmtDate, options, emptyState, brandChip, stars } from './ui.js';
import { remindersMessage, post } from './discord.js';
import { eventStatus } from './shows.js';
import { currentWeek, weekStatus, isPLEWeek, pleNameFor, gmSettings } from './gm.js';

function myMatches() {
  const me = getMember(state.me);
  if (!me) return '<p class="muted">Pick your name to see the matches you need to play, who you\'re facing, and their gamertag.</p>';
  const mine = new Set(state.data.superstars.filter((s) => s.memberId === me.id).map((s) => s.id));
  const list = pendingMatches(state.data).filter(({ seg }) => participants(seg).some((id) => mine.has(id)));
  if (!list.length) return '<p class="muted">No matches waiting on you right now. 🎉</p>';
  return `<div class="list">${list.map(({ ev, seg }) => {
    const opps = participants(seg).filter((id) => !mine.has(id)).map((id) => {
      const s = getSuperstar(id);
      const m = s && getMember(s.memberId);
      return m ? `<li><strong>${esc(s.name)}</strong> — ${esc(m.name)}${m.gamertag ? ` · <span class="mono">${esc(m.gamertag)}</span>` : ''}${m.platform ? ` <span class="chip chip-muted">${esc(m.platform)}</span>` : ''}</li>` : '';
    }).join('');
    const dl = seg.deadline || ev.deadline;
    const overdue = dl && dl < today();
    return `<div class="list-item">
      <div class="grow">
        <div class="eyebrow">${esc(ev.name)} · ${esc(matchName(seg))}${seg.titleId ? ` · 🏆 ${esc(getTitle(seg.titleId)?.name || '')}` : ''}</div>
        <div class="matchup">${matchupText(seg, { html: true })}</div>
        ${opps ? `<ul class="opp-list">${opps}</ul>` : ''}
        ${dl ? `<div class="${overdue ? 'text-bad' : 'muted'} small">⏰ ${overdue ? 'Overdue — was due' : 'Due'} ${esc(fmtDate(dl, { weekday: true }))}</div>` : ''}
      </div>
      <a class="btn btn-sm btn-primary" href="#/submit?match=${esc(seg.id)}">Submit result</a>
    </div>`;
  }).join('')}</div>`;
}

function gmCard() {
  const d = state.data;
  if (d.superstars.length < 4) return '';
  const cur = currentWeek(d);
  const st = cur ? weekStatus(d, cur) : null;
  const next = cur + 1;
  const ple = isPLEWeek(d, next);
  let msg, btn;
  if (!cur) { msg = 'Your GM is ready to book Week 1.'; btn = 'Book Week 1'; }
  else if (st.complete) { msg = `All Week ${cur} results are in. Time to book Week ${next}${ple ? ` (${esc(pleNameFor(d, next))})` : ''}.`; btn = `Book Week ${next}`; }
  else { msg = `Week ${cur}: ${st.done}/${st.total} results in.`; btn = 'Enter results'; }
  return `<section class="card gm-home">
    <div class="row between wrap gap"><div><div class="eyebrow">General Manager${gmSettings(d).autopilot ? ' · 🤖 Autopilot' : ''}</div><div class="gm-home-msg">${msg}</div></div>
    <a class="btn btn-primary" href="#/gm">${btn}</a></div>
  </section>`;
}

function setupChecklist() {
  const d = state.data;
  const steps = [
    { done: d.league.name !== 'My WWE 2K26 League', label: 'Name your league', href: '#/settings?tab=league' },
    { done: d.members.length > 0, label: 'Add your Discord members', href: '#/roster?tab=members' },
    { done: d.superstars.length > 0, label: 'Add superstars and assign them to members', href: '#/roster' },
    { done: d.championships.length > 0, label: 'Add championships', href: '#/titles' },
    { done: d.events.length > 0, label: 'Book your first show', href: '#/shows' },
    { done: (state.admin.webhooks || []).length > 0, label: 'Connect Discord channels (webhooks)', href: '#/settings?tab=discord' },
    { done: !!(state.admin.token && state.admin.repo), label: 'Set up publishing to GitHub', href: '#/settings?tab=github' },
  ];
  if (steps.every((s) => s.done)) return '';
  return `<section class="card">
    <h2>Get your league running</h2>
    <ol class="checklist">${steps.map((s) => `<li class="${s.done ? 'done' : ''}"><a href="${s.href}">${esc(s.label)}</a></li>`).join('')}</ol>
    <p class="muted small">Want to look around first? <a href="#/settings?tab=backup">Load the demo league</a> from Settings → Backup.</p>
  </section>`;
}

export default {
  render() {
    const d = state.data;
    const L = d.league;
    const events = sortedEvents(d);
    const upcoming = events.filter((ev) => eventStatus(ev) !== 'completed');
    const next = upcoming.find((ev) => (ev.date || '') >= today()) || upcoming[upcoming.length - 1];
    const lastDone = [...events].reverse().find((ev) => ev.card.some((s) => s.kind === 'match' && hasResult(s)));
    const pr = powerRankings(d, { season: L.season, limit: 5 });
    const titles = d.championships.filter((t) => !t.retired);
    const stories = d.storylines.filter((s) => s.status !== 'concluded').slice(0, 3);
    const invite = safeUrl(L.discordInvite);

    return `
    <section class="hero">
      <div>
        <div class="eyebrow">WWE 2K26 League · Season ${esc(L.season)}</div>
        <h1 class="hero-title">${esc(L.name)}</h1>
        ${L.tagline ? `<p class="hero-sub">${esc(L.tagline)}</p>` : ''}
      </div>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/submit">Submit a result</a>
        ${invite ? `<a class="btn btn-discord" href="${esc(invite)}" target="_blank" rel="noopener">Join Discord</a>` : ''}
      </div>
    </section>

    ${isAdmin() ? setupChecklist() : ''}
    ${isAdmin() ? gmCard() : ''}

    ${titles.length ? `<section>
      <div class="section-head"><h2>Champions</h2><a href="#/titles">All titles →</a></div>
      <div class="champ-strip">${titles.map((t) => {
        const r = currentReign(d, t.id);
        const s = r && getSuperstar(r.holders[0]);
        return `<a class="champ-card" href="#/title/${esc(t.id)}" style="--c:${esc(getBrand(t.brandId)?.color || '#f5c542')}">
          <div class="champ-title">${esc(t.name)}</div>
          <div class="champ-holder">${r ? `${avatar(s, 'sm')}<span>${holderText(r)}</span>` : '<span class="muted">Vacant</span>'}</div>
          ${r ? `<div class="muted small">${reignLength(r)} days</div>` : ''}
        </a>`;
      }).join('')}</div>
    </section>` : ''}

    <div class="grid-2">
      <section class="card">
        <div class="section-head"><h2>My matches</h2></div>
        ${d.members.length ? `<label class="field inline-field"><span class="field-label">I am</span>
          <select data-change="home-me">${options(d.members.map((m) => ({ value: m.id, label: m.name })), state.me, { empty: 'Pick your name…' })}</select></label>
          ${myMatches()}` : '<p class="muted">Once members are added, pick your name here to see the matches you need to play.</p>'}
      </section>

      <section class="card">
        <div class="section-head"><h2>Power rankings</h2><a href="#/standings">Standings →</a></div>
        ${pr.length ? `<ol class="rank-list">${pr.map((r, i) => `
          <li><span class="rank">${i + 1}</span>${avatar(r.s, 'sm')}<a href="#/superstar/${esc(r.s.id)}" class="grow">${esc(r.s.name)}${r.champ ? ' <span title="Champion">🏆</span>' : ''}</a>
          <span class="mono">${formatRecord(r.rec)}</span><span class="streak ${r.rec.streak > 0 ? 'up' : r.rec.streak < 0 ? 'down' : ''}">${formatStreak(r.rec.streak)}</span></li>`).join('')}</ol>`
          : '<p class="muted">Rankings appear after the first results come in.</p>'}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="section-head"><h2>${next ? 'Next up' : 'Shows'}</h2><a href="#/shows">All shows →</a></div>
        ${next ? `<a class="event-link" href="#/show/${esc(next.id)}">
            <div class="event-name">${esc(next.name)} ${next.type === 'ple' ? '<span class="chip chip-gold">PLE</span>' : ''} ${brandChip(next.brandId, 'All brands')}</div>
            <div class="muted small">${esc(fmtDate(next.date, { weekday: true }))}${next.deadline ? ` · matches due ${esc(fmtDate(next.deadline, { short: true }))}` : ''}</div>
          </a>
          <ul class="card-list">${next.card.filter((s) => s.kind === 'match').map((seg) => `<li><span class="eyebrow">${esc(matchName(seg))}${seg.titleId ? ` · 🏆 ${esc(getTitle(seg.titleId)?.name || '')}` : ''}</span><div>${matchupText(seg, { html: true })} ${hasResult(seg) ? '<span class="chip chip-good">Done</span>' : ''}</div></li>`).join('') || '<li class="muted">Card to be announced</li>'}</ul>
          ${isAdmin() ? '<button class="btn btn-sm btn-ghost" data-act="home-reminders">Post deadline reminders</button>' : ''}`
          : emptyState('No shows booked yet', isAdmin() ? 'Book a weekly show or a PLE to get things started.' : 'Check back soon.', isAdmin() ? '<a class="btn btn-primary" href="#/shows">Book a show</a>' : '')}
      </section>

      <section class="card">
        <div class="section-head"><h2>Latest results</h2>${lastDone ? `<a href="#/show/${esc(lastDone.id)}">${esc(lastDone.name)} →</a>` : ''}</div>
        ${lastDone ? `<ul class="card-list">${lastDone.card.filter((s) => s.kind === 'match' && hasResult(s)).map((seg) => {
          const r = seg.result;
          let line;
          if (r.nc) line = `No contest: ${matchupText(seg, { html: true })}`;
          else if (r.draw) line = `Draw: ${matchupText(seg, { html: true })}`;
          else {
            const w = Number(r.winnerSide);
            line = `<strong>${holderText({ holders: seg.sides[w].ids, teamId: seg.sides[w].teamId }, { html: true })}</strong> def. ${seg.sides.filter((s, i) => i !== w && s.ids.length).map((s) => holderText({ holders: s.ids, teamId: s.teamId }, { html: true })).join(', ')}`;
          }
          return `<li><span class="eyebrow">${esc(matchName(seg))}${r.titleChange ? ' · <span class="text-gold">👑 NEW CHAMPION</span>' : ''}</span><div>${line}</div><div class="muted small">${esc(r.method || '')} ${r.rating ? `<span class="text-gold">${stars(r.rating)}</span>` : ''}</div></li>`;
        }).join('')}</ul>` : '<p class="muted">No results yet.</p>'}
      </section>
    </div>

    ${stories.length ? `<section>
      <div class="section-head"><h2>Storylines</h2><a href="#/storylines">All storylines →</a></div>
      <div class="grid-3">${stories.map((s) => `<a class="card story-mini" href="#/storylines">
        <div class="heat">${'🔥'.repeat(Number(s.heat) || 1)}</div>
        <h3>${esc(s.title)}</h3>
        <div class="avatar-row">${(s.superstarIds || []).map((id) => avatar(getSuperstar(id), 'sm')).join('')}</div>
        <p class="muted small clamp">${esc((s.updates[s.updates.length - 1] || {}).text || s.summary || '')}</p>
      </a>`).join('')}</div>
    </section>` : ''}

    ${L.rules ? `<section class="card"><details><summary><h2 class="inline">League rules</h2></summary><div class="prose">${esc(L.rules).replace(/\n/g, '<br>')}</div></details></section>` : ''}
    `;
  },
  onChange: {
    'home-me': (el) => setMe(el.value),
  },
  actions: {
    'home-reminders': () => post(remindersMessage()),
  },
};
