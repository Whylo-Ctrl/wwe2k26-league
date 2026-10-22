import { state, isAdmin, commit, uid, getTitle, getBrand, getSuperstar, getEvent, getTeam } from './store.js';
import { currentReign, reignsFor, reignLength, defenses, today, matchName, plural } from './stats.js';
import { esc, safeUrl, avatar, brandChip, fmtDate, options, field, input, textarea, formModal, confirmDialog, toast, emptyState, pageHead, holderText, superstarOptions } from './ui.js';
import { post, championsMessage, titleChangeMessage } from './discord.js';

export const PRESETS = [
  { name: 'Undisputed WWE Championship', brand: 'smackdown', kind: 'singles', division: 'men' },
  { name: 'World Heavyweight Championship', brand: 'raw', kind: 'singles', division: 'men' },
  { name: "WWE Women's Championship", brand: 'smackdown', kind: 'singles', division: 'women' },
  { name: "Women's World Championship", brand: 'raw', kind: 'singles', division: 'women' },
  { name: 'Intercontinental Championship', brand: 'raw', kind: 'singles', division: 'men' },
  { name: 'United States Championship', brand: 'smackdown', kind: 'singles', division: 'men' },
  { name: 'World Tag Team Championship', brand: 'raw', kind: 'tag', division: 'men' },
  { name: 'WWE Tag Team Championship', brand: 'smackdown', kind: 'tag', division: 'men' },
  { name: "Women's Tag Team Championship", brand: '', kind: 'tag', division: 'women' },
  { name: 'NXT Championship', brand: 'nxt', kind: 'singles', division: 'men' },
  { name: "NXT Women's Championship", brand: 'nxt', kind: 'singles', division: 'women' },
];

function titleForm(t) {
  const d = state.data;
  return `
    ${field('Championship name', input('name', t ? t.name : '', 'required placeholder="e.g. Intercontinental Championship"'))}
    <div class="grid-form">
      ${field('Brand', `<select name="brandId">${options(d.brands.map((b) => ({ value: b.id, label: b.name })), t ? t.brandId : '', { empty: 'All brands' })}</select>`)}
      ${field('Type', `<select name="kind">${options([{ value: 'singles', label: 'Singles' }, { value: 'tag', label: 'Tag team' }], t ? t.kind : 'singles')}</select>`)}
      ${field('Division', `<select name="division">${options([{ value: 'men', label: "Men's" }, { value: 'women', label: "Women's" }, { value: 'open', label: 'Open / intergender' }], t ? t.division : 'men')}</select>`)}
      ${field('Display order', input('order', t ? t.order ?? '' : d.championships.length + 1, 'type="number"'))}
      ${field('Title level (for the GM)', `<select name="tier">${options([{ value: 'auto', label: 'Auto' }, { value: 'world', label: 'World title (defended at PLEs)' }, { value: 'secondary', label: 'Secondary (defended on TV too)' }, { value: 'tag', label: 'Tag title' }], t ? t.tier || 'auto' : 'auto')}</select>`, 'Auto: the first singles title of a brand and division is its world title.')}
    </div>
    ${field('Belt image URL', input('imageUrl', t ? t.imageUrl || '' : '', 'type="url" placeholder="https://… (optional)"'))}
    ${t ? `<label class="check"><input type="checkbox" name="retired" ${t.retired ? 'checked' : ''}> Retired (hide from active titles)</label>` : ''}`;
}

function openTitleForm(id) {
  const t = id ? getTitle(id) : null;
  formModal({
    title: t ? `Edit ${t.name}` : 'Add a championship',
    html: titleForm(t),
    onSubmit(v) {
      if (!v.name) { toast('Name is required', 'error'); return false; }
      const fields = { name: v.name, brandId: v.brandId || null, kind: v.kind, division: v.division, order: Number(v.order) || 0, imageUrl: v.imageUrl, retired: !!v.retired, tier: v.tier || 'auto' };
      if (t) commit(() => Object.assign(t, fields));
      else commit((d) => d.championships.push({ id: uid('title'), ...fields }));
    },
  });
}

