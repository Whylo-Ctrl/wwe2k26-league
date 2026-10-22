import { state, isAdmin, commit, refresh, uid, getSuperstar, getMember, getBrand, getTeam, getTitle, getEvent } from './store.js';
import { records, recordOf, completedMatches, formatRecord, formatStreak, titlesHeldBy, reignLength, defenses, matchName, winPct, undoTitleEffects, plural } from './stats.js';
import {
  esc, safeUrl, avatar, brandChip, fmtDate, stars, options, field, input, textarea, formModal, confirmDialog, toast,
  emptyState, pageHead, superstarChecklist, holderText, sideText,
} from './ui.js';

const PLATFORMS = ['PS5', 'Xbox Series X|S', 'PC (Steam)', 'PS4', 'Xbox One'];
const ALIGNMENTS = ['Face', 'Heel', 'Tweener'];
const STATUSES = ['Active', 'Injured', 'Suspended', 'Inactive'];

const ui = { tab: 'superstars', q: '', brand: '', gender: '', member: '', status: '' };

// ---------- superstars ----------
function superstarForm(s) {
  const d = state.data;
  return `
    <div class="grid-form">
      ${field('Name', input('name', s ? s.name : '', 'required placeholder="e.g. Cody Rhodes or your CAW name"'))}
      ${field('Controlled by (member)', `<select name="memberId">${options(d.members.map((m) => ({ value: m.id, label: m.name })), s ? s.memberId : '', { empty: 'Nobody (CPU / open)' })}</select>`)}
      ${field('Brand', `<select name="brandId">${options(d.brands.map((b) => ({ value: b.id, label: b.name })), s ? s.brandId : (d.brands[0] || {}).id, { empty: 'Free agent' })}</select>`)}
      ${field('Division', `<select name="gender">${options([{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }], s ? s.gender : 'M')}</select>`)}
      ${field('Alignment', `<select name="alignment">${options(ALIGNMENTS, s ? s.alignment : 'Face')}</select>`)}
      ${field('Status', `<select name="status">${options(STATUSES, s ? s.status : 'Active')}</select>`)}
      ${field('Overall rating', input('overall', s ? s.overall || '' : '', 'type="number" min="0" max="100" placeholder="e.g. 88"'))}
      ${field('Finisher', input('finisher', s ? s.finisher || '' : '', 'placeholder="e.g. Cross Rhodes"'))}
      ${field('Hometown', input('hometown', s ? s.hometown || '' : ''))}
      ${field('Contract until', input('contractUntil', s ? s.contractUntil || '' : '', 'type="date"'))}
    </div>
    ${field('Photo / render URL', input('imageUrl', s ? s.imageUrl || '' : '', 'type="url" placeholder="https://… (optional)"'))}
    ${field('Bio', textarea('bio', s ? s.bio || '' : '', 'rows="3"'))}`;
}

function openSuperstarForm(id) {
  const s = id ? getSuperstar(id) : null;
  formModal({
    title: s ? `Edit ${s.name}` : 'Add a superstar',
    html: superstarForm(s),
    wide: true,
    onSubmit(v) {
      if (!v.name) { toast('Name is required', 'error'); return false; }
      const fields = {
        name: v.name, memberId: v.memberId || null, brandId: v.brandId || null, gender: v.gender, alignment: v.alignment, status: v.status,
        overall: v.overall ? Number(v.overall) : null, finisher: v.finisher, hometown: v.hometown, contractUntil: v.contractUntil || null, imageUrl: v.imageUrl, bio: v.bio,
      };
      if (s) commit(() => Object.assign(s, fields));
      else commit((d) => d.superstars.push({ id: uid('ss'), ...fields }));
      toast(s ? 'Saved' : `${v.name} added to the roster`);
    },
  });
}

