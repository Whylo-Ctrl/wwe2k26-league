// Discord: build announcement messages and post them through channel webhooks.
// Webhook URLs are secrets — they are stored only in this browser (never in league.json).

import { state, getSuperstar, getMember, getBrand, getTitle, getEvent, commit } from './store.js';
import { matchName, hasResult, currentReign, reignLength, defenses, reignsFor, formatRecord, formatStreak, powerRankings, standings, pendingMatches, plural } from './stats.js';
import { esc, fmtDate, stars, sideText, holderText, openModal, toast, copyText, safeUrl, options } from './ui.js';

export const PURPOSES = [
  { id: 'cards', label: 'Match cards & shows' },
  { id: 'results', label: 'Results' },
  { id: 'titles', label: 'Title changes & champions' },
  { id: 'rankings', label: 'Standings & power rankings' },
  { id: 'news', label: 'News: draft, storylines, promos, announcements' },
];

const GOLD = 0xf5c542;
const RED = 0xe3242b;

const trunc = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const hexToInt = (hex) => { const n = parseInt(String(hex || '').replace('#', ''), 16); return Number.isFinite(n) ? n : RED; };
const brandInt = (brandId) => { const b = getBrand(brandId); return b ? hexToInt(b.color) : RED; };

function memberTag(superstarId) {
  const s = getSuperstar(superstarId);
  const m = s && getMember(s.memberId);
  if (!m) return '';
  return /^\d{15,21}$/.test(m.discordId || '') ? `<@${m.discordId}>` : `@${m.name}`;
}
function pingIdsFor(superstarIds) {
  const ids = new Set();
  for (const sid of superstarIds) {
    const s = getSuperstar(sid);
    const m = s && getMember(s.memberId);
    if (m && /^\d{15,21}$/.test(m.discordId || '')) ids.add(m.discordId);
  }
  return [...ids];
}
function sideWithTags(side) {
  if (!side || !side.ids.length) return 'TBD';
  const names = sideText(side);
  const tags = side.ids.map(memberTag).filter(Boolean);
  return tags.length ? `**${names}** (${[...new Set(tags)].join(', ')})` : `**${names}**`;
}
function footer() {
  const L = state.data.league;
  return { text: trunc(`${L.name} · Season ${L.season}`, 2048) };
}
function base() {
  const L = state.data.league;
  const p = { username: trunc(state.admin.botName || L.name || 'League Bot', 80) };
  const logo = safeUrl(L.logoUrl);
  if (logo && /^https:/.test(logo)) p.avatar_url = logo;
  return p;
}
function withPings(payload, ping, ids, lead) {
  if (ping && ids.length) {
    payload.content = trunc(`${lead ? `${lead} ` : ''}${ids.map((i) => `<@${i}>`).join(' ')}`, 2000);
    payload.allowed_mentions = { parse: [], users: ids.slice(0, 100) };
  } else {
    if (lead) payload.content = lead;
    payload.allowed_mentions = { parse: [] };
  }
  return payload;
}
// Split long field lists into several embeds/messages that fit Discord limits.
function embedsFromFields(head, fields) {
  const embeds = [];
  let cur = { ...head, fields: [] }, size = (head.title || '').length + (head.description || '').length;
  for (const f of fields) {
    const fsize = f.name.length + f.value.length;
    if (cur.fields.length >= 25 || size + fsize > 5500) {
      embeds.push(cur);
      cur = { color: head.color, fields: [] };
      size = 0;
    }
    cur.fields.push(f); size += fsize;
  }
  embeds.push(cur);
  return embeds;
}
function payloadsFromEmbeds(embeds, first = {}) {
  // one embed per message keeps every message safely under the 6000-char total
  return embeds.map((e, i) => ({ ...base(), ...(i === 0 ? first : { allowed_mentions: { parse: [] } }), embeds: [e] }));
}

