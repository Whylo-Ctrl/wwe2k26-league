import { state, isAdmin, commit, refresh, uid, getSuperstar, getStoryline, getEvent, sortedEvents } from './store.js';
import { today } from './stats.js';
import { esc, safeUrl, avatar, fmtDate, options, field, input, textarea, formModal, confirmDialog, toast, emptyState, pageHead, superstarChecklist, superstarOptions } from './ui.js';
import { post, storylineMessage, promoMessage } from './discord.js';

const ui = { showConcluded: false };

function openStoryForm(id) {
  const s = id ? getStoryline(id) : null;
  formModal({
    title: s ? 'Edit storyline' : 'New storyline',
    wide: true,
    html: `
      <div class="grid-form">
        ${field('Title', input('title', s ? s.title : '', 'required placeholder="e.g. The Road to the Rumble"'))}
        ${field('Heat', `<select name="heat">${options([1, 2, 3, 4, 5].map((n) => ({ value: n, label: '🔥'.repeat(n) })), s ? s.heat : 3)}</select>`)}
        ${field('Started', input('started', s ? s.started || '' : today(), 'type="date"'))}
        ${field('Status', `<select name="status">${options([{ value: 'active', label: 'Active' }, { value: 'concluded', label: 'Concluded' }], s ? s.status : 'active')}</select>`)}
      </div>
      ${field('Summary', textarea('summary', s ? s.summary : '', 'rows="3" placeholder="What is this rivalry about?"'))}
      <div class="field"><span class="field-label">Superstars involved</span>${superstarChecklist('superstarIds', s ? s.superstarIds : [])}</div>`,
    extraFooter: s ? `<button type="button" class="btn btn-ghost btn-danger-text" data-act="story-delete" data-id="${esc(s.id)}" data-close>Delete</button>` : '',
    onSubmit(v) {
      if (!v.title) { toast('Give the storyline a title', 'error'); return false; }
      const fields = { title: v.title, heat: Number(v.heat) || 1, started: v.started, status: v.status, summary: v.summary, superstarIds: v.superstarIds || [] };
      if (s) commit(() => Object.assign(s, fields));
      else commit((d) => d.storylines.unshift({ id: uid('story'), ...fields, updates: [] }));
    },
  });
}

function openUpdateForm(id) {
  const s = getStoryline(id);
  formModal({
    title: `Update: ${s.title}`,
    html: `
      ${field('What happened?', textarea('text', '', 'rows="4" required placeholder="e.g. Gunther attacked Cody after his match on Raw…"'))}
      ${field('Date', input('date', today(), 'type="date"'))}
      <label class="check"><input type="checkbox" name="postIt" checked> Post this update to Discord after saving</label>`,
    submitLabel: 'Add update',
    onSubmit(v) {
      if (!v.text) { toast('Write the update first', 'error'); return false; }
      const upd = { id: uid('upd'), date: v.date, text: v.text };
      commit(() => s.updates.push(upd));
      if (v.postIt) setTimeout(() => post(storylineMessage(s, upd)), 50);
    },
  });
}

function openPromoForm(id) {
  const d = state.data;
  const p = id ? d.promos.find((x) => x.id === id) : null;
  formModal({
    title: p ? 'Edit promo' : 'Add a promo',
    html: `
      <div class="grid-form">
        ${field('Superstar', `<select name="superstarId" required>${superstarOptions(p ? p.superstarId : '', { empty: 'Choose…' })}</select>`)}
        ${field('Show (optional)', `<select name="eventId">${options(sortedEvents(d).reverse().map((ev) => ({ value: ev.id, label: ev.name })), p ? p.eventId : '', { empty: 'None' })}</select>`)}
        ${field('Title', input('title', p ? p.title : '', 'placeholder="e.g. A message to the champ"'))}
        ${field('Date', input('date', p ? p.date : today(), 'type="date"'))}
      </div>
      ${field('Promo', textarea('text', p ? p.text : '', 'rows="6" placeholder="Cut your promo here…"'))}
      ${field('Video link', input('link', p ? p.link : '', 'type="url" placeholder="https://… (optional)"'))}`,
    extraFooter: p ? `<button type="button" class="btn btn-ghost btn-danger-text" data-act="promo-delete" data-id="${esc(p.id)}" data-close>Delete</button>` : '',
    onSubmit(v) {
      if (!v.superstarId) { toast('Choose a superstar', 'error'); return false; }
      const fields = { superstarId: v.superstarId, eventId: v.eventId || null, title: v.title, date: v.date, text: v.text, link: v.link };
      if (p) commit(() => Object.assign(p, fields));
      else commit((data) => data.promos.unshift({ id: uid('promo'), ...fields }));
    },
  });
}