function openBulkAdd() {
  const d = state.data;
  formModal({
    title: 'Add many superstars',
    html: `
      <p class="muted">One name per line. You can assign members and fine-tune each superstar afterwards.</p>
      ${field('Names', textarea('names', '', 'rows="8" placeholder="Cody Rhodes\nGunther\nRhea Ripley"'))}
      <div class="grid-form">
        ${field('Brand', `<select name="brandId">${options(d.brands.map((b) => ({ value: b.id, label: b.name })), (d.brands[0] || {}).id, { empty: 'Free agent' })}</select>`)}
        ${field('Division', `<select name="gender">${options([{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }], 'M')}</select>`)}
      </div>`,
    submitLabel: 'Add all',
    onSubmit(v) {
      const existing = new Set(d.superstars.map((s) => s.name.toLowerCase()));
      const names = [...new Set(v.names.split('\n').map((x) => x.trim()).filter(Boolean))].filter((n) => !existing.has(n.toLowerCase()));
      if (!names.length) { toast('No new names to add', 'error'); return false; }
      commit((data) => {
        for (const name of names) data.superstars.push({ id: uid('ss'), name, memberId: null, brandId: v.brandId || null, gender: v.gender, alignment: 'Face', status: 'Active' });
      });
      toast(`Added ${names.length} superstar${names.length === 1 ? '' : 's'}`);
    },
  });
}

function superstarsTab() {
  const d = state.data;
  const recs = records(d, { season: d.league.season });
  const q = ui.q.toLowerCase();
  const list = d.superstars
    .filter((s) => (!q || s.name.toLowerCase().includes(q))
      && (!ui.brand || (ui.brand === 'free' ? !s.brandId : s.brandId === ui.brand))
      && (!ui.gender || s.gender === ui.gender)
      && (!ui.member || (ui.member === 'none' ? !s.memberId : s.memberId === ui.member))
      && (!ui.status || (s.status || 'Active') === ui.status))
    .sort((a, b) => a.name.localeCompare(b.name));
  return `
    <div class="filters">
      <input type="search" placeholder="Search…" value="${esc(ui.q)}" data-input="roster-q" aria-label="Search superstars">
      <select data-change="roster-f" data-f="brand">${options([...d.brands.map((b) => ({ value: b.id, label: b.name })), { value: 'free', label: 'Free agents' }], ui.brand, { empty: 'All brands' })}</select>
      <select data-change="roster-f" data-f="gender">${options([{ value: 'M', label: "Men's" }, { value: 'F', label: "Women's" }], ui.gender, { empty: 'All divisions' })}</select>
      <select data-change="roster-f" data-f="member">${options([...d.members.map((m) => ({ value: m.id, label: m.name })), { value: 'none', label: 'Unassigned' }], ui.member, { empty: 'All members' })}</select>
      <select data-change="roster-f" data-f="status">${options(STATUSES, ui.status, { empty: 'Any status' })}</select>
    </div>
    <div id="roster-grid">${list.length ? `<div class="ss-grid">${list.map((s) => {
      const rec = recordOf(recs, s.id);
      const m = getMember(s.memberId);
      const belts = titlesHeldBy(d, s.id);
      return `<a class="ss-card" href="#/superstar/${esc(s.id)}" style="--c:${esc(getBrand(s.brandId)?.color || '#6b7280')}">
        ${avatar(s, 'lg')}
        <div class="ss-name">${esc(s.name)}${belts.length ? ' <span title="Champion">🏆</span>' : ''}</div>
        <div class="ss-meta">${brandChip(s.brandId)}${s.status && s.status !== 'Active' ? `<span class="chip chip-bad">${esc(s.status)}</span>` : ''}</div>
        <div class="muted small">${m ? esc(m.name) : 'Unassigned'} · <span class="mono">${formatRecord(rec)}</span></div>
      </a>`;
    }).join('')}</div>` : emptyState(d.superstars.length ? 'No one matches those filters' : 'No superstars yet', isAdmin() && !d.superstars.length ? 'Add the wrestlers your members will use — one at a time or a whole list at once.' : '')}</div>`;
}

