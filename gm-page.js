// The GM page: enter this week's results, then let the GM book next week.

import { state, isAdmin, commit, refresh, hooks, runHooks, getSuperstar, getMember, getTitle, getBrand, getTeam, WIN_METHODS } from './store.js';
import { hasResult, matchName, currentReign, participants, today } from './stats.js';
import {
  gmSettings, GM_DEFAULTS, PLE_NAMES, DAY_NAMES, currentWeek, weekEvents, weekStatus, isPLEWeek, pleNameFor, nextPLEWeek,
  planWeek, addMatchToPlan, bookPlan, recordResult, titleTier, showDay, simulateMatch,
} from './gm.js';
import { announceOutcome, simSegment } from './shows.js';
import { esc, avatar, brandChip, fmtDate, stars, options, field, input, textarea, formModal, confirmDialog, toast, pageHead, emptyState, sideText, superstarOptions, formValues } from './ui.js';
import { post, cardMessage, titleChangeMessage, resultsMessage, sendWebhook, defaultWebhookFor } from './discord.js';

const ui = { plan: null, showSettings: false };

// ---------- helpers ----------
function sideLine(side) {
  if (!side.ids.length) return '<span class="muted">TBD</span>';
  const team = getTeam(side.teamId);
  const ppl = side.ids.map((id) => {
    const s = getSuperstar(id);
    const m = s && getMember(s.memberId);
    return `<span class="gm-person">${avatar(s, 'xs')}<span>${esc(s ? s.name : '?')}${m ? ` <span class="muted tiny">${esc(m.name)}</span>` : ' <span class="muted tiny">CPU</span>'}</span></span>`;
  }).join('');
  return `${team ? `<span class="team-name">${esc(team.name)}</span>` : ''}${ppl}`;
}

function segPreview(seg, i, showIdx, removable) {
  const rm = removable ? `<button class="icon-btn" title="Remove" data-act="gm-remove" data-show="${showIdx}" data-i="${i}">✕</button>` : '';
  if (seg.kind === 'promo') {
    return `<li class="gm-seg gm-seg-promo"><div class="gm-seg-head"><span class="seg-num">${i + 1}</span><div class="grow"><div class="seg-title">🎤 ${esc(seg.title)}</div><div class="gm-reason">${esc(seg.text)}</div></div>${rm}</div></li>`;
  }
  const t = getTitle(seg.titleId);
  return `<li class="gm-seg${t ? ' gm-seg-title' : ''}">
    <div class="gm-seg-head"><span class="seg-num">${i + 1}</span>
      <div class="grow">
        <div class="seg-title">${esc(matchName(seg))}</div>
        <div class="chips">${t ? `<span class="chip chip-gold">🏆 ${esc(t.name)}</span>` : ''}${seg.contenderFor ? '<span class="chip chip-upcoming">#1 Contender</span>' : ''}${seg.gm && seg.gm.blowoff ? '<span class="chip chip-bad">Feud finale</span>' : ''}</div>
      </div>${rm}</div>
    <div class="gm-sides">${seg.sides.filter((s) => s.ids.length).map((s) => `<div class="gm-side">${sideLine(s)}</div>`).join('<span class="vs">VS</span>')}</div>
    ${seg.gm && seg.gm.reason ? `<div class="gm-reason">${esc(seg.gm.reason)}</div>` : ''}
  </li>`;
}

async function postCardsDirect(eventIds) {
  const hook = defaultWebhookFor('cards');
  const evs = eventIds.map((id) => state.data.events.find((e) => e.id === id)).filter(Boolean);
  if (!hook) { if (evs[0]) post(cardMessage(evs[0])); return false; }
  for (const ev of evs) {
    for (const p of cardMessage(ev).build({ ping: state.admin.pingMembers !== false }).payloads) await sendWebhook(hook.url, p);
  }
  toast(`Posted ${evs.length} card${evs.length === 1 ? '' : 's'} to #${hook.name}`);
  return true;
}

