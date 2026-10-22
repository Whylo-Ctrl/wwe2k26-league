// First-run setup: a simple step-by-step that builds the league before
// showing the rest of the app.

import { state, commit, refresh, uid, saveAdmin, guessRepo, getMember, getBrand, replaceData, tokenUrl, testGithub, publish, githubReady, autoSaveOn } from './store.js';
import { today, currentReign } from './stats.js';
import { esc, options, field, input, formValues, toast, avatar, brandChip, superstarOptions } from './ui.js';
import { PRESETS } from './titles.js';
import { gmSettings, showDay, DAY_NAMES } from './gm.js';

const PLATFORMS = ['PS5', 'Xbox Series X|S', 'PC (Steam)', 'PS4', 'Xbox One'];
const STEPS = ['League', 'Brands', 'Members', 'Superstars', 'Titles', 'Shows', 'Save', 'Done'];
const BRAND_CHOICES = [
  { id: 'raw', name: 'Raw', color: '#e3242b' },
  { id: 'smackdown', name: 'SmackDown', color: '#1f6fff' },
  { id: 'nxt', name: 'NXT', color: '#f2c230' },
];

const ui = { step: null };

export function needsSetup(d = state.data) {
  return !d.league.setupDone && d.superstars.length === 0 && d.events.length === 0;
}

function firstStep(d) {
  if (d.league.name === 'My WWE 2K26 League') return 0;
  if (!d.members.length) return 2;
  if (!d.superstars.length) return 3;
  if (!d.championships.length) return 4;
  return 5;
}

function go(step) { ui.step = Math.max(0, Math.min(STEPS.length - 1, step)); refresh(); window.scrollTo(0, 0); }

function progress() {
  return `<div class="wiz-progress" aria-label="Setup progress">${STEPS.map((s, i) => `<div class="wiz-dot${i < ui.step ? ' done' : ''}${i === ui.step ? ' current' : ''}"><span>${i < ui.step ? '✓' : i + 1}</span><small>${esc(s)}</small></div>`).join('')}</div>`;
}

function nav({ back = true, next = 'Next', nextAct = null, form = null } = {}) {
  return `<div class="wiz-nav">
    ${back && ui.step > 0 ? '<button type="button" class="btn btn-ghost" data-act="wiz-back">← Back</button>' : '<span></span>'}
    ${form ? `<button type="submit" form="${form}" class="btn btn-primary btn-lg">${esc(next)} →</button>` : `<button type="button" class="btn btn-primary btn-lg" data-act="${nextAct || 'wiz-next'}">${esc(next)} →</button>`}
  </div>`;
}

// ---------- steps ----------
function stepLeague() {
  const L = state.data.league;
  return `<h1>Let's set up your league</h1>
    <p class="wiz-lead">A few quick steps: your members, their superstars, your titles and your weekly shows. You can change any of it later.</p>
    <form id="wiz-form" class="form wiz-card" data-step="league">
      ${field('League name', input('name', L.name === 'My WWE 2K26 League' ? '' : L.name, 'required placeholder="e.g. Whylo Wrestling Federation" autocomplete="off"'))}
      ${field('Discord invite link (optional)', input('discordInvite', L.discordInvite, 'type="url" placeholder="https://discord.gg/…"'), 'Shows a "Join Discord" button on the site.')}
    </form>
    ${nav({ form: 'wiz-form', back: false })}
    <p class="muted small center">Just want to look around? <a href="#" data-act="wiz-demo">Load the demo league</a> instead.</p>`;
}

