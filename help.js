// The in-app manual.

import { esc, pageHead } from './ui.js';

const SECTIONS = [
  {
    id: 'start', icon: '🚀', title: 'Quick start',
    body: `
      <ol>
        <li><strong>Set up your league.</strong> The first time you open the site, it walks you through it: league name, brands, members, superstars, titles and your weekly show schedule.</li>
        <li><strong>Book Week 1.</strong> Open the <a href="#/gm">GM</a> page and tap <em>Book Week 1</em>. Look over the card, then tap <em>Approve & book</em>.</li>
        <li><strong>Play the matches.</strong> Your members play their matches online in WWE 2K26 and tell you who won.</li>
        <li><strong>Enter the results.</strong> On the GM page, tap the winner of each match, then <em>Save results</em>. Or let the app sim a match.</li>
        <li><strong>Book the next week.</strong> Once every result is in, the GM is ready to book the next week. Repeat.</li>
      </ol>
      <p>That's the whole loop. Everything else (standings, power rankings, title history, storylines, awards) updates itself from your results.</p>`,
  },
  {
    id: 'saving', icon: '💾', title: 'Saving & moving devices',
    body: `
      <ul>
        <li><strong>Your league saves by itself</strong> every time you change something. It's saved in this browser on this device. No account needed.</li>
        <li><strong>Every device has its own league.</strong> If a friend opens the same link, they get their own separate league, so they can't see or change yours.</li>
        <li><strong>Back it up.</strong> Go to <a href="#/settings?tab=backup">Settings → Backup & seasons</a> and tap <em>Download backup</em>. If your browser's data ever gets cleared, that file brings your league back.</li>
        <li><strong>Switching phones or computers?</strong> Download a backup on the old device, then use <em>Restore a backup</em> on the new one. The first setup screen also has a restore option.</li>
        <li>Private or incognito browsing won't keep your league. If saving isn't working, a warning appears at the top of the page.</li>
      </ul>`,
  },
  {
    id: 'gm', icon: '🧠', title: 'The GM: how weekly booking works',
    body: `
      <p>The GM books a card for every brand each week, plus a <strong>Premium Live Event (PLE)</strong> every few weeks (4 by default). On PLE weeks there are no weekly shows, just the PLE with every title on the line.</p>
      <p><strong>What the GM thinks about when it books:</strong></p>
      <ul>
        <li><strong>Titles:</strong> secondary titles (IC, US) and tag titles are defended on TV every couple of weeks, and world titles at PLEs.</li>
        <li><strong>Challengers</strong> come from the power rankings, win streaks, #1 contender wins and rematch clauses (a champion who just lost the belt gets one shot to win it back).</li>
        <li><strong>#1 contender's matches</strong> happen the week before a PLE. The winner gets the title shot at the PLE.</li>
        <li><strong>Messy finishes get rematches.</strong> A DQ leads to No Holds Barred, a count-out to Falls Count Anywhere or Steel Cage, and a draw to Last Man Standing.</li>
        <li><strong>Feuds escalate</strong> each time the rivals meet, and end in a big stipulation match at a PLE.</li>
        <li><strong>Every member gets a match each week</strong> against someone near their level. Nobody is ever booked against their own superstar, and one member never has two wrestlers in the same match.</li>
      </ul>
      <p>Every match comes with a short line explaining <em>why</em> it was booked. That line shows on the show page and in the Discord post.</p>
      <p><strong>Before you approve,</strong> you can tap ✕ to remove a match, <em>+ Add a match</em>, or <em>🔀 Shuffle</em> for a whole new card. After it's booked, you can still edit any match from the <a href="#/shows">Shows</a> page.</p>
      <p><strong>🤖 Autopilot</strong> (in GM settings) books the next week and posts it to Discord the moment the last result of the week is saved.</p>
      <p><strong>GM settings</strong> let you change matches per show, how often PLEs happen, the PLE names and order, how often secondary titles are defended, what day each brand airs, and whether CPU superstars can be used.</p>`,
  },
  {
    id: 'results', icon: '✅', title: 'Entering results',
    body: `
      <ul>
        <li><strong>Fastest:</strong> on the <a href="#/gm">GM</a> page, tap the winner of each match, pick the finish (pinfall, submission…) and a star rating if you like, then tap <em>Save results</em>.</li>
        <li><strong>More detail:</strong> on a show page, tap <em>Enter result</em> to add notes or a link to a clip.</li>
        <li><strong>Changed your mind?</strong> Tap <em>Edit result</em> or <em>Clear result</em>. Title changes, contenders and storylines all undo themselves correctly.</li>
        <li><strong>Title changes are automatic.</strong> If the challenger wins a title match, the belt changes hands and the reign goes into the title history. Champions keep their title on a <strong>DQ or count-out</strong>, just like on TV.</li>
      </ul>`,
  },
  {
    id: 'sim', icon: '🎲', title: 'Simulating matches',
    body: `
      <p>Not every match gets played: CPU vs CPU, someone missed the deadline, or you just want to move on. Tap <strong>🎲 Sim</strong> and the app decides the match for you.</p>
      <ul>
        <li>The winner is based on <strong>overall rating</strong>, <strong>momentum</strong> (win streaks, recent form) and whether they're a <strong>champion</strong>, plus some luck. Upsets do happen.</li>
        <li>The finish fits the match type: ladder matches end with the item being grabbed, Royal Rumbles by elimination, Last Man Standing by knockout, and so on.</li>
        <li>It also gives a star rating. Title matches, PLEs, stipulation matches and close matchups tend to rate higher.</li>
        <li>On the GM page you can <em>Sim CPU-only matches</em> or <em>Sim all remaining</em> in one tap.</li>
        <li>In GM settings, turn on <em>Sim any match nobody played by its deadline</em> to have overdue matches simmed whenever you open the app.</li>
        <li>Simmed results show a 🎲 tag so everyone knows.</li>
      </ul>`,
  },
  {
    id: 'titles', icon: '🏆', title: 'Championships',
    body: `
      <ul>
        <li><strong>World titles</strong> are defended at PLEs. <strong>Secondary titles</strong> (IC, US…) and <strong>tag titles</strong> are defended on weekly TV too. By default, the first singles title of each brand and division counts as its world title. Change it per title on the <a href="#/titles">Titles</a> page with <em>Edit → Title level</em>.</li>
        <li><strong>Award</strong> crowns a champion by hand (for example your starting champions). <strong>Vacate</strong> strips the title.</li>
        <li>The <strong>title history</strong> lists every reign with days held and successful defenses.</li>
        <li>The <strong>Title picture</strong> on the GM page shows each title's #1 contender. You can set or clear a contender yourself.</li>
      </ul>`,
  },
  {
    id: 'specials', icon: '💼', title: 'Royal Rumble, Money in the Bank, King & Queen of the Ring',
    body: `
      <p>Some PLEs come with something extra. The GM spots them by name, so they still work if you reorder the PLE list in GM settings.</p>
      <ul>
        <li><strong>Royal Rumble:</strong> a men's and women's Rumble with everyone available. The winner earns a world title match <strong>at WrestleMania</strong> and is saved for that night (no early title shots).</li>
        <li><strong>Money in the Bank:</strong> a men's and women's ladder match for the briefcase. The holder can <strong>cash in on a world champion right after one of their title matches</strong>, when the champ is worn out. The GM decides when, and the odds go up every week. A cash-in is guaranteed within 12 weeks. When it happens, a new title match pops onto that show's card and you get a 💼 alert to post to Discord.</li>
        <li><strong>King & Queen of the Ring:</strong> semifinals the week before the PLE, then the finals at the PLE. The winner is crowned and earns a world title shot <strong>at SummerSlam</strong>.</li>
      </ul>
      <p>The default PLE order is Royal Rumble, Elimination Chamber, WrestleMania, Backlash, Money in the Bank, King & Queen of the Ring, SummerSlam, Clash in Paris, Crown Jewel, Survivor Series and Saturday Night's Main Event. Then it starts over.</p>`,
  },
  {
    id: 'stories', icon: '🔥', title: 'Storylines & promos',
    body: `
      <ul>
        <li>Start a rivalry on the <a href="#/storylines">Storylines</a> page: pick the superstars, a heat level (🔥 1–5) and a summary. The GM will keep booking them against each other.</li>
        <li>The GM also <strong>starts rivalries on its own</strong> after a DQ, count-out or draw, and <strong>logs every match</strong> between rivals in the storyline's timeline.</li>
        <li>When a feud's final stipulation match at a PLE has a clear winner, the storyline is marked concluded.</li>
        <li>Add <strong>promos</strong> (text or a video link) and post them to Discord. Weekly shows can also open with a promo segment the GM writes.</li>
      </ul>`,
  },
  {
    id: 'standings', icon: '📊', title: 'Standings, power rankings & awards',
    body: `
      <ul>
        <li><strong>Standings:</strong> 3 points for a win and 1 for a draw by default (you can change this in Settings). Includes win %, streaks, recent form, member totals and leaderboards.</li>
        <li><strong>Power rankings:</strong> season points, plus 2× recent form, a bonus for champions, and the current win streak. When you post them to Discord, the next post shows ▲▼ movement.</li>
        <li><strong>Awards:</strong> the <a href="#/awards">Awards</a> page shows the race all season: Superstar of the Year, Women's Superstar of the Year, Match of the Year, Feud of the Year, Tag Team of the Year, Upset of the Year, Title Reign of the Year, Breakout Star and Player of the Year (the member with the best record), plus King and Queen of the Ring.</li>
        <li><strong>End Season</strong> (on the Awards page) locks in the awards, posts them to Discord and starts the next season. Standings reset; titles and history carry over.</li>
        <li><strong>Hall of Fame:</strong> induct your league's legends with a note about why they belong.</li>
      </ul>`,
  },
  {
    id: 'roster', icon: '🧑‍🤝‍🧑', title: 'Roster, members & the draft',
    body: `
      <ul>
        <li><strong>Members</strong> are the people who play. <strong>Superstars</strong> are who they play as. A member can have more than one superstar. Superstars without a member are CPU superstars the GM can use as opponents.</li>
        <li>Give superstars an <strong>overall rating</strong> (the 2K one works great). It helps the GM pair fair matches and makes sims more realistic.</li>
        <li><strong>Tag teams and factions</strong> let the GM book proper tag matches and tag title defenses.</li>
        <li>Mark someone <strong>Injured, Suspended or Inactive</strong> and the GM won't book them.</li>
        <li><strong>Draft:</strong> from the Roster page, tap <em>Run a draft</em> to split superstars between brands, snake order, with each pick posted to Discord.</li>
      </ul>`,
  },
  {
    id: 'discord', icon: '💬', title: 'Posting to Discord',
    body: `
      <ol>
        <li>In Discord, open the channel's settings: <em>Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL</em>.</li>
        <li>In the app: <a href="#/settings?tab=discord">Settings → Discord → + Add channel</a>, paste it, and pick what that channel is for (cards, results, titles, rankings, news). Tap <em>Test</em>.</li>
      </ol>
      <ul>
        <li>Every "Post" button shows a <strong>preview</strong> first. You can send it, or <em>Copy text</em> and paste it yourself.</li>
        <li>To <strong>@mention</strong> members, add their Discord user ID on Roster → Members. In Discord, turn on <em>Settings → Advanced → Developer Mode</em>, then right-click someone → <em>Copy User ID</em>.</li>
        <li>Webhook links are saved on this device only. Don't share them, because anyone with the link can post in that channel.</li>
      </ul>`,
  },
  {
    id: 'faq', icon: '❓', title: 'Questions',
    body: `
      <p><strong>My league is gone!</strong> The browser's data was probably cleared, or you're on a different device or browser. Restore your latest backup from Settings → Backup & seasons.</p>
      <p><strong>Can my members see the league?</strong> Not on the site, since each device has its own league. Share the action through Discord: cards, results, title changes, standings, power rankings and awards can all be posted there.</p>
      <p><strong>A member didn't play their match.</strong> Sim it (🎲), or turn on auto-sim for overdue matches in GM settings.</p>
      <p><strong>I want more or fewer matches.</strong> Change <em>Matches per weekly show</em> in GM settings, or use + Add a match / ✕ on the proposed card.</p>
      <p><strong>Someone got booked who shouldn't be.</strong> Set them to Injured or Inactive on their profile, or remove the match before approving.</p>
      <p><strong>Can I book a show myself?</strong> Yes: <a href="#/shows">Shows</a> → <em>+ Book show</em>, then add matches with any 2K26 match type.</p>
      <p><strong>How do I start over?</strong> Settings → Backup & seasons → <em>Start a new league</em>. Download a backup first if you want to keep the old one.</p>`,
  },
];

export default {
  render() {
    return `
      ${pageHead('How it works', 'Everything you need to run your league')}
      <nav class="help-toc" aria-label="Contents">${SECTIONS.map((s) => `<a href="#/help?s=${s.id}" data-help="${s.id}">${s.icon} ${esc(s.title)}</a>`).join('')}</nav>
      <div class="help">
        ${SECTIONS.map((s, i) => `<details class="card help-section" id="help-${s.id}" ${i === 0 ? 'open' : ''}>
          <summary><h2 class="inline">${s.icon} ${esc(s.title)}</h2></summary>
          <div class="prose help-body">${s.body}</div>
        </details>`).join('')}
      </div>`;
  },
  mount(root, params) {
    if (params && params.s) {
      const el = root.querySelector(`#help-${CSS.escape(params.s)}`);
      if (el) { el.open = true; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); }
    }
  },
};
