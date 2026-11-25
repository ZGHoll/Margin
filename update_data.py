"""
WoW: Forever Tailoring profit site - data updater
=================================================
Run by GitHub Actions every hour (or by hand). It:
  1. downloads every recipe for each profession in config.json (refreshed once a day),
  2. downloads vendor prices for the reagents (refreshed once a day),
  3. downloads the auction house snapshots (every run),
  4. writes site/data.json, which the web page (site/index.html) reads.

It needs two environment variables: BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET.
Settings live in config.json. Hand-set prices live in overrides.json.

The Forever API is not officially documented yet, so this follows the layout
community testers found. If it stops working the script says why and exits
with an error, and the website keeps showing the last good data.
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "cache"
SITE_DIR = ROOT / "site"
COPPER_PER_GOLD = 10000
DELAY = 0.1  # seconds between small requests
MAX_REAGENTS = 12


class UpdateError(Exception):
    """A problem with a clear message for the person reading the log."""


# ----------------------------------------------------------------------------
# Small helpers
# ----------------------------------------------------------------------------
def load_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def text_of(value):
    """Names usually arrive as text but can arrive as {en_US: ...}."""
    if isinstance(value, dict):
        return value.get("en_US") or next(iter(value.values()), "") or ""
    return value or ""


def is_fresh(cache, hours):
    return bool(cache) and (time.time() - cache.get("fetched", 0)) < hours * 3600


# ----------------------------------------------------------------------------
# Talking to Blizzard
# ----------------------------------------------------------------------------
def get_token(client_id, client_secret):
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    request = urllib.request.Request(
        "https://oauth.battle.net/token",
        data=b"grant_type=client_credentials",
        headers={"Authorization": f"Basic {basic}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)["access_token"]
    except urllib.error.HTTPError as err:
        raise UpdateError(f"Blizzard login failed (HTTP {err.code}). Check the two GitHub secrets "
                          "BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET.")


def api_get(path, token, region, namespace):
    """Fetch one address. Returns parsed JSON, or None if Blizzard answers 404."""
    query = urllib.parse.urlencode({"namespace": namespace, "locale": "en_US"})
    url = f"https://{region}.api.blizzard.com{path}?{query}"
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.load(response)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return None
            if err.code == 429 or err.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            if err.code == 401:
                raise UpdateError("Blizzard rejected the login token (HTTP 401).")
            if err.code == 403:
                raise UpdateError(f"Blizzard refused the request (HTTP 403) for namespace '{namespace}'. "
                                  "The namespace or region may be wrong, or this data is not available yet.")
            raise UpdateError(f"Request failed (HTTP {err.code}) for {path}.")
        except urllib.error.URLError as err:
            if attempt == 3:
                raise UpdateError(f"Could not reach Blizzard: {err.reason}")
            time.sleep(3)
    raise UpdateError(f"Gave up after repeated errors for {path}.")


# ----------------------------------------------------------------------------
# Recipes
# ----------------------------------------------------------------------------
def find_profession_id(token, region, namespace, name, fallback_id):
    index = api_get("/data/wow/profession/index", token, region, namespace)
    if isinstance(index, dict):
        for p in index.get("professions", []):
            if text_of(p.get("name")).lower() == name.lower():
                return p["id"]
    if not fallback_id:
        raise UpdateError(f"Could not find a profession named '{name}'. Check the spelling in config.json "
                          "or add a fallback_id.")
    print(f"Could not find '{name}' in the profession list; trying ID {fallback_id}.")
    return fallback_id


def collect_recipe_list(token, region, namespace, profession_id, name="profession"):
    profession = api_get(f"/data/wow/profession/{profession_id}", token, region, namespace)
    if not profession:
        raise UpdateError(f"{name}: the profession page was not found. Forever's profession data may not be "
                          "available through the API yet.")
    found = []
    tiers = profession.get("skill_tiers") or []
    for tier in tiers:
        data = api_get(f"/data/wow/profession/{profession_id}/skill-tier/{tier.get('id')}", token, region, namespace)
        if not data:
            continue
        lists = [g.get("recipes") or [] for g in (data.get("categories") or [])] + [data.get("recipes") or []]
        for recipe_list in lists:
            for recipe in recipe_list:
                found.append((recipe["id"], text_of(recipe.get("name")), text_of(tier.get("name"))))
        time.sleep(DELAY)
    if not tiers:
        for recipe in profession.get("recipes") or []:
            found.append((recipe["id"], text_of(recipe.get("name")), ""))
    seen, unique = set(), []
    for item in found:
        if item[0] not in seen:
            seen.add(item[0])
            unique.append(item)
    return unique


def read_recipe(recipe_id, fallback_name, tier, token, region, namespace):
    data = api_get(f"/data/wow/recipe/{recipe_id}", token, region, namespace)
    if not data:
        return None
    crafted = (data.get("crafted_item") or data.get("alliance_crafted_item")
               or data.get("horde_crafted_item") or {})
    quantity = data.get("crafted_quantity") or {}
    reagents = []
    for r in (data.get("reagents") or [])[:MAX_REAGENTS]:
        item = r.get("reagent") or {}
        if item.get("id"):
            reagents.append({"id": item["id"], "name": text_of(item.get("name")), "qty": r.get("quantity") or 1})
    if not reagents:
        return None
    return {
        "id": recipe_id,
        "name": text_of(data.get("name")) or fallback_name,
        "item": text_of(crafted.get("name")),
        "item_id": crafted.get("id") or None,
        "tier": tier,
        "qty": quantity.get("value") or quantity.get("minimum") or 1,
        "reagents": reagents,
    }


def slug(name):
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in name).strip("-")


def get_recipes(token, region, config, profession):
    name = profession["name"]
    cache_file = CACHE_DIR / f"recipes-{slug(name)}.json"
    cache = load_json(cache_file)
    if is_fresh(cache, config.get("refresh_recipes_hours", 24)):
        print(f"{name}: using {len(cache['recipes'])} cached recipes.")
        return cache["recipes"]

    namespace = f"static-forever-{region}"
    profession_id = find_profession_id(token, region, namespace, name, profession.get("fallback_id"))
    recipe_list = collect_recipe_list(token, region, namespace, profession_id, name)
    if not recipe_list:
        raise UpdateError(f"{name}: no recipes were found. Forever's recipe data may not be available through the API yet.")
    print(f"{name}: downloading {len(recipe_list)} recipes...")
    recipes = []
    for number, (recipe_id, recipe_name, tier) in enumerate(recipe_list, start=1):
        recipe = read_recipe(recipe_id, recipe_name, tier, token, region, namespace)
        if recipe:
            recipes.append(recipe)
        time.sleep(DELAY)
        if number % 50 == 0:
            print(f"  {number}/{len(recipe_list)}")
    if not recipes:
        raise UpdateError(f"{name}: recipes were found but none had reagent data.")
    save_json(cache_file, {"fetched": time.time(), "recipes": recipes})
    return recipes


# ----------------------------------------------------------------------------
# Vendor prices
# ----------------------------------------------------------------------------
def get_vendor_prices(token, region, config, item_ids):
    cache_file = CACHE_DIR / "vendor.json"
    cache = load_json(cache_file)
    if is_fresh(cache, config.get("refresh_recipes_hours", 24)) and set(map(str, item_ids)) <= set(cache["prices"]):
        return {int(k): v for k, v in cache["prices"].items()}

    namespace = f"static-forever-{region}"
    print(f"Looking up vendor prices for {len(item_ids)} reagents...")
    prices = {}
    for item_id in sorted(item_ids):
        data = api_get(f"/data/wow/item/{item_id}", token, region, namespace)
        price = 0
        if data:
            stack = data.get("purchase_quantity") or 1
            price = (data.get("purchase_price") or 0) / max(stack, 1) / COPPER_PER_GOLD
        prices[str(item_id)] = round(price, 6)
        time.sleep(DELAY)
    save_json(cache_file, {"fetched": time.time(), "prices": prices})
    return {int(k): v for k, v in prices.items()}


# ----------------------------------------------------------------------------
# Auction prices
# ----------------------------------------------------------------------------
def weighted_percentile(sorted_entries, fraction):
    total = sum(q for _, q in sorted_entries)
    target = total * fraction
    running = 0
    for price, quantity in sorted_entries:
        running += quantity
        if running >= target:
            return price
    return sorted_entries[-1][0]


def summarize_house(house_data, commodity_data, wanted_ids):
    """{item_id: [lowest, p25, median, listings]} in gold, for the wanted items only."""
    entries = {}
    auctions = (house_data or {}).get("auctions")
    for auction in auctions if isinstance(auctions, list) else []:
        item_id = (auction.get("item") or {}).get("id")
        buyout = auction.get("buyout")
        quantity = auction.get("quantity") or 1
        if item_id in wanted_ids and buyout:
            entries.setdefault(item_id, []).append((buyout / quantity / COPPER_PER_GOLD, quantity))
    commodities = (commodity_data or {}).get("auctions")
    for auction in commodities if isinstance(commodities, list) else []:
        item_id = (auction.get("item") or {}).get("id")
        unit_price = auction.get("unit_price")
        quantity = auction.get("quantity") or 1
        if item_id in wanted_ids and unit_price:
            entries.setdefault(item_id, []).append((unit_price / COPPER_PER_GOLD, quantity))
    result = {}
    for item_id, lst in entries.items():
        ordered = sorted(lst)
        result[str(item_id)] = [
            round(ordered[0][0], 4),
            round(weighted_percentile(ordered, 0.25), 4),
            round(weighted_percentile(ordered, 0.50), 4),
            len(ordered),
        ]
    return result


def get_auction_prices(token, region, ruleset, wanted_ids):
    dynamic = f"dynamic-forever-{region}"
    index = api_get(f"/data/wow/ruleset/{ruleset}/auctions/", token, region, dynamic)  # trailing slash matters
    houses = (index or {}).get("auctions") or []
    if not houses:
        raise UpdateError(f"No auction houses were returned for ruleset {ruleset}. "
                          "The API may have changed, or the ruleset number in config.json is wrong.")
    prices, house_list = {}, []
    for house in houses:
        house_id = house["id"]
        print(f"Downloading auction house {house_id} ({house.get('name', '')})...")
        house_data = api_get(f"/data/wow/ruleset/{ruleset}/auctions/{house_id}", token, region, dynamic)
        commodity_data = api_get(f"/data/wow/ruleset/{ruleset}/auctions/{house_id}/commodities", token, region, dynamic)
        summary = summarize_house(house_data, commodity_data, wanted_ids)
        if summary:
            prices[str(house_id)] = summary
            house_list.append({"id": house_id, "name": house.get("name", f"House {house_id}"), "items": len(summary)})
    if not prices:
        raise UpdateError("Auction data was downloaded but none of it matched your recipes' items.")
    return prices, house_list



# ----------------------------------------------------------------------------
# Price history (for the little charts on the page)
# ----------------------------------------------------------------------------
HISTORY_FILE = CACHE_DIR / "history.json"


def update_history(config, data):
    """Adds one snapshot (25th percentile price, in copper) for the default house every few hours."""
    settings = config.get("history") or {}
    if settings.get("enabled", True) is False:
        return
    gap = float(settings.get("hours_between_points", 6)) * 3600
    max_points = max(2, int(float(settings.get("days", 28)) * 24 * 3600 / gap))
    house = str(data["default_house"])
    hist = load_json(HISTORY_FILE, {}) or {}
    if hist.get("house") != house or not isinstance(hist.get("times"), list) or not isinstance(hist.get("items"), dict):
        hist = {"house": house, "times": [], "items": {}}
    now = int(time.time())
    if not hist["times"] or now - hist["times"][-1] >= gap - 600:
        count = len(hist["times"])
        hist["times"].append(now)
        seen = set()
        for item_id, row in (data["prices"].get(house) or {}).items():
            price = row[1] if len(row) > 1 else 0
            series = hist["items"].setdefault(item_id, [None] * count)
            series.append(int(round(price * COPPER_PER_GOLD)) if price and price > 0 else None)
            seen.add(item_id)
        for item_id, series in hist["items"].items():
            if item_id not in seen:
                series.append(None)
        extra = len(hist["times"]) - max_points
        if extra > 0:
            hist["times"] = hist["times"][extra:]
            for item_id in list(hist["items"]):
                hist["items"][item_id] = hist["items"][item_id][extra:]
                if not any(v is not None for v in hist["items"][item_id]):
                    del hist["items"][item_id]
        save_json(HISTORY_FILE, hist)
    save_json(SITE_DIR / "history.json", hist)
    print(f"History: {len(hist['times'])} snapshots for house {house}.")


# ----------------------------------------------------------------------------
# Optional Discord post of the best crafts
# ----------------------------------------------------------------------------
def price_for(data, house, item_id, basis, allow_vendor):
    key = str(item_id)
    override = data["overrides"].get(key)
    if override and override > 0:
        return override
    row = (data["prices"].get(str(house)) or {}).get(key)
    if row and row[basis] and row[basis] > 0:
        return row[basis]
    if allow_vendor:
        vendor = data["vendor"].get(key)
        if vendor and vendor > 0:
            return vendor
    return None


def top_crafts(data, house, per_profession, min_listings=3):
    cut = data.get("ah_cut", 0.05)
    result = []
    for profession in data["professions"]:
        rows = []
        for recipe in profession["recipes"]:
            if not recipe.get("item_id"):
                continue
            sell = price_for(data, house, recipe["item_id"], 1, False)
            listing = (data["prices"].get(str(house)) or {}).get(str(recipe["item_id"]))
            if not sell or not listing or listing[3] < min_listings:
                continue
            cost, ok = 0, True
            for reagent in recipe["reagents"]:
                price = price_for(data, house, reagent["id"], 1, True)
                if price is None:
                    ok = False
                    break
                cost += price * reagent["qty"]
            if ok:
                rows.append((recipe["qty"] * sell * (1 - cut) - cost, recipe["name"], cost))
        rows.sort(reverse=True)
        result.append((profession["name"], rows[:per_profession]))
    return result


def fmt_gold(value):
    return f"{value:,.0f}g" if abs(value) >= 100 else f"{value:.2f}g"


def maybe_post_discord(config, data):
    settings = config.get("discord") or {}
    url = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not url or not settings.get("enabled", False):
        return
    state_file = CACHE_DIR / "discord.json"
    state = load_json(state_file, {}) or {}
    gap = float(settings.get("hours_between_posts", 24)) * 3600
    if time.time() - state.get("last", 0) < gap - 600:
        return
    house = data["default_house"]
    house_name = next((h["name"] for h in data["houses"] if h["id"] == house), f"House {house}")
    fields = []
    for name, rows in top_crafts(data, house, int(settings.get("top_n", 5))):
        if rows:
            value = "\n".join(f"{i}. {n} - **{fmt_gold(p)}** profit (cost {fmt_gold(c)})" for i, (p, n, c) in enumerate(rows, 1))
            fields.append({"name": name, "value": value[:1000], "inline": False})
    if not fields:
        return
    embed = {
        "title": "Best crafts right now",
        "description": f"{house_name} auction house, 25th percentile prices, items with 3+ listings.",
        "color": 0xD6B26A,
        "fields": fields,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if config.get("site_url"):
        embed["url"] = config["site_url"]
    body = json.dumps({"username": "Crafter's Ledger", "embeds": [embed]}).encode()
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "User-Agent": "crafters-ledger"})
    try:
        with urllib.request.urlopen(request, timeout=30):
            pass
        save_json(state_file, {"last": time.time()})
        print("Posted the best crafts to Discord.")
    except Exception as err:  # never fail the site update because of Discord
        print(f"WARNING: Discord post failed: {err}", file=sys.stderr)


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def professions_from_config(config):
    """Accepts the new list format, or the old single-profession settings."""
    listed = config.get("professions")
    if listed:
        return [p if isinstance(p, dict) else {"name": p} for p in listed]
    return [{"name": config.get("profession", "Tailoring"), "fallback_id": config.get("profession_fallback_id", 197)}]


def main():
    config = load_json(ROOT / "config.json", {})
    overrides = (load_json(ROOT / "overrides.json", {}) or {}).get("items", {})
    region = str(config.get("region", "us")).lower()
    ruleset = config.get("ruleset", 2)

    client_id = os.environ.get("BLIZZARD_CLIENT_ID", "").strip()
    client_secret = os.environ.get("BLIZZARD_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise UpdateError("BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET are not set. "
                          "Add them as repository secrets (see README).")
    token = get_token(client_id, client_secret)

    # Each profession is read separately. If one fails but another works, the page still
    # publishes and shows a warning for the one that failed.
    profession_data, errors = [], []
    for profession in professions_from_config(config):
        try:
            recipes = get_recipes(token, region, config, profession)
            profession_data.append({"name": profession["name"], "recipes": recipes})
        except UpdateError as err:
            print(f"WARNING: {err}", file=sys.stderr)
            errors.append(str(err))
    if not profession_data:
        raise UpdateError("No profession could be loaded. " + " | ".join(errors))

    all_recipes = [r for p in profession_data for r in p["recipes"]]
    reagent_ids = {r["id"] for recipe in all_recipes for r in recipe["reagents"]}
    output_ids = {recipe["item_id"] for recipe in all_recipes if recipe["item_id"]}
    vendor = get_vendor_prices(token, region, config, sorted(reagent_ids))
    prices, houses = get_auction_prices(token, region, ruleset, reagent_ids | output_ids)

    names = {}
    for recipe in all_recipes:
        for r in recipe["reagents"]:
            if r["name"]:
                names[str(r["id"])] = r["name"]
        if recipe["item_id"] and recipe["item"]:
            names[str(recipe["item_id"])] = recipe["item"]

    default_house = config.get("default_house") or max(houses, key=lambda h: h["items"])["id"]
    data = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "region": region,
        "ruleset": ruleset,
        "ah_cut": config.get("ah_cut", 0.05),
        "default_house": default_house,
        "houses": houses,
        "professions": profession_data,
        "errors": errors,
        "repo": os.environ.get("GITHUB_REPOSITORY", ""),
        "names": names,
        "prices": prices,
        "vendor": {str(k): v for k, v in vendor.items() if v > 0},
        "overrides": {str(k): v for k, v in overrides.items() if isinstance(v, (int, float)) and v > 0},
    }
    SITE_DIR.mkdir(exist_ok=True)
    save_json(SITE_DIR / "data.json", data)
    for step in (update_history, maybe_post_discord):
        try:
            step(config, data)
        except Exception as err:  # extras must never stop the site from updating
            print(f"WARNING: {step.__name__} failed: {err}", file=sys.stderr)
    summary = ", ".join(f"{p['name']} {len(p['recipes'])}" for p in profession_data)
    print(f"Done: {summary} recipes, {len(houses)} auction houses with data. Wrote site/data.json")


if __name__ == "__main__":
    try:
        main()
    except UpdateError as err:
        print(f"\nERROR: {err}", file=sys.stderr)
        sys.exit(1)
