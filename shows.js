import { state, isAdmin, commit, refresh, runHooks, uid, clone, getEvent, getBrand, getTitle, getSuperstar, getTeam, getMember, MATCH_FORMATS, WIN_METHODS, NON_TITLE_CHANGE_METHODS, sortedEvents, findSegment } from './store.js';
import { hasResult, matchName, applyResult, undoTitleEffects, currentReign, participants, today, parseDate } from './stats.js';
import {
  esc, safeUrl, fmtDate, stars, avatar, brandChip, sideText, holderText, options, opt, superstarOptions, superstarChecklist,
  field, input, textarea, formModal, openModal, confirmDialog, toast, emptyState, pageHead, bindChecklistSearch,
} from './ui.js';
import { post, cardMessage, resultsMessage, singleResultMessage, titleChangeMessage, remindersMessage } from './discord.js';
import { recordResult, undoGmEffects } from './gm.js';

export function eventStatus(ev) {
  const matches = ev.card.filter((s) => s.kind === 'match');
  if (!matches.length) return 'upcoming';
  const done = matches.filter(hasResult).length;
  if (done === matches.length) return 'completed';
  return done ? 'in-progress' : 'upcoming';
}

const STATUS_LABEL = { upcoming: 'Upcoming', 'in-progress': 'In progress', completed: 'Completed' };

