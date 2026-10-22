import { state, commit, refresh, uid, saveAdmin, replaceData, defaultLeague, DEFAULT_MATCH_TYPES, clone, markBackedUp } from './store.js';
import { endSeason } from './awards.js';
import { esc, options, field, input, textarea, formModal, confirmDialog, toast, pageHead, formValues } from './ui.js';
import { PURPOSES, validWebhook, sendWebhook, post, customMessage, awardsMessage } from './discord.js';

const ui = { tab: 'league' };
const TABS = [
  ['league', 'League'], ['brands', 'Brands'], ['rules', 'Scoring & match types'],
  ['discord', 'Discord'], ['backup', 'Backup & seasons'],
];

function leagueTab() {
  const L = state.data.league;
  return `<form class="form card" data-form="league">
    <div class="grid-form">
      ${field('League name', input('name', L.name, 'required'))}
      ${field('Short name', input('shortName', L.shortName, 'maxlength="8"'), 'Shown in the logo badge when there is no logo.')}
      ${field('Tagline', input('tagline', L.tagline))}
      ${field('Current season', input('season', L.season, 'type="number" min="1"'))}
      ${field('Logo image URL', input('logoUrl', L.logoUrl, 'type="url" placeholder="https://…"'), 'Also used as the avatar on Discord posts (must be https).')}
      ${field('Discord invite link', input('discordInvite', L.discordInvite, 'type="url" placeholder="https://discord.gg/…"'))}
    </div>
    ${field('League rules', textarea('rules', L.rules, 'rows="6" placeholder="Match settings, difficulty, how to submit results, deadlines, sportsmanship…"'), 'Shown on the home page.')}
    <button class="btn btn-primary" type="submit">Save league info</button>
  </form>`;
}

function brandsTab() {
  const d = state.data;
  return `<section class="card">
    <p class="muted">Brands split your roster and shows (Raw, SmackDown, NXT, or make up your own). The order here is the draft pick order.</p>
    <div class="list">${d.brands.map((b, i) => `
      <div class="list-item">
        <span class="swatch" style="background:${esc(b.color)}"></span>
        <strong class="grow">${esc(b.name)}</strong>
        <span class="muted small">${d.superstars.filter((s) => s.brandId === b.id).length} superstars</span>
        <button class="icon-btn" data-act="brand-move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="icon-btn" data-act="brand-move" data-i="${i}" data-dir="1" ${i === d.brands.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button class="btn btn-sm btn-ghost" data-act="brand-edit" data-id="${esc(b.id)}">Edit</button>
      </div>`).join('')}</div>
    <button class="btn btn-primary" data-act="brand-new">+ Brand</button>
  </section>`;
}

function rulesTab() {
  const s = state.data.settings;
  return `<form class="form card" data-form="rules">
    <h2>Points</h2>
    <div class="grid-form">
      ${field('Points for a win', input('win', s.points.win, 'type="number"'))}
      ${field('Points for a draw', input('draw', s.points.draw, 'type="number"'))}
      ${field('Points for a loss', input('loss', s.points.loss, 'type="number"'))}
      ${field('Champion bonus (power rankings)', input('champBonus', s.champBonus, 'type="number"'))}
      ${field('Recent-form window (matches)', input('formMatches', s.formMatches, 'type="number" min="1"'))}
      ${field('Min. matches for win % board', input('minMatchesForPct', s.minMatchesForPct, 'type="number" min="1"'))}
      ${field('Default days to play matches', input('defaultDeadlineDays', s.defaultDeadlineDays, 'type="number" min="0"'))}
    </div>
    <h2>Match types</h2>
    ${field('One per line', textarea('matchTypes', s.matchTypes.join('\n'), 'rows="10"'), 'Pre-filled with the WWE 2K26 match types. Add your own if you like.')}
    <div class="row gap wrap"><button class="btn btn-primary" type="submit">Save</button><button class="btn btn-ghost" type="button" data-act="rules-reset-types">Reset to 2K26 defaults</button></div>
  </form>`;
}

