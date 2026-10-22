// Small UI toolkit: escaping, formatting, modals, toasts and form helpers.

import { state, getSuperstar, getMember, getBrand, getTeam, getTitle } from './store.js';
import { parseDate } from './stats.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function safeUrl(u) {
  if (!u) return '';
  try {
    const x = new URL(String(u), location.href);
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : '';
  } catch { return ''; }
}

export function fmtDate(s, opts = {}) {
  const d = parseDate(s);
  if (!d) return '';
  return d.toLocaleDateString(undefined, opts.short ? { month: 'short', day: 'numeric' } : { weekday: opts.weekday ? 'short' : undefined, month: 'short', day: 'numeric', year: 'numeric' });
}

export function stars(r) {
  const n = Number(r);
  if (!n) return '';
  const full = Math.floor(n);
  const frac = Math.round((n - full) * 4);
  return '★'.repeat(full) + ['', '¼', '½', '¾'][frac];
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function brandColor(brandId) {
  const b = getBrand(brandId);
  return b ? b.color : '#6b7280';
}

export function avatar(s, size = 'md') {
  if (!s) return `<span class="avatar avatar-${size}">?</span>`;
  const url = safeUrl(s.imageUrl);
  if (url) return `<img class="avatar avatar-${size}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  return `<span class="avatar avatar-${size}" style="--c:${esc(brandColor(s.brandId))}">${esc(initials(s.name))}</span>`;
}

export function brandChip(brandId, none = 'Free agent') {
  const b = getBrand(brandId);
  if (!b) return none ? `<span class="chip chip-muted">${esc(none)}</span>` : '';
  return `<span class="chip" style="--c:${esc(b.color)}">${esc(b.name)}</span>`;
}

export function ssName(id) {
  const s = getSuperstar(id);
  return s ? s.name : 'Unknown';
}

export function ssLink(id) {
  const s = getSuperstar(id);
  if (!s) return '<span class="muted">Unknown</span>';
  return `<a class="ss-link" href="#/superstar/${esc(s.id)}">${esc(s.name)}</a>`;
}

export function memberOf(superstarId) {
  const s = getSuperstar(superstarId);
  return s ? getMember(s.memberId) : null;
}

export function sideText(side, { html = false } = {}) {
  if (!side || !side.ids.length) return html ? '<span class="muted">TBD</span>' : 'TBD';
  const team = getTeam(side.teamId);
  const names = side.ids.map((id) => (html ? ssLink(id) : ssName(id))).join(html ? ' &amp; ' : ' & ');
  if (team) return html ? `<strong>${esc(team.name)}</strong> <span class="muted">(${names})</span>` : `${team.name} (${names})`;
  return names;
}

export function matchupText(seg, { html = false } = {}) {
  const sides = (seg.sides || []).filter((s) => s.ids.length);
  if (!sides.length) return html ? '<span class="muted">Participants TBD</span>' : 'Participants TBD';
  return sides.map((s) => sideText(s, { html })).join(html ? ' <span class="vs">vs</span> ' : ' vs ');
}

export function holderText(reign, { html = false } = {}) {
  if (!reign) return html ? '<span class="muted">Vacant</span>' : 'Vacant';
  return sideText({ ids: reign.holders, teamId: reign.teamId }, { html });
}

export function titleName(id) {
  const t = getTitle(id);
  return t ? t.name : '';
}

// ---------- form helpers ----------
export function opt(value, label, selected) {
  return `<option value="${esc(value)}"${String(value) === String(selected ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
}

export function options(list, selected, { empty } = {}) {
  return (empty !== undefined ? opt('', empty, selected) : '') + list.map((o) => (typeof o === 'string' ? opt(o, o, selected) : opt(o.value, o.label, selected))).join('');
}

export function superstarOptions(selected, { empty, filter } = {}) {
  const d = state.data;
  let html = empty !== undefined ? opt('', empty, selected) : '';
  const groups = [...d.brands.map((b) => ({ id: b.id, name: b.name })), { id: '', name: 'Free agents' }];
  for (const g of groups) {
    const list = d.superstars.filter((s) => (s.brandId || '') === g.id && (!filter || filter(s))).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    html += `<optgroup label="${esc(g.name)}">${list.map((s) => opt(s.id, s.name, selected)).join('')}</optgroup>`;
  }
  // superstars whose brand was deleted
  const orphans = d.superstars.filter((s) => s.brandId && !getBrand(s.brandId));
  if (orphans.length) html += `<optgroup label="Other">${orphans.map((s) => opt(s.id, s.name, selected)).join('')}</optgroup>`;
  return html;
}

// A searchable checkbox list of superstars (for picking several at once).
export function superstarChecklist(name, selectedIds = [], { filter } = {}) {
  const d = state.data;
  const sel = new Set(selectedIds);
  const groups = [...d.brands.map((b) => ({ id: b.id, name: b.name })), { id: '', name: 'Free agents' }];
  let html = `<input type="search" class="checklist-search" placeholder="Search superstars…" data-checklist-search>`;
  html += '<div class="check-list">';
  for (const g of groups) {
    const list = d.superstars.filter((s) => (s.brandId && getBrand(s.brandId) ? s.brandId : '') === g.id && (!filter || filter(s))).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    html += `<div class="check-group"><div class="check-group-name">${esc(g.name)}</div>${list.map((s) => `<label class="check" data-name="${esc(s.name.toLowerCase())}"><input type="checkbox" name="${esc(name)}" value="${esc(s.id)}" data-multi ${sel.has(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div>`;
  }
  if (!d.superstars.length) html += '<p class="muted">No superstars yet — add some on the Roster page.</p>';
  return `${html}</div>`;
}

// Wire up the search box of any checklist inside `root`.
export function bindChecklistSearch(root) {
  root.querySelectorAll('[data-checklist-search]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      const list = inp.nextElementSibling;
      list.querySelectorAll('label.check').forEach((l) => { l.hidden = q && !l.dataset.name.includes(q); });
    });
  });
}

export function field(label, control, hint = '', cls = '') {
  return `<label class="field ${cls}"><span class="field-label">${esc(label)}</span>${control}${hint ? `<small class="hint">${hint}</small>` : ''}</label>`;
}

export function input(name, value = '', attrs = '') {
  return `<input name="${esc(name)}" value="${esc(value)}" ${attrs}>`;
}

export function textarea(name, value = '', attrs = '') {
  return `<textarea name="${esc(name)}" ${attrs}>${esc(value)}</textarea>`;
}

export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if ('multi' in el.dataset) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
      else if (!(el.name in out)) out[el.name] = null;
    } else if (el.tagName === 'SELECT' && el.multiple) {
      out[el.name] = [...el.selectedOptions].map((o) => o.value);
    } else if (el.tagName !== 'BUTTON') {
      out[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
    }
  }
  return out;
}

// ---------- modal ----------
let modalCount = 0;

export function openModal({ title, body = '', footer = '', wide = false, onClose } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal${wide ? ' modal-wide' : ''}`;
  const id = `modal-${++modalCount}`;
  dlg.innerHTML = `
    <div class="modal-head"><h2 id="${id}-title">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
  dlg.setAttribute('aria-labelledby', `${id}-title`);
  document.body.appendChild(dlg);
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener('close', () => {
    // keep any toasts that were showing inside this dialog
    const t = dlg.querySelector(':scope > .toasts');
    dlg.remove();
    if (t && t.children.length) {
      let wrap = document.body.querySelector(':scope > .toasts');
      if (!wrap) document.body.appendChild(t); else [...t.children].forEach((c) => wrap.appendChild(c));
    }
    if (onClose) onClose();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target === dlg) close(); // backdrop
  });
  dlg.showModal();
  return { el: dlg, close, setBody(html) { dlg.querySelector('.modal-body').innerHTML = html; } };
}

export function formModal({ title, html, submitLabel = 'Save', onSubmit, onMount, wide = false, extraFooter = '' }) {
  const formId = `form-${modalCount + 1}`;
  const footer = `${extraFooter}<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary" form="${formId}">${esc(submitLabel)}</button>`;
  const m = openModal({ title, body: `<form id="${formId}" class="form" novalidate>${html}</form>`, footer, wide });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = m.el.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await onSubmit(formValues(form), form, m);
      if (r !== false) m.close();
    } catch (err) {
      console.error(err);
      toast(err.message || String(err), 'error', 6000);
    } finally { btn.disabled = false; }
  });
  bindChecklistSearch(form);
  if (onMount) onMount(form, m);
  const first = form.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
  if (first && window.matchMedia('(min-width: 700px)').matches) first.focus();
  return m;
}

export function confirmDialog(message, { okLabel = 'OK', danger = false, title = 'Are you sure?' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      body: `<p>${message}</p>`,
      footer: `<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); m.close(); });
  });
}

// ---------- toast ----------
export function toast(msg, kind = 'ok', ms = 3500) {
  // An open <dialog> sits above everything else, so show toasts inside it when one is open.
  const dialogs = document.querySelectorAll('dialog[open]');
  const host = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  let wrap = host.querySelector(':scope > .toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; wrap.setAttribute('role', 'status'); host.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function emptyState(title, text = '', action = '') {
  return `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

export function pageHead(title, sub = '', actions = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
