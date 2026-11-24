# WoW: Forever Tailoring profit site

A web page that ranks every Tailoring recipe by profit and refreshes itself every hour.
Anyone with the link can open it. Nothing runs on your PC.

How it works: GitHub (free) runs `update_data.py` every hour. The script downloads recipes,
vendor prices and auction prices from Blizzard, saves the result, and publishes the page in
the `site` folder.

## Before you start

You need:
- A free GitHub account (github.com).
- Your Blizzard API **Client ID** and **Client Secret** (the same ones you used for the scripts).
  Get them from https://develop.battle.net/access/clients.

Know this first:
- The repository must be **public** for free GitHub Pages. Your code and `overrides.json` will be
  visible to everyone. Your Blizzard secret will NOT be, as long as you only put it in GitHub's
  secrets store (step 4) and never in a file.
- The Forever API is not officially documented. If Blizzard changes it, the hourly job fails and the
  page keeps showing the last good data (it warns when the data is more than 4 hours old).
- Read Blizzard's API terms of use (https://develop.battle.net) before sharing the link widely.
  This page shows calculated profits and prices only for items used in Tailoring recipes. It does
  not republish the full auction house.

## Setup, step by step

### 1. Create the repository
1. Sign in to github.com and click the **+** at the top right, then **New repository**.
2. Name it something like `forever-tailoring`. Choose **Public**. Click **Create repository**.

### 2. Upload the files
1. Unzip the download. You should see `update_data.py`, `config.json`, `overrides.json`, `README.md`,
   `.gitignore` and a `site` folder.
2. On your new repository page click **uploading an existing file**.
3. Drag in `update_data.py`, `config.json`, `overrides.json`, `README.md` and `.gitignore`, and also
   the whole `site` folder. Click **Commit changes**.

### 3. Add the hourly schedule file
GitHub's upload page can skip hidden folders, so make this one by hand:
1. On the repository page click **Add file**, then **Create new file**.
2. In the name box type exactly: `.github/workflows/update.yml`
   (typing the slashes creates the folders).
3. Open `update.yml` from the unzipped download in Notepad, copy everything, and paste it into the big box.
4. Click **Commit changes**.

### 4. Add your Blizzard secrets
1. In the repository, click **Settings**, then **Secrets and variables**, then **Actions**.
2. Click **New repository secret**. Name: `BLIZZARD_CLIENT_ID`. Secret: your Client ID. Click **Add secret**.
3. Click **New repository secret** again. Name: `BLIZZARD_CLIENT_SECRET`. Secret: your Client Secret. Click **Add secret**.

### 5. Turn on the website
1. Still in **Settings**, click **Pages** on the left.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

### 6. Run it the first time
1. Click the **Actions** tab. If GitHub asks, click the green button to enable workflows.
2. Click **Update prices and publish site** on the left, then **Run workflow**, then the green **Run workflow** button.
3. Wait about 5 to 10 minutes. Both steps ("build" and "deploy") should get a green tick.
4. Go to **Settings**, then **Pages**. Your link is shown at the top, usually
   `https://YOUR-USERNAME.github.io/forever-tailoring/`. Send it to your friends.

After this it refreshes every hour by itself.

## Settings you can change

Open `config.json` on GitHub (click the file, then the pencil icon) to edit:
- `region`: `us`, `eu`, `kr` or `tw`.
- `ruleset`: 1 = PvP, 2 = Normal, 3 = Roleplay, 15 = Roleplay PvP (US and EU).
- `default_house`: the house ID the page opens on. `null` picks the house with the most data.
  Each visitor can switch house with the dropdown, and the page remembers their choice.
- `ah_cut`: the auction house cut as a decimal (0.05 = 5%). Visitors can change it on the page.
- `profession`: leave as `Tailoring`.

To set a price by hand (for an item the API can't price), edit `overrides.json`, for example
`"items": { "2320": 0.001 }`. Prices are in gold, keyed by item ID.

## Troubleshooting

- **The run shows a red X.** Click the run, click the failed step, and read the line starting with
  `ERROR:`. Paste it to Claude. Common ones:
  - "Blizzard login failed": the two secrets are wrong. Re-enter them.
  - "403" or "not available yet": Blizzard has changed the API or the region is wrong.
  - "No recipes were found": the Forever recipe data is not exposed by the API (yet).
- **The page says "Could not load the price data".** The first run has not finished. Wait and refresh.
- **The page says the data is hours old.** The hourly job has stopped. Open the Actions tab and look
  for failures. GitHub also switches off scheduled jobs in public repositories after 60 days with no
  changes to the repository. If that happens, open the Actions tab and click **Enable workflow**, or
  edit any file to wake it up.
- **Many recipes are hidden.** They are missing a price. Untick "Hide recipes missing a price" to see
  which reagent is the problem, then add it to `overrides.json`.
- **GitHub warns about an outdated action.** Tell Claude which one and what version it suggests.

## What is in this folder

- `update_data.py`: downloads the data (needs no extra software).
- `site/index.html`, `site/app.js`: the web page. `site/data.json` is created by the script.
- `.github/workflows/update.yml`: the hourly schedule.
- `config.json`, `overrides.json`: your settings.
