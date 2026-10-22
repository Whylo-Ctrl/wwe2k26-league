import { state, isAdmin, commit, refresh, uid, saveAdmin, getSuperstar, getBrand } from './store.js';
import { today } from './stats.js';
import { esc, avatar, brandChip, fmtDate, options, field, input, formModal, confirmDialog, toast, emptyState, pageHead } from './ui.js';
import { post, draftPickMessage, draftResultsMessage, sendWebhook, defaultWebhookFor } from './discord.js';

const ui = { draftId: null, q: '', focus: false };

function slots(dr) {
  const B = dr.brandIds.length;
  if (!B) return [];
  const total = dr.rounds > 0 ? dr.rounds * B : Math.max(dr.picks.length + 1, B);
  const out = [];
  for (let k = 0; k < total; k++) {
    const round = Math.floor(k / B) + 1;
    let idx = k % B;
    if (dr.snake && round % 2 === 0) idx = B - 1 - idx;
    out.push({ n: k + 1, round, brandId: dr.brandIds[idx] });
  }
  return out;
}

function onClock(dr) {
  if (dr.status === 'done') return null;
  if (dr.rounds > 0 && dr.picks.length >= dr.rounds * dr.brandIds.length) return null;
  const B = dr.brandIds.length;
  const k = dr.picks.length;
  const round = Math.floor(k / B) + 1;
  let idx = k % B;
  if (dr.snake && round % 2 === 0) idx = B - 1 - idx;
  return { n: k + 1, round, brandId: dr.brandIds[idx] };
}

function pool(dr) {
  const picked = new Set(dr.picks.map((p) => p.superstarId));
  return state.data.superstars
    .filter((s) => !picked.has(s.id) && (s.status || 'Active') !== 'Inactive')
    .filter((s) => (dr.pool === 'free' ? !s.brandId : true))
    .filter((s) => (!dr.gender || s.gender === dr.gender))
    .sort((a, b) => (Number(b.overall) || 0) - (Number(a.overall) || 0) || a.name.localeCompare(b.name));
}

function openDraftForm() {
  const d = state.data;
  formModal({
    title: 'Set up a draft',
    html: `
      ${field('Draft name', input('name', `Season ${d.league.season} Draft`, 'required'))}
      <div class="grid-form">
        ${field('Date', input('date', today(), 'type="date"'))}
        ${field('Rounds', input('rounds', '', 'type="number" min="0" placeholder="Leave empty for no limit"'))}
        ${field('Who can be drafted', `<select name="pool">${options([{ value: 'all', label: 'Everyone on the roster' }, { value: 'free', label: 'Free agents only' }], 'all')}</select>`)}
        ${field('Division', `<select name="gender">${options([{ value: 'M', label: "Men's only" }, { value: 'F', label: "Women's only" }], '', { empty: 'Both' })}</select>`)}
      </div>
      <div class="field"><span class="field-label">Brands in pick order (first pick first)</span>
        <div class="check-list">${d.brands.map((b) => `<label class="check"><input type="checkbox" name="brandIds" value="${esc(b.id)}" data-multi checked> ${esc(b.name)}</label>`).join('')}</div>
        <small class="hint">Brands pick in the order listed. Reorder brands in Settings if you need a different order.</small>
      </div>
      <label class="check"><input type="checkbox" name="snake" checked> Snake order (order reverses every round)</label>`,
    submitLabel: 'Create draft',
    onSubmit(v) {
      if ((v.brandIds || []).length < 2) { toast('Pick at least 2 brands', 'error'); return false; }
      const id = uid('draft');
      commit((data) => data.drafts.unshift({ id, name: v.name || 'Draft', date: v.date, rounds: Number(v.rounds) || 0, pool: v.pool, gender: v.gender, brandIds: v.brandIds, snake: !!v.snake, picks: [], status: 'open' }));
      ui.draftId = id;
    },
  });
}