function stepBrands() {
  const have = new Set(state.data.brands.map((b) => b.id));
  const custom = state.data.brands.filter((b) => !BRAND_CHOICES.some((c) => c.id === b.id));
  const checked = (id) => (ui.brandPick ? ui.brandPick.has(id) : id !== 'nxt' ? have.has(id) : false);
  return `<h1>Pick your brands</h1>
    <p class="wiz-lead">Each brand gets its own weekly show and roster. Small league? One or two brands is plenty.</p>
    <form id="wiz-form" class="form wiz-card" data-step="brands">
      <div class="wiz-brands">
        ${BRAND_CHOICES.map((b) => `<label class="wiz-brand" style="--c:${b.color}"><input type="checkbox" name="brands" value="${b.id}" data-multi ${checked(b.id) ? 'checked' : ''}><span>${esc(b.name)}</span></label>`).join('')}
        ${custom.map((b) => `<label class="wiz-brand" style="--c:${esc(b.color)}"><input type="checkbox" name="brands" value="${esc(b.id)}" data-multi checked><span>${esc(b.name)}</span></label>`).join('')}
      </div>
      <div class="row gap wrap">
        <input name="customName" placeholder="Add your own brand (e.g. AEW Dynamite)" style="flex:1 1 220px">
        <input name="customColor" type="color" value="#9333ea" style="width:56px" aria-label="Brand color">
        <button type="button" class="btn btn-ghost" data-act="wiz-add-brand">+ Add</button>
      </div>
    </form>
    ${nav({ form: 'wiz-form' })}`;
}

function stepMembers() {
  const d = state.data;
  return `<h1>Who's in the league?</h1>
    <p class="wiz-lead">Add everyone in your Discord who plays. Add yourself too if you're playing.</p>
    <div class="wiz-card">
      <form id="wiz-add-member" class="wiz-add-row">
        <input name="name" placeholder="Name (as on Discord)" required autocomplete="off">
        <input name="gamertag" placeholder="Gamertag / PSN (optional)" autocomplete="off">
        <select name="platform">${options(PLATFORMS, '', { empty: 'Platform' })}</select>
        <button class="btn btn-primary" type="submit">+ Add</button>
      </form>
      ${d.members.length ? `<ul class="wiz-list">${d.members.map((m) => `<li><strong>${esc(m.name)}</strong><span class="muted small">${esc([m.gamertag, m.platform].filter(Boolean).join(' · '))}</span><button class="icon-btn" title="Remove" data-act="wiz-del-member" data-id="${esc(m.id)}">✕</button></li>`).join('')}</ul>`
        : '<p class="muted center">No members yet.</p>'}
      <p class="muted tiny">Tip: you can add Discord IDs later (Roster → Members) so posts can @mention people.</p>
    </div>
    ${nav({ next: d.members.length ? 'Next' : 'Skip for now' })}`;
}

function stepSuperstars() {
  const d = state.data;
  const missing = d.members.filter((m) => !d.superstars.some((s) => s.memberId === m.id));
  const brands = d.brands;
  return `<h1>Add the superstars</h1>
    <p class="wiz-lead">Who does each member play as? Add extra superstars without a member to use as CPU opponents.</p>
    <div class="wiz-card">
      <form id="wiz-add-ss" class="wiz-add-row">
        <input name="name" placeholder="Superstar name" required autocomplete="off">
        <select name="memberId">${options(d.members.map((m) => ({ value: m.id, label: m.name })), ui.lastMember || (missing[0] && missing[0].id) || '', { empty: 'CPU (no member)' })}</select>
        <select name="brandId">${options(brands.map((b) => ({ value: b.id, label: b.name })), ui.lastBrand || (brands[0] && brands[0].id))}</select>
        <select name="gender">${options([{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }], ui.lastGender || 'M')}</select>
        <button class="btn btn-primary" type="submit">+ Add</button>
      </form>
      ${missing.length ? `<p class="small text-warn">Still needs a superstar: ${missing.map((m) => esc(m.name)).join(', ')}</p>` : d.members.length ? '<p class="small text-good">✓ Every member has a superstar.</p>' : ''}
      ${brands.map((b) => {
        const list = d.superstars.filter((s) => s.brandId === b.id);
        return `<div class="wiz-brand-group"><div class="row gap">${brandChip(b.id)}<span class="muted small">${list.length} superstar${list.length === 1 ? '' : 's'}</span></div>
          ${list.length ? `<ul class="wiz-list">${list.map((s) => `<li>${avatar(s, 'xs')}<strong>${esc(s.name)}</strong><span class="muted small">${s.gender === 'F' ? "Women's" : "Men's"} · ${esc(getMember(s.memberId)?.name || 'CPU')}</span><button class="icon-btn" title="Remove" data-act="wiz-del-ss" data-id="${esc(s.id)}">✕</button></li>`).join('')}</ul>` : ''}
        </div>`;
      }).join('')}
      <details class="wiz-bulk"><summary>Paste a list of CPU superstars</summary>
        <form id="wiz-bulk-ss" class="form">
          <textarea name="names" rows="5" placeholder="One name per line"></textarea>
          <div class="row gap wrap">
            <select name="brandId">${options(brands.map((b) => ({ value: b.id, label: b.name })), brands[0] && brands[0].id)}</select>
            <select name="gender">${options([{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }], 'M')}</select>
            <button class="btn btn-ghost" type="submit">Add all</button>
          </div>
        </form>
      </details>
    </div>
    ${nav({ next: 'Next', nextAct: 'wiz-next-ss' })}`;
}