// ---------- message builders ----------
function resultLine(seg) {
  const r = seg.result;
  if (!r || !hasResult(seg)) return 'Not played yet';
  let line;
  if (r.nc) line = `No contest — ${seg.sides.filter((s) => s.ids.length).map((s) => sideText(s)).join(' vs ')}`;
  else if (r.draw) line = `Draw — ${seg.sides.filter((s) => s.ids.length).map((s) => sideText(s)).join(' vs ')}`;
  else {
    const w = Number(r.winnerSide);
    const losers = seg.sides.filter((s, i) => i !== w && s.ids.length).map((s) => sideText(s));
    line = `**${sideText(seg.sides[w])}** def. ${losers.join(', ') || 'TBD'}`;
  }
  const extra = [r.method && !r.nc && !r.draw ? `via ${r.method}` : '', r.rating ? stars(r.rating) : ''].filter(Boolean).join(' · ');
  if (extra) line += `\n${extra}`;
  if (seg.titleId) {
    const t = getTitle(seg.titleId);
    if (r.titleChange) line += `\n👑 **AND NEW ${t ? t.name : 'Champion'}!**`;
    else if (r.retainedReignId) line += `\n🏆 Retained the ${t ? t.name : 'title'}`;
  }
  if (r.link && safeUrl(r.link)) line += `\n[Watch](${safeUrl(r.link)})`;
  return line;
}

function segHeading(seg, i) {
  if (seg.kind === 'promo') return `${i + 1}. 🎤 ${seg.title || 'Promo segment'}`;
  const t = seg.titleId && getTitle(seg.titleId);
  return `${i + 1}. ${matchName(seg)}${t ? ` — 🏆 ${t.name}` : ''}`;
}

export function cardMessage(ev) {
  const brand = getBrand(ev.brandId);
  const allIds = ev.card.filter((s) => s.kind === 'match').flatMap((s) => s.sides.flatMap((x) => x.ids));
  return {
    title: `Match card: ${ev.name}`,
    purpose: 'cards',
    canPing: pingIdsFor(allIds).length > 0,
    build({ ping }) {
      const fields = ev.card.map((seg, i) => {
        let value;
        if (seg.kind === 'promo') value = [seg.superstarIds && seg.superstarIds.length ? seg.superstarIds.map((id) => getSuperstar(id)?.name || '?').join(', ') : '', seg.text ? trunc(seg.text, 300) : ''].filter(Boolean).join('\n') || 'Segment';
        else {
          value = seg.sides.filter((s) => s.ids.length).map(sideWithTags).join('\n**vs**\n') || 'TBD';
          if (seg.stipulation) value += `\n_${seg.stipulation}_`;
          const dl = seg.deadline || ev.deadline;
          if (dl && !hasResult(seg)) value += `\n⏰ Play by **${fmtDate(dl, { weekday: true })}**`;
        }
        return { name: trunc(segHeading(seg, i), 256), value: trunc(value, 1024) };
      });
      const desc = [`**${ev.type === 'ple' ? 'Premium Live Event' : 'Weekly show'}**${brand ? ` · ${brand.name}` : ''}${ev.date ? ` · ${fmtDate(ev.date, { weekday: true })}` : ''}`, ev.notes || ''].filter(Boolean).join('\n\n');
      const head = { title: trunc(`${ev.type === 'ple' ? '🔥' : '📺'} ${ev.name} — Match Card`, 256), description: trunc(desc, 4096), color: brandInt(ev.brandId), footer: footer() };
      const poster = safeUrl(ev.posterUrl);
      if (poster && /^https:/.test(poster)) head.image = { url: poster };
      const embeds = embedsFromFields(head, fields.length ? fields : [{ name: 'Card', value: 'To be announced' }]);
      const first = withPings({}, ping, pingIdsFor(allIds), ping ? `**${ev.name}** card is up! Get your matches in:` : '');
      const text = [`**${ev.name} — Match Card**`, desc, '', ...fields.map((f) => `**${f.name}**\n${f.value}\n`)].join('\n');
      return { payloads: payloadsFromEmbeds(embeds, first), text };
    },
  };
}