async function makePick(dr, superstarId) {
  const slot = onClock(dr);
  if (!slot) return;
  const s = getSuperstar(superstarId);
  const pick = { ...slot, superstarId, prevBrandId: s.brandId || null };
  commit(() => { dr.picks.push(pick); s.brandId = slot.brandId; });
  toast(`${getBrand(slot.brandId)?.name || 'Brand'} picks ${s.name}`);
  if (state.admin.autoPostDraft) {
    const hook = defaultWebhookFor('news');
    if (!hook) { toast('Auto-post is on but no Discord channel is set up', 'error'); return; }
    try { for (const p of draftPickMessage(dr, pick).build({ ping: state.admin.pingMembers !== false }).payloads) await sendWebhook(hook.url, p); }
    catch (e) { toast(`Pick saved, but posting failed: ${e.message}`, 'error', 6000); }
  }
}

export default {
  render() {
    const d = state.data;
    const admin = isAdmin();
    if (!d.drafts.length) {
      return `${pageHead('Draft', 'Split the roster between brands')}
        ${emptyState('No drafts yet', admin ? 'Run a live draft: brands take turns picking superstars, and each pick can post straight to Discord.' : 'No draft has been held yet.', admin ? '<button class="btn btn-primary" data-act="draft-new">Set up a draft</button>' : '')}`;
    }
    const dr = d.drafts.find((x) => x.id === ui.draftId) || d.drafts[0];
    ui.draftId = dr.id;
    const clock = onClock(dr);
    const avail = pool(dr);
    const q = ui.q.toLowerCase();
    const shown = avail.filter((s) => !q || s.name.toLowerCase().includes(q));
    const all = slots(dr);

    return `
      ${pageHead('Draft', `${esc(dr.name)}${dr.date ? ` · ${esc(fmtDate(dr.date))}` : ''}`, `
        ${d.drafts.length > 1 ? `<select data-change="draft-pick-draft">${options(d.drafts.map((x) => ({ value: x.id, label: x.name })), dr.id)}</select>` : ''}
        <button class="btn btn-ghost" data-act="draft-post-all">Post results</button>
        ${admin ? '<button class="btn btn-primary" data-act="draft-new">+ New draft</button>' : ''}`)}

      <div class="on-clock card" style="--c:${esc(clock ? getBrand(clock.brandId)?.color || '#e3242b' : '#22c55e')}">
        ${clock ? `<div class="eyebrow">On the clock · Round ${clock.round}, pick #${clock.n}</div><h2>${esc(getBrand(clock.brandId)?.name || 'Brand')}</h2>`
          : `<div class="eyebrow">${dr.status === 'done' ? 'Draft complete' : 'All rounds done'}</div><h2>${dr.picks.length} picks made</h2>`}
        ${admin ? `<div class="row gap wrap">
          ${dr.picks.length && dr.status !== 'done' ? '<button class="btn btn-sm btn-ghost" data-act="draft-undo">Undo last pick</button>' : ''}
          ${dr.status !== 'done' ? '<button class="btn btn-sm btn-ghost" data-act="draft-finish">Finish draft</button>' : '<button class="btn btn-sm btn-ghost" data-act="draft-reopen">Reopen</button>'}
          <label class="check small"><input type="checkbox" data-change="draft-autopost" ${state.admin.autoPostDraft ? 'checked' : ''}> Auto-post each pick to Discord</label>
          <button class="btn btn-sm btn-ghost btn-danger-text" data-act="draft-delete">Delete draft</button>
        </div>` : ''}
      </div>

      <div class="draft-cols" style="--n:${dr.brandIds.length}">
        ${dr.brandIds.map((bid) => {
          const picks = dr.picks.filter((p) => p.brandId === bid);
          return `<div class="card draft-col" style="--c:${esc(getBrand(bid)?.color || '#6b7280')}">
            <h3>${esc(getBrand(bid)?.name || 'Brand')} <span class="muted small">(${picks.length})</span></h3>
            <ol class="pick-list">${picks.map((p) => `<li><span class="pick-n">#${p.n}</span>${avatar(getSuperstar(p.superstarId), 'xs')}<span class="grow">${esc(getSuperstar(p.superstarId)?.name || '?')}</span>${admin ? `<button class="icon-btn tiny" title="Post this pick" data-act="draft-post-pick" data-n="${p.n}">📣</button>` : ''}</li>`).join('') || '<li class="muted small">No picks yet</li>'}</ol>
          </div>`;
        }).join('')}
      </div>

      ${clock ? `<section class="card">
        <div class="section-head"><h2>Available (${avail.length})</h2><input type="search" placeholder="Search…" value="${esc(ui.q)}" data-input="draft-q" aria-label="Search available superstars"></div>
        ${shown.length ? `<div class="pool-grid">${shown.map((s) => `
          <div class="pool-item">${avatar(s, 'sm')}<div class="grow"><div>${esc(s.name)}</div><div class="muted tiny">${s.overall ? `OVR ${esc(s.overall)} · ` : ''}${s.gender === 'F' ? "Women's" : "Men's"} · ${s.brandId ? esc(getBrand(s.brandId)?.name || '') : 'Free agent'}</div></div>
          ${admin ? `<button class="btn btn-sm btn-primary" data-act="draft-select" data-id="${esc(s.id)}">Draft</button>` : ''}</div>`).join('')}</div>` : '<p class="muted">Nobody left to draft.</p>'}
      </section>` : ''}

      ${all.length && dr.rounds > 0 ? `<details class="card"><summary>Full pick order</summary><ol class="order-list">${all.map((sl) => `<li>${sl.n}. R${sl.round} — ${esc(getBrand(sl.brandId)?.name || '')}${dr.picks[sl.n - 1] ? ` → <strong>${esc(getSuperstar(dr.picks[sl.n - 1].superstarId)?.name || '?')}</strong>` : ''}</li>`).join('')}</ol></details>` : ''}`;
  },
  mount(root) {
    const q = root.querySelector('[data-input="draft-q"]');
    if (q && ui.focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    ui.focus = false;
  },
  onInput: { 'draft-q': (el) => { ui.q = el.value; ui.focus = true; refresh(); } },
  onChange: {
    'draft-pick-draft': (el) => { ui.draftId = el.value; refresh(); },
    'draft-autopost': (el) => saveAdmin({ autoPostDraft: el.checked }),
  },
  actions: {
    'draft-new': () => openDraftForm(),
    'draft-select': (el) => makePick(state.data.drafts.find((x) => x.id === ui.draftId), el.dataset.id),
    'draft-undo': () => {
      const dr = state.data.drafts.find((x) => x.id === ui.draftId);
      const last = dr.picks[dr.picks.length - 1];
      commit(() => { dr.picks.pop(); const s = getSuperstar(last.superstarId); if (s) s.brandId = last.prevBrandId; });
      toast('Last pick undone');
    },
    'draft-finish': () => { const dr = state.data.drafts.find((x) => x.id === ui.draftId); commit(() => { dr.status = 'done'; }); setTimeout(() => post(draftResultsMessage(dr)), 50); },
    'draft-reopen': () => { const dr = state.data.drafts.find((x) => x.id === ui.draftId); commit(() => { dr.status = 'open'; }); },
    'draft-post-all': () => post(draftResultsMessage(state.data.drafts.find((x) => x.id === ui.draftId))),
    'draft-post-pick': (el) => { const dr = state.data.drafts.find((x) => x.id === ui.draftId); post(draftPickMessage(dr, dr.picks.find((p) => p.n === Number(el.dataset.n)))); },
    'draft-delete': async () => {
      const dr = state.data.drafts.find((x) => x.id === ui.draftId);
      if (!(await confirmDialog(`Delete <strong>${esc(dr.name)}</strong>? Superstars keep the brands they were drafted to.`, { okLabel: 'Delete', danger: true }))) return;
      commit((d) => { d.drafts = d.drafts.filter((x) => x.id !== dr.id); });
      ui.draftId = null;
    },
  },
};