function presetList() {
  const d = state.data;
  const brandIds = new Set(d.brands.map((b) => b.id));
  let list = PRESETS.filter((p) => !p.brand || brandIds.has(p.brand));
  if (!list.some((p) => p.brand)) list = []; // custom brands only
  return list;
}

function stepTitles() {
  const d = state.data;
  const presets = presetList();
  const existing = d.championships;
  const have = new Set(existing.map((t) => t.name.toLowerCase()));
  const champSelect = (name, div, selected, brand) => `<select name="${esc(name)}" class="wiz-champ">${superstarOptions(selected || '', { empty: 'Vacant', filter: (s) => (!div || s.gender === div) && (!brand || s.brandId === brand) })}</select>`;
  const divOf = (division) => (division === 'women' ? 'F' : division === 'men' ? 'M' : null);
  return `<h1>Championships</h1>
    <p class="wiz-lead">Tick the titles you want and pick the current champion. Vacant titles get decided by the GM at your first PLE.</p>
    <form id="wiz-form" class="form wiz-card" data-step="titles">
      ${existing.length ? `<div class="wiz-title-group"><div class="eyebrow">Your titles</div>${existing.map((t) => {
        const r = currentReign(d, t.id);
        return `<div class="wiz-title"><span class="wiz-belt">🏆</span><div class="grow"><strong>${esc(t.name)}</strong><div class="muted tiny">${esc(getBrand(t.brandId)?.name || 'All brands')} · ${t.kind === 'tag' ? 'Tag' : t.division === 'women' ? "Women's" : "Men's"}</div></div>
          ${t.kind === 'tag' ? `<span class="muted small">${r ? 'Has champions' : 'Vacant'}</span>` : champSelect(`champ_${t.id}`, divOf(t.division), r ? r.holders[0] : '', t.brandId)}
          <button type="button" class="icon-btn" title="Remove" data-act="wiz-del-title" data-id="${esc(t.id)}">✕</button></div>`;
      }).join('')}</div>` : ''}
      ${presets.filter((p) => !have.has(p.name.toLowerCase())).length ? `<div class="wiz-title-group"><div class="eyebrow">${existing.length ? 'Add more' : 'Standard WWE titles'}</div>
        ${presets.filter((p) => !have.has(p.name.toLowerCase())).map((p, i) => `<label class="wiz-title">
          <input type="checkbox" name="preset" value="${i}" data-multi ${existing.length ? '' : 'checked'}>
          <div class="grow"><strong>${esc(p.name)}</strong><div class="muted tiny">${esc(getBrand(p.brand)?.name || 'All brands')} · ${p.kind === 'tag' ? 'Tag' : p.division === 'women' ? "Women's" : "Men's"}</div></div>
          ${p.kind === 'tag' ? '<span class="muted small">Starts vacant</span>' : champSelect(`pchamp_${i}`, divOf(p.division), '', p.brand)}
        </label>`).join('')}</div>` : ''}
      <details class="wiz-bulk"><summary>Make your own title</summary>
        <div class="row gap wrap">
          <input name="customName" placeholder="Title name" style="flex:1 1 200px">
          <select name="customBrand">${options(d.brands.map((b) => ({ value: b.id, label: b.name })), '', { empty: 'All brands' })}</select>
          <select name="customKind">${options([{ value: 'singles|men', label: "Men's singles" }, { value: 'singles|women', label: "Women's singles" }, { value: 'tag|men', label: 'Tag team' }, { value: 'singles|open', label: 'Open' }], 'singles|men')}</select>
          <button type="button" class="btn btn-ghost" data-act="wiz-add-title">+ Add</button>
        </div>
      </details>
    </form>
    ${nav({ form: 'wiz-form' })}`;
}