function approvePlan(plan, { postToDiscord }) {
  const ids = commit((d) => bookPlan(d, plan));
  ui.plan = null;
  toast(`Week ${plan.week} is booked!`);
  if (postToDiscord) postCardsDirect(ids).catch((e) => toast(`Booked, but posting failed: ${e.message}`, 'error', 7000));
  return ids;
}

// Autopilot: once every result for the week is in, book and post the next week.
let autopilotBusy = false;
async function afterResults() {
  if (!isAdmin() || autopilotBusy) return;
  const d = state.data;
  const cur = currentWeek(d);
  if (!cur) return;
  const st = weekStatus(d, cur);
  if (!st.complete) return;
  const s = gmSettings(d);
  if (!s.autopilot) {
    toast(`All Week ${cur} results are in! Open the GM page to book Week ${cur + 1}.`, 'ok', 6000);
    return;
  }
  autopilotBusy = true;
  try {
    const plan = planWeek(d, { week: cur + 1 });
    if (!plan.shows.length) { toast('Autopilot could not book next week — check the GM page.', 'error', 6000); return; }
    const ids = commit((data) => bookPlan(data, plan));
    toast(`🤖 Autopilot booked Week ${plan.week}`, 'ok', 5000);
    if ((state.admin.webhooks || []).length) await postCardsDirect(ids).catch((e) => toast(`Posting failed: ${e.message}`, 'error', 7000));
  } finally { autopilotBusy = false; }
}
hooks.afterResults.add(afterResults);

function cpuOnly(seg) {
  return seg.sides.every((sd) => sd.ids.every((id) => { const x = getSuperstar(id); return !(x && x.memberId && getMember(x.memberId)); }));
}

// Sim a batch of pending matches in one go.
function simMany(list, label) {
  if (!list.length) { toast('Nothing to sim', 'error'); return 0; }
  const outs = [];
  commit((d) => {
    for (const { ev, seg } of list) {
      const res = simulateMatch(d, ev, seg);
      if (res) outs.push({ ev, seg, out: recordResult(d, ev, seg, res) });
    }
  });
  toast(`🎲 Simmed ${outs.length} ${label}`);
  for (const o of outs) announceOutcome(o.ev, o.seg, o.out, { quiet: true });
  runHooks('afterResults');
  return outs.length;
}

// Optional: sim anything nobody played by its deadline, whenever the app opens.
hooks.afterLoad.add(() => {
  const d = state.data;
  if (!gmSettings(d).autoSimOverdue) return;
  const overdue = [];
  for (const ev of d.events) for (const seg of ev.card) {
    const dl = seg.deadline || ev.deadline;
    if (seg.kind === 'match' && !hasResult(seg) && dl && dl < today() && seg.sides.filter((x) => x.ids.length).length >= 2) overdue.push({ ev, seg });
  }
  if (overdue.length) simMany(overdue, `overdue match${overdue.length === 1 ? '' : 'es'} (past their deadline)`);
});