// ---------- teams ----------
function openTeamForm(id) {
  const d = state.data;
  const t = id ? getTeam(id) : null;
  formModal({
    title: t ? `Edit ${t.name}` : 'Add a tag team / faction',
    wide: true,
    html: `
      <div class="grid-form">
        ${field('Name', input('name', t ? t.name : '', 'required placeholder="e.g. The Judgment Day"'))}
        ${field('Type', `<select name="kind">${options([{ value: 'tag', label: 'Tag team' }, { value: 'faction', label: 'Faction / stable' }], t ? t.kind : 'tag')}</select>`)}
        ${field('Brand', `<select name="brandId">${options(d.brands.map((b) => ({ value: b.id, label: b.name })), t ? t.brandId : '', { empty: 'No brand' })}</select>`)}
      </div>
      <div class="field"><span class="field-label">Members</span>${superstarChecklist('superstarIds', t ? t.superstarIds : [])}</div>`,
    onSubmit(v) {
      if (!v.name) { toast('Name is required', 'error'); return false; }
      if ((v.superstarIds || []).length < 2) { toast('Pick at least 2 superstars', 'error'); return false; }
      const fields = { name: v.name, kind: v.kind, brandId: v.brandId || null, superstarIds: v.superstarIds };
      if (t) commit(() => Object.assign(t, fields));
      else commit((data) => data.teams.push({ id: uid('team'), ...fields }));
    },
  });
}

function teamsTab() {
  const d = state.data;
  if (!d.teams.length) return emptyState('No tag teams or factions yet', isAdmin() ? 'Group superstars into teams so you can drop the whole team into tag matches in one click.' : '');
  return `<div class="grid-3">${d.teams.map((t) => `
    <div class="card team-card" style="--c:${esc(getBrand(t.brandId)?.color || '#6b7280')}">
      <div class="row between"><div><div class="eyebrow">${t.kind === 'faction' ? 'Faction' : 'Tag team'}</div><h3>${esc(t.name)}</h3></div>${brandChip(t.brandId, '')}</div>
      <div class="people">${t.superstarIds.map((id) => `<a class="person" href="#/superstar/${esc(id)}">${avatar(getSuperstar(id), 'sm')}<span>${esc(getSuperstar(id)?.name || 'Unknown')}</span></a>`).join('')}</div>
      ${titlesHeldByTeam(t)}
      ${isAdmin() ? `<div class="row gap"><button class="btn btn-sm btn-ghost" data-act="team-edit" data-id="${esc(t.id)}">Edit</button><button class="btn btn-sm btn-ghost btn-danger-text" data-act="team-delete" data-id="${esc(t.id)}">Delete</button></div>` : ''}
    </div>`).join('')}</div>`;
}

function titlesHeldByTeam(t) {
  const held = state.data.championships.filter((c) => !c.retired && state.data.reigns.some((r) => r.titleId === c.id && !r.lostAt && r.teamId === t.id));
  return held.length ? `<div class="chips">${held.map((c) => `<span class="chip chip-gold">🏆 ${esc(c.name)}</span>`).join('')}</div>` : '';
}