function stepShows() {
  const d = state.data;
  const s = gmSettings(d);
  return `<h1>Your weekly shows</h1>
    <p class="wiz-lead">The GM books a card for every brand each week, and a Premium Live Event every few weeks with all the titles on the line.</p>
    <form id="wiz-form" class="form wiz-card" data-step="shows">
      <div class="grid-form">
        ${d.brands.map((b) => field(`${b.name} airs on`, `<select name="day_${esc(b.id)}">${options(DAY_NAMES.map((n, i) => ({ value: i, label: n })), showDay(d, b))}</select>`)).join('')}
        ${field('Matches per show', `<select name="matchesPerShow">${options([2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: `${n} matches` })), s.matchesPerShow)}</select>`)}
        ${field('Premium Live Event', `<select name="pleEvery">${options([{ value: 0, label: 'No PLEs' }, ...[2, 3, 4, 5, 6, 8].map((n) => ({ value: n, label: `Every ${n} weeks` }))], s.pleEvery)}</select>`)}
        ${field('Members have … to play their match', `<select name="deadline">${options([3, 4, 5, 7, 10, 14].map((n) => ({ value: n, label: `${n} days` })), d.settings.defaultDeadlineDays)}</select>`)}
      </div>
      <label class="check autopilot"><input type="checkbox" name="autopilot" ${s.autopilot ? 'checked' : ''}> <span><strong>🤖 Autopilot.</strong> When the last result of a week is in, book the next week and post it automatically. You can turn this on later too.</span></label>
    </form>
    ${nav({ form: 'wiz-form', next: 'Finish' })}`;
}

function stepSave() {
  const g = guessRepo() || {};
  const a = state.admin;
  const owner = a.owner || g.owner || '';
  const repo = a.repo || g.repo || '';
  if (autoSaveOn()) {
    return `<h1>Saving is on ✓</h1>
      <p class="wiz-lead">Your league is connected to <strong>${esc(owner)}/${esc(repo)}</strong>. Every change saves by itself, and everyone who opens the site sees it within about a minute.</p>
      ${nav({ nextAct: 'wiz-next' })}`;
  }
  return `<h1>Save it for everyone</h1>
    <p class="wiz-lead">Right now your league only lives on this device. Connect it to your GitHub repo once, and from then on <strong>every change saves by itself</strong>. Everyone who opens the site sees the latest.</p>
    <div class="wiz-card">
      <ol class="wiz-steps">
        <li><a class="btn btn-primary" href="${esc(tokenUrl(owner))}" target="_blank" rel="noopener">Open GitHub to make a save key ↗</a><div class="muted small">GitHub fills in the details for you.</div></li>
        <li>Under <strong>Repository access</strong>, choose <strong>Only select repositories</strong>, then pick <strong>${esc(repo || 'your league repo')}</strong>.</li>
        <li>Scroll down, click <strong>Generate token</strong>, then copy the key it shows you.</li>
        <li>Paste it here:</li>
      </ol>
      <form id="wiz-form" class="form" data-step="save">
        <input name="token" type="password" placeholder="github_pat_…" autocomplete="off" required>
        <details ${owner && repo ? '' : 'open'}><summary class="muted small">Repo: ${esc(owner || '?')}/${esc(repo || '?')} (change)</summary>
          <div class="grid-form" style="margin-top:8px">
            ${field('GitHub username', input('owner', owner, 'autocapitalize="off" autocomplete="off"'))}
            ${field('Repository name', input('repo', repo, 'autocapitalize="off" autocomplete="off"'))}
          </div>
        </details>
        <p class="muted tiny">The key is stored only in this browser. Don't share it or paste it in Discord. It lasts a year, and you can make a new one any time in Settings → Saving.</p>
      </form>
    </div>
    <div class="wiz-nav">
      <button type="button" class="btn btn-ghost" data-act="wiz-back">← Back</button>
      <span class="row gap"><button type="button" class="btn btn-ghost" data-act="wiz-next">Skip for now</button><button type="submit" form="wiz-form" class="btn btn-primary btn-lg">Connect & save →</button></span>
    </div>`;
}