// ---------- sections ----------
function thisWeekSection(cur) {
  const d = state.data;
  if (!cur) {
    return `<section class="card"><h2>Welcome, GM</h2>
      <p>Give the GM a roster and championships, then let it book. Each week it will:</p>
      <ul class="gm-list">
        <li>defend secondary and tag titles on TV, and save world titles for the PLE every ${esc(gmSettings(d).pleEvery)} weeks</li>
        <li>book <strong>#1 contender's matches</strong> the week before a PLE, and give the winners their title shot</li>
        <li>keep <strong>feuds</strong> going with stipulations that escalate, and book rematches after DQs, count-outs and draws</li>
        <li>make sure <strong>every member gets a match</strong> each week, against opponents near their level</li>
      </ul>
      ${d.superstars.length < 4 ? '<p class="text-warn">Add at least a few superstars (and assign them to members) on the Roster page first.</p>' : ''}
    </section>`;
  }
  const st = weekStatus(d, cur);
  const evs = weekEvents(d, cur);
  const ratings = [];
  for (let x = 0.5; x <= 5; x += 0.5) ratings.push({ value: String(x), label: `${stars(x)}` });
  return `<section class="card">
    <div class="section-head"><h2>Week ${cur} results</h2><span class="chip ${st.complete ? 'chip-good' : 'chip-in-progress'}">${st.done}/${st.total} in</span></div>
    <div class="chips">${evs.map((ev) => `<a class="chip" href="#/show/${esc(ev.id)}" style="--c:${esc(getBrand(ev.brandId)?.color || '#f5c542')}">${esc(ev.name)}</a>`).join('')}</div>
    ${st.pending.length ? `<form id="gm-results" class="form">
      <p class="muted small">Tap the winner of each match you have a result for. Leave the rest blank, or let the app sim them.</p>
      <div class="row gap wrap">
        ${st.pending.filter(({ seg }) => cpuOnly(seg)).length ? `<button type="button" class="btn btn-sm btn-ghost" data-act="gm-sim-cpu">🎲 Sim CPU-only matches (${st.pending.filter(({ seg }) => cpuOnly(seg)).length})</button>` : ''}
        <button type="button" class="btn btn-sm btn-ghost" data-act="gm-sim-all">🎲 Sim all ${st.pending.length} remaining</button>
      </div>
      ${st.pending.map(({ ev, seg }) => `
        <div class="qr-row">
          <div class="eyebrow">${esc(ev.name)} · ${esc(matchName(seg))}${seg.titleId ? ` · 🏆 ${esc(getTitle(seg.titleId)?.name || '')}` : ''}</div>
          <div class="qr-sides">
            ${seg.sides.map((sd, i) => (sd.ids.length ? `<label class="qr-pick"><input type="radio" name="w_${esc(seg.id)}" value="${i}"><span>${esc(sideText(sd))}</span></label>` : '')).join('')}
            <label class="qr-pick small"><input type="radio" name="w_${esc(seg.id)}" value="draw"><span>Draw</span></label>
            <label class="qr-pick small"><input type="radio" name="w_${esc(seg.id)}" value="nc"><span>No contest</span></label>
          </div>
          <div class="row gap wrap">
            <select name="m_${esc(seg.id)}" aria-label="Method">${options(WIN_METHODS, 'Pinfall')}</select>
            <select name="r_${esc(seg.id)}" aria-label="Rating">${options(ratings, '', { empty: 'Rating' })}</select>
            <button type="button" class="btn btn-sm btn-ghost" data-act="gm-sim-one" data-seg="${esc(seg.id)}" title="Let the app decide">🎲 Sim</button>
          </div>
        </div>`).join('')}
      <button class="btn btn-primary" type="submit">Save results</button>
    </form>` : `<p class="text-good">✅ Every Week ${cur} result is in.</p>
      <div class="row gap wrap">${evs.map((ev) => `<button class="btn btn-sm btn-ghost" data-act="gm-post-results" data-ev="${esc(ev.id)}">Post ${esc(ev.name)} results</button>`).join('')}</div>`}
  </section>`;
}

