// Member submissions without a server: members fill a form, copy the generated
// message into a Discord channel, and a commissioner pastes it into the Inbox.

import { state, isAdmin, commit, refresh, uid, setMe, getSuperstar, getMember, getEvent, getTitle, findSegment, sortedEvents } from './store.js';
import { pendingMatches, hasResult, matchName, today } from './stats.js';
import { esc, safeUrl, stars, options, superstarOptions, field, input, textarea, formValues, toast, copyText, emptyState, pageHead, sideText, matchupText, fmtDate } from './ui.js';
import { resultFormHtml, resultFromForm, saveResult } from './shows.js';

const PREFIX = 'W2K:';
const ui = { tab: 'result', matchId: '', generated: null, items: [], inboxText: '' };

function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(code) {
  const b64 = code.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

function memberName() {
  const m = getMember(state.me);
  return m ? m.name : '';
}

function resultSummary(seg, r) {
  if (r.nc) return `No contest — ${matchupText(seg)}`;
  if (r.draw) return `Draw — ${matchupText(seg)}`;
  const w = seg.sides[Number(r.winnerSide)];
  const losers = seg.sides.filter((s, i) => i !== Number(r.winnerSide) && s.ids.length).map((s) => sideText(s));
  return `${sideText(w)} def. ${losers.join(', ')}`;
}

function resultMessageText(ev, seg, r, by) {
  return [
    `📝 **Result submission** — ${ev.name}: ${matchName(seg)}${seg.titleId ? ` (${getTitle(seg.titleId)?.name || 'title'})` : ''}`,
    `${resultSummary(seg, r)}${r.method && !r.draw && !r.nc ? ` — ${r.method}` : ''}${r.rating ? ` — ${stars(r.rating)}` : ''}`,
    r.link ? `Proof: ${r.link}` : '',
    by ? `Submitted by ${by}` : '',
    `\`${encode({ v: 1, k: 'r', m: seg.id, w: r.nc ? 'nc' : r.draw ? 'draw' : String(r.winnerSide), me: r.method, ra: r.rating, l: r.link, n: r.notes, by, at: today() })}\``,
  ].filter(Boolean).join('\n');
}

function promoMessageText(p) {
  const s = getSuperstar(p.superstarId);
  return [
    `🎤 **Promo submission** — ${s ? s.name : '?'}${p.title ? `: "${p.title}"` : ''}`,
    p.text ? `> ${p.text.slice(0, 160).replace(/\n/g, ' ')}${p.text.length > 160 ? '…' : ''}` : '',
    p.link ? `Video: ${p.link}` : '',
    p.by ? `Submitted by ${p.by}` : '',
    `\`${encode({ v: 1, k: 'p', s: p.superstarId, e: p.eventId || '', t: p.title, x: p.text, l: p.link, by: p.by, at: today() })}\``,
  ].filter(Boolean).join('\n');
}

function generatedBox() {
  const g = ui.generated;
  if (!g) return '';
  const tooLong = g.length > 2000;
  return `<section class="card generated">
    <h2>Now post it in Discord</h2>
    <ol class="steps"><li>Tap <strong>Copy message</strong>.</li><li>Paste it in the league's submissions channel on Discord.</li><li>A commissioner approves it and it shows up on the site.</li></ol>
    <pre class="code-box">${esc(g)}</pre>
    ${tooLong ? '<p class="text-bad small">This is over Discord\'s 2,000-character limit. Shorten the promo text.</p>' : ''}
    <div class="row gap wrap"><button class="btn btn-primary" data-act="sub-copy">Copy message</button>${isAdmin() ? '<button class="btn btn-ghost" data-act="sub-apply-now">Apply it now (commissioner)</button>' : ''}<button class="btn btn-ghost" data-act="sub-reset">Start over</button></div>
  </section>`;
}

function resultTab() {
  const d = state.data;
  const pend = pendingMatches(d);
  const mine = state.me ? new Set(d.superstars.filter((s) => s.memberId === state.me).map((s) => s.id)) : null;
  const sorted = mine ? [...pend.filter(({ seg }) => seg.sides.some((s) => s.ids.some((id) => mine.has(id)))), ...pend.filter(({ seg }) => !seg.sides.some((s) => s.ids.some((id) => mine.has(id))))] : pend;
  if (ui.matchId && !pend.some(({ seg }) => seg.id === ui.matchId)) {
    const f = findSegment(ui.matchId);
    if (f && hasResult(f.seg)) return `<div class="notice">That match already has a result: <strong>${esc(resultSummary(f.seg, f.seg.result))}</strong>. If it's wrong, message a commissioner.</div><button class="btn btn-ghost" data-act="sub-clear-match">Pick another match</button>`;
  }
  const f = ui.matchId ? findSegment(ui.matchId) : null;
  return `
    ${field('Which match?', `<select data-change="sub-match">${opt('', 'Choose your match…', ui.matchId)}${sorted.map(({ ev, seg }) => opt(seg.id, `${ev.name}: ${matchupText(seg)}${seg.deadline || ev.deadline ? ` (due ${fmtDate(seg.deadline || ev.deadline, { short: true })})` : ''}`, ui.matchId)).join('')}</select>`)}
    ${!pend.length ? '<p class="muted">There are no matches waiting for results right now.</p>' : ''}
    ${f ? `<form class="form" id="sub-form" novalidate>
      <div class="notice small">${esc(f.ev.name)} · ${esc(matchName(f.seg))}${f.seg.titleId ? ` · 🏆 ${esc(getTitle(f.seg.titleId)?.name || '')}` : ''}</div>
      ${resultFormHtml(f.seg, {})}
      <button class="btn btn-primary" type="submit">Create submission</button>
    </form>` : ''}`;
}

function opt(v, l, sel) { return `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`; }

function promoTab() {
  const d = state.data;
  const mineFirst = (s) => !state.me || s.memberId === state.me;
  return `<form class="form" id="promo-form" novalidate>
    <div class="grid-form">
      ${field('Superstar', `<select name="superstarId" required>${superstarOptions('', { empty: 'Choose…', filter: mineFirst })}</select>`, state.me ? 'Showing your superstars.' : '')}
      ${field('For which show? (optional)', `<select name="eventId">${options(sortedEvents(d).filter((ev) => (ev.date || '') >= today() || ev.card.some((s) => !hasResult(s))).map((ev) => ({ value: ev.id, label: ev.name })), '', { empty: 'No specific show' })}</select>`)}
    </div>
    ${field('Promo title', input('title', '', 'placeholder="e.g. Message to the champ"'))}
    ${field('Your promo', textarea('text', '', 'rows="7" maxlength="1000" placeholder="Cut your promo (up to 1,000 characters)…"'))}
    ${field('Video link (optional)', input('link', '', 'type="url" placeholder="YouTube / Twitch clip"'))}
    <button class="btn btn-primary" type="submit">Create submission</button>
  </form>`;
}

export const submitView = {
  render(params) {
    const d = state.data;
    if (params.match && params.match !== ui.lastParam) { ui.matchId = params.match; ui.tab = 'result'; ui.generated = null; ui.lastParam = params.match; }
    if (params.tab && params.tab !== ui.lastTab) { ui.tab = params.tab; ui.lastTab = params.tab; }
    return `
      ${pageHead('Submit', 'Played your match online? Send in the result or cut a promo.')}
      ${d.members.length ? `<label class="field inline-field"><span class="field-label">I am</span><select data-change="sub-me">${options(d.members.map((m) => ({ value: m.id, label: m.name })), state.me, { empty: 'Pick your name…' })}</select></label>` : ''}
      <div class="tabs" role="tablist">
        <button class="tab${ui.tab === 'result' ? ' active' : ''}" role="tab" data-act="sub-tab" data-tab="result">Match result</button>
        <button class="tab${ui.tab === 'promo' ? ' active' : ''}" role="tab" data-act="sub-tab" data-tab="promo">Promo</button>
      </div>
      ${ui.generated ? generatedBox() : `<section class="card">${ui.tab === 'promo' ? promoTab() : resultTab()}</section>`}`;
  },
  mount(root) {
    const rf = root.querySelector('#sub-form');
    if (rf) rf.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(rf);
      const r = resultFromForm(v);
      if (!r) { toast('Pick who won', 'error'); return; }
      if (!r.link) toast('Tip: add a clip or screenshot link as proof', 'warn', 4000);
      const { ev, seg } = findSegment(ui.matchId);
      ui.generated = resultMessageText(ev, seg, r, memberName());
      ui.pending = { k: 'r', segId: seg.id, result: { ...r, submittedBy: memberName() } };
      refresh();
    });
    const pf = root.querySelector('#promo-form');
    if (pf) pf.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(pf);
      if (!v.superstarId) { toast('Choose a superstar', 'error'); return; }
      if (!v.text && !v.link) { toast('Write the promo or add a video link', 'error'); return; }
      const p = { superstarId: v.superstarId, eventId: v.eventId, title: v.title, text: v.text, link: v.link, by: memberName() };
      ui.generated = promoMessageText(p);
      ui.pending = { k: 'p', promo: p };
      refresh();
    });
  },
  onChange: {
    'sub-me': (el) => setMe(el.value),
    'sub-match': (el) => { ui.matchId = el.value; refresh(); },
  },
  actions: {
    'sub-tab': (el) => { ui.tab = el.dataset.tab; ui.generated = null; refresh(); },
    'sub-copy': async () => { const ok = await copyText(ui.generated); toast(ok ? 'Copied! Paste it in Discord.' : 'Copy failed — select the text and copy it manually', ok ? 'ok' : 'error'); },
    'sub-reset': () => { ui.generated = null; ui.matchId = ''; ui.lastParam = null; if (location.hash.includes('?')) location.hash = '#/submit'; else refresh(); },
    'sub-clear-match': () => { ui.matchId = ''; ui.lastParam = null; location.hash = '#/submit'; },
    'sub-apply-now': () => {
      const p = ui.pending;
      if (!p) return;
      if (p.k === 'r') saveResult(p.segId, p.result);
      else { addPromo(p.promo); toast('Promo added'); }
      ui.generated = null; ui.matchId = '';
      location.hash = p.k === 'r' ? `#/show/${findSegment(p.segId).ev.id}` : '#/storylines';
    },
  },
};