export function resultsMessage(ev) {
  return {
    title: `Results: ${ev.name}`,
    purpose: 'results',
    canPing: false,
    build() {
      const fields = ev.card.filter((s) => s.kind === 'match').map((seg, i) => ({ name: trunc(segHeading(seg, i), 256), value: trunc(resultLine(seg), 1024) }));
      const head = { title: trunc(`📣 ${ev.name} — Results`, 256), description: ev.date ? fmtDate(ev.date, { weekday: true }) : '', color: brandInt(ev.brandId), footer: footer() };
      const embeds = embedsFromFields(head, fields.length ? fields : [{ name: 'Results', value: 'No matches yet' }]);
      const text = [`**${ev.name} — Results**`, '', ...fields.map((f) => `**${f.name}**\n${f.value}\n`)].join('\n');
      return { payloads: payloadsFromEmbeds(embeds, { allowed_mentions: { parse: [] } }), text };
    },
  };
}

export function singleResultMessage(ev, seg) {
  return {
    title: `Result: ${matchName(seg)}`,
    purpose: 'results',
    canPing: pingIdsFor(seg.sides.flatMap((s) => s.ids)).length > 0,
    build({ ping }) {
      const t = seg.titleId && getTitle(seg.titleId);
      const embed = {
        title: trunc(`${seg.result && seg.result.titleChange ? '👑' : '✅'} ${matchName(seg)}${t ? ` — ${t.name}` : ''}`, 256),
        description: trunc(`${resultLine(seg)}\n\n_${ev.name}${ev.date ? ` · ${fmtDate(ev.date)}` : ''}_${seg.result && seg.result.notes ? `\n\n${seg.result.notes}` : ''}`, 4096),
        color: seg.result && seg.result.titleChange ? GOLD : brandInt(ev.brandId),
        footer: footer(),
      };
      const payload = withPings({ ...base(), embeds: [embed] }, ping, pingIdsFor(seg.sides.flatMap((s) => s.ids)), '');
      return { payloads: [payload], text: `**${embed.title}**\n${embed.description}` };
    },
  };
}

export function titleChangeMessage(reign) {
  const t = getTitle(reign.titleId);
  const ev = getEvent(reign.wonEventId);
  const prev = reignsFor(state.data, reign.titleId).find((r) => r.lostMatchId && r.lostMatchId === reign.wonMatchId);
  const holderReigns = state.data.reigns.filter((r) => r.titleId === reign.titleId && r.holders.join() === reign.holders.join()).length;
  return {
    title: `New champion: ${t ? t.name : ''}`,
    purpose: 'titles',
    canPing: pingIdsFor(reign.holders).length > 0,
    build({ ping }) {
      const embed = {
        title: trunc(`👑 AND NEW ${t ? t.name.toUpperCase() : 'CHAMPION'}!`, 256),
        description: trunc(`**${holderText(reign)}** ${prev ? `defeated **${holderText(prev)}**` : 'won the vacant title'}${ev ? ` at **${ev.name}**` : ''}!`, 4096),
        color: GOLD,
        fields: [
          ...(prev ? [{ name: 'Previous reign', value: `${holderText(prev)} — ${plural(reignLength(prev), 'day')}, ${plural(defenses(state.data, prev.id), 'defense')}`, inline: false }] : []),
          { name: 'Reign', value: `#${holderReigns}`, inline: true },
          ...(reign.wonAt ? [{ name: 'Date', value: fmtDate(reign.wonAt), inline: true }] : []),
        ],
        footer: footer(),
      };
      const img = t && safeUrl(t.imageUrl);
      if (img && /^https:/.test(img)) embed.thumbnail = { url: img };
      const payload = withPings({ ...base(), embeds: [embed] }, ping, pingIdsFor(reign.holders), '');
      return { payloads: [payload], text: `**${embed.title}**\n${embed.description}` };
    },
  };
}

