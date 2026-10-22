# WWE 2K26 League Manager

A website for running a WWE 2K26 league on Discord. It hosts free on GitHub Pages and works on phones. It posts match cards, results and title changes straight into your Discord channels. There's no bot or server to keep running.

## The GM (auto-booking)

Give it your superstars, members and championships, and the **GM page** books every week for you. Enter the results, and it books the next week:

- **Weekly shows** for each brand, plus a **Premium Live Event every 4 weeks** (Royal Rumble, Elimination Chamber, WrestleMania…) with every title on the line.
- **Title defenses:** secondary and tag titles are defended on TV every couple of weeks, and world titles at PLEs. Challengers come from the power rankings and win streaks, and a former champion gets a rematch-clause shot.
- **#1 contender's matches** the week before a PLE. The winner is locked in for the title shot.
- **Rematches after messy finishes:** a DQ leads to No Holds Barred, a count-out to Falls Count Anywhere or Steel Cage, and a draw to Last Man Standing.
- **Feuds escalate** week to week and end in a stipulation match at a PLE. Rivalries start on their own after DQs, count-outs and draws, and every feud result is logged on its storyline.
- **Every member gets a match each week** against an opponent near their level, and never against their own superstar. CPU superstars fill in where needed.
- Every match comes with a line explaining **why it was booked**, and that line goes out in the Discord post too.
- **Autopilot (optional):** the moment the last result of the week is saved, it books next week, posts the cards to Discord and publishes. No clicks needed.

You can always shuffle the card, remove or add matches, or edit anything before you approve it.

## What it does

- **Shows:** book weekly shows and PLEs. Cards can use any 2K26 format and match type (singles to Royal Rumble, tag, handicap, WarGames, Inferno, Dumpster, 3 Stages of Hell…), title matches, deadlines and promo segments.
- **Results:** record the winner, method and star rating. Title changes happen automatically, and champions keep the belt on a DQ or count-out.
- **Championships:** current champions, days held, defenses and a full reign history for every title.
- **Standings:** W-L-D records, points, win %, streaks, recent form, member totals and season vs all-time views.
- **Power rankings:** ▲▼ movement since the last time you posted them.
- **Leaderboards:** most wins, best win %, longest streak, best match ratings, most title reigns and top-rated matches.
- **Roster:** superstars (who plays them, brand, alignment, overall, finisher), tag teams, factions and members (gamertags, platform, Discord ID).
- **Storylines:** rivalries with heat levels and a week-by-week timeline, plus promos.
- **Draft:** a live snake draft that splits superstars between brands, and can post each pick to Discord.
- **"My matches":** members pick their name to see who they have to play, the opponent's gamertag and the deadline.
- **Member submissions:** members submit results and promos from the site. They paste a code into Discord, and a commissioner approves it in the Inbox with one click.
- **Discord posts:** cards, results, title changes, champions, standings, power rankings, deadline reminders, draft picks, storylines, promos and custom announcements. Every post shows a preview first and can ping the members involved.

## Setup (about 10 minutes)

### 1. Turn on GitHub Pages
In this repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
After a minute your site is live at `https://<your-username>.github.io/<repo-name>/`.

### 2. Open the site and follow the setup
On a brand-new league the site shows **"I'm the commissioner: set it up"**. Tap it, and it walks you through:

1. League name
2. Brands (Raw, SmackDown, NXT or your own)
3. Members (the people in your Discord who play)
4. Superstars (who each member plays as, plus CPU superstars)
5. Championships and current champions
6. Weekly shows (what day each brand airs, matches per show, how often PLEs happen)
7. **Save it for everyone.** The site opens GitHub with a "save key" (token) already filled in. You choose this repo, generate the key and paste it back. From then on **every change saves by itself**, and everyone who opens the site sees the latest league within about a minute.

After that the full app unlocks: the GM, shows, standings, titles, roster, storylines and settings.

> The save key is stored only in your browser. Never paste it in Discord or commit it to the repo. If you run the league from two devices, connect saving on each one (**Settings → Saving**).

### 3. Connect your Discord channels
For each channel you want the site to post in: **Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL**.
In the site, go to **Settings → Discord → + Add channel**, paste the URL, and pick what that channel is for (cards, results, titles, rankings, news). Tap **Test**.

> Webhook URLs are also stored only in your browser. They are never written to `league.json`, because anyone with the link could post in your channel.

To let posts **@mention** members, add each member's Discord user ID on the Roster → Members tab. To get an ID, turn on Discord **Settings → Advanced → Developer Mode**, then right-click a name → **Copy User ID**.

## Running a week

1. Open **GM → Book Week 1**. Check the card, then **Approve & book**. It posts the cards to Discord, and members get pinged with their matches and deadlines.
2. Members play online, then use **Submit** on the site and paste the message it gives them into your submissions channel.
3. Copy those messages into **Inbox** and approve them. Or tap the winners yourself on the **GM** page.
4. When every result is in, the GM books the next week. With autopilot on, it does this by itself.
5. Post results and power rankings from **Standings**. Everything saves for everyone automatically.

Want to book a show by hand instead? **Shows → + Book show** still works any time.

New season? **Settings → Backup & seasons → Start Season 2**. Standings reset, while champions and all-time stats carry over.

## Co-commissioners
Add them as collaborators on the repo. Each one turns on commissioner mode on their own device and makes their own save key (**Settings → Saving**). If two people edit at once, the site warns instead of overwriting.

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css` | The page and its look |
| `app.js` | Navigation, the publish bar |
| `store.js` | League data and saving to GitHub (auto-save) |
| `stats.js` | Records, standings, power rankings, title logic |
| `discord.js` | Discord messages + webhooks |
| `gm.js` | The GM: weekly booking, contenders, rivalries |
| `ui.js` | Shared helpers (popups, forms) |
| `setup.js` | The first-run setup steps |
| `home.js`, `gm-page.js`, `shows.js`, `roster.js`, `titles.js`, `standings.js`, `storylines.js`, `draft.js`, `submit.js`, `settings.js` | One file per page |
| `league.json` | **Your league data** (the site edits this for you) |
| `demo.json` | Sample league for trying things out |

It's plain HTML/CSS/JavaScript with no build step and nothing to install. To run it on your own computer: `python3 -m http.server` in this folder, then open http://localhost:8000.

## Backups
**Settings → Backup & seasons → Download backup** saves the whole league as a `.json` file. GitHub also keeps every published version in the repo history.