function storyCard(s) {
  const admin = isAdmin();
  const updates = s.updates.slice().reverse();
  return `<article class="card story" data-heat="${esc(s.heat)}">
    <div class="row between wrap">
      <div><div class="heat" title="Heat ${esc(s.heat)}/5">${'🔥'.repeat(Number(s.heat) || 1)}</div><h3>${esc(s.title)}</h3>
      <div class="muted small">${s.started ? `Since ${esc(fmtDate(s.started))}` : ''}${s.status === 'concluded' ? ' · Concluded' : ''}</div></div>
      <div class="avatar-row">${s.superstarIds.map((id) => `<a href="#/superstar/${esc(id)}" title="${esc(getSuperstar(id)?.name || '')}">${avatar(getSuperstar(id), 'md')}</a>`).join('')}</div>
    </div>
    <div class="muted small">${s.superstarIds.map((id) => esc(getSuperstar(id)?.name || '?')).join(' · ')}</div>
    ${s.summary ? `<p class="prose">${esc(s.summary).replace(/\n/g, '<br>')}</p>` : ''}
    ${updates.length ? `<ol class="timeline">${updates.map((u) => `<li><span class="tl-date">${esc(fmtDate(u.date, { short: true }))}</span><span>${esc(u.text)}</span>${admin ? `<button class="icon-btn tiny" title="Delete update" data-act="story-del-update" data-id="${esc(s.id)}" data-upd="${esc(u.id)}">✕</button>` : ''}</li>`).join('')}</ol>` : ''}
    <div class="row gap wrap">
      ${admin ? `<button class="btn btn-sm btn-primary" data-act="story-update" data-id="${esc(s.id)}">+ Update</button><button class="btn btn-sm btn-ghost" data-act="story-edit" data-id="${esc(s.id)}">Edit</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-act="story-post" data-id="${esc(s.id)}">Post to Discord</button>
    </div>
  </article>`;
}

export default {
  render() {
    const d = state.data;
    const admin = isAdmin();
    const active = d.storylines.filter((s) => s.status !== 'concluded').sort((a, b) => (b.heat || 0) - (a.heat || 0));
    const done = d.storylines.filter((s) => s.status === 'concluded');
    const promos = d.promos.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return `
      ${pageHead('Storylines', 'Rivalries, feuds and the promos that fuel them', admin ? '<button class="btn btn-ghost" data-act="promo-new">+ Promo</button><button class="btn btn-primary" data-act="story-new">+ Storyline</button>' : '<a class="btn btn-ghost" href="#/submit?tab=promo">Submit a promo</a>')}
      ${active.length ? `<div class="grid-2 align-start">${active.map(storyCard).join('')}</div>` : emptyState('No active storylines', admin ? 'Start a rivalry between superstars and log updates week by week.' : '')}
      ${done.length ? `<button class="btn btn-ghost btn-sm" data-act="story-toggle-done">${ui.showConcluded ? 'Hide' : 'Show'} concluded (${done.length})</button>${ui.showConcluded ? `<div class="grid-2 align-start">${done.map(storyCard).join('')}</div>` : ''}` : ''}

      <h2 class="list-title">Promos</h2>
      ${promos.length ? `<div class="grid-2 align-start">${promos.map((p) => {
        const s = getSuperstar(p.superstarId);
        const ev = getEvent(p.eventId);
        const link = safeUrl(p.link);
        return `<article class="card promo">
          <div class="row gap">${avatar(s, 'md')}<div class="grow"><div class="eyebrow">${esc(s ? s.name : 'Unknown')}${ev ? ` · ${esc(ev.name)}` : ''} · ${esc(fmtDate(p.date, { short: true }))}</div><h3>🎤 ${esc(p.title || 'Promo')}</h3></div></div>
          ${p.text ? `<blockquote class="prose">${esc(p.text).replace(/\n/g, '<br>')}</blockquote>` : ''}
          ${p.submittedBy ? `<div class="muted tiny">Submitted by ${esc(p.submittedBy)}</div>` : ''}
          <div class="row gap wrap">
            ${link ? `<a class="btn btn-sm btn-ghost" href="${esc(link)}" target="_blank" rel="noopener">Watch</a>` : ''}
            <button class="btn btn-sm btn-ghost" data-act="promo-post" data-id="${esc(p.id)}">Post to Discord</button>
            ${admin ? `<button class="btn btn-sm btn-ghost" data-act="promo-edit" data-id="${esc(p.id)}">Edit</button>` : ''}
          </div>
        </article>`;
      }).join('')}</div>` : '<p class="muted">No promos yet. Members can submit promos from the Submit page.</p>'}`;
  },
  actions: {
    'story-new': () => openStoryForm(null),
    'story-edit': (el) => openStoryForm(el.dataset.id),
    'story-update': (el) => openUpdateForm(el.dataset.id),
    'story-post': (el) => post(storylineMessage(getStoryline(el.dataset.id), null)),
    'story-toggle-done': () => { ui.showConcluded = !ui.showConcluded; refresh(); },
    'story-del-update': async (el) => {
      if (!(await confirmDialog('Delete this update?', { okLabel: 'Delete', danger: true }))) return;
      const s = getStoryline(el.dataset.id);
      commit(() => { s.updates = s.updates.filter((u) => u.id !== el.dataset.upd); });
    },
    'story-delete': async (el) => {
      if (!(await confirmDialog('Delete this storyline and all its updates?', { okLabel: 'Delete', danger: true }))) return;
      commit((d) => { d.storylines = d.storylines.filter((s) => s.id !== el.dataset.id); });
    },
    'promo-new': () => openPromoForm(null),
    'promo-edit': (el) => openPromoForm(el.dataset.id),
    'promo-post': (el) => post(promoMessage(state.data.promos.find((p) => p.id === el.dataset.id))),
    'promo-delete': async (el) => {
      if (!(await confirmDialog('Delete this promo?', { okLabel: 'Delete', danger: true }))) return;
      commit((d) => { d.promos = d.promos.filter((p) => p.id !== el.dataset.id); });
    },
  },
};
