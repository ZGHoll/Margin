# Crafter's Ledger

A free website that ranks crafting recipes in **WoW: Forever** by profit and refreshes itself every hour.
Pick a profession and your auction house, and the best crafts rise to the top.

Live at **https://suln.live**. Built and run by Suln. It is an unofficial fan tool, not affiliated with or
endorsed by Blizzard Entertainment.

Nothing runs on a PC. GitHub runs the hourly update for free and publishes the page with GitHub Pages.

## What the site does

- **Crafting rankings:** every recipe for the chosen profession, ranked by profit or return, with the top three highlighted.
  Click a recipe to see its reagents, where each price came from, and price history charts.
  Flags show recipes that need a scarce reagent or make an item with a thin market (fewer than 3 listed).
- **Shopping list:** press **+** on any recipe. The list totals every reagent, the cost, the expected sales after the auction
  house cut and the expected profit, and shows the cheapest auction house for each reagent. It can be copied as text.
- **Craft vs buy:** compares the cost to make an item with the price to buy it.
- **Raid consumables:** enter how many flasks, potions, food and so on you need and compare crafting with buying.
  Items are found by name, so a few may be missing or extra.
- **Leveling helper:** recipes sorted by lowest net cost (reagents minus resale value). Forever's data has no skill-up
  ranges, so check recipe colors in game.
- **Favorites:** the star button pins recipes to the top. Favorites, the shopping list and the raid plan are saved in each
  visitor's own browser.
- **Price history:** the hourly job saves a snapshot every 6 hours (kept for 28 days) for the default auction house.
  Charts appear in a recipe's details after a couple of days, with "Cheap right now" and "Expensive right now" tags.
- **Auction house finder:** a one-time prompt asks visitors to confirm their auction house, with a finder that compares
  prices they see in game (gold, silver and copper) with every house. They can choose "Maybe later".
- **Extras:** dark theme with a light/dark toggle, shareable links, a layout for phones, an About section,
  an optional daily Discord post, and a feedback link to the repository's Issues page.

## How it works

1. `.github/workflows/update.yml` runs every hour and whenever you start it from the Actions tab.
2. It runs `update_data.py`, which asks Blizzard's game data API for recipes, vendor prices and auction snapshots.
3. The script writes `site/data.json` and `site/history.json`.
4. The `site` folder is published to GitHub Pages. The page (`index.html` and `app.js`) reads the data in the visitor's browser.

Recipes are saved for 24 hours so most runs are quick. The first run after adding professions can take 15 to 40 minutes.

## What is in this folder

| File | What it is |
|---|---|
| `update_data.py` | Downloads the data, saves price history, sends the optional Discord post. Needs no extra software. |
| `config.json` | Your settings (see below). |
| `overrides.json` | Hand-set prices for items the API cannot price. |
| `site/index.html` | The page: layout, styling and the About text. |
| `site/app.js` | The page logic: rankings, tools, filters, finder. |
| `site/favicon.svg` | The icon in the browser tab. |
| `.github/workflows/update.yml` | The hourly schedule and publishing. |
| `PROJECT_NOTES.md` | Technical notes, decisions and open items. |
| `.gitignore` | Keeps temporary files out of the repository. |

## Setup from scratch