function stepDone() {
  const d = state.data;
  return `<div class="wiz-done">
    <div class="wiz-trophy">🏆</div>
    <h1>${esc(d.league.name)} is ready!</h1>
    <p class="wiz-lead">${d.members.length} members · ${d.superstars.length} superstars · ${d.championships.length} titles · ${d.brands.length} brand${d.brands.length === 1 ? '' : 's'}</p>
    <button class="btn btn-primary btn-lg" data-act="wiz-finish" data-to="#/gm">🎲 Book Week 1 with the GM</button>
    <div class="wiz-card wiz-next-steps">
      <h3>${autoSaveOn() ? 'One more thing' : 'Two more things'} (when you're ready)</h3>
      <ol>
        ${autoSaveOn() ? '' : '<li><strong>Save it for everyone.</strong> Right now your league is only on this device. <a href="#" data-act="wiz-finish" data-to="#/settings?tab=github">Turn on saving</a> (about 2 minutes).</li>'}
        <li><strong>Connect Discord</strong> so cards and results post to your channels. <a href="#" data-act="wiz-finish" data-to="#/settings?tab=discord">Add a channel</a></li>
      </ol>
      ${autoSaveOn() ? '<p class="small text-good" style="margin:8px 0 0">✓ Saving is on. Every change you make saves for everyone automatically.</p>' : ''}
    </div>
    <p class="muted small"><a href="#" data-act="wiz-finish" data-to="#/">Take me to the home page</a></p>
  </div>`;
}