export function addDays(dateStr, n) {
  const d = parseDate(dateStr) || new Date();
  d.setDate(d.getDate() + Number(n || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const listFilter = { season: '', brand: '' };

function eventRow(ev) {
  const d = parseDate(ev.date);
  const st = eventStatus(ev);
  const matches = ev.card.filter((s) => s.kind === 'match');
  const done = matches.filter(hasResult).length;
  return `<a class="event-row" href="#/show/${esc(ev.id)}" style="--c:${esc(getBrand(ev.brandId)?.color || '#6b7280')}">
    <div class="date-block">${d ? `<span>${d.toLocaleDateString(undefined, { month: 'short' })}</span><strong>${d.getDate()}</strong>` : '<span>TBD</span>'}</div>
    <div class="grow">
      <div class="event-name">${esc(ev.name)} ${ev.type === 'ple' ? '<span class="chip chip-gold">PLE</span>' : ''}</div>
      <div class="muted small">${brandChip(ev.brandId, 'All brands')} ${matches.length} match${matches.length === 1 ? '' : 'es'}${st === 'in-progress' ? ` · ${done}/${matches.length} played` : ''}${ev.deadline && st !== 'completed' ? ` · due ${esc(fmtDate(ev.deadline, { short: true }))}` : ''}</div>
    </div>
    <span class="chip chip-${st}">${STATUS_LABEL[st]}</span>
  </a>`;
}

function eventForm(ev) {
  const d = state.data;
  const date = ev ? ev.date : today();
  return `
    ${field('Show name', input('name', ev ? ev.name : '', 'required placeholder="e.g. Raw Week 1, WrestleMania"'))}
    <div class="grid-form">
      ${field('Type', `<select name="type">${options([{ value: 'weekly', label: 'Weekly show' }, { value: 'ple', label: 'Premium Live Event (PPV)' }], ev ? ev.type : 'weekly')}</select>`)}
      ${field('Brand', `<select name="brandId">${options(d.brands.map((b) => ({ value: b.id, label: b.name })), ev ? ev.brandId : '', { empty: 'All brands / co-branded' })}</select>`)}
      ${field('Show date', input('date', date, 'type="date" required'))}
      ${field('Matches due by', input('deadline', ev ? ev.deadline || '' : addDays(date, d.settings.defaultDeadlineDays), 'type="date"'), 'Members must play their match online by this date.')}
      ${field('Season', input('season', ev ? ev.season : d.league.season, 'type="number" min="1"'))}
      ${field('Poster image URL', input('posterUrl', ev ? ev.posterUrl || '' : '', 'type="url" placeholder="https://…"'))}
    </div>
    ${field('Notes / storyline hype', textarea('notes', ev ? ev.notes || '' : '', 'rows="3"'))}`;
}

function openEventForm(evId) {
  const ev = evId ? getEvent(evId) : null;
  formModal({
    title: ev ? 'Edit show' : 'Book a new show',
    html: eventForm(ev),
    submitLabel: ev ? 'Save' : 'Create show',
    onSubmit(v) {
      if (!v.name) { toast('Give the show a name', 'error'); return false; }
      const fields = { name: v.name, type: v.type, brandId: v.brandId || null, date: v.date, deadline: v.deadline || null, season: Number(v.season) || state.data.league.season, posterUrl: v.posterUrl, notes: v.notes };
      if (ev) commit(() => Object.assign(ev, fields));
      else {
        const id = uid('ev');
        commit((d) => d.events.push({ id, ...fields, card: [] }));
        location.hash = `#/show/${id}`;
      }
    },
  });
}

export const showsView = {
  render() {
    const d = state.data;
    const seasons = [...new Set([d.league.season, ...d.events.map((e) => Number(e.season))])].filter(Boolean).sort((a, b) => b - a);
    const season = listFilter.season === '' ? d.league.season : listFilter.season;
    const evs = sortedEvents(d).filter((ev) => (season === 'all' || Number(ev.season) === Number(season)) && (!listFilter.brand || ev.brandId === listFilter.brand));
    const upcoming = evs.filter((ev) => eventStatus(ev) !== 'completed');
    const done = evs.filter((ev) => eventStatus(ev) === 'completed').reverse();
    const actions = isAdmin()
      ? '<button class="btn btn-ghost" data-act="shows-reminders">Post reminders</button><button class="btn btn-primary" data-act="shows-new">+ Book show</button>'
      : '';
    return `
      ${pageHead('Shows', 'Weekly shows and Premium Live Events', actions)}
      <div class="filters">
        <select data-change="shows-season">${options([...seasons.map((s) => ({ value: s, label: `Season ${s}` })), { value: 'all', label: 'All seasons' }], season)}</select>
        <select data-change="shows-brand">${options(d.brands.map((b) => ({ value: b.id, label: b.name })), listFilter.brand, { empty: 'All brands' })}</select>
      </div>
      ${!evs.length ? emptyState('No shows yet', isAdmin() ? 'Book your first weekly show or PLE.' : 'Nothing has been booked for this season yet.', isAdmin() ? '<button class="btn btn-primary" data-act="shows-new">+ Book show</button>' : '') : ''}
      ${upcoming.length ? `<h2 class="list-title">Upcoming</h2><div class="list">${upcoming.map(eventRow).join('')}</div>` : ''}
      ${done.length ? `<h2 class="list-title">Completed</h2><div class="list">${done.map(eventRow).join('')}</div>` : ''}`;
  },
  onChange: {
    'shows-season': (el) => { listFilter.season = el.value === 'all' ? 'all' : Number(el.value); refresh(); },
    'shows-brand': (el) => { listFilter.brand = el.value; refresh(); },
  },
  actions: {
    'shows-new': () => openEventForm(null),
    'shows-reminders': () => post(remindersMessage()),
  },
};

// ---------- single show ----------
function sideBlock(seg, side, i) {
  const r = seg.result;
  let cls = '';
  if (hasResult(seg) && !r.draw && !r.nc) cls = Number(r.winnerSide) === i ? 'winner' : 'loser';
  const team = getTeam(side.teamId);
  return `<div class="side ${cls}">
    ${team ? `<div class="team-name">${esc(team.name)}</div>` : ''}
    ${side.ids.length ? side.ids.map((id) => {
      const s = getSuperstar(id);
      const m = s && getMember(s.memberId);
      return `<div class="person">${avatar(s, 'sm')}<div><a href="#/superstar/${esc(id)}">${esc(s ? s.name : 'Unknown')}</a>${m ? `<div class="muted tiny">${esc(m.name)}</div>` : ''}</div></div>`;
    }).join('') : '<div class="muted">TBD</div>'}
    ${cls === 'winner' ? '<span class="wl wl-w">WIN</span>' : ''}
  </div>`;
}

function segmentCard(ev, seg, i, n) {
  const admin = isAdmin();
  const tools = admin ? `<div class="seg-tools">
      <button class="icon-btn" title="Move up" data-act="seg-up" data-ev="${esc(ev.id)}" data-seg="${esc(seg.id)}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-btn" title="Move down" data-act="seg-down" data-ev="${esc(ev.id)}" data-seg="${esc(seg.id)}" ${i === n - 1 ? 'disabled' : ''}>↓</button>
      <button class="icon-btn" title="Edit" data-act="seg-edit" data-ev="${esc(ev.id)}" data-seg="${esc(seg.id)}">✎</button>
      <button class="icon-btn" title="Delete" data-act="seg-delete" data-ev="${esc(ev.id)}" data-seg="${esc(seg.id)}">🗑</button>
    </div>` : '';

  if (seg.kind === 'promo') {
    const link = safeUrl(seg.link);
    return `<article class="seg card seg-promo">
      <div class="seg-head"><span class="seg-num">${i + 1}</span><div class="grow"><div class="eyebrow">Segment</div><div class="seg-title">🎤 ${esc(seg.title || 'Promo')}</div></div>${tools}</div>
      <div class="avatar-row">${(seg.superstarIds || []).map((id) => `${avatar(getSuperstar(id), 'sm')}<span>${esc(getSuperstar(id)?.name || '?')}</span>`).join('')}</div>
      ${seg.text ? `<p class="prose">${esc(seg.text).replace(/\n/g, '<br>')}</p>` : ''}
      ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">Watch / read →</a>` : ''}
    </article>`;
  }

  const t = getTitle(seg.titleId);
  const r = seg.result;
  const done = hasResult(seg);
  const many = (seg.sides || []).length > 4;
  const sides = (seg.sides || []).map((side, si) => sideBlock(seg, side, si)).join(many ? '' : '<div class="vs-sep">VS</div>');
  const dl = seg.deadline || ev.deadline;
  let resultHtml = '';
  if (done) {
    let line;
    if (r.nc) line = 'No contest';
    else if (r.draw) line = 'Draw';
    else line = `${esc(sideText(seg.sides[Number(r.winnerSide)]))} wins${r.method ? ` by ${esc(r.method.toLowerCase())}` : ''}`;
    resultHtml = `<div class="result-line">
      <span>${line}</span>
      ${r.rating ? `<span class="text-gold" title="${esc(r.rating)} stars">${stars(r.rating)}</span>` : ''}
      ${r.titleChange ? '<span class="chip chip-gold">👑 New champion</span>' : r.retainedReignId ? '<span class="chip">Retained</span>' : ''}
      ${safeUrl(r.link) ? `<a href="${esc(safeUrl(r.link))}" target="_blank" rel="noopener">Watch</a>` : ''}
    </div>${r.notes ? `<p class="muted small">${esc(r.notes)}</p>` : ''}`;
  } else if (dl) {
    const overdue = dl < today();
    resultHtml = `<div class="${overdue ? 'text-bad' : 'muted'} small">⏰ ${overdue ? 'Overdue — was due' : 'Play by'} ${esc(fmtDate(dl, { weekday: true }))}</div>`;
  }
  const buttons = [];
  if (admin) buttons.push(`<button class="btn btn-sm ${done ? 'btn-ghost' : 'btn-primary'}" data-act="seg-result" data-ev="${esc(ev.id)}" data-seg="${esc(seg.id)}">${done ? 'Edit result' : 'Enter result'}</button>`);
  if (admin && done) buttons.push(`<button class="btn btn-sm btn-ghost" data-act="seg-post" data-ev="${esc(ev.id)}" data-seg="${esc(seg.id)}">Post result</button>`);
  if (!done && seg.sides.some((s) => s.ids.length)) buttons.push(`<a class="btn btn-sm btn-ghost" href="#/submit?match=${esc(seg.id)}">Submit result</a>`);

  return `<article class="seg card${t ? ' seg-title-match' : ''}">
    <div class="seg-head">
      <span class="seg-num">${i + 1}</span>
      <div class="grow">
        <div class="seg-title">${esc(matchName(seg))}</div>
        <div class="chips">${t ? `<span class="chip chip-gold">🏆 ${esc(t.name)}</span>` : ''}${seg.contenderFor ? '<span class="chip chip-upcoming">#1 Contender</span>' : ''}${seg.stipulation ? `<span class="chip chip-muted">${esc(seg.stipulation)}</span>` : ''}</div>
        ${seg.gm && seg.gm.reason ? `<div class="gm-reason">${esc(seg.gm.reason)}</div>` : ''}
      </div>
      ${tools}
    </div>
    <div class="sides${many ? ' sides-many' : ''}">${sides || '<div class="muted">Participants TBD</div>'}</div>
    ${resultHtml}
    ${buttons.length ? `<div class="seg-actions">${buttons.join('')}</div>` : ''}
  </article>`;
}

export const showView = {
  render({ id }) {
    const ev = getEvent(id);
    if (!ev) return emptyState('Show not found', 'It may have been deleted.', '<a class="btn" href="#/shows">Back to shows</a>');
    const admin = isAdmin();
    const st = eventStatus(ev);
    const poster = safeUrl(ev.posterUrl);
    const anyResult = ev.card.some((s) => s.kind === 'match' && hasResult(s));
    const actions = `
      <button class="btn btn-ghost" data-act="show-post-card" data-ev="${esc(ev.id)}">Post card</button>
      ${anyResult ? `<button class="btn btn-ghost" data-act="show-post-results" data-ev="${esc(ev.id)}">Post results</button>` : ''}
      ${admin ? `<button class="btn btn-ghost" data-act="show-edit" data-ev="${esc(ev.id)}">Edit</button><button class="btn btn-ghost btn-danger-text" data-act="show-delete" data-ev="${esc(ev.id)}">Delete</button>` : ''}`;
    const n = ev.card.length;
    return `
      <a class="back" href="#/shows">← Shows</a>
      <div class="show-head" style="--c:${esc(getBrand(ev.brandId)?.color || '#6b7280')}">
        ${poster ? `<img class="poster" src="${esc(poster)}" alt="">` : ''}
        <div class="grow">
          <div class="eyebrow">${ev.type === 'ple' ? 'Premium Live Event' : 'Weekly show'} · Season ${esc(ev.season)}</div>
          <h1>${esc(ev.name)}</h1>
          <div class="chips">${brandChip(ev.brandId, 'All brands')}<span class="chip chip-${st}">${STATUS_LABEL[st]}</span>${ev.date ? `<span class="chip chip-muted">${esc(fmtDate(ev.date, { weekday: true }))}</span>` : ''}${ev.deadline && st !== 'completed' ? `<span class="chip chip-muted">⏰ Due ${esc(fmtDate(ev.deadline, { short: true }))}</span>` : ''}</div>
          ${ev.notes ? `<p class="prose">${esc(ev.notes).replace(/\n/g, '<br>')}</p>` : ''}
        </div>
      </div>
      <div class="page-actions wrap">${actions}</div>
      <div class="card-stack">
        ${n ? ev.card.map((seg, i) => segmentCard(ev, seg, i, n)).join('') : emptyState('No matches on this card yet', admin ? 'Add matches and promo segments to build the card.' : 'The card will be announced soon.')}
      </div>
      ${admin ? `<div class="row gap wrap add-row">
        <button class="btn btn-primary" data-act="seg-add-match" data-ev="${esc(ev.id)}">+ Add match</button>
        <button class="btn btn-ghost" data-act="seg-add-promo" data-ev="${esc(ev.id)}">+ Add promo / segment</button>
      </div>` : ''}`;
  },
  actions: {
    'show-edit': (el) => openEventForm(el.dataset.ev),
    'show-delete': async (el) => {
      const ev = getEvent(el.dataset.ev);
      if (!(await confirmDialog(`Delete <strong>${esc(ev.name)}</strong> and all its matches and results? Title changes from this show are undone too.`, { okLabel: 'Delete show', danger: true }))) return;
      commit((d) => {
        for (const seg of ev.card) { undoGmEffects(d, seg); undoTitleEffects(d, seg); }
        d.events = d.events.filter((e) => e.id !== ev.id);
      });
      location.hash = '#/shows';
      toast('Show deleted');
    },
    'show-post-card': (el) => post(cardMessage(getEvent(el.dataset.ev))),
    'show-post-results': (el) => post(resultsMessage(getEvent(el.dataset.ev))),
    'seg-add-match': (el) => openMatchBuilder(el.dataset.ev, null),
    'seg-add-promo': (el) => openPromoSegment(el.dataset.ev, null),
    'seg-edit': (el) => {
      const f = findSegment(el.dataset.seg);
      if (f.seg.kind === 'promo') openPromoSegment(el.dataset.ev, el.dataset.seg);
      else openMatchBuilder(el.dataset.ev, el.dataset.seg);
    },
    'seg-delete': async (el) => {
      const f = findSegment(el.dataset.seg);
      if (!(await confirmDialog(`Remove <strong>${esc(f.seg.kind === 'promo' ? f.seg.title || 'this segment' : matchName(f.seg))}</strong> from the card?`, { okLabel: 'Remove', danger: true }))) return;
      commit((d) => { undoGmEffects(d, f.seg); undoTitleEffects(d, f.seg); f.ev.card = f.ev.card.filter((s) => s.id !== f.seg.id); });
    },
    'seg-up': (el) => moveSeg(el.dataset.seg, -1),
    'seg-down': (el) => moveSeg(el.dataset.seg, 1),
    'seg-result': (el) => openResult(el.dataset.seg),
    'seg-post': (el) => { const f = findSegment(el.dataset.seg); post(singleResultMessage(f.ev, f.seg)); },
  },
};

function moveSeg(segId, dir) {
  const f = findSegment(segId);
  const i = f.ev.card.indexOf(f.seg);
  const j = i + dir;
  if (j < 0 || j >= f.ev.card.length) return;
  commit(() => { [f.ev.card[i], f.ev.card[j]] = [f.ev.card[j], f.ev.card[i]]; });
}

// ---------- match builder ----------
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function builderHtml(st) {
  const d = state.data;
  const fmt = MATCH_FORMATS.find((f) => f.id === st.format) || MATCH_FORMATS[0];
  const used = new Set(st.sides.flatMap((s) => s.ids));
  const teams = d.teams.slice().sort((a, b) => a.name.localeCompare(b.name));
  return `
    <div class="grid-form">
      ${field('Format', `<select data-k="format">${options(MATCH_FORMATS.map((f) => ({ value: f.id, label: f.name })), st.format)}</select>`)}
      ${field('Match type', `<select data-k="type">${options(d.settings.matchTypes, st.type)}</select>`)}
      ${field('Championship', `<select data-k="titleId">${options(d.championships.filter((t) => !t.retired).map((t) => ({ value: t.id, label: t.name })), st.titleId, { empty: 'Non-title match' })}</select>`)}
      ${field('Play by', `<input type="date" data-k="deadline" value="${esc(st.deadline || '')}">`)}
    </div>
    <div class="sides-builder">
      ${st.sides.map((side, i) => `
        <div class="side-box">
          <div class="side-head"><strong>Side ${LETTERS[i] || i + 1}</strong>${getTeam(side.teamId) ? ` <span class="chip">${esc(getTeam(side.teamId).name)}</span>` : ''}
            <span class="spacer"></span>${st.sides.length > 2 ? `<button type="button" class="btn btn-sm btn-ghost" data-b="remove-side" data-i="${i}">Remove side</button>` : ''}</div>
          <div class="chips">${side.ids.map((id) => `<span class="chip chip-removable">${esc(getSuperstar(id)?.name || '?')}<button type="button" data-b="remove-p" data-i="${i}" data-id="${esc(id)}" aria-label="Remove">✕</button></span>`).join('') || '<span class="muted small">Nobody yet</span>'}</div>
          <div class="row gap wrap">
            <select data-b="add-p" data-i="${i}">${superstarOptions('', { empty: fmt.sides[i] && side.ids.length >= fmt.sides[i] ? '+ Add another…' : '+ Add superstar…', filter: (s) => !used.has(s.id) })}</select>
            ${teams.length ? `<select data-b="set-team" data-i="${i}">${options(teams.map((t) => ({ value: t.id, label: t.name })), '', { empty: 'Use a tag team / faction…' })}</select>` : ''}
          </div>
        </div>`).join('')}
      <button type="button" class="btn btn-sm btn-ghost" data-b="add-side">+ Add another side</button>
    </div>
    ${st.format === 'multi' ? `<details class="quick-add"><summary>Quick add many (each becomes their own side)</summary>
      ${superstarChecklist('quick', [], { filter: (s) => !used.has(s.id) })}
      <button type="button" class="btn btn-sm" data-b="quick-add">Add selected</button></details>` : ''}
    <div class="grid-form">
      ${field('Custom match name (optional)', `<input data-k="name" value="${esc(st.name || '')}" placeholder="${esc(matchName({ ...st, name: '' }))}">`)}
      ${field('Extra rules / stipulation', `<input data-k="stipulation" value="${esc(st.stipulation || '')}" placeholder="e.g. Loser leaves Raw, No count-outs">`)}
    </div>
    <p class="muted small">Shows as: <strong data-preview-name>${esc(matchName(st))}</strong></p>`;
}

function reshape(st, formatId) {
  const fmt = MATCH_FORMATS.find((f) => f.id === formatId) || MATCH_FORMATS[0];
  const filled = st.sides.filter((s) => s.ids.length).length;
  const len = Math.max(fmt.id === 'multi' ? 2 : fmt.sides.length, filled, fmt.id === 'multi' ? st.sides.length : 0);
  const kept = [...st.sides.filter((s) => s.ids.length), ...st.sides.filter((s) => !s.ids.length)];
  st.sides = Array.from({ length: len }, (_, i) => kept[i] || { ids: [] });
  st.format = formatId;
}

function openMatchBuilder(evId, segId) {
  const ev = getEvent(evId);
  const existing = segId ? ev.card.find((s) => s.id === segId) : null;
  const st = existing
    ? clone({ format: existing.format || 'singles', type: existing.type || 'Normal', name: existing.name || '', titleId: existing.titleId || '', stipulation: existing.stipulation || '', deadline: existing.deadline || '', sides: existing.sides })
    : { format: 'singles', type: 'Normal', name: '', titleId: '', stipulation: '', deadline: ev.deadline || '', sides: [{ ids: [] }, { ids: [] }] };
  const footer = '<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn btn-primary" data-save>Save match</button>';
  const m = openModal({ title: existing ? 'Edit match' : 'Add a match', wide: true, footer });
  const body = m.el.querySelector('.modal-body');
  const draw = () => { body.innerHTML = `<div class="form">${builderHtml(st)}</div>`; bindChecklistSearch(body); };
  draw();

  body.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (k === 'name' || k === 'stipulation') {
      st[k] = e.target.value;
      body.querySelector('[data-preview-name]').textContent = matchName(st);
    }
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    const k = t.dataset.k;
    if (k === 'format') { reshape(st, t.value); draw(); return; }
    if (k === 'type') { st.type = t.value; body.querySelector('[data-preview-name]').textContent = matchName(st); return; }
    if (k === 'deadline') { st.deadline = t.value; return; }
    if (k === 'titleId') {
      st.titleId = t.value;
      const title = getTitle(st.titleId);
      const cur = title && currentReign(state.data, title.id);
      if (title && title.kind === 'tag' && st.format === 'singles') reshape(st, 'tag');
      if (cur && !st.sides.some((s) => s.ids.length)) { st.sides[0] = { ids: [...cur.holders], teamId: cur.teamId || null }; }
      draw();
      return;
    }
    const b = t.dataset.b;
    const i = Number(t.dataset.i);
    if (b === 'add-p' && t.value) {
      st.sides[i].ids.push(t.value);
      draw();
    } else if (b === 'set-team' && t.value) {
      const team = getTeam(t.value);
      const used = new Set(st.sides.filter((_, j) => j !== i).flatMap((s) => s.ids));
      st.sides[i] = { ids: team.superstarIds.filter((id) => !used.has(id) && getSuperstar(id)), teamId: team.id };
      draw();
    }
  });
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-b]');
    if (!t || t.tagName === 'SELECT') return;
    const b = t.dataset.b;
    const i = Number(t.dataset.i);
    if (b === 'remove-p') {
      st.sides[i].ids = st.sides[i].ids.filter((x) => x !== t.dataset.id);
      if (!st.sides[i].ids.length) st.sides[i].teamId = null;
      draw();
    } else if (b === 'add-side') { st.sides.push({ ids: [] }); draw(); }
    else if (b === 'remove-side') { st.sides.splice(i, 1); draw(); }
    else if (b === 'quick-add') {
      const picked = [...body.querySelectorAll('input[name=quick]:checked')].map((x) => x.value);
      const empty = st.sides.filter((s) => s.ids.length);
      st.sides = [...empty, ...picked.map((id) => ({ ids: [id] }))];
      while (st.sides.length < 2) st.sides.push({ ids: [] });
      draw();
    }
  });

  m.el.querySelector('[data-save]').addEventListener('click', async () => {
    const all = st.sides.flatMap((s) => s.ids);
    if (new Set(all).size !== all.length) { toast('Someone is on more than one side', 'error'); return; }
    const sides = st.sides.filter((s, idx) => s.ids.length || idx < 2).map((s) => ({ ids: [...s.ids], teamId: s.teamId || null }));
    const fields = { format: st.format, type: st.type, name: st.name.trim(), titleId: st.titleId || null, stipulation: st.stipulation.trim(), deadline: st.deadline || null, sides };
    if (existing) {
      const changed = JSON.stringify(existing.sides.map((s) => s.ids)) !== JSON.stringify(sides.map((s) => s.ids)) || (existing.titleId || null) !== fields.titleId;
      if (existing.result && changed) {
        if (!(await confirmDialog('This match already has a result. Changing who is in it (or the title) clears that result.', { okLabel: 'Change and clear result', danger: true }))) return;
        commit((d) => { recordResult(d, ev, existing, null); Object.assign(existing, fields); });
      } else commit(() => Object.assign(existing, fields));
    } else {
      commit(() => ev.card.push({ id: uid('m'), kind: 'match', ...fields, result: null }));
    }
    m.close();
  });
}

// ---------- promo segment ----------
function openPromoSegment(evId, segId) {
  const ev = getEvent(evId);
  const seg = segId ? ev.card.find((s) => s.id === segId) : null;
  formModal({
    title: seg ? 'Edit segment' : 'Add promo / segment',
    wide: true,
    html: `
      ${field('Segment title', input('title', seg ? seg.title : '', 'placeholder="e.g. Cody Rhodes opens the show"'))}
      <div class="field"><span class="field-label">Who is involved</span>${superstarChecklist('superstarIds', seg ? seg.superstarIds : [])}</div>
      ${field('What happens', textarea('text', seg ? seg.text : '', 'rows="4" placeholder="Promo text, angle, backstage segment…"'))}
      ${field('Video / clip link', input('link', seg ? seg.link : '', 'type="url" placeholder="https://…"'))}`,
    onSubmit(v) {
      const fields = { title: v.title, superstarIds: v.superstarIds || [], text: v.text, link: v.link };
      if (seg) commit(() => Object.assign(seg, fields));
      else commit(() => ev.card.push({ id: uid('p'), kind: 'promo', ...fields }));
    },
  });
}

// ---------- results ----------
export function resultFormHtml(seg, r = {}) {
  const cur = seg.titleId && currentReign(state.data, seg.titleId);
  const title = getTitle(seg.titleId);
  const val = r.nc ? 'nc' : r.draw ? 'draw' : r.winnerSide !== undefined && r.winnerSide !== null ? String(r.winnerSide) : '';
  const ratings = [];
  for (let x = 0.25; x <= 5; x += 0.25) ratings.push({ value: String(x), label: `${stars(x)}  (${x})` });
  return `
    <fieldset class="field"><legend class="field-label">Who won?</legend>
      <div class="radio-list">
        ${seg.sides.map((s, i) => (s.ids.length ? `<label class="radio-card"><input type="radio" name="winner" value="${i}" ${val === String(i) ? 'checked' : ''}><span>${esc(sideText(s))}</span></label>` : '')).join('')}
        <label class="radio-card small"><input type="radio" name="winner" value="draw" ${val === 'draw' ? 'checked' : ''}><span>Draw</span></label>
        <label class="radio-card small"><input type="radio" name="winner" value="nc" ${val === 'nc' ? 'checked' : ''}><span>No contest</span></label>
      </div>
    </fieldset>
    ${title ? `<div class="notice">🏆 <strong>${esc(title.name)}</strong> — current champion: <strong>${esc(holderText(cur))}</strong>. If anyone else wins, the title changes hands automatically (not on ${[...NON_TITLE_CHANGE_METHODS].join(' or ').toLowerCase()}).</div>` : ''}
    <div class="grid-form">
      ${field('Method', `<select name="method">${options(WIN_METHODS, r.method || 'Pinfall')}</select>`)}
      ${field('Match rating', `<select name="rating">${options(ratings, r.rating ? String(r.rating) : '', { empty: 'No rating' })}</select>`)}
    </div>
    ${field('Proof / highlight link', input('link', r.link || '', 'type="url" placeholder="Clip, stream VOD or screenshot link"'))}
    ${field('Notes', textarea('notes', r.notes || '', 'rows="2" placeholder="Big spots, interference, finish…"'))}`;
}

export function resultFromForm(v) {
  if (v.winner === null || v.winner === undefined || v.winner === '') return null;
  return {
    winnerSide: v.winner === 'draw' || v.winner === 'nc' ? null : Number(v.winner),
    draw: v.winner === 'draw',
    nc: v.winner === 'nc',
    method: v.method || '',
    rating: v.rating ? Number(v.rating) : 0,
    link: v.link || '',
    notes: v.notes || '',
  };
}

// Save a result (from the admin form or an imported submission) and announce title changes.
export function saveResult(segId, result) {
  const f = findSegment(segId);
  if (!f) throw new Error('That match no longer exists.');
  const outcome = commit((d) => recordResult(d, f.ev, f.seg, result));
  if (outcome && outcome.kind === 'change') {
    toast(`👑 New ${getTitle(f.seg.titleId)?.name || 'champion'}: ${holderText(outcome.reign)}`, 'ok', 5000);
    setTimeout(() => post(titleChangeMessage(outcome.reign)), 50);
  } else if (outcome && outcome.kind === 'retain') {
    toast(`Result saved — ${holderText(outcome.reign)} retained${outcome.reason ? ` (${outcome.reason})` : ''}`);
  } else toast('Result saved');
  runHooks('afterResults');
  return outcome;
}

function openResult(segId) {
  const { seg } = findSegment(segId);
  if (!seg.sides.filter((s) => s.ids.length).length) { toast('Add participants to this match first', 'error'); return; }
  formModal({
    title: `Result: ${matchName(seg)}`,
    html: resultFormHtml(seg, seg.result || {}),
    submitLabel: 'Save result',
    extraFooter: seg.result ? '<button type="button" class="btn btn-ghost btn-danger-text" data-clear-result>Clear result</button>' : '',
    onMount(form, m) {
      const btn = m.el.querySelector('[data-clear-result]');
      if (btn) btn.addEventListener('click', () => {
        const f = findSegment(segId);
        commit((d) => { recordResult(d, f.ev, seg, null); });
        toast('Result cleared');
        m.close();
      });
    },
    onSubmit(v) {
      const result = resultFromForm(v);
      if (!result) { toast('Pick a winner (or draw / no contest)', 'error'); return false; }
      saveResult(segId, result);
    },
  });
}