function addPromo(p) {
  commit((d) => d.promos.unshift({ id: uid('promo'), superstarId: p.superstarId, eventId: p.eventId || null, title: p.title || '', text: p.text || '', link: safeUrl(p.link) ? p.link : '', date: p.at || today(), submittedBy: p.by || '' }));
}

// ---------- commissioner inbox ----------
function parseSubmissions(text) {
  const codes = [...new Set(String(text).match(/W2K:[A-Za-z0-9_-]+/g) || [])];
  return codes.map((code) => {
    try {
      const o = decode(code);
      if (o.k === 'r') {
        const f = findSegment(String(o.m));
        const result = {
          winnerSide: o.w === 'draw' || o.w === 'nc' ? null : Number(o.w), draw: o.w === 'draw', nc: o.w === 'nc',
          method: String(o.me || '').slice(0, 40), rating: Math.min(5, Math.max(0, Number(o.ra) || 0)),
          link: safeUrl(o.l) ? String(o.l) : '', notes: String(o.n || '').slice(0, 1000), submittedBy: String(o.by || '').slice(0, 80),
        };
        let error = '';
        if (!f) error = 'This match was not found (it may have been deleted).';
        else if (result.winnerSide !== null && (!f.seg.sides[result.winnerSide] || !f.seg.sides[result.winnerSide].ids.length)) error = 'The winner in this submission does not match the current card.';
        return { code, kind: 'r', f, result, error, status: 'new' };
      }
      if (o.k === 'p') {
        const promo = { superstarId: String(o.s || ''), eventId: String(o.e || ''), title: String(o.t || '').slice(0, 120), text: String(o.x || '').slice(0, 2000), link: String(o.l || ''), by: String(o.by || '').slice(0, 80), at: String(o.at || '') };
        return { code, kind: 'p', promo, error: getSuperstar(promo.superstarId) ? '' : 'Unknown superstar.', status: 'new' };
      }
      return { code, error: 'Unknown submission type.', status: 'new' };
    } catch {
      return { code, error: 'This code is damaged — ask the member to copy it again.', status: 'new' };
    }
  });
}