function nextWeekSection(cur) {
  const d = state.data;
  const next = cur + 1;
  const st = cur ? weekStatus(d, cur) : { complete: true, pending: [] };
  const ple = isPLEWeek(d, next);
  const head = `<div class="section-head"><h2>Week ${next}${ple ? ` · ${esc(pleNameFor(d, next))}` : ''}</h2>${ple ? '<span class="chip chip-gold">Premium Live Event</span>' : ''}</div>`;
  if (!ui.plan) {
    const nextPle = nextPLEWeek(d, next);
    return `<section class="card gm-next">
      ${head}
      ${st.complete
        ? `<p>${cur ? 'All results are in.' : 'Ready when you are.'} The GM will book ${ple ? `<strong>${esc(pleNameFor(d, next))}</strong> with every title on the line` : `next week's shows`}.${!ple && nextPle && nextPle === next + 1 ? ` The PLE is next week, so expect <strong>#1 contender's matches</strong>.` : ''}</p>
           <button class="btn btn-primary btn-lg" data-act="gm-plan">🎲 Book Week ${next}</button>`
        : `<p class="muted">Waiting on ${st.pending.length} result${st.pending.length === 1 ? '' : 's'} from Week ${cur}. The GM books better once it knows who won.</p>
           <button class="btn btn-ghost" data-act="gm-plan">Book Week ${next} anyway</button>`}
    </section>`;
  }
  const plan = ui.plan;
  const hasHooks = (state.admin.webhooks || []).length > 0;
  return `<section class="card gm-next">
    ${head}
    <p class="muted small">Here's what your GM booked. Remove anything you don't like, add a match, or shuffle for a different card. Nothing is saved until you approve.</p>
    ${plan.notes.length ? `<div class="notice small">${plan.notes.map(esc).join('<br>')}</div>` : ''}
    ${plan.shows.map((sh, si) => `
      <div class="gm-show" style="--c:${esc(getBrand(sh.brandId)?.color || '#f5c542')}">
        <div class="row between wrap gap">
          <div><h3>${esc(sh.name)}</h3><div class="muted small">${esc(fmtDate(sh.date, { weekday: true }))} · matches due ${esc(fmtDate(sh.deadline, { short: true }))}</div></div>
          ${sh.type === 'ple' ? '<span class="chip chip-gold">PLE</span>' : brandChip(sh.brandId)}
        </div>
        <ol class="gm-card">${sh.card.map((sg, i) => segPreview(sg, i, si, true)).join('')}</ol>
        <button class="btn btn-sm btn-ghost" data-act="gm-add" data-show="${si}">+ Add a match</button>
      </div>`).join('')}
    <div class="row gap wrap gm-approve">
      <button class="btn btn-ghost" data-act="gm-plan">🔀 Shuffle</button>
      <button class="btn btn-ghost" data-act="gm-discard">Discard</button>
      <span class="spacer"></span>
      <label class="check small"><input type="checkbox" id="gm-post" ${hasHooks ? 'checked' : ''}> Post the cards to Discord</label>
      <button class="btn btn-primary" data-act="gm-approve">✅ Approve & book</button>
    </div>
  </section>`;
}