You need a free GitHub account and your Blizzard API **Client ID** and **Client Secret**
(from https://develop.battle.net/access/clients).

1. **Create the repository.** On github.com click **+**, then **New repository**. Name it (for example `crafters-ledger`) and choose **Public**
   (free GitHub Pages needs a public repository).
2. **Upload the files.** Click **uploading an existing file** and drag in everything from this folder, including the `site` folder.
   Commit the changes.
3. **Add the schedule file.** GitHub's upload page can skip hidden folders, so use **Add file**, then **Create new file**,
   type `.github/workflows/update.yml` as the name, paste in the contents of `update.yml`, and commit.
4. **Add your secrets.** In **Settings**, **Secrets and variables**, **Actions**, add `BLIZZARD_CLIENT_ID` and
   `BLIZZARD_CLIENT_SECRET`. Never put them in a file.
5. **Turn on the website.** In **Settings**, **Pages**, set **Source** to **GitHub Actions**.
6. **Run it.** Open the **Actions** tab, choose **Update prices and publish site**, then **Run workflow**.
   When both steps (build and deploy) show green ticks, the site is live.

### Using your own domain (suln.live)

- At Namecheap, add four **A records** for `@`: 185.199.108.153, 185.199.109.153, 185.199.110.153 and 185.199.111.153,
  plus a **CNAME** for `www` pointing to `YOUR-USERNAME.github.io`. Delete any default parking records.
- In the repository, **Settings**, **Pages**, enter the domain under **Custom domain**. When the DNS check passes, tick **Enforce HTTPS**.
- Note: your browser hides `https://`. A padlock icon next to the address means the connection is secure.

## Changing the site

**Always upload files rather than pasting them.** Pasting a large file into GitHub's editor once cut `index.html` off
and left the page stuck on "Loading prices...".

To replace a file: open its folder in the repository, click **Add file**, then **Upload files**, drag in the new file and commit.
It replaces the old one.

- A change to `index.html` or `app.js` goes live a minute or two after the commit. Hard-refresh with Ctrl+F5 to see it.
- A change to `update_data.py`, `config.json` or `update.yml` needs the workflow to run: **Actions**, **Run workflow**.
- Keep `index.html` and `app.js` in step with each other. If you update one, update the other when told to.

## Settings in config.json

| Setting | What it does |
|---|---|
| `region` | `us`, `eu`, `kr` or `tw`. |
| `ruleset` | 1 = PvP, 2 = Normal, 3 = Roleplay, 15 = Roleplay PvP (US and EU). |
| `professions` | The professions to track, each with a `name` and a `fallback_id`. Currently Tailoring 197, Blacksmithing 164, Alchemy 171, Enchanting 333, Engineering 202, Leatherworking 165 and Cooking 185. |
| `ah_cut` | Auction house cut as a decimal. 0.05 is 5% (faction houses). Neutral houses (Gadgetzan, Booty Bay, Everlook) take 15%. Visitors can change it on the page. |
| `default_house` | The house the page opens on. `null` picks the house with the most data. |
| `house_labels` | Friendly names for house IDs, for example `"113": "US Horde PvP"`. They appear in the dropdown. |
| `history` | `enabled`, `hours_between_points` (default 6) and `days` (default 28). |
| `discord` | `enabled` (default `false`), `top_n` and `hours_between_posts`. |
| `site_url` | Used in the Discord post. |
| `refresh_recipes_hours` | How often recipes are downloaded again (24). |

To set a price by hand, edit `overrides.json`, for example `"items": { "2320": 0.001 }`. Prices are in gold, keyed by item ID.

### Optional: Discord posts

1. In your Discord channel open the settings, then **Integrations**, then **Webhooks**, and create one. Copy its URL.
2. In GitHub, add it as a secret named `DISCORD_WEBHOOK_URL` (same place as the Blizzard secrets).
3. In `config.json`, change `"enabled": false` to `"enabled": true` under `discord`, then run the workflow.

It posts the best crafts for each profession once a day. If the secret is missing, nothing is posted.

## How profit is worked out

`profit = items made x sell price x (1 - auction house cut) - reagent cost`

- Reagent prices come from the auction house, then from vendors if an item is not listed. Hand-set prices override both.
- Prices default to the 25th percentile, which is steadier than the single lowest listing. Visitors can switch to Lowest or Median.
- Deposits are not included.
- Items are matched by item ID because Forever's item data lacks names for many auction items.

## Troubleshooting

- **The run shows a red X.** Open the run, click the failed step and read the line starting with `ERROR:`. Common ones:
  "Blizzard login failed" means the secrets are wrong, so re-enter them. "403" or "not available yet" means Blizzard changed
  the API or the region is wrong. "No recipes were found" means Forever's recipe data is not available (yet).
- **The page is stuck on "Loading prices..." and the dropdowns are empty.** The script did not run, usually because `index.html`
  was cut off. View the page source and check that the last lines are `<script src="app.js"></script>`, `</body>` and `</html>`.
  Re-upload `index.html`.
- **The page says the data is hours old.** The hourly job has stopped. Look in the Actions tab for failures. GitHub switches off
  scheduled jobs after 60 days with no changes to the repository. Edit any file, or click **Enable workflow**.
- **One profession is missing.** If Blizzard has no data for it, the page still publishes the others and shows a warning at the top.
  Look for lines starting with `WARNING:` in the failed run's log.
- **Many recipes are hidden.** They are missing a price. Under **Price settings & filters**, untick "Hide recipes missing a price" to see why,
  then add the missing item to `overrides.json`.
- **Price history charts are missing.** They appear after a couple of days. If GitHub clears its saved cache, history restarts from zero.
- **GitHub warns about Node.js 20.** This is a harmless notice about the tools the workflow uses.
- **The house finder gave no clear match.** Enter two or three items with their exact lowest prices.

## Good to know

- Blizzard's Forever API is not officially documented and can change without notice. If it breaks, the hourly job fails and the
  page keeps showing the last good data, with a warning when it is more than 4 hours old.
- Only prices for items used in recipes are published, not the whole auction house. Read Blizzard's API terms before sharing widely.
- No Blizzard art, logos or icons are used.
- Keep your Blizzard secret only in GitHub's secrets. If it is ever exposed, create a new one at develop.battle.net.