export function championsMessage() {
  const d = state.data;
  return {
    title: 'Current champions',
    purpose: 'titles',
    canPing: false,
    build() {
      const fields = d.championships.filter((t) => !t.retired).map((t) => {
        const r = currentReign(d, t.id);
        const b = getBrand(t.brandId);
        return {
          name: trunc(`🏆 ${t.name}${b ? ` (${b.name})` : ''}`, 256),
          value: r ? `**${holderText(r)}**\n${plural(reignLength(r), 'day')} · ${plural(defenses(d, r.id), 'defense')}` : '_Vacant_',
        };
      });
      const head = { title: '🏆 Current Champions', color: GOLD, footer: footer() };
      const embeds = embedsFromFields(head, fields.length ? fields : [{ name: 'Titles', value: 'No championships yet' }]);
      return { payloads: payloadsFromEmbeds(embeds, { allowed_mentions: { parse: [] } }), text: ['**Current Champions**', ...fields.map((f) => `${f.name}\n${f.value}\n`)].join('\n') };
    },
  };
}

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

export function standingsMessage({ season, brandId } = {}) {
  const d = state.data;
  const b = getBrand(brandId);
  return {
    title: `Standings${b ? ` — ${b.name}` : ''}`,
    purpose: 'rankings',
    canPing: false,
    build() {
      const rows = standings(d, { season, brandId }).filter((r) => r.rec.matches).slice(0, 25);
      const lines = rows.map((r, i) => `${pad(i + 1, 3)}${pad(r.s.name, 20)} ${pad(formatRecord(r.rec), 7)} ${pad(r.pts, 4)} ${formatStreak(r.rec.streak)}`);
      const table = `\`\`\`\n${pad('#', 3)}${pad('Superstar', 20)} ${pad('W-L', 7)} ${pad('Pts', 4)} Strk\n${lines.join('\n') || 'No matches yet'}\n\`\`\``;
      const embed = { title: trunc(`📊 ${season ? `Season ${season}` : 'All-Time'} Standings${b ? ` — ${b.name}` : ''}`, 256), description: trunc(table, 4096), color: b ? hexToInt(b.color) : RED, footer: footer() };
      return { payloads: [{ ...base(), embeds: [embed], allowed_mentions: { parse: [] } }], text: `**${embed.title}**\n${table}` };
    },
  };
}

export function powerRankingsMessage(onSent) {
  const d = state.data;
  const prev = (d.prHistory && d.prHistory.ids) || [];
  return {
    title: 'Power rankings',
    purpose: 'rankings',
    canPing: false,
    onSent,
    build() {
      const rows = powerRankings(d, { season: d.league.season, limit: 10 });
      const lines = rows.map((r, i) => {
        const was = prev.indexOf(r.s.id);
        const move = was === -1 ? '🆕' : was > i ? `🔺${was - i}` : was < i ? `🔻${i - was}` : '➖';
        return `**${i + 1}. ${r.s.name}**${r.champ ? ' 🏆' : ''} ${move}\n${formatRecord(r.rec)} · ${formatStreak(r.rec.streak)} · ${r.score} pts`;
      });
      const embed = { title: `⚡ Power Rankings — Season ${d.league.season}`, description: trunc(lines.join('\n\n') || 'No matches yet', 4096), color: RED, footer: footer() };
      return { payloads: [{ ...base(), embeds: [embed], allowed_mentions: { parse: [] } }], text: `**${embed.title}**\n\n${lines.join('\n\n')}` };
    },
  };
}