function discordTab() {
  const a = state.admin;
  const hooks = a.webhooks || [];
  return `
    <section class="card">
      <h2>Channels</h2>
      <p class="muted">Each Discord channel you post to needs a <strong>webhook</strong>. In Discord: <em>Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL</em>. Webhook links are stored only on this device, never in the public league file.</p>
      ${hooks.length ? `<div class="list">${hooks.map((h) => `
        <div class="list-item">
          <div class="grow"><strong># ${esc(h.name)}</strong><div class="muted small">${(h.purposes || []).map((p) => esc(PURPOSES.find((x) => x.id === p)?.label || p)).join(' · ') || 'Not the default for anything'}</div></div>
          <button class="btn btn-sm btn-ghost" data-act="hook-test" data-id="${esc(h.id)}">Test</button>
          <button class="btn btn-sm btn-ghost" data-act="hook-edit" data-id="${esc(h.id)}">Edit</button>
        </div>`).join('')}</div>` : '<p>No channels yet.</p>'}
      <button class="btn btn-primary" data-act="hook-new">+ Add channel</button>
    </section>
    <form class="form card" data-form="discord">
      <h2>Posting options</h2>
      ${field('Bot display name', input('botName', a.botName || '', `placeholder="${esc(state.data.league.name)}"`), 'Name shown on posts. The league logo is used as its avatar.')}
      <label class="check"><input type="checkbox" name="pingMembers" ${a.pingMembers !== false ? 'checked' : ''}> Ping members when their matches are booked or they win a title (you can still switch it off per post)</label>
      <button class="btn btn-primary" type="submit">Save</button>
    </form>
    <section class="card">
      <h2>Make an announcement</h2>
      <button class="btn btn-ghost" data-act="announce">Write an announcement…</button>
    </section>`;
}

function backupTab() {
  const d = state.data;
  return `
    <section class="card">
      <h2>Backup & moving devices</h2>
      <p>Your league is saved in <strong>this browser on this device</strong>. Download a backup now and then. It's your safety net if the browser's data gets cleared, and it's how you move your league to another phone or computer (download here, then restore there).</p>
      <p class="muted small">${state.lastBackup ? `Last backup: ${esc(new Date(state.lastBackup).toLocaleDateString())}.` : 'You haven\'t downloaded a backup yet.'}</p>
      <div class="row gap wrap">
        <button class="btn btn-primary" data-act="backup-export">Download backup</button>
        <label class="btn btn-ghost">Restore a backup<input type="file" accept="application/json,.json" data-change="backup-import" hidden></label>
      </div>
    </section>
    <section class="card">
      <h2>Seasons</h2>
      <p>Current season: <strong>${esc(d.league.season)}</strong>. Starting a new season locks in this season's <a href="#/awards">awards</a> and resets standings and power rankings. All-time stats and title histories are kept, and champions keep their belts.</p>
      <button class="btn btn-primary" data-act="season-new">Start Season ${Number(d.league.season) + 1}</button>
    </section>
    <section class="card">
      <h2>Demo & starting over</h2>
      <p class="muted">Load a sample league to try everything out, or wipe this device's league and set up a new one. Download a backup first if you want to keep your current league.</p>
      <div class="row gap wrap">
        <button class="btn btn-ghost" data-act="demo-load">Load demo league</button>
        <button class="btn btn-ghost btn-danger-text" data-act="league-reset">Start a new league</button>
      </div>
    </section>`;
}

function openBrandForm(id) {
  const b = id ? state.data.brands.find((x) => x.id === id) : null;
  formModal({
    title: b ? `Edit ${b.name}` : 'Add a brand',
    html: `<div class="grid-form">${field('Name', input('name', b ? b.name : '', 'required'))}${field('Color', input('color', b ? b.color : '#9333ea', 'type="color"'))}</div>`,
    extraFooter: b ? `<button type="button" class="btn btn-ghost btn-danger-text" data-act="brand-delete" data-id="${esc(b.id)}" data-close>Delete</button>` : '',
    onSubmit(v) {
      if (!v.name) { toast('Name is required', 'error'); return false; }
      if (b) commit(() => { b.name = v.name; b.color = v.color; });
      else commit((d) => d.brands.push({ id: uid('brand'), name: v.name, color: v.color }));
    },
  });
}