function addPresets() {
  const d = state.data;
  const have = new Set(d.championships.map((t) => t.name.toLowerCase()));
  const add = PRESETS.filter((p) => !have.has(p.name.toLowerCase()));
  if (!add.length) { toast('You already have all the standard titles'); return; }
  commit((data) => {
    add.forEach((p, i) => data.championships.push({
      id: uid('title'), name: p.name, brandId: data.brands.some((b) => b.id === p.brand) ? p.brand : null,
      kind: p.kind, division: p.division, order: data.championships.length + i + 1, imageUrl: '', retired: false,
    }));
  });
  toast(`Added ${add.length} championships — delete any you don't use`);
}

// Award a title outside of a match (starting champions, cash-ins you didn't book, etc.)
function openAward(titleId) {
  const t = getTitle(titleId);
  const d = state.data;
  const cur = currentReign(d, titleId);
  const n = t.kind === 'tag' ? 2 : 1;
  formModal({
    title: `Award the ${t.name}`,
    html: `
      ${cur ? `<div class="notice">This ends <strong>${esc(holderText(cur))}</strong>'s reign on the date below.</div>` : ''}
      ${t.kind === 'tag' && d.teams.length ? field('Tag team', `<select name="teamId">${options(d.teams.map((x) => ({ value: x.id, label: x.name })), '', { empty: 'Pick a team (or choose superstars below)' })}</select>`) : ''}
      <div class="grid-form">${Array.from({ length: n }, (_, i) => field(n > 1 ? `Superstar ${i + 1}` : 'New champion', `<select name="s${i}">${superstarOptions('', { empty: 'Choose…' })}</select>`)).join('')}</div>
      ${field('Date won', input('date', today(), 'type="date" required'))}
      ${field('Notes', input('notes', '', 'placeholder="e.g. Inaugural champion, won in a tournament"'))}`,
    submitLabel: 'Award title',
    onSubmit(v) {
      let holders = Array.from({ length: n }, (_, i) => v[`s${i}`]).filter(Boolean);
      let teamId = null;
      if (v.teamId) { const team = getTeam(v.teamId); holders = team.superstarIds.slice(0, Math.max(2, team.superstarIds.length)); teamId = team.id; }
      if (!holders.length) { toast('Choose the new champion', 'error'); return false; }
      if (new Set(holders).size !== holders.length) { toast('Pick different superstars', 'error'); return false; }
      const reign = { id: uid('reign'), titleId, holders, teamId, wonAt: v.date, wonEventId: null, wonMatchId: null, lostAt: null, lostEventId: null, lostMatchId: null, notes: v.notes };
      commit((data) => {
        if (cur) { cur.lostAt = v.date; }
        data.reigns.push(reign);
      });
      setTimeout(() => post(titleChangeMessage(reign)), 50);
    },
  });
}

function openReignForm(reignId) {
  const r = state.data.reigns.find((x) => x.id === reignId);
  formModal({
    title: 'Edit reign',
    html: `
      <p><strong>${esc(holderText(r))}</strong></p>
      <div class="grid-form">
        ${field('Won on', input('wonAt', r.wonAt || '', 'type="date"'))}
        ${field('Lost on', input('lostAt', r.lostAt || '', 'type="date"'), 'Leave empty if they are still champion.')}
      </div>
      ${field('Notes', textarea('notes', r.notes || '', 'rows="2"'))}`,
    extraFooter: `<button type="button" class="btn btn-ghost btn-danger-text" data-act="reign-delete" data-id="${esc(r.id)}" data-close>Delete reign</button>`,
    onSubmit(v) {
      commit(() => { r.wonAt = v.wonAt; r.lostAt = v.lostAt || null; r.notes = v.notes; });
    },
  });
}

export const titlesView = {
  render() {
    const d = state.data;
    const titles = d.championships.slice().sort((a, b) => (a.retired ? 1 : 0) - (b.retired ? 1 : 0) || (a.order || 0) - (b.order || 0));
    const actions = `<button class="btn btn-ghost" data-act="titles-post">Post champions</button>${isAdmin() ? '<button class="btn btn-primary" data-act="title-new">+ Championship</button>' : ''}`;
    return `
      ${pageHead('Championships', 'Current champions and every reign', actions)}
      ${!titles.length ? emptyState('No championships yet', isAdmin() ? 'Add your own, or start with the standard WWE title lineup.' : '', isAdmin() ? '<button class="btn btn-primary" data-act="title-presets">Add standard WWE titles</button>' : '') : ''}
      <div class="title-grid">${titles.map((t) => {
        const r = currentReign(d, t.id);
        const img = safeUrl(t.imageUrl);
        const count = reignsFor(d, t.id).length;
        return `<article class="title-card${t.retired ? ' retired' : ''}" style="--c:${esc(getBrand(t.brandId)?.color || '#f5c542')}">
          <a class="title-top" href="#/title/${esc(t.id)}">
            ${img ? `<img class="belt" src="${esc(img)}" alt="" loading="lazy">` : '<div class="belt belt-icon">🏆</div>'}
            <div><div class="eyebrow">${t.kind === 'tag' ? 'Tag team' : 'Singles'} · ${t.division === 'women' ? "Women's" : t.division === 'open' ? 'Open' : "Men's"}${t.retired ? ' · Retired' : ''}</div><h3>${esc(t.name)}</h3>${brandChip(t.brandId, 'All brands')}</div>
          </a>
          <div class="holder">
            ${r ? `<div class="avatar-row">${r.holders.map((id) => avatar(getSuperstar(id), 'md')).join('')}</div>
              <div><div class="holder-name">${holderText(r, { html: true })}</div><div class="muted small">${plural(reignLength(r), 'day')} · ${plural(defenses(d, r.id), 'defense')} · since ${esc(fmtDate(r.wonAt, { short: true }))}</div></div>`
              : '<div class="muted">Vacant</div>'}
          </div>
          ${t.contender ? `<div class="small">#1 contender: <strong>${holderText({ holders: t.contender.ids || [], teamId: t.contender.teamId }, { html: true })}</strong></div>` : ''}
          <div class="row gap wrap">
            <a class="btn btn-sm btn-ghost" href="#/title/${esc(t.id)}">History (${count})</a>
            ${isAdmin() && !t.retired ? `<button class="btn btn-sm btn-ghost" data-act="title-award" data-id="${esc(t.id)}">Award</button>${r ? `<button class="btn btn-sm btn-ghost" data-act="title-vacate" data-id="${esc(t.id)}">Vacate</button>` : ''}` : ''}
            ${isAdmin() ? `<button class="btn btn-sm btn-ghost" data-act="title-edit" data-id="${esc(t.id)}">Edit</button>` : ''}
          </div>
        </article>`;
      }).join('')}</div>`;
  },
  actions: {
    'titles-post': () => post(championsMessage()),
    'title-new': () => openTitleForm(null),
    'title-presets': () => addPresets(),
    'title-edit': (el) => openTitleForm(el.dataset.id),
    'title-award': (el) => openAward(el.dataset.id),
    'title-vacate': async (el) => {
      const t = getTitle(el.dataset.id);
      const cur = currentReign(state.data, t.id);
      if (!(await confirmDialog(`Vacate the <strong>${esc(t.name)}</strong>? ${esc(holderText(cur))}'s reign ends today.`, { okLabel: 'Vacate', danger: true }))) return;
      commit(() => { cur.lostAt = today(); cur.notes = [cur.notes, 'Vacated'].filter(Boolean).join(' · '); });
      toast('Title vacated');
    },
    'title-delete': async (el) => {
      const t = getTitle(el.dataset.id);
      if (!(await confirmDialog(`Delete the <strong>${esc(t.name)}</strong> and its whole history? Marking it as retired keeps the history instead.`, { okLabel: 'Delete', danger: true }))) return;
      commit((d) => {
        d.championships = d.championships.filter((x) => x.id !== t.id);
        d.reigns = d.reigns.filter((r) => r.titleId !== t.id);
        for (const ev of d.events) for (const seg of ev.card) if (seg.titleId === t.id) { seg.titleId = null; if (seg.result) { delete seg.result.titleChange; delete seg.result.retainedReignId; } }
      });
      location.hash = '#/titles';
    },
    'reign-edit': (el) => openReignForm(el.dataset.id),
    'reign-delete': async (el) => {
      if (!(await confirmDialog('Delete this reign from the history?', { okLabel: 'Delete', danger: true }))) return;
      commit((d) => { d.reigns = d.reigns.filter((r) => r.id !== el.dataset.id); });
    },
  },
};

export const titleView = {
  render({ id }) {
    const d = state.data;
    const t = getTitle(id);
    if (!t) return emptyState('Championship not found', '', '<a class="btn" href="#/titles">Back to titles</a>');
    const reigns = reignsFor(d, t.id);
    const img = safeUrl(t.imageUrl);
    const total = reigns.length;
    return `
      <a class="back" href="#/titles">← Championships</a>
      <section class="profile" style="--c:${esc(getBrand(t.brandId)?.color || '#f5c542')}">
        ${img ? `<img class="belt belt-lg" src="${esc(img)}" alt="">` : '<div class="belt belt-icon belt-lg">🏆</div>'}
        <div class="grow">
          <div class="chips">${brandChip(t.brandId, 'All brands')}<span class="chip chip-muted">${t.kind === 'tag' ? 'Tag team' : 'Singles'}</span>${t.retired ? '<span class="chip chip-warn">Retired</span>' : ''}</div>
          <h1>${esc(t.name)}</h1>
          <p class="muted">${total} reign${total === 1 ? '' : 's'} on record</p>
          ${isAdmin() ? `<div class="row gap wrap">${!t.retired ? `<button class="btn btn-sm btn-primary" data-act="title-award" data-id="${esc(t.id)}">Award title</button>` : ''}<button class="btn btn-sm btn-ghost" data-act="title-edit" data-id="${esc(t.id)}">Edit</button><button class="btn btn-sm btn-ghost btn-danger-text" data-act="title-delete" data-id="${esc(t.id)}">Delete</button></div>` : ''}
        </div>
      </section>
      <section class="card">
        <h2>Title history</h2>
        ${reigns.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th class="num">#</th><th>Champion</th><th>Won</th><th>Lost</th><th class="num">Days</th><th class="num">Defenses</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
          <tbody>${reigns.map((r, i) => {
            const won = getEvent(r.wonEventId);
            const lost = getEvent(r.lostEventId);
            return `<tr class="${r.lostAt ? '' : 'current'}">
              <td class="num">${total - i}</td>
              <td><strong>${holderText(r, { html: true })}</strong>${r.notes ? `<div class="muted small">${esc(r.notes)}</div>` : ''}</td>
              <td>${esc(fmtDate(r.wonAt))}${won ? `<div class="small"><a href="#/show/${esc(won.id)}">${esc(won.name)}</a></div>` : ''}</td>
              <td>${r.lostAt ? `${esc(fmtDate(r.lostAt))}${lost ? `<div class="small"><a href="#/show/${esc(lost.id)}">${esc(lost.name)}</a></div>` : ''}` : '<span class="chip chip-gold">Current</span>'}</td>
              <td class="num">${reignLength(r)}</td>
              <td class="num">${defenses(d, r.id)}</td>
              ${isAdmin() ? `<td class="num"><button class="btn btn-sm btn-ghost" data-act="reign-edit" data-id="${esc(r.id)}">Edit</button></td>` : ''}
            </tr>`;
          }).join('')}</tbody></table></div>` : '<p class="muted">No reigns yet. Title changes from match results show up here automatically.</p>'}
      </section>`;
  },
};