export function remindersMessage() {
  const d = state.data;
  const list = pendingMatches(d).filter(({ seg, ev }) => seg.deadline || ev.deadline);
  const allIds = list.flatMap(({ seg }) => seg.sides.flatMap((s) => s.ids));
  return {
    title: 'Match deadline reminders',
    purpose: 'cards',
    canPing: pingIdsFor(allIds).length > 0,
    build({ ping }) {
      const fields = list.map(({ ev, seg }) => ({
        name: trunc(`${ev.name}: ${matchName(seg)}`, 256),
        value: trunc(`${seg.sides.filter((s) => s.ids.length).map(sideWithTags).join(' vs ')}\n⏰ Due **${fmtDate(seg.deadline || ev.deadline, { weekday: true })}**`, 1024),
      }));
      const head = { title: '⏰ Matches Still To Play', description: 'Play these online and submit your result on the league site.', color: 0xf59e0b, footer: footer() };
      const embeds = embedsFromFields(head, fields.length ? fields : [{ name: 'All caught up', value: 'No pending matches with deadlines.' }]);
      const first = withPings({}, ping, pingIdsFor(allIds), ping ? 'Reminder — these matches are due:' : '');
      return { payloads: payloadsFromEmbeds(embeds, first), text: ['**Matches Still To Play**', ...fields.map((f) => `**${f.name}**\n${f.value}\n`)].join('\n') };
    },
  };
}

export function draftPickMessage(draft, pick) {
  const s = getSuperstar(pick.superstarId);
  const b = getBrand(pick.brandId);
  return {
    title: `Draft pick #${pick.n}`,
    purpose: 'news',
    canPing: s ? pingIdsFor([s.id]).length > 0 : false,
    build({ ping }) {
      const embed = {
        title: trunc(`🎟️ ${draft.name} — Pick #${pick.n}`, 256),
        description: `With pick #${pick.n} (round ${pick.round}), **${b ? b.name : 'TBD'}** selects…\n\n# ${s ? s.name : '?'}`,
        color: b ? hexToInt(b.color) : RED,
        footer: footer(),
      };
      const img = s && safeUrl(s.imageUrl);
      if (img && /^https:/.test(img)) embed.thumbnail = { url: img };
      const payload = withPings({ ...base(), embeds: [embed] }, ping, s ? pingIdsFor([s.id]) : [], '');
      return { payloads: [payload], text: `**${embed.title}**\n${embed.description}` };
    },
  };
}

export function draftResultsMessage(draft) {
  return {
    title: `Draft results: ${draft.name}`,
    purpose: 'news',
    canPing: false,
    build() {
      const fields = draft.brandIds.map((bid) => {
        const b = getBrand(bid);
        const picks = draft.picks.filter((p) => p.brandId === bid && p.superstarId);
        return { name: b ? b.name : 'Brand', value: trunc(picks.map((p) => `#${p.n} ${getSuperstar(p.superstarId)?.name || '?'}`).join('\n') || '—', 1024), inline: true };
      });
      const embed = { title: trunc(`🎟️ ${draft.name} — Full Results`, 256), color: RED, fields, footer: footer() };
      return { payloads: [{ ...base(), embeds: [embed], allowed_mentions: { parse: [] } }], text: [`**${embed.title}**`, ...fields.map((f) => `**${f.name}**\n${f.value}\n`)].join('\n') };
    },
  };
}

export function storylineMessage(sl, update) {
  const ids = sl.superstarIds || [];
  return {
    title: `Storyline: ${sl.title}`,
    purpose: 'news',
    canPing: pingIdsFor(ids).length > 0,
    build({ ping }) {
      const embed = {
        title: trunc(`📖 ${sl.title}`, 256),
        description: trunc(update ? `**Update — ${fmtDate(update.date)}**\n${update.text}` : sl.summary || '', 4096),
        color: 0x8b5cf6,
        fields: ids.length ? [{ name: 'Involved', value: trunc(ids.map((id) => `${getSuperstar(id)?.name || '?'}${memberTag(id) ? ` (${memberTag(id)})` : ''}`).join('\n'), 1024) }] : [],
        footer: footer(),
      };
      const payload = withPings({ ...base(), embeds: [embed] }, ping, pingIdsFor(ids), '');
      return { payloads: [payload], text: `**${embed.title}**\n${embed.description}` };
    },
  };
}

