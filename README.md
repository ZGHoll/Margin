# Margin

**Margin: crafting profits for WoW Forever.** A free website that ranks crafting recipes by profit and refreshes itself every hour.
Pick a profession, realm type and auction house, and the best crafts rise to the top. (Formerly called Crafter's Ledger.)

Live at **https://suln.live**. Built and run by Suln. It is an unofficial fan tool, not affiliated with or
endorsed by Blizzard Entertainment.

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
- **Realm types:** Normal, PvP, Roleplay and Roleplay PvP each have their own auction houses and prices. Visitors pick their realm type first, and the page remembers it.
- **Auction house finder:** a one-time prompt asks visitors to confirm their auction house, with a finder that compares
  prices they see in game (gold, silver and copper) with every house. They can choose "Maybe later".
- **Extras:** dark theme with a light/dark toggle, shareable links, a layout for phones, an About section,
  an optional daily Discord post, and a feedback link to the repository's Issues page.

## How profit is worked out


`profit = items made x sell price x (1 - auction house cut) - reagent cost`

- Reagent prices come from the auction house, then from vendors if an item is not listed. Hand-set prices override both.
- Prices default to the 25th percentile, which is steadier than the single lowest listing. Visitors can switch to Lowest or Median.
- Deposits are not included.
- Items are matched by item ID because Forever's item data lacks names for many auction items.

## Good to know


- Blizzard's Forever API is not officially documented and can change without notice. If it breaks, the hourly job fails and the
  page keeps showing the last good data, with a warning when it is more than 4 hours old.
- Only prices for items used in recipes are published, not the whole auction house. Read Blizzard's API terms before sharing widely.
- No Blizzard art, logos or icons are used.
- Keep your Blizzard secret only in GitHub's secrets. If it is ever exposed, create a new one at develop.battle.net.

## Feedback

Found a bug or have an idea? Open an issue on this repository's Issues page, or find Suln on X, YouTube or Instagram (links in the site's About section).