function contendersSection() {
  const d = state.data;
  const titles = d.championships.filter((t) => !t.retired);
  if (!titles.length) return '';
  return `<section class="card">
    <h2>Title picture</h2>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Title</th><th>Champion</th><th>#1 contender</th><th class="hide-sm">Division</th><th></th></tr></thead>
      <tbody>${titles.map((t) => {
        const r = currentReign(d, t.id);
        const tier = titleTier(d, t);
        const c = t.contender;
        return `<tr>
          <td><strong>${esc(t.name)}</strong><div class="muted tiny">${tier === 'world' ? 'World title · PLEs' : tier === 'tag' ? 'Tag title · TV + PLEs' : 'Secondary · TV + PLEs'}</div></td>
          <td>${r ? esc(sideText({ ids: r.holders, teamId: r.teamId })) : '<span class="muted">Vacant</span>'}</td>
          <td>${c ? `${esc(sideText({ ids: c.ids || [], teamId: c.teamId }))}${c.reason ? `<div class="muted tiny">${esc(c.reason)}${c.forPle ? ` · at ${esc(c.forPle)}` : ''}</div>` : ''}` : '<span class="muted">—</span>'}</td>
          <td class="hide-sm muted small">${t.kind === 'tag' ? 'Tag' : t.division === 'women' ? "Women's" : t.division === 'open' ? 'Open' : "Men's"}</td>
          <td class="num"><button class="btn btn-sm btn-ghost" data-act="gm-contender" data-id="${esc(t.id)}">${c ? 'Change' : 'Set'}</button>${c ? `<button class="btn btn-sm btn-ghost" data-act="gm-contender-clear" data-id="${esc(t.id)}">Clear</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    ${(d.briefcases || []).length ? `<h3>💼 Money in the Bank</h3><ul class="card-list">${d.briefcases.map((b) => `<li><strong>${esc(getSuperstar(b.holder)?.name || '?')}</strong> <span class="muted small">holds the ${b.division === 'F' ? "women's" : "men's"} briefcase · ${Math.max(0, currentWeek(d) - (Number(b.week) || 0))} week(s) · can cash in on a world champion any time</span></li>`).join('')}</ul>` : ''}
    <p class="muted tiny">The first singles title of each brand and division counts as its world title (change this per title on the Titles page). Special PLEs: Royal Rumble (winner gets a WrestleMania title shot), Money in the Bank (briefcase), King & Queen of the Ring (tournament).</p>
  </section>`;
}

function settingsSection() {
  const d = state.data;
  const s = gmSettings(d);
  const chance = [{ value: '0', label: 'Never' }, { value: '0.15', label: 'Sometimes' }, { value: '0.3', label: 'Often' }];
  return `<section class="card">
    <details ${ui.showSettings ? 'open' : ''} data-gm-settings>
      <summary><h2 class="inline">GM settings</h2></summary>
      <form id="gm-settings" class="form" style="margin-top:12px">
        <label class="check autopilot"><input type="checkbox" name="autopilot" ${s.autopilot ? 'checked' : ''}> <span><strong>🤖 Autopilot.</strong> As soon as the last result of the week is saved, book next week and post the cards to Discord. No clicks needed.</span></label>
        <div class="grid-form">
          ${field('Matches per weekly show', input('matchesPerShow', s.matchesPerShow, 'type="number" min="1" max="12"'))}
          ${field('PLE every … weeks', input('pleEvery', s.pleEvery, 'type="number" min="0" max="12"'), '0 = no PLEs. On PLE weeks there are no weekly shows.')}
          ${field('Matches per PLE', input('pleMatches', s.pleMatches, 'type="number" min="1" max="15"'))}
          ${field('Secondary titles defended every … weeks', input('tvTitleEvery', s.tvTitleEvery, 'type="number" min="1" max="8"'))}
          ${field('Stipulation matches', `<select name="stipulationChance">${options(chance, String(s.stipulationChance))}</select>`)}
        </div>
        <label class="check"><input type="checkbox" name="autoSimOverdue" ${s.autoSimOverdue ? 'checked' : ''}> 🎲 Sim any match nobody played by its deadline (checked whenever you open the app)</label>
        <label class="check"><input type="checkbox" name="everyMemberWeekly" ${s.everyMemberWeekly ? 'checked' : ''}> Every member gets at least one match each week</label>
        <label class="check"><input type="checkbox" name="allowCpuOpponents" ${s.allowCpuOpponents ? 'checked' : ''}> Use unassigned (CPU) superstars as opponents</label>
        <label class="check"><input type="checkbox" name="allowCpuVsCpu" ${s.allowCpuVsCpu ? 'checked' : ''}> Allow CPU vs CPU matches (you sim them)</label>
        <label class="check"><input type="checkbox" name="promos" ${s.promos ? 'checked' : ''}> Open weekly shows with a promo segment</label>
        <label class="check"><input type="checkbox" name="autoStorylines" ${s.autoStorylines ? 'checked' : ''}> Start rivalries automatically (after DQs, count-outs and draws) and log feud results</label>
        ${d.brands.length ? `<div class="grid-form">${d.brands.map((b) => field(`${b.name} airs on`, `<select name="day_${esc(b.id)}">${options(DAY_NAMES.map((n, i) => ({ value: i, label: n })), showDay(d, b))}</select>`)).join('')}</div>` : ''}
        ${field('PLE names (in order, one per line)', textarea('pleNames', s.pleNames.join('\n'), 'rows="5"'))}
        <div class="row gap wrap"><button class="btn btn-primary" type="submit">Save GM settings</button><button class="btn btn-ghost" type="button" data-act="gm-settings-reset">Reset to defaults</button></div>
      </form>
    </details>
  </section>`;
}

export default {
  render() {
    const d = state.data;
    const cur = currentWeek(d);
    const s = gmSettings(d);
    return `
      ${pageHead('General Manager', `Season ${esc(d.league.season)} · ${cur ? `Week ${cur}` : 'Not started'}${s.autopilot ? ' · <span class="text-gold">🤖 Autopilot on</span>' : ''}`)}
      <div class="grid-2 align-start gm-grid">
        <div>${thisWeekSection(cur)}${nextWeekSection(cur)}</div>
        <div>${contendersSection()}${settingsSection()}</div>
      </div>`;
  },
  mount(root) {
    const rf = root.querySelector('#gm-results');
    if (rf) rf.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(rf);
      const cur = currentWeek(state.data);
      const pending = weekStatus(state.data, cur).pending;
      const picks = pending.filter(({ seg }) => v[`w_${seg.id}`] !== null && v[`w_${seg.id}`] !== undefined);
      if (!picks.length) { toast('Tap a winner for at least one match', 'error'); return; }
      const changes = [];
      commit((d) => {
        for (const { ev, seg } of picks) {
          const w = v[`w_${seg.id}`];
          const result = {
            winnerSide: w === 'draw' || w === 'nc' ? null : Number(w), draw: w === 'draw', nc: w === 'nc',
            method: v[`m_${seg.id}`] || 'Pinfall', rating: v[`r_${seg.id}`] ? Number(v[`r_${seg.id}`]) : 0, link: '', notes: '',
          };
          const out = recordResult(d, ev, seg, result);
          changes.push({ ev, seg, out });
        }
      });
      const champs = changes.filter((c) => c.out && c.out.kind === 'change' && !c.out.cashIn);
      toast(`Saved ${picks.length} result${picks.length === 1 ? '' : 's'}${champs.length ? ` — ${champs.length} new champion${champs.length === 1 ? '' : 's'}!` : ''}`);
      for (const c of changes) announceOutcome(c.ev, c.seg, c.out, { quiet: true });
      if (champs.length) setTimeout(() => post(titleChangeMessage(champs[0].out.reign)), 50);
      runHooks('afterResults');
    });
    const sf = root.querySelector('#gm-settings');
    if (sf) sf.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(sf);
      const showDays = {};
      for (const b of state.data.brands) showDays[b.id] = Number(v[`day_${b.id}`]);
      const names = String(v.pleNames || '').split('\n').map((x) => x.trim()).filter(Boolean);
      commit((d) => {
        d.settings.gm = {
          matchesPerShow: Math.max(1, Number(v.matchesPerShow) || 4), pleEvery: Math.max(0, Number(v.pleEvery) || 0), pleMatches: Math.max(1, Number(v.pleMatches) || 6),
          tvTitleEvery: Math.max(1, Number(v.tvTitleEvery) || 2), stipulationChance: Number(v.stipulationChance) || 0,
          everyMemberWeekly: !!v.everyMemberWeekly, allowCpuOpponents: !!v.allowCpuOpponents, allowCpuVsCpu: !!v.allowCpuVsCpu,
          promos: !!v.promos, autoStorylines: !!v.autoStorylines, autopilot: !!v.autopilot, autoSimOverdue: !!v.autoSimOverdue,
          showDays, pleNames: names.length ? names : PLE_NAMES,
        };
      });
      ui.showSettings = true;
      toast('GM settings saved');
    });
    const det = root.querySelector('[data-gm-settings]');
    if (det) det.addEventListener('toggle', () => { ui.showSettings = det.open; });
  },
  actions: {
    'gm-sim-one': (el) => simSegment(el.dataset.seg),
    'gm-sim-cpu': () => { const st = weekStatus(state.data, currentWeek(state.data)); simMany(st.pending.filter(({ seg }) => cpuOnly(seg)), 'CPU-only matches'); },
    'gm-sim-all': async () => {
      const st = weekStatus(state.data, currentWeek(state.data));
      if (!(await confirmDialog(`Let the app decide all ${st.pending.length} remaining matches? Winners are based on overall rating, momentum and a bit of luck.`, { okLabel: '🎲 Sim them all' }))) return;
      simMany(weekStatus(state.data, currentWeek(state.data)).pending, `match${st.pending.length === 1 ? '' : 'es'}`);
    },
    'gm-plan': () => {
      const d = state.data;
      ui.plan = planWeek(d, { week: currentWeek(d) + 1 });
      if (!ui.plan.shows.length) { toast(ui.plan.notes[0] || 'Nothing to book yet', 'error', 6000); ui.plan = null; }
      refresh();
    },
    'gm-discard': () => { ui.plan = null; refresh(); },
    'gm-remove': (el) => {
      const sh = ui.plan.shows[Number(el.dataset.show)];
      sh.card.splice(Number(el.dataset.i), 1);
      refresh();
    },
    'gm-add': (el) => {
      if (!addMatchToPlan(state.data, ui.plan, Number(el.dataset.show))) toast('Everyone available is already booked this week', 'error');
      refresh();
    },
    'gm-approve': () => {
      const box = document.getElementById('gm-post');
      const plan = ui.plan;
      plan.shows = plan.shows.filter((sh) => sh.card.some((x) => x.kind === 'match'));
      if (!plan.shows.length) { toast('The card is empty', 'error'); return; }
      approvePlan(plan, { postToDiscord: !!(box && box.checked) });
    },
    'gm-post-results': (el) => post(resultsMessage(state.data.events.find((e) => e.id === el.dataset.ev))),
    'gm-contender': (el) => {
      const t = getTitle(el.dataset.id);
      const d = state.data;
      const r = currentReign(d, t.id);
      const div = t.division === 'women' ? 'F' : t.division === 'men' ? 'M' : null;
      formModal({
        title: `#1 contender: ${t.name}`,
        html: t.kind === 'tag'
          ? field('Team', `<select name="teamId">${options(d.teams.filter((x) => !r || x.id !== r.teamId).map((x) => ({ value: x.id, label: x.name })), t.contender && t.contender.teamId, { empty: 'Choose a team…' })}</select>`)
          : field('Superstar', `<select name="ssId">${superstarOptions(t.contender && t.contender.ids ? t.contender.ids[0] : '', { empty: 'Choose…', filter: (x) => (!div || x.gender === div) && !(r && r.holders.includes(x.id)) })}</select>`),
        onSubmit(v) {
          if (t.kind === 'tag') {
            const team = getTeam(v.teamId);
            if (!team) { toast('Choose a team', 'error'); return false; }
            commit(() => { t.contender = { ids: team.superstarIds.slice(0, 2), teamId: team.id, matchId: null, since: today(), manual: true }; });
          } else {
            if (!v.ssId) { toast('Choose a superstar', 'error'); return false; }
            commit(() => { t.contender = { ids: [v.ssId], teamId: null, matchId: null, since: today(), manual: true }; });
          }
          toast('#1 contender set — the GM will book them in the next title match');
        },
      });
    },
    'gm-contender-clear': (el) => { const t = getTitle(el.dataset.id); commit(() => { t.contender = null; }); },
    'gm-settings-reset': async () => {
      if (!(await confirmDialog('Reset all GM settings to the defaults?', { okLabel: 'Reset' }))) return;
      commit((d) => { d.settings.gm = { ...GM_DEFAULTS }; });
      toast('GM settings reset');
    },
  },
};