function openHookForm(id) {
  const hooks = state.admin.webhooks || [];
  const h = id ? hooks.find((x) => x.id === id) : null;
  const taken = new Set(hooks.filter((x) => x !== h).flatMap((x) => x.purposes || []));
  formModal({
    title: h ? `Edit #${h.name}` : 'Add a Discord channel',
    html: `
      ${field('Channel name (just a label)', input('name', h ? h.name : '', 'required placeholder="e.g. results"'))}
      ${field('Webhook URL', `<input name="url" type="password" value="${esc(h ? h.url : '')}" placeholder="https://discord.com/api/webhooks/…" autocomplete="off">`)}
      <fieldset class="field"><legend class="field-label">Use this channel by default for</legend>
        ${PURPOSES.map((p) => `<label class="check"><input type="checkbox" name="purposes" value="${p.id}" data-multi ${(h ? (h.purposes || []).includes(p.id) : !taken.has(p.id)) ? 'checked' : ''}> ${esc(p.label)}</label>`).join('')}
      </fieldset>`,
    extraFooter: h ? `<button type="button" class="btn btn-ghost btn-danger-text" data-act="hook-delete" data-id="${esc(h.id)}" data-close>Remove</button>` : '',
    onSubmit(v) {
      if (!v.name) { toast('Give it a name', 'error'); return false; }
      if (!validWebhook(v.url)) { toast('That is not a Discord webhook URL. It should start with https://discord.com/api/webhooks/', 'error', 6000); return false; }
      const entry = { id: h ? h.id : uid('hook'), name: v.name.replace(/^#/, ''), url: v.url.trim(), purposes: v.purposes || [] };
      // a purpose can only have one default channel
      const others = hooks.filter((x) => x.id !== entry.id).map((x) => ({ ...x, purposes: (x.purposes || []).filter((p) => !entry.purposes.includes(p)) }));
      saveAdmin({ webhooks: h ? hooks.map((x) => (x.id === h.id ? entry : others.find((o) => o.id === x.id))) : [...others, entry] });
      toast('Channel saved — tap Test to check it');
    },
  });
}

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export default {
  render(params) {
    if (params.tab && params.tab !== ui.lastParam) { ui.tab = params.tab; ui.lastParam = params.tab; }
    const body = { league: leagueTab, brands: brandsTab, rules: rulesTab, discord: discordTab, backup: backupTab }[ui.tab] || leagueTab;
    return `
      ${pageHead('Settings')}
      <div class="tabs scroll" role="tablist">${TABS.map(([id, label]) => `<button class="tab${ui.tab === id ? ' active' : ''}" role="tab" data-act="set-tab" data-tab="${id}">${esc(label)}${id === 'discord' && !(state.admin.webhooks || []).length ? ' <span class="dot-warn"></span>' : ''}</button>`).join('')}</div>
      ${body()}`;
  },
  mount(root) {
    root.querySelectorAll('form[data-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formValues(form);
        const kind = form.dataset.form;
        if (kind === 'league') {
          if (!v.name) { toast('League name is required', 'error'); return; }
          commit((d) => { Object.assign(d.league, { ...v, season: Number(v.season) || d.league.season }); });
          toast('League info saved');
        } else if (kind === 'rules') {
          const types = v.matchTypes.split('\n').map((x) => x.trim()).filter(Boolean);
          commit((d) => {
            d.settings.points = { win: Number(v.win) || 0, draw: Number(v.draw) || 0, loss: Number(v.loss) || 0 };
            Object.assign(d.settings, { champBonus: Number(v.champBonus) || 0, formMatches: Number(v.formMatches) || 5, minMatchesForPct: Number(v.minMatchesForPct) || 1, defaultDeadlineDays: Number(v.defaultDeadlineDays) || 0, matchTypes: types.length ? [...new Set(types)] : [...DEFAULT_MATCH_TYPES] });
          });
          toast('Saved');
        } else if (kind === 'discord') {
          saveAdmin({ botName: v.botName, pingMembers: !!v.pingMembers });
          toast('Saved');
        }
      });
    });
  },
  onChange: {
    'backup-import': (el) => {
      const file = el.files && el.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object' || !data.league) throw new Error('This file is not a league backup.');
          if (!(await confirmDialog('Replace the league on this device with this backup?', { okLabel: 'Restore', danger: true }))) return;
          data.league.setupDone = true;
          replaceData(data);
          toast('Backup restored');
        } catch (e) { toast(e.message || 'Could not read that file', 'error'); }
      };
      reader.readAsText(file);
      el.value = '';
    },
  },
  actions: {
    'set-tab': (el) => { ui.tab = el.dataset.tab; if (location.hash.includes('?')) location.hash = '#/settings'; else refresh(); },
    'brand-new': () => openBrandForm(null),
    'brand-edit': (el) => openBrandForm(el.dataset.id),
    'brand-move': (el) => {
      const i = Number(el.dataset.i), j = i + Number(el.dataset.dir);
      commit((d) => { [d.brands[i], d.brands[j]] = [d.brands[j], d.brands[i]]; });
    },
    'brand-delete': async (el) => {
      const b = state.data.brands.find((x) => x.id === el.dataset.id);
      if (!(await confirmDialog(`Delete <strong>${esc(b.name)}</strong>? Its superstars become free agents.`, { okLabel: 'Delete', danger: true }))) return;
      commit((d) => {
        d.brands = d.brands.filter((x) => x.id !== b.id);
        for (const s of d.superstars) if (s.brandId === b.id) s.brandId = null;
        for (const t of d.teams) if (t.brandId === b.id) t.brandId = null;
        for (const t of d.championships) if (t.brandId === b.id) t.brandId = null;
        for (const ev of d.events) if (ev.brandId === b.id) ev.brandId = null;
      });
    },
    'rules-reset-types': () => { commit((d) => { d.settings.matchTypes = [...DEFAULT_MATCH_TYPES]; }); toast('Match types reset'); },
    'hook-new': () => openHookForm(null),
    'hook-edit': (el) => openHookForm(el.dataset.id),
    'hook-delete': (el) => saveAdmin({ webhooks: (state.admin.webhooks || []).filter((h) => h.id !== el.dataset.id) }),
    'hook-test': async (el) => {
      const h = state.admin.webhooks.find((x) => x.id === el.dataset.id);
      el.disabled = true;
      try {
        await sendWebhook(h.url, { username: state.admin.botName || state.data.league.name, content: `✅ **${state.data.league.name}** is connected to this channel.`, allowed_mentions: { parse: [] } });
        toast(`Test message sent to #${h.name}`);
      } catch (e) { toast(e.message === 'Failed to fetch' ? 'Could not reach Discord — check the URL and your connection.' : e.message, 'error', 7000); }
      finally { el.disabled = false; }
    },
    announce: () => {
      formModal({
        title: 'Announcement',
        html: `
          ${field('Title', input('title', '', 'required placeholder="e.g. WrestleMania card revealed!"'))}
          ${field('Message', textarea('body', '', 'rows="6" placeholder="Supports **bold** and _italics_."'))}
          <div class="grid-form">${field('Color', input('color', '#e3242b', 'type="color"'))}${field('Image URL (optional)', input('imageUrl', '', 'type="url"'))}</div>
          <label class="check"><input type="checkbox" name="everyone"> Ping @everyone</label>`,
        submitLabel: 'Preview',
        onSubmit(v) { setTimeout(() => post(customMessage(v)), 50); },
      });
    },
    'season-new': async () => {
      const next = Number(state.data.league.season) + 1;
      if (!(await confirmDialog(`End this season and start <strong>Season ${next}</strong>? The season's awards get locked in (see the Awards page), and standings reset.`, { okLabel: `Start Season ${next}` }))) return;
      const { season, list } = endSeason();
      toast(`Season ${next} has begun! Season ${season} awards are on the Awards page.`, 'ok', 5000);
      setTimeout(() => post(awardsMessage(season, list, false)), 60);
    },
    'backup-export': () => {
      const name = (state.data.league.shortName || 'league').replace(/[^\w-]+/g, '-').toLowerCase();
      download(`${name}-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state.data, null, 2));
      markBackedUp();
      refresh();
      toast('Backup downloaded. Keep the file somewhere safe.');
    },
    'demo-load': async () => {
      if (!(await confirmDialog('Replace the league on this device with the demo league? Download a backup first if you want to keep yours.', { okLabel: 'Load demo', danger: true }))) return;
      try {
        const res = await fetch(`demo.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('demo.json was not found next to index.html');
        replaceData(await res.json());
        toast('Demo league loaded — click around!');
        location.hash = '#/';
      } catch (e) { toast(e.message, 'error'); }
    },
    'league-reset': async () => {
      if (!(await confirmDialog('Delete this device\'s league and start a new one? This can\'t be undone unless you have a backup.', { okLabel: 'Start a new league', danger: true }))) return;
      replaceData(clone(defaultLeague()));
      location.hash = '#/setup';
    },
  },
};