function inboxItem(it, i) {
  if (it.kind === 'r' && it.f) {
    const { ev, seg } = it.f;
    const r = it.result;
    const already = hasResult(seg);
    return `<article class="card inbox-item ${it.status}">
      <div class="eyebrow">Match result · ${esc(ev.name)} · ${esc(matchName(seg))}${seg.titleId ? ` · 🏆 ${esc(getTitle(seg.titleId)?.name || '')}` : ''}</div>
      <h3>${esc(resultSummary(seg, r))}</h3>
      <div class="muted small">${esc(r.method || '')} ${r.rating ? `<span class="text-gold">${stars(r.rating)}</span>` : ''} ${r.submittedBy ? `· from ${esc(r.submittedBy)}` : ''}</div>
      ${r.notes ? `<p class="small">${esc(r.notes)}</p>` : ''}
      ${safeUrl(r.link) ? `<a href="${esc(safeUrl(r.link))}" target="_blank" rel="noopener">View proof →</a>` : '<div class="text-warn small">No proof link</div>'}
      ${it.error ? `<div class="text-bad small">${esc(it.error)}</div>` : ''}
      ${already && it.status === 'new' ? `<div class="notice small">This match already has a result: ${esc(resultSummary(seg, seg.result))}. Applying replaces it.</div>` : ''}
      ${it.status === 'new' ? `<div class="row gap">${it.error ? '' : `<button class="btn btn-sm btn-primary" data-act="inbox-apply" data-i="${i}">${already ? 'Replace result' : 'Approve'}</button>`}<button class="btn btn-sm btn-ghost" data-act="inbox-skip" data-i="${i}">Dismiss</button></div>` : `<div class="chip ${it.status === 'applied' ? 'chip-good' : 'chip-muted'}">${it.status === 'applied' ? 'Approved' : 'Dismissed'}</div>`}
    </article>`;
  }
  if (it.kind === 'p') {
    const s = getSuperstar(it.promo.superstarId);
    return `<article class="card inbox-item ${it.status}">
      <div class="eyebrow">Promo · ${esc(s ? s.name : 'Unknown')}${it.promo.by ? ` · from ${esc(it.promo.by)}` : ''}</div>
      <h3>🎤 ${esc(it.promo.title || 'Promo')}</h3>
      ${it.promo.text ? `<blockquote class="prose">${esc(it.promo.text).replace(/\n/g, '<br>')}</blockquote>` : ''}
      ${safeUrl(it.promo.link) ? `<a href="${esc(safeUrl(it.promo.link))}" target="_blank" rel="noopener">Video →</a>` : ''}
      ${it.error ? `<div class="text-bad small">${esc(it.error)}</div>` : ''}
      ${it.status === 'new' ? `<div class="row gap">${it.error ? '' : `<button class="btn btn-sm btn-primary" data-act="inbox-apply" data-i="${i}">Approve</button>`}<button class="btn btn-sm btn-ghost" data-act="inbox-skip" data-i="${i}">Dismiss</button></div>` : `<div class="chip ${it.status === 'applied' ? 'chip-good' : 'chip-muted'}">${it.status === 'applied' ? 'Approved' : 'Dismissed'}</div>`}
    </article>`;
  }
  return `<article class="card inbox-item"><div class="text-bad">${esc(it.error || 'Could not read this submission')}</div><code class="tiny">${esc(it.code.slice(0, 40))}…</code></article>`;
}