export function promoMessage(p) {
  const s = getSuperstar(p.superstarId);
  const ev = getEvent(p.eventId);
  return {
    title: `Promo: ${p.title || (s ? s.name : '')}`,
    purpose: 'news',
    canPing: false,
    build() {
      const embed = {
        author: { name: s ? s.name : 'Promo' },
        title: trunc(`🎤 ${p.title || 'Promo'}`, 256),
        description: trunc(`${p.text || ''}${p.link && safeUrl(p.link) ? `\n\n[Watch](${safeUrl(p.link)})` : ''}`, 4096),
        color: s ? brandInt(s.brandId) : RED,
        footer: { text: trunc(`${ev ? `${ev.name} · ` : ''}${state.data.league.name}`, 2048) },
      };
      const img = s && safeUrl(s.imageUrl);
      if (img && /^https:/.test(img)) embed.thumbnail = { url: img };
      return { payloads: [{ ...base(), embeds: [embed], allowed_mentions: { parse: [] } }], text: `**${embed.title}** — ${s ? s.name : ''}\n${p.text || ''}` };
    },
  };
}

export function customMessage({ title, body, color, imageUrl, everyone }) {
  return {
    title: 'Announcement',
    purpose: 'news',
    canPing: false,
    build() {
      const embed = { title: trunc(title || 'Announcement', 256), description: trunc(body || '', 4096), color: hexToInt(color || '#e3242b'), footer: footer() };
      const img = safeUrl(imageUrl);
      if (img && /^https:/.test(img)) embed.image = { url: img };
      const payload = { ...base(), embeds: [embed], allowed_mentions: { parse: everyone ? ['everyone'] : [] } };
      if (everyone) payload.content = '@everyone';
      return { payloads: [payload], text: `${everyone ? '@everyone\n' : ''}**${embed.title}**\n${embed.description}` };
    },
  };
}

// ---------- sending ----------
export function validWebhook(url) {
  return /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(String(url || '').trim());
}

export async function sendWebhook(url, payload) {
  if (!validWebhook(url)) throw new Error('That does not look like a Discord webhook URL.');
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${url.trim()}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) return res.json().catch(() => ({}));
    if (res.status === 429) {
      let wait = 1;
      try { wait = (await res.json()).retry_after || 1; } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, Math.min(10, wait) * 1000 + 250));
      continue;
    }
    let msg = '';
    try { const j = await res.json(); msg = j.message || JSON.stringify(j); } catch { /* ignore */ }
    if (res.status === 404 || res.status === 401) throw new Error('Discord says this webhook no longer exists. Create a new one in your channel settings.');
    throw new Error(`Discord rejected the message (${res.status}). ${msg}`);
  }
  throw new Error('Discord is rate limiting — try again in a minute.');
}

export function defaultWebhookFor(purpose) {
  const hooks = state.admin.webhooks || [];
  return hooks.find((h) => (h.purposes || []).includes(purpose)) || hooks[0] || null;
}