// ---------- members ----------
function openMemberForm(id) {
  const m = id ? getMember(id) : null;
  formModal({
    title: m ? `Edit ${m.name}` : 'Add a league member',
    extraFooter: m ? `<button type="button" class="btn btn-ghost btn-danger-text" data-act="member-delete" data-id="${esc(m.id)}" data-close>Remove member</button>` : '',
    html: `
      <div class="grid-form">
        ${field('Name (Discord display name)', input('name', m ? m.name : '', 'required'))}
        ${field('Discord user ID', input('discordId', m ? m.discordId || '' : '', 'inputmode="numeric" placeholder="e.g. 123456789012345678"'), 'Lets the site @mention them. In Discord: Settings → Advanced → Developer Mode on, then right-click their name → Copy User ID.')}
        ${field('Gamertag / PSN / Steam name', input('gamertag', m ? m.gamertag || '' : ''))}
        ${field('Platform', `<select name="platform">${options(PLATFORMS, m ? m.platform : '', { empty: 'Choose…' })}</select>`)}
        ${field('Role', `<select name="role">${options(['Member', 'Commissioner', 'Co-commissioner'], m ? m.role : 'Member')}</select>`)}
        ${field('Joined', input('joined', m ? m.joined || '' : new Date().toISOString().slice(0, 10), 'type="date"'))}
      </div>`,
    onSubmit(v) {
      if (!v.name) { toast('Name is required', 'error'); return false; }
      if (v.discordId && !/^\d{15,21}$/.test(v.discordId)) { toast('Discord user IDs are 17–20 digits long', 'error'); return false; }
      const fields = { name: v.name, discordId: v.discordId, gamertag: v.gamertag, platform: v.platform, role: v.role, joined: v.joined };
      if (m) commit(() => Object.assign(m, fields));
      else commit((d) => d.members.push({ id: uid('mem'), ...fields }));
    },
  });
}