export const inboxView = {
  render() {
    if (!isAdmin()) return emptyState('Commissioners only', 'Turn on commissioner mode in Settings to approve submissions.', '<a class="btn" href="#/settings">Settings</a>');
    const open = ui.items.filter((x) => x.status === 'new' && !x.error).length;
    return `
      ${pageHead('Inbox', 'Approve results and promos members posted in Discord')}
      <section class="card">
        <form id="inbox-form" class="form">
          ${field('Paste submissions', `<textarea name="text" rows="5" placeholder="Copy the submission messages from your Discord channel and paste them here — you can paste lots at once.">${esc(ui.inboxText)}</textarea>`)}
          <div class="row gap"><button class="btn btn-primary" type="submit">Read submissions</button>${open > 1 ? `<button type="button" class="btn btn-ghost" data-act="inbox-apply-all">Approve all ${open}</button>` : ''}${ui.items.length ? '<button type="button" class="btn btn-ghost" data-act="inbox-clear">Clear</button>' : ''}</div>
        </form>
      </section>
      ${ui.items.length ? `<div class="card-stack">${ui.items.map(inboxItem).join('')}</div>` : '<p class="muted">Tip: tell members to use the <a href="#/submit">Submit page</a>. It gives them a message with a code to post in Discord; paste those messages here.</p>'}`;
  },
  mount(root) {
    const form = root.querySelector('#inbox-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      ui.inboxText = form.elements.text.value;
      const found = parseSubmissions(ui.inboxText);
      if (!found.length) { toast('No submission codes found in that text', 'error'); return; }
      const known = new Set(ui.items.map((x) => x.code));
      ui.items = [...ui.items, ...found.filter((x) => !known.has(x.code))];
      ui.inboxText = '';
      toast(`Found ${found.length} submission${found.length === 1 ? '' : 's'}`);
      refresh();
    });
  },
  actions: {
    'inbox-apply': (el) => applyItem(ui.items[Number(el.dataset.i)]),
    'inbox-skip': (el) => { ui.items[Number(el.dataset.i)].status = 'skipped'; refresh(); },
    'inbox-apply-all': () => { for (const it of ui.items) if (it.status === 'new' && !it.error) applyItem(it, true); },
    'inbox-clear': () => { ui.items = []; refresh(); },
  },
};

function applyItem(it, quiet = false) {
  if (!it || it.status !== 'new' || it.error) return;
  it.status = 'applied';
  if (it.kind === 'r') saveResult(it.f.seg.id, it.result);
  else { addPromo(it.promo); if (!quiet) toast('Promo added to Storylines'); }
}