export default {
  render() {
    const d = state.data;
    if (ui.step === null) ui.step = firstStep(d);
    const body = [stepLeague, stepBrands, stepMembers, stepSuperstars, stepTitles, stepShows, stepSave, stepDone][ui.step]();
    return `<div class="wizard">${ui.step < STEPS.length - 1 ? progress() : ''}${body}
      ${ui.step < STEPS.length - 1 ? '<p class="center"><a href="#" class="muted small" data-act="wiz-skip">Skip setup and show me everything</a></p>' : ''}</div>`;
  },
  mount(root) {
    const first = root.querySelector('.wizard input:not([type=checkbox]):not([type=color])');
    if (first && !first.value && window.matchMedia('(min-width: 700px)').matches) first.focus();
    const f = root.querySelector('#wiz-form');
    if (f) f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(f);
      const step = f.dataset.step;
      if (step === 'league') {
        if (!v.name) { toast('Give your league a name', 'error'); return; }
        const short = v.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 4).toUpperCase();
        commit((d) => { d.league.name = v.name; d.league.shortName = short || 'LG'; d.league.discordInvite = v.discordInvite; });
        go(1);
      } else if (step === 'brands') {
        const pick = new Set(v.brands || []);
        if (!pick.size) { toast('Pick at least one brand', 'error'); return; }
        commit((d) => {
          const keep = d.brands.filter((b) => pick.has(b.id));
          for (const c of BRAND_CHOICES) if (pick.has(c.id) && !keep.some((b) => b.id === c.id)) keep.push({ ...c });
          const order = [...BRAND_CHOICES.map((c) => c.id)];
          keep.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
          const removed = new Set(d.brands.filter((b) => !pick.has(b.id)).map((b) => b.id));
          d.brands = keep;
          for (const s of d.superstars) if (removed.has(s.brandId)) s.brandId = keep[0].id;
        });
        ui.brandPick = null;
        go(2);
      } else if (step === 'titles') {
        const presets = presetList();
        const have = new Set(state.data.championships.map((t) => t.name.toLowerCase()));
        const avail = presets.filter((p) => !have.has(p.name.toLowerCase()));
        const chosen = (v.preset || []).map(Number);
        commit((d) => {
          // champions for titles that already exist
          for (const t of d.championships) {
            const pickId = v[`champ_${t.id}`];
            if (pickId === undefined) continue;
            const r = currentReign(d, t.id);
            if (r && r.holders[0] === pickId) continue;
            if (r && !r.wonMatchId) d.reigns = d.reigns.filter((x) => x.id !== r.id);
            if (pickId) d.reigns.push({ id: uid('reign'), titleId: t.id, holders: [pickId], teamId: null, wonAt: today(), wonEventId: null, wonMatchId: null, lostAt: null, notes: 'Inaugural champion' });
          }
          chosen.forEach((i) => {
            const p = avail[i];
            if (!p) return;
            const id = uid('title');
            d.championships.push({ id, name: p.name, brandId: p.brand || null, kind: p.kind, division: p.division, order: d.championships.length + 1, imageUrl: '', retired: false, tier: 'auto' });
            const champ = v[`pchamp_${i}`];
            if (champ) d.reigns.push({ id: uid('reign'), titleId: id, holders: [champ], teamId: null, wonAt: today(), wonEventId: null, wonMatchId: null, lostAt: null, notes: 'Inaugural champion' });
          });
        });
        go(5);
      } else if (step === 'shows') {
        commit((d) => {
          const showDays = {};
          for (const b of d.brands) showDays[b.id] = Number(v[`day_${b.id}`]);
          d.settings.gm = { ...gmSettings(d), showDays, matchesPerShow: Number(v.matchesPerShow) || 4, pleEvery: Number(v.pleEvery) || 0, autopilot: !!v.autopilot };
          d.settings.defaultDeadlineDays = Number(v.deadline) || 7;
          d.league.setupDone = true;
        });
        go(6);
      } else if (step === 'save') {
        const btn = document.querySelector('button[form=wiz-form]');
        const token = String(v.token || '').trim();
        if (!token) { toast('Paste the key from GitHub first', 'error'); return; }
        if (!v.owner || !v.repo) { toast('Fill in your GitHub username and repo name', 'error'); return; }
        saveAdmin({ token, owner: v.owner.trim(), repo: v.repo.trim(), branch: state.admin.branch || 'main', path: state.admin.path || 'league.json', autoSave: true });
        if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
        (async () => {
          try {
            await testGithub();
            let r = await publish({ message: 'League setup' });
            if (r && r.conflict) r = await publish({ message: 'League setup', force: true });
            toast('Connected! Your league is saved for everyone.');
            go(7);
          } catch (err) {
            toast(err.message, 'error', 8000);
            if (btn) { btn.disabled = false; btn.textContent = 'Connect & save →'; }
          }
        })();
      }
    });
    // picking a champion ticks that title
    root.querySelectorAll('select[name^="pchamp_"]').forEach((sel) => sel.addEventListener('change', () => {
      const box = sel.closest('label') && sel.closest('label').querySelector('input[type=checkbox]');
      if (box && sel.value) box.checked = true;
    }));
    const am = root.querySelector('#wiz-add-member');
    if (am) am.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(am);
      if (!v.name) return;
      if (state.data.members.some((m) => m.name.toLowerCase() === v.name.toLowerCase())) { toast(`${v.name} is already in the league`, 'error'); return; }
      commit((d) => d.members.push({ id: uid('mem'), name: v.name, gamertag: v.gamertag, platform: v.platform, discordId: '', role: d.members.length ? 'Member' : 'Commissioner', joined: today() }));
      setTimeout(() => { const n = document.querySelector('#wiz-add-member input[name=name]'); if (n) n.focus(); }, 0);
    });
    const as = root.querySelector('#wiz-add-ss');
    if (as) as.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(as);
      if (!v.name) return;
      ui.lastBrand = v.brandId; ui.lastGender = v.gender;
      const d = state.data;
      const next = d.members.find((m) => m.id !== v.memberId && !d.superstars.some((s) => s.memberId === m.id));
      ui.lastMember = next ? next.id : v.memberId;
      commit((data) => data.superstars.push({ id: uid('ss'), name: v.name, memberId: v.memberId || null, brandId: v.brandId || null, gender: v.gender, alignment: 'Face', status: 'Active' }));
      setTimeout(() => { const n = document.querySelector('#wiz-add-ss input[name=name]'); if (n) n.focus(); }, 0);
    });
    const bulk = root.querySelector('#wiz-bulk-ss');
    if (bulk) bulk.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = formValues(bulk);
      const have = new Set(state.data.superstars.map((s) => s.name.toLowerCase()));
      const names = [...new Set(String(v.names || '').split('\n').map((x) => x.trim()).filter(Boolean))].filter((n) => !have.has(n.toLowerCase()));
      if (!names.length) { toast('No new names to add', 'error'); return; }
      commit((d) => { for (const name of names) d.superstars.push({ id: uid('ss'), name, memberId: null, brandId: v.brandId, gender: v.gender, alignment: 'Face', status: 'Active' }); });
      toast(`Added ${names.length} CPU superstar${names.length === 1 ? '' : 's'}`);
    });
  },
  actions: {
    'wiz-back': () => go(ui.step - 1),
    'wiz-next': () => go(ui.step + 1),
    'wiz-next-ss': () => {
      const d = state.data;
      if (d.superstars.length < 2) { toast('Add at least two superstars so the GM can book a match', 'error'); return; }
      go(4);
    },
    'wiz-add-brand': () => {
      const nameEl = document.querySelector('#wiz-form input[name=customName]');
      const colorEl = document.querySelector('#wiz-form input[name=customColor]');
      const name = nameEl.value.trim();
      if (!name) { toast('Type a brand name first', 'error'); return; }
      const current = new Set([...document.querySelectorAll('#wiz-form input[name=brands]:checked')].map((x) => x.value));
      const id = uid('brand');
      commit((d) => d.brands.push({ id, name, color: colorEl.value }));
      current.add(id);
      ui.brandPick = current;
    },
    'wiz-del-member': (el) => commit((d) => {
      d.members = d.members.filter((m) => m.id !== el.dataset.id);
      for (const s of d.superstars) if (s.memberId === el.dataset.id) s.memberId = null;
    }),
    'wiz-del-ss': (el) => commit((d) => {
      d.superstars = d.superstars.filter((s) => s.id !== el.dataset.id);
      d.reigns = d.reigns.filter((r) => !r.holders.includes(el.dataset.id));
    }),
    'wiz-del-title': (el) => commit((d) => {
      d.championships = d.championships.filter((t) => t.id !== el.dataset.id);
      d.reigns = d.reigns.filter((r) => r.titleId !== el.dataset.id);
    }),
    'wiz-add-title': () => {
      const f = document.querySelector('#wiz-form');
      const name = f.elements.customName.value.trim();
      if (!name) { toast('Type a title name first', 'error'); return; }
      const [kind, division] = f.elements.customKind.value.split('|');
      commit((d) => d.championships.push({ id: uid('title'), name, brandId: f.elements.customBrand.value || null, kind, division, order: d.championships.length + 1, imageUrl: '', retired: false, tier: 'auto' }));
      toast(`${name} added`);
    },
    'wiz-demo': async () => {
      try {
        const res = await fetch(`demo.json?t=${Date.now()}`, { cache: 'no-store' });
        replaceData(await res.json());
        ui.step = null;
        location.hash = '#/';
        toast('Demo league loaded. Start a blank league any time from Settings → Backup.');
      } catch (e) { toast('Could not load the demo', 'error'); }
    },
    'wiz-skip': () => { commit((d) => { d.league.setupDone = true; }); ui.step = null; location.hash = '#/'; },
    'wiz-finish': (el) => { if (!state.data.league.setupDone) commit((d) => { d.league.setupDone = true; }); ui.step = null; location.hash = el.dataset.to || '#/'; },
  },
};

export function startSetup() {
  const g = guessRepo();
  saveAdmin({ on: true, ...(g && !state.admin.owner ? { owner: g.owner, repo: g.repo } : {}) });
  ui.step = null;
  location.hash = '#/setup';
}