// ---------- preview + composer ----------
function md(text) {
  let h = esc(text);
  h = h.replace(/```\n?([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`);
  h = h.replace(/&lt;@(\d+)&gt;/g, (_, id) => {
    const m = state.data.members.find((x) => x.discordId === id);
    return `<span class="dc-mention">@${esc(m ? m.name : 'member')}</span>`;
  });
  h = h.replace(/@everyone/g, '<span class="dc-mention">@everyone</span>');
  h = h.replace(/^# (.+)$/gm, '<span class="dc-h1">$1</span>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^\w])_(.+?)_(?!\w)/g, '$1<em>$2</em>');
  h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return h.replace(/\n/g, '<br>');
}

export function previewHtml(payloads) {
  return payloads.map((p) => `
    <div class="dc-msg">
      <div class="dc-avatar">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : '🤼'}</div>
      <div class="dc-main">
        <div class="dc-user">${esc(p.username || 'League Bot')} <span class="dc-bot">APP</span></div>
        ${p.content ? `<div class="dc-content">${md(p.content)}</div>` : ''}
        ${(p.embeds || []).map((e) => `
          <div class="dc-embed" style="--c:#${(e.color || 0).toString(16).padStart(6, '0')}">
            ${e.author ? `<div class="dc-author">${esc(e.author.name)}</div>` : ''}
            ${e.title ? `<div class="dc-title">${md(e.title)}</div>` : ''}
            ${e.description ? `<div class="dc-desc">${md(e.description)}</div>` : ''}
            ${e.fields && e.fields.length ? `<div class="dc-fields">${e.fields.map((f) => `<div class="dc-field${f.inline ? ' inline' : ''}"><div class="dc-fname">${md(f.name)}</div><div class="dc-fval">${md(f.value)}</div></div>`).join('')}</div>` : ''}
            ${e.image ? `<img class="dc-image" src="${esc(e.image.url)}" alt="">` : ''}
            ${e.footer ? `<div class="dc-footer">${esc(e.footer.text)}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`).join('');
}

// Opens the "Post to Discord" window: pick channel, preview, send or copy.
export function openComposer(msg) {
  const hooks = state.admin.webhooks || [];
  const def = defaultWebhookFor(msg.purpose);
  let ping = !!(msg.canPing && state.admin.pingMembers !== false);
  const body = `
    ${hooks.length ? `
      <div class="row wrap gap">
        <label class="field grow"><span class="field-label">Channel</span><select data-hook>${options(hooks.map((h) => ({ value: h.id, label: h.name })), def && def.id)}</select></label>
        ${msg.canPing ? `<label class="check"><input type="checkbox" data-ping ${ping ? 'checked' : ''}> Ping the members involved</label>` : ''}
      </div>` : `<div class="notice">No Discord channels set up yet. You can <strong>copy the text</strong> and paste it into Discord, or add a webhook in <a href="#/settings" data-close>Settings → Discord</a> to post with one tap.</div>`}
    <div class="dc-preview" data-preview></div>`;
  const footer = `<button type="button" class="btn btn-ghost" data-copy>Copy text</button><span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Close</button>${hooks.length ? '<button type="button" class="btn btn-discord" data-send>Send to Discord</button>' : ''}`;
  const m = openModal({ title: msg.title, body, footer, wide: true });
  const render = () => { m.el.querySelector('[data-preview]').innerHTML = previewHtml(msg.build({ ping }).payloads); };
  render();
  const pingBox = m.el.querySelector('[data-ping]');
  if (pingBox) pingBox.addEventListener('change', () => { ping = pingBox.checked; render(); });
  m.el.querySelector('[data-copy]').addEventListener('click', async () => {
    const ok = await copyText(msg.build({ ping }).text);
    toast(ok ? 'Copied — paste it into Discord' : 'Could not copy', ok ? 'ok' : 'error');
  });
  const sendBtn = m.el.querySelector('[data-send]');
  if (sendBtn) sendBtn.addEventListener('click', async () => {
    const hookId = m.el.querySelector('[data-hook]').value;
    const hook = hooks.find((h) => h.id === hookId);
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      for (const p of msg.build({ ping }).payloads) await sendWebhook(hook.url, p);
      toast(`Posted to ${hook.name}`);
      if (msg.onSent) msg.onSent();
      m.close();
    } catch (e) {
      toast(e.message === 'Failed to fetch' ? 'Could not reach Discord. Check your connection or the webhook URL.' : e.message, 'error', 7000);
      sendBtn.disabled = false; sendBtn.textContent = 'Send to Discord';
    }
  });
  return m;
}

export function post(msg) {
  return openComposer(msg);
}

export function savePowerRankingsSnapshot() {
  const ids = powerRankings(state.data, { season: state.data.league.season, limit: 10 }).map((r) => r.s.id);
  commit((d) => { d.prHistory = { date: new Date().toISOString().slice(0, 10), ids }; });
}

