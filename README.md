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
- **Autopilot (optional):** the moment the last result of the week is saved, it books next week and posts the cards to Discord. No clicks needed.

You can always shuffle the card, remove or add matches, or edit anything before you approve it.

### Big events
- **Royal Rumble:** men's and women's Rumbles. The winner gets a world title match at WrestleMania.
- **Money in the Bank:** ladder matches for the briefcase. The holder can cash in on a worn-out world champion right after a title match. The GM decides when, and it's guaranteed within 12 weeks.
- **King & Queen of the Ring:** semifinals the week before, finals at the PLE. The winner is crowned and gets a title shot at SummerSlam.

### Sim matches
Tap **🎲 Sim** on any match (or sim a whole week) and the app picks a believable winner, finish and star rating. It uses overall rating, momentum and a bit of luck. It's handy for CPU matches or members who miss their deadline, and you can turn on auto-sim for overdue matches.

### Awards & Hall of Fame
The **Awards** page tracks Superstar of the Year, Women's Superstar of the Year, Match of the Year, Feud of the Year, Tag Team of the Year, Upset of the Year, Title Reign of the Year, Breakout Star and Player of the Year all season. **End Season** locks them in and posts them to Discord. You can also induct legends into the Hall of Fame.

### Built-in manual
Tap **Help** in the menu for a plain-English guide to everything.

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
- **Discord posts:** cards, results, title changes, champions, standings, power rankings, deadline reminders, draft picks, storylines, promos and custom announcements. Every post shows a preview first and can ping the members involved.

## How saving works

**Every device keeps its own league.** Whoever opens the site gets a quick setup, then runs their own league. It's saved in that browser automatically, with no account or server. Two people opening the same link each get their own separate league.

- **Moving to another phone or computer:** go to **Settings → Backup & seasons → Download backup**, then on the other device choose **Restore a backup**. The first setup screen has this option too.
- **Back up now and then.** If the browser's data gets cleared, the backup file is how you get your league back. The home page reminds you.
- Discord channel links are also saved per device.

## Setup (about 5 minutes)

### 1. Turn on GitHub Pages (once, for the site itself)
In this repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
After a minute your site is live at `https://<your-username>.github.io/<repo-name>/`.

### 2. Open the site and follow the setup
The first time you open it on a device, it walks you through:

1. League name
2. Brands (Raw, SmackDown, NXT or your own)
3. Members (the people in your Discord who play)
4. Superstars (who each member plays as, plus CPU superstars)
5. Championships and current champions
6. Weekly shows (what day each brand airs, matches per show, how often PLEs happen)

Then everything else unlocks: the GM, shows, standings, titles, roster, storylines and settings.

### 3. Connect your Discord channels (optional)
For each channel you want the site to post in: **Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL**.
In the site, go to **Settings → Discord → + Add channel**, paste the URL, and pick what that channel is for (cards, results, titles, rankings, news). Tap **Test**.

To let posts **@mention** members, add each member's Discord user ID on the Roster → Members tab. To get an ID, turn on Discord **Settings → Advanced → Developer Mode**, then right-click a name → **Copy User ID**.

## Running a week

1. Open **GM → Book Week 1**. Check the card, then **Approve & book**. It posts the cards to Discord, and members get pinged with their matches and deadlines.
2. Members play their matches online and tell you who won.
3. Tap the winners on the **GM** page.
4. When every result is in, the GM books the next week. With autopilot on, it does this by itself.
5. Post results and power rankings to Discord from the show page and **Standings**.

Want to book a show by hand instead? **Shows → + Book show** still works any time.

New season? **Settings → Backup & seasons → Start Season 2**. Standings reset, while champions and all-time stats carry over.

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css` | The page and its look |
| `app.js` | Navigation and page layout |
| `store.js` | League data, saved on each device |
| `stats.js` | Records, standings, power rankings, title logic |
| `discord.js` | Discord messages + webhooks |
| `gm.js` | The GM: weekly booking, contenders, rivalries, big events, match sim |
| `awards.js` | Season awards and Hall of Fame |
| `help.js` | The in-app manual |
| `ui.js` | Shared helpers (popups, forms) |
| `setup.js` | The first-run setup steps |
| `home.js`, `gm-page.js`, `shows.js`, `roster.js`, `titles.js`, `standings.js`, `storylines.js`, `draft.js`, `settings.js` | One file per page |
| `demo.json` | Sample league for trying things out |

It's plain HTML/CSS/JavaScript with no build step and nothing to install. To run it on your own computer: `python3 -m http.server` in this folder, then open http://localhost:8000.

## Updating the code
If you change any file, bump the `v=` number in `index.html` (it appears in a few places, so find and replace `v=8` with `v=9`, and so on). That makes everyone's browser load the new files instead of old cached copies.