function membersTab() {
  const d = state.data;
  const recs = records(d, { season: d.league.season });
  if (!d.members.length) return emptyState('No members yet', isAdmin() ? 'Add the people in your Discord who play in the league.' : '');
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Member</th><th>Platform</th><th>Superstars</th><th class="num">Season</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
    <tbody>${d.members.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => {
      const mine = d.superstars.filter((s) => s.memberId === m.id);
      const tot = mine.reduce((t, s) => { const r = recordOf(recs, s.id); return { w: t.w + r.w, l: t.l + r.l, d: t.d + r.d }; }, { w: 0, l: 0, d: 0 });
      return `<tr>
        <td><strong>${esc(m.name)}</strong>${m.role && m.role !== 'Member' ? ` <span class="chip chip-muted">${esc(m.role)}</span>` : ''}${m.discordId ? '' : (isAdmin() ? ' <span class="chip chip-warn" title="Add their Discord ID so posts can @mention them">no Discord ID</span>' : '')}</td>
        <td>${m.platform ? esc(m.platform) : ''}${m.gamertag ? `<div class="mono small">${esc(m.gamertag)}</div>` : ''}</td>
        <td>${mine.map((s) => `<a href="#/superstar/${esc(s.id)}">${esc(s.name)}</a>`).join(', ') || '<span class="muted">—</span>'}</td>
        <td class="num mono">${formatRecord(tot)}</td>
        ${isAdmin() ? `<td class="num"><button class="btn btn-sm btn-ghost" data-act="member-edit" data-id="${esc(m.id)}">Edit</button></td>` : ''}
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

export const rosterView = {
  render(params) {
    if (params.tab) ui.tab = params.tab;
    const d = state.data;
    const tabs = [['superstars', `Superstars (${d.superstars.length})`], ['teams', `Tag teams & factions (${d.teams.length})`], ['members', `Members (${d.members.length})`]];
    let actions = '';
    if (isAdmin()) {
      if (ui.tab === 'superstars') actions = '<a class="btn btn-ghost" href="#/draft">Run a draft</a><button class="btn btn-ghost" data-act="ss-bulk">Add many</button><button class="btn btn-primary" data-act="ss-new">+ Superstar</button>';
      if (ui.tab === 'teams') actions = '<button class="btn btn-primary" data-act="team-new">+ Team</button>';
      if (ui.tab === 'members') actions = '<button class="btn btn-primary" data-act="member-new">+ Member</button>';
    }
    return `
      ${pageHead('Roster', 'Superstars, teams and the members who play them', actions)}
      <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" class="tab${ui.tab === id ? ' active' : ''}" aria-selected="${ui.tab === id}" data-act="roster-tab" data-tab="${id}">${esc(label)}</button>`).join('')}</div>
      ${ui.tab === 'teams' ? teamsTab() : ui.tab === 'members' ? membersTab() : superstarsTab()}`;
  },
  mount(root) {
    const q = root.querySelector('[data-input="roster-q"]');
    if (q && ui.focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    ui.focus = false;
  },
  onInput: {
    'roster-q': (el) => { ui.q = el.value; ui.focus = true; refresh(); },
  },
  onChange: {
    'roster-f': (el) => { ui[el.dataset.f] = el.value; refresh(); },
  },
  actions: {
    'roster-tab': (el) => { ui.tab = el.dataset.tab; if (location.hash.includes('tab=')) location.hash = '#/roster'; else refresh(); },
    'ss-new': () => openSuperstarForm(null),
    'ss-bulk': () => openBulkAdd(),
    'ss-edit': (el) => openSuperstarForm(el.dataset.id),
    'ss-delete': async (el) => {
      const s = getSuperstar(el.dataset.id);
      const inMatches = state.data.events.some((ev) => ev.card.some((seg) => (seg.sides || []).some((sd) => sd.ids.includes(s.id))));
      const msg = inMatches
        ? `<strong>${esc(s.name)}</strong> has matches on record. Deleting removes them from those matches and their title reigns. Setting their status to <em>Inactive</em> keeps history instead.`
        : `Delete <strong>${esc(s.name)}</strong>?`;
      if (!(await confirmDialog(msg, { okLabel: 'Delete', danger: true }))) return;
      commit((d) => {
        d.superstars = d.superstars.filter((x) => x.id !== s.id);
        for (const t of d.teams) t.superstarIds = t.superstarIds.filter((x) => x !== s.id);
        for (const ev of d.events) for (const seg of ev.card) {
          if (seg.kind === 'promo') seg.superstarIds = (seg.superstarIds || []).filter((x) => x !== s.id);
          else for (const sd of seg.sides) sd.ids = sd.ids.filter((x) => x !== s.id);
        }
        d.reigns = d.reigns.filter((r) => { r.holders = r.holders.filter((x) => x !== s.id); return r.holders.length; });
        for (const sl of d.storylines) sl.superstarIds = sl.superstarIds.filter((x) => x !== s.id);
      });
      location.hash = '#/roster';
      toast('Deleted');
    },
    'team-new': () => openTeamForm(null),
    'team-edit': (el) => openTeamForm(el.dataset.id),
    'team-delete': async (el) => {
      const t = getTeam(el.dataset.id);
      if (!(await confirmDialog(`Delete <strong>${esc(t.name)}</strong>? The superstars stay on the roster.`, { okLabel: 'Delete', danger: true }))) return;
      commit((d) => { d.teams = d.teams.filter((x) => x.id !== t.id); });
    },
    'member-new': () => openMemberForm(null),
    'member-edit': (el) => openMemberForm(el.dataset.id),
    'member-delete': async (el) => {
      const m = getMember(el.dataset.id);
      if (!(await confirmDialog(`Remove <strong>${esc(m.name)}</strong> from the league? Their superstars become unassigned.`, { okLabel: 'Remove', danger: true }))) return;
      commit((d) => {
        d.members = d.members.filter((x) => x.id !== m.id);
        for (const s of d.superstars) if (s.memberId === m.id) s.memberId = null;
      });
    },
  },
};

// ---------- superstar profile ----------
export const profileView = {
  render({ id }) {
    const d = state.data;
    const s = getSuperstar(id);
    if (!s) return emptyState('Superstar not found', '', '<a class="btn" href="#/roster">Back to roster</a>');
    const m = getMember(s.memberId);
    const season = records(d, { season: d.league.season });
    const all = records(d);
    const rs = recordOf(season, s.id), ra = recordOf(all, s.id);
    const belts = titlesHeldBy(d, s.id);
    const reigns = d.reigns.filter((r) => r.holders.includes(s.id)).sort((a, b) => (b.wonAt || '').localeCompare(a.wonAt || ''));
    const history = completedMatches(d).filter(({ seg }) => seg.sides.some((sd) => sd.ids.includes(s.id))).reverse();
    const upcoming = d.events.flatMap((ev) => ev.card.filter((seg) => seg.kind === 'match' && !seg.result && seg.sides.some((sd) => sd.ids.includes(s.id))).map((seg) => ({ ev, seg })));
    const stories = d.storylines.filter((sl) => sl.superstarIds.includes(s.id));
    const promos = d.promos.filter((p) => p.superstarId === s.id);
    const teams = d.teams.filter((t) => t.superstarIds.includes(s.id));
    const avg = ra.rated ? (ra.ratingSum / ra.rated) : 0;

    return `
      <a class="back" href="#/roster">← Roster</a>
      <section class="profile" style="--c:${esc(getBrand(s.brandId)?.color || '#6b7280')}">
        ${avatar(s, 'xl')}
        <div class="grow">
          <div class="chips">${brandChip(s.brandId)}<span class="chip chip-muted">${s.gender === 'F' ? "Women's" : "Men's"} division</span>${s.alignment ? `<span class="chip ${s.alignment === 'Heel' ? 'chip-bad' : s.alignment === 'Face' ? 'chip-good' : 'chip-muted'}">${esc(s.alignment)}</span>` : ''}${s.status && s.status !== 'Active' ? `<span class="chip chip-warn">${esc(s.status)}</span>` : ''}</div>
          <h1>${esc(s.name)}</h1>
          ${belts.length ? `<div class="chips">${belts.map((t) => `<a class="chip chip-gold" href="#/title/${esc(t.id)}">🏆 ${esc(t.name)}</a>`).join('')}</div>` : ''}
          ${(d.briefcases || []).some((b) => b.holder === s.id) || (d.royalty || []).some((r) => r.holder === s.id) || (d.hallOfFame || []).some((h) => h.superstarId === s.id) ? `<div class="chips">
            ${(d.briefcases || []).some((b) => b.holder === s.id) ? '<span class="chip chip-good">💼 Mr. Money in the Bank</span>' : ''}
            ${(d.royalty || []).filter((r) => r.holder === s.id).map((r) => `<span class="chip chip-gold">👑 ${esc(r.title)} (S${esc(r.season)})</span>`).join('')}
            ${(d.hallOfFame || []).some((h) => h.superstarId === s.id) ? '<span class="chip chip-gold">🏛️ Hall of Famer</span>' : ''}
          </div>` : ''}
          <dl class="facts">
            <div><dt>Played by</dt><dd>${m ? `${esc(m.name)}${m.gamertag ? ` · <span class="mono">${esc(m.gamertag)}</span>` : ''}${m.platform ? ` (${esc(m.platform)})` : ''}` : 'Unassigned'}</dd></div>
            ${s.overall ? `<div><dt>Overall</dt><dd>${esc(s.overall)}</dd></div>` : ''}
            ${s.finisher ? `<div><dt>Finisher</dt><dd>${esc(s.finisher)}</dd></div>` : ''}
            ${s.hometown ? `<div><dt>From</dt><dd>${esc(s.hometown)}</dd></div>` : ''}
            ${s.contractUntil ? `<div><dt>Contract</dt><dd>until ${esc(fmtDate(s.contractUntil))}</dd></div>` : ''}
            ${teams.length ? `<div><dt>Teams</dt><dd>${teams.map((t) => esc(t.name)).join(', ')}</dd></div>` : ''}
          </dl>
          ${s.bio ? `<p class="prose">${esc(s.bio).replace(/\n/g, '<br>')}</p>` : ''}
          ${isAdmin() ? `<div class="row gap"><button class="btn btn-sm btn-ghost" data-act="ss-edit" data-id="${esc(s.id)}">Edit</button><button class="btn btn-sm btn-ghost btn-danger-text" data-act="ss-delete" data-id="${esc(s.id)}">Delete</button></div>` : ''}
        </div>
      </section>

      <div class="stat-row">
        <div class="stat"><span class="stat-val">${formatRecord(rs)}</span><span class="stat-label">Season ${esc(d.league.season)}</span></div>
        <div class="stat"><span class="stat-val">${formatRecord(ra)}</span><span class="stat-label">All-time</span></div>
        <div class="stat"><span class="stat-val">${formatStreak(ra.streak)}</span><span class="stat-label">Streak</span></div>
        <div class="stat"><span class="stat-val">${ra.w + ra.l + ra.d ? Math.round(winPct(ra) * 100) : 0}%</span><span class="stat-label">Win rate</span></div>
        <div class="stat"><span class="stat-val">${reigns.length}</span><span class="stat-label">Title reigns</span></div>
        <div class="stat"><span class="stat-val">${avg ? avg.toFixed(2) : '—'}</span><span class="stat-label">Avg rating</span></div>
      </div>

      ${upcoming.length ? `<section class="card"><h2>Upcoming</h2><ul class="card-list">${upcoming.map(({ ev, seg }) => `<li><span class="eyebrow">${esc(ev.name)} · ${esc(matchName(seg))}</span><div>${seg.sides.map((sd) => esc(sideText(sd))).join(' <span class="vs">vs</span> ')}</div><a class="small" href="#/show/${esc(ev.id)}">Go to show →</a></li>`).join('')}</ul></section>` : ''}

      <section class="card">
        <h2>Match history</h2>
        ${history.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th></th><th>Match</th><th>Opponents</th><th>Show</th><th>Finish</th></tr></thead>
          <tbody>${history.map(({ ev, seg }) => {
            const r = seg.result;
            const mySide = seg.sides.findIndex((sd) => sd.ids.includes(s.id));
            const res = r.nc ? 'NC' : r.draw ? 'D' : Number(r.winnerSide) === mySide ? 'W' : 'L';
            const opps = seg.sides.filter((_, i) => i !== mySide).map((sd) => esc(sideText(sd))).join(', ');
            return `<tr><td><span class="wl wl-${res.toLowerCase()}">${res}</span></td><td>${esc(matchName(seg))}${seg.titleId ? ` <span title="${esc(getTitle(seg.titleId)?.name || '')}">🏆</span>` : ''}</td><td>${opps}</td><td><a href="#/show/${esc(ev.id)}">${esc(ev.name)}</a></td><td class="small">${esc(r.method || '')} ${r.rating ? `<span class="text-gold">${stars(r.rating)}</span>` : ''}</td></tr>`;
          }).join('')}</tbody></table></div>` : '<p class="muted">No matches yet.</p>'}
      </section>

      ${reigns.length ? `<section class="card"><h2>Title history</h2><ul class="card-list">${reigns.map((r) => `<li><a href="#/title/${esc(r.titleId)}"><strong>${esc(getTitle(r.titleId)?.name || 'Title')}</strong></a> — ${esc(fmtDate(r.wonAt))} to ${r.lostAt ? esc(fmtDate(r.lostAt)) : '<strong>present</strong>'} · ${plural(reignLength(r), 'day')} · ${plural(defenses(d, r.id), 'defense')}</li>`).join('')}</ul></section>` : ''}
      ${stories.length ? `<section class="card"><h2>Storylines</h2><ul class="card-list">${stories.map((sl) => `<li><a href="#/storylines">${esc(sl.title)}</a> <span class="chip chip-muted">${sl.status === 'concluded' ? 'Concluded' : 'Active'}</span></li>`).join('')}</ul></section>` : ''}
      ${promos.length ? `<section class="card"><h2>Promos</h2><ul class="card-list">${promos.map((p) => `<li><strong>${esc(p.title || 'Promo')}</strong> <span class="muted small">${esc(fmtDate(p.date))}</span><div class="muted small clamp">${esc(p.text || '')}</div></li>`).join('')}</ul></section>` : ''}`;
  },
};
