// WoW: Forever profit calculator - page logic.
// The calculation functions are plain and testable; the page code at the bottom only runs in a browser.
(function () {
  "use strict";

  var BASIS = { lowest: 0, p25: 1, median: 2 };
  var SCARCE = 3; // fewer listings than this = scarce reagent / thin market

  // Price of one item: hand-set override, then auction price, then vendor price.
  function priceFor(data, houseId, itemId, basis, allowVendor) {
    var id = String(itemId);
    var override = data.overrides[id];
    if (override > 0) return { price: override, source: "override" };
    var house = data.prices[String(houseId)];
    var row = house && house[id];
    if (row && row[BASIS[basis]] > 0) return { price: row[BASIS[basis]], source: "auction" };
    if (allowVendor) {
      var vendor = data.vendor[id];
      if (vendor > 0) return { price: vendor, source: "vendor" };
    }
    return null;
  }

  function recipesFor(data, professionName) {
    if (!data.professions) return data.recipes || [];
    var found = data.professions.filter(function (p) { return p.name === professionName; })[0] || data.professions[0];
    return found ? found.recipes : [];
  }

  function computeRows(data, s) {
    var rows = [];
    recipesFor(data, s.profession).forEach(function (recipe) {
      var cost = 0;
      var missing = [];
      var scarce = [];
      var reagents = recipe.reagents.map(function (r) {
        var found = priceFor(data, s.house, r.id, s.buyBasis, true);
        var name = r.name || data.names[String(r.id)] || "Item " + r.id;
        if (!found) {
          missing.push(name);
          return { id: r.id, name: name, qty: r.qty, price: null, source: "missing" };
        }
        cost += found.price * r.qty;
        var hrow = data.prices[String(s.house)] && data.prices[String(s.house)][String(r.id)];
        var rl = hrow ? hrow[3] : 0;
        if (found.source === "auction" && rl < SCARCE) scarce.push(name);
        return { id: r.id, name: name, qty: r.qty, price: found.price, source: found.source, listings: rl };
      });

      var sellFound = recipe.item_id ? priceFor(data, s.house, recipe.item_id, s.sellBasis, false) : null;
      var listingsRow = recipe.item_id && data.prices[String(s.house)] ? data.prices[String(s.house)][String(recipe.item_id)] : null;
      var listings = listingsRow ? listingsRow[3] : 0;

      var status = "ok";
      if (!recipe.item_id) status = "no output item";
      else if (!sellFound) status = "no auction price for the item it makes";
      else if (missing.length) status = "missing reagent price: " + missing.join(", ");

      var row = {
        id: recipe.id,
        itemId: recipe.item_id || null,
        rawCost: missing.length ? null : cost,
        name: recipe.name,
        tier: recipe.tier || "",
        qty: recipe.qty || 1,
        sell: sellFound ? sellFound.price : null,
        sellSource: sellFound ? sellFound.source : null,
        listings: listings,
        cost: status === "ok" ? cost : null,
        reagents: reagents,
        scarce: scarce,
        status: status,
        profit: null,
        roi: null,
      };
      if (status === "ok") {
        row.profit = row.qty * row.sell * (1 - s.cut) - cost;
        row.roi = cost > 0 ? row.profit / cost : null;
      }
      rows.push(row);
    });

    var q = (s.search || "").trim().toLowerCase();
    rows = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1) return false;
      if (s.tier && r.tier !== s.tier) return false;
      if (s.hideIncomplete && r.status !== "ok") return false;
      if (s.hideScarce && r.scarce.length) return false;
      if (s.minListings > 0 && (r.status !== "ok" || r.listings < s.minListings)) return false;
      return true;
    });

    var key = s.rankBy === "roi" ? "roi" : (s.rankBy === "depth" ? "listings" : "profit");
    rows.sort(function (a, b) {
      if (a[key] === null && b[key] === null) return a.name.localeCompare(b.name);
      if (a[key] === null) return 1;
      if (b[key] === null) return -1;
      return b[key] - a[key];
    });
    return rows;
  }

  function formatGold(g) {
    if (g === null || g === undefined) return "-";
    var negative = g < 0;
    var copper = Math.round(Math.abs(g) * 10000);
    var out;
    if (copper >= 10000 * 100) {
      out = Math.round(copper / 10000).toLocaleString() + "g";
    } else if (copper >= 10000) {
      out = (copper / 10000).toFixed(2) + "g";
    } else {
      var silver = Math.floor(copper / 100);
      var rest = copper % 100;
      var parts = [];
      if (silver) parts.push(silver + "s");
      if (rest || !silver) parts.push(rest + "c");
      out = parts.join(" ");
    }
    return (negative ? "-" : "") + out;
  }


  // ---- tools: pure functions so they can be tested without a browser
  function cheapestHouse(data, itemId, basis) {
    var best = null;
    Object.keys(data.prices).forEach(function (h) {
      var row = data.prices[h][String(itemId)];
      var v = row && row[BASIS[basis]];
      if (v > 0 && (!best || v < best.price)) best = { house: h, price: v, listings: row[3] };
    });
    return best;
  }

  function shoppingTotals(data, s, list) {
    var base = Object.assign({}, s, { hideIncomplete: false, hideScarce: false, search: "", tier: "", minListings: 0 });
    var cache = {}, lines = [], need = {}, revenue = 0;
    Object.keys(list).forEach(function (key) {
      var qty = list[key];
      if (!(qty > 0)) return;
      var i = key.indexOf(":");
      var prof = key.slice(0, i), id = key.slice(i + 1);
      if (data.professions && !data.professions.some(function (p) { return p.name === prof; })) return;
      if (!cache[prof]) cache[prof] = computeRows(data, Object.assign({}, base, { profession: prof }));
      var row = cache[prof].filter(function (r) { return String(r.id) === id; })[0];
      if (!row) return;
      lines.push({ key: key, prof: prof, name: row.name, qty: qty, row: row });
      row.reagents.forEach(function (g) {
        var n = need[g.id] || (need[g.id] = { id: g.id, name: g.name, qty: 0 });
        n.qty += g.qty * qty;
      });
      if (row.status === "ok") revenue += qty * row.qty * row.sell * (1 - s.cut);
    });
    var cost = 0, saving = 0, unpriced = [];
    var reagents = Object.keys(need).map(function (id) {
      var n = need[id];
      var found = priceFor(data, s.house, id, s.buyBasis, true);
      var best = cheapestHouse(data, id, s.buyBasis);
      var total = found ? found.price * n.qty : null;
      if (total === null) unpriced.push(n.name); else cost += total;
      var save = 0;
      if (found && found.source === "auction" && best && String(best.house) !== String(s.house) && best.price < found.price) {
        save = (found.price - best.price) * n.qty;
      }
      saving += save;
      return { id: id, name: n.name, qty: n.qty, unit: found ? found.price : null, source: found ? found.source : "missing", total: total, best: best, saving: save };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { lines: lines, reagents: reagents, cost: cost, revenue: revenue, profit: revenue - cost, saving: saving, unpriced: unpriced };
  }

  // Which house is mine? entries: [{ itemId, price }] with the lowest price seen in game, in gold.
  function findHouses(data, entries) {
    var used = entries.filter(function (e) { return e.itemId && e.price > 0; });
    if (!used.length) return [];
    return data.houses.map(function (h) {
      var score = 0, matched = 0;
      used.forEach(function (e) {
        var row = data.prices[String(h.id)] && data.prices[String(h.id)][String(e.itemId)];
        if (row && row[0] > 0) { score += Math.abs(Math.log(row[0] / e.price)); matched++; } else { score += 3; }
      });
      return { house: h, score: score, matched: matched, entries: used.length };
    }).sort(function (a, b) { return a.score - b.score; });
  }

  function craftVsBuyRows(data, s) {
    var rows = computeRows(data, Object.assign({}, s, { hideIncomplete: true, hideScarce: false, minListings: 0 }));
    var out = [];
    rows.forEach(function (r) {
      var buy = r.itemId ? priceFor(data, s.house, r.itemId, s.buyBasis, false) : null;
      if (!buy || r.rawCost === null) return;
      var worth = buy.price * r.qty;
      out.push({ id: r.id, name: r.name, tier: r.tier, qty: r.qty, craft: r.rawCost, buy: worth, save: worth - r.rawCost,
                 pct: r.rawCost > 0 ? (worth - r.rawCost) / r.rawCost : null, listings: r.listings });
    });
    out.sort(function (a, b) { return b.save - a.save; });
    return out;
  }

  var CONSUMABLE_RE = /\b(flask|elixir|potion|draught|philter|oil|weightstone|sharpening stone|bandage|poison|juju|food|feast|stew|soup|roast|brew|salve|rune)\b/i;
  function consumableRows(data, s) {
    var out = [];
    (data.professions || []).forEach(function (p) {
      var base = Object.assign({}, s, { profession: p.name, hideIncomplete: false, hideScarce: false, search: "", tier: "", minListings: 0 });
      computeRows(data, base).forEach(function (r) {
        if (p.name !== "Cooking" && !CONSUMABLE_RE.test(r.name)) return;
        var buy = r.itemId ? priceFor(data, s.house, r.itemId, s.buyBasis, false) : null;
        out.push({ key: p.name + ":" + r.id, prof: p.name, name: r.name, qty: r.qty, craft: r.rawCost, buy: buy ? buy.price : null });
      });
    });
    out.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return out;
  }
  function consumableTotals(rows, plan) {
    var craft = 0, buy = 0, unknown = 0;
    rows.forEach(function (r) {
      var units = plan[r.key];
      if (!(units > 0)) return;
      if (r.craft !== null) craft += Math.ceil(units / r.qty) * r.craft; else unknown++;
      if (r.buy !== null) buy += units * r.buy;
    });
    return { craft: craft, buy: buy, unknown: unknown };
  }

  function levelingRows(data, s) {
    var rows = computeRows(data, Object.assign({}, s, { hideIncomplete: false, hideScarce: false, minListings: 0 }));
    return rows.filter(function (r) { return r.rawCost !== null; }).map(function (r) {
      var resale = r.sell !== null ? r.qty * r.sell * (1 - s.cut) : 0;
      return { id: r.id, name: r.name, tier: r.tier, cost: r.rawCost, resale: resale, net: r.rawCost - resale, sellable: r.sell !== null };
    }).sort(function (a, b) { return a.net - b.net; });
  }

  // History: hist = { house, times: [unix...], items: { itemId: [copper or null, ...] } }
  function trendFor(hist, itemId) {
    var series = hist && hist.items && hist.items[String(itemId)];
    if (!series) return null;
    var vals = series.filter(function (v) { return v !== null && v > 0; });
    if (vals.length < 8) return null;
    var sorted = vals.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    var current = null;
    for (var i = series.length - 1; i >= 0; i--) { if (series[i] > 0) { current = series[i]; break; } }
    var ratio = current / median;
    return { series: series, current: current, median: median, tag: ratio <= 0.85 ? "cheap" : (ratio >= 1.15 ? "expensive" : null) };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { computeRows: computeRows, priceFor: priceFor, formatGold: formatGold, recipesFor: recipesFor,
      cheapestHouse: cheapestHouse, findHouses: findHouses, shoppingTotals: shoppingTotals, craftVsBuyRows: craftVsBuyRows,
      consumableRows: consumableRows, consumableTotals: consumableTotals, levelingRows: levelingRows, trendFor: trendFor };
  }
  if (typeof document === "undefined") return;

  // ------------------------------------------------------------------ page
  var $ = function (id) { return document.getElementById(id); };
  var data = null;
  var historyPromise = null;
  var activeTab = "rank";
  var TABS = ["rank", "list", "cvb", "cons", "lvl"];

  var ICONS = {
    Tailoring: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 26 24 6"/><ellipse cx="25" cy="5" rx="1.6" ry="2.6" transform="rotate(40 25 5)"/><path d="M9 10c6-4 9 4 14 0M7 16c6-4 9 4 14 0M11 22c4-2 7 2 11 0" opacity=".8"/></svg>',
    Blacksmithing: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h17c0 4-3 6-7 6v3h5v4H9v-4h5v-3C9 15 6 13 4 9z"/><path d="M21 9h6c-1 3-3 4-6 4"/><path d="M8 27h16"/></svg>',
    Alchemy: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3h8M13 3v8L5 25a2 2 0 0 0 2 3h18a2 2 0 0 0 2-3l-8-14V3"/><path d="M9 20h14"/></svg>',
    Enchanting: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 27 19 13"/><path d="M22 3l1.6 4.4L28 9l-4.4 1.6L22 15l-1.6-4.4L16 9l4.4-1.6z"/><path d="M8 7v4M6 9h4M26 21v4M24 23h4"/></svg>',
    Engineering: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="5"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l3 3M22 22l3 3M25 7l-3 3M10 22l-3 3"/></svg>',
    Leatherworking: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4l-5 6 4 4 3-2v16h10V12l3 2 4-4-5-6-4 3h-6z"/></svg>',
    Cooking: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14h22l-2 11a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"/><path d="M3 14h26M12 5c-2 2 2 3 0 5M18 5c-2 2 2 3 0 5"/></svg>',
    _: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l3 8 8 1-6 6 2 9-7-4-7 4 2-9-6-6 8-1z"/></svg>'
  };
  function iconFor(name) { return ICONS[name] || ICONS._; }

  function loadObj(key) {
    try { var o = JSON.parse(localStorage.getItem(key) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
  }
  function saveObj(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* private mode: ignore */ }
  }
  var favs = loadObj("forever-favs");
  var list = loadObj("forever-list");
  var raid = loadObj("forever-raid");
  function loadSettings() { return loadObj("forever-settings"); }
  function saveSettings(s) { saveObj("forever-settings", s); }

  function currentSettings() {
    return {
      profession: $("profession").value,
      house: $("house").value,
      buyBasis: $("buyBasis").value,
      sellBasis: $("sellBasis").value,
      cut: Math.max(0, Math.min(0.5, parseFloat($("cut").value) / 100 || 0)),
      rankBy: $("rankBy").value,
      minListings: parseInt($("minListings").value, 10) || 0,
      search: $("search").value,
      tier: $("tier").value,
      hideIncomplete: $("hideIncomplete").checked,
      hideScarce: $("hideScarce").checked,
      favOnly: $("favOnly").checked,
      tab: activeTab,
    };
  }

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, className, onClick, label) {
    var b = el("button", text, className);
    b.type = "button";
    if (label) b.setAttribute("aria-label", label);
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(e); });
    return b;
  }
  function houseLabel(h) { return (h.label || h.name || "House " + h.id) + " (ID " + h.id + ")"; }
  function houseName(id) {
    var h = data.houses.filter(function (x) { return String(x.id) === String(id); })[0];
    return h ? houseLabel(h) : "house " + id;
  }
  var RULESETS = { 1: "PvP", 2: "Normal", 3: "Roleplay", 15: "Roleplay PvP" };
  function pct(v) { return v === null || v === undefined ? "-" : Math.round(v * 100) + "%"; }

  // Builds a table; returns { wrap, tbody }. cols: [{label, num, hideSm}]
  function makeTable(cols) {
    var wrap = el("div", null, "tablewrap");
    var table = el("table");
    var head = el("tr");
    cols.forEach(function (c) {
      head.appendChild(el("th", c.label, (c.num ? "num " : "") + (c.hideSm ? "hide-sm" : "")));
    });
    var thead = el("thead");
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = el("tbody");
    table.appendChild(tbody);
    wrap.appendChild(table);
    return { wrap: wrap, tbody: tbody, cols: cols };
  }
  function addRow(t, cells) {
    var tr = el("tr");
    cells.forEach(function (cell, i) {
      var spec = t.cols[i] || {};
      var td = el("td", null, (spec.num ? "num " : "") + (spec.hideSm ? "hide-sm" : ""));
      if (cell instanceof Node) td.appendChild(cell); else td.textContent = cell === null || cell === undefined ? "-" : String(cell);
      tr.appendChild(td);
    });
    t.tbody.appendChild(tr);
    return tr;
  }
  function note(text, cls) { return el("p", text, cls || "hint"); }
  function stat(label, value, cls) {
    var box = el("div", null, "stat");
    box.appendChild(el("div", label, "stat-l"));
    box.appendChild(el("div", value, "stat-v " + (cls || "")));
    return box;
  }

  function fillTiers(professionName, keep) {
    var tierSelect = $("tier");
    tierSelect.textContent = "";
    var all = el("option", "All");
    all.value = "";
    tierSelect.appendChild(all);
    var tiers = [];
    recipesFor(data, professionName).forEach(function (r) { if (r.tier && tiers.indexOf(r.tier) === -1) tiers.push(r.tier); });
    tiers.forEach(function (t) { var o = el("option", t); o.value = t; tierSelect.appendChild(o); });
    tierSelect.value = keep && tiers.indexOf(keep) !== -1 ? keep : "";
  }

  function professionNames() {
    return (data.professions || [{ name: data.profession || "Tailoring" }]).map(function (p) { return p.name; });
  }

  function renderHint(current) {
    var hint = $("profHint");
    hint.textContent = "";
    var names = professionNames();
    hint.appendChild(el("span", names.length + (names.length === 1 ? " profession available:" : " professions available:")));
    names.forEach(function (n) {
      var chip = el("button", n, "chip" + (n === current ? " on" : ""));
      chip.type = "button";
      chip.addEventListener("click", function () { $("profession").value = n; onProfessionChange(); });
      hint.appendChild(chip);
    });
    hint.appendChild(el("span", "(use the box above or tap a name)"));
  }

  // ---- history charts
  function loadHistory() {
    if (!historyPromise) {
      historyPromise = fetch("history.json?v=" + Date.now())
        .then(function (r) { if (!r.ok) throw new Error("none"); return r.json(); })
        .catch(function () { return null; });
    }
    return historyPromise;
  }
  function spark(series) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 120 30");
    svg.setAttribute("class", "spark");
    svg.setAttribute("aria-hidden", "true");
    var vals = series.filter(function (v) { return v > 0; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = hi - lo || 1;
    var d = "", pen = false;
    series.forEach(function (v, i) {
      if (!(v > 0)) { pen = false; return; }
      var x = series.length > 1 ? i / (series.length - 1) * 118 + 1 : 60;
      var y = 28 - (v - lo) / span * 26;
      d += (pen ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      pen = true;
    });
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }
  function historyBlock(r, s) {
    var box = el("div", null, "hist");
    box.appendChild(el("div", "Price history (25th percentile)", "hist-title"));
    var items = [];
    if (r.itemId) items.push({ id: r.itemId, name: r.name + " (what it makes)" });
    r.reagents.forEach(function (g) { if (g.source === "auction") items.push({ id: g.id, name: g.name }); });
    loadHistory().then(function (h) {
      if (!h || !h.times || h.times.length < 2) {
        box.appendChild(note("History is still building. Charts appear after a couple of days of hourly updates."));
        return;
      }
      if (String(h.house) !== String(s.house)) box.appendChild(note("History is only recorded for " + houseName(h.house) + ", so these charts show that house."));
      var shown = 0;
      items.forEach(function (it) {
        var t = trendFor(h, it.id);
        if (!t) return;
        shown++;
        var row = el("div", null, "hrow");
        row.appendChild(el("span", it.name, "hname"));
        row.appendChild(spark(t.series));
        row.appendChild(el("span", "now " + formatGold(t.current / 10000) + ", typical " + formatGold(t.median / 10000), "htext"));
        if (t.tag) row.appendChild(el("em", t.tag === "cheap" ? "Cheap right now" : "Expensive right now", "trend-" + t.tag));
        box.appendChild(row);
      });
      if (!shown) box.appendChild(note("Not enough history for these items yet."));
    });
    return box;
  }

  // ---- list helpers
  function listCount() { return Object.keys(list).filter(function (k) { return list[k] > 0; }).length; }
  function updateListCount() { $("listCount").textContent = String(listCount()); }
  function addToList(key) { list[key] = (list[key] || 0) + 1; saveObj("forever-list", list); updateListCount(); }

  // ---- tab: rankings
  function podiumCard(r, place) {
    var card = el("div", null, "medal r" + place);
    card.appendChild(el("div", "#" + place + " best craft", "rank"));
    card.appendChild(el("h3", r.name));
    card.appendChild(el("div", r.tier || " ", "tier"));
    card.appendChild(el("div", formatGold(r.profit), "big"));
    card.appendChild(el("div", "profit per craft" + (r.roi === null ? "" : " - " + Math.round(r.roi * 100) + "% return"), "sub"));
    return card;
  }

  function renderRank(s) {
    var rows = computeRows(data, s);
    rows.forEach(function (r, i) { r.rank = i + 1; r.key = s.profession + ":" + r.id; });
    var body = $("rows");
    body.textContent = "";

    var incomplete = computeRows(data, Object.assign({}, s, { hideIncomplete: false, search: "", tier: "", minListings: 0, hideScarce: false }))
      .filter(function (r) { return r.status !== "ok"; }).length;

    var podium = $("podium");
    podium.textContent = "";
    var best = rows.filter(function (r) { return r.profit !== null; }).slice(0, 3);
    best.forEach(function (r, i) { podium.appendChild(podiumCard(r, i + 1)); });
    $("podiumSection").hidden = best.length === 0;

    if (s.favOnly) rows = rows.filter(function (r) { return favs[r.key]; });
    rows = rows.filter(function (r) { return favs[r.key]; }).concat(rows.filter(function (r) { return !favs[r.key]; }));
    $("summary").textContent = rows.length + " recipes shown" +
      (incomplete ? " - " + incomplete + " recipes in total are missing a price" : "") +
      (Object.keys(favs).length ? " - favorites are pinned to the top" : "");

    var maxProfit = 0;
    rows.forEach(function (r) { if (r.profit !== null && r.profit > maxProfit) maxProfit = r.profit; });

    if (!rows.length) {
      var emptyRow = el("tr");
      var emptyCell = el("td", "No recipes match. Try clearing the search, or untick \"Hide recipes missing a price\" in the filters.", "empty");
      emptyCell.colSpan = 8;
      emptyRow.appendChild(emptyCell);
      body.appendChild(emptyRow);
    }

    rows.forEach(function (r) {
      var tr = el("tr", null, "main");
      tr.tabIndex = 0;
      tr.setAttribute("aria-expanded", "false");
      tr.appendChild(el("td", String(r.rank), "rk"));

      var nameCell = el("td");
      nameCell.appendChild(el("div", r.name, "rname"));
      if (r.tier) nameCell.appendChild(el("div", r.tier, "rtier"));
      if (r.status !== "ok") nameCell.appendChild(el("div", r.status, "warn"));
      if (r.scarce.length) nameCell.appendChild(el("span", "Scarce reagent: " + r.scarce.join(", "), "badge"));
      if (r.status === "ok" && r.listings < 3) nameCell.appendChild(el("span", "Thin market (" + r.listings + " listed)", "badge"));
      tr.appendChild(nameCell);

      var profit = el("td", null, "num");
      profit.appendChild(el("span", formatGold(r.profit), r.profit !== null ? (r.profit >= 0 ? "pos" : "neg") : ""));
      if (r.profit !== null && r.profit > 0 && maxProfit > 0) {
        var bar = el("div", null, "bar");
        var fill = el("i");
        fill.style.width = Math.max(2, Math.round(r.profit / maxProfit * 100)) + "%";
        bar.appendChild(fill);
        profit.appendChild(bar);
      }
      tr.appendChild(profit);
      tr.appendChild(el("td", r.roi === null ? "-" : Math.round(r.roi * 100) + "%", "num"));
      tr.appendChild(el("td", formatGold(r.sell), "num hide-sm"));
      tr.appendChild(el("td", String(r.listings), "num hide-sm"));
      tr.appendChild(el("td", formatGold(r.cost), "num"));

      var actions = el("td", null, "acts");
      var isFav = !!favs[r.key];
      actions.appendChild(button(isFav ? "★" : "☆", "icon-btn" + (isFav ? " on" : ""), function () {
        if (favs[r.key]) delete favs[r.key]; else favs[r.key] = 1;
        saveObj("forever-favs", favs);
        render();
      }, isFav ? "Remove " + r.name + " from favorites" : "Add " + r.name + " to favorites"));
      var plus = button("+", "icon-btn", function () {
        addToList(r.key);
        plus.textContent = "✓";
        setTimeout(function () { plus.textContent = "+"; }, 1200);
      }, "Add " + r.name + " to the shopping list");
      actions.appendChild(plus);
      tr.appendChild(actions);

      var detail = el("tr", null, "detail");
      detail.hidden = true;
      var dcell = el("td");
      dcell.colSpan = 8;
      var wrap = el("div", null, "reag");
      r.reagents.forEach(function (g) {
        var chip = el("span", g.qty + " x " + g.name + (g.price === null ? "" : "  " + formatGold(g.price) + " each = " + formatGold(g.price * g.qty) + (g.source === "auction" ? " (" + g.listings + " listed)" : "")));
        chip.appendChild(el("em", g.source === "missing" ? "no price" : g.source, "src-" + g.source));
        wrap.appendChild(chip);
      });
      if (r.qty > 1) wrap.appendChild(el("span", "Makes " + r.qty + " per craft"));
      dcell.appendChild(wrap);
      var historyBox = null;
      detail.appendChild(dcell);

      function toggle() {
        detail.hidden = !detail.hidden;
        tr.setAttribute("aria-expanded", String(!detail.hidden));
        if (!detail.hidden && !historyBox) { historyBox = historyBlock(r, s); dcell.appendChild(historyBox); }
      }
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", function (e) {
        if (e.target === tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); }
      });
      body.appendChild(tr);
      body.appendChild(detail);
    });
  }

  // ---- tab: shopping list
  function listText(t) {
    var out = ["Crafts:"];
    t.lines.forEach(function (l) { out.push(l.qty + " x " + l.name + " (" + l.prof + ")"); });
    out.push("", "Buy these:");
    t.reagents.forEach(function (g) { out.push(g.qty + " x " + g.name + (g.total !== null ? " (~" + formatGold(g.total) + ")" : "")); });
    return out.join("\n");
  }
  function renderList(s) {
    var box = $("listBody");
    box.textContent = "";
    var t = shoppingTotals(data, s, list);
    if (!t.lines.length) {
      box.appendChild(note("Your list is empty. In Crafting rankings, press + on any recipe to add it here.", "empty"));
      return;
    }
    var stats = el("div", null, "stats");
    stats.appendChild(stat("Reagent cost", formatGold(t.cost)));
    stats.appendChild(stat("Expected sales (after cut)", formatGold(t.revenue)));
    stats.appendChild(stat("Expected profit", formatGold(t.profit), t.profit >= 0 ? "pos" : "neg"));
    if (t.saving > 0) stats.appendChild(stat("Possible saving at the cheapest houses", formatGold(t.saving), "pos"));
    box.appendChild(stats);
    if (t.unpriced.length) box.appendChild(note("No price found for: " + t.unpriced.join(", ") + ". The cost is lower than it really is.", "warn"));

    box.appendChild(el("h3", "Crafts", "sub-h"));
    var ct = makeTable([{ label: "Recipe" }, { label: "Profession", hideSm: true }, { label: "How many", num: true }, { label: "" }]);
    t.lines.forEach(function (l) {
      var qty = el("input", null, "qty");
      qty.type = "number"; qty.min = "1"; qty.step = "1"; qty.value = String(l.qty);
      qty.setAttribute("aria-label", "Number of " + l.name);
      qty.addEventListener("change", function () {
        var n = Math.max(0, Math.floor(parseFloat(qty.value) || 0));
        if (n > 0) list[l.key] = n; else delete list[l.key];
        saveObj("forever-list", list); updateListCount(); render();
      });
      var rm = button("Remove", "link-btn", function () { delete list[l.key]; saveObj("forever-list", list); updateListCount(); render(); });
      addRow(ct, [l.name, l.prof, qty, rm]);
    });
    box.appendChild(ct.wrap);

    box.appendChild(el("h3", "Reagents to buy", "sub-h"));
    var rt = makeTable([{ label: "Reagent" }, { label: "Needed", num: true }, { label: "Each", num: true, hideSm: true }, { label: "Total", num: true }, { label: "Cheapest house" }]);
    t.reagents.forEach(function (g) {
      var cheapest = "-";
      if (g.best) {
        cheapest = String(g.best.house) === String(s.house) ? "Your house is cheapest" :
          houseName(g.best.house) + " at " + formatGold(g.best.price) + (g.saving > 0 ? " (save " + formatGold(g.saving) + ")" : "");
      }
      addRow(rt, [g.name + (g.source === "vendor" ? " (vendor)" : ""), g.qty, formatGold(g.unit), formatGold(g.total), cheapest]);
    });
    box.appendChild(rt.wrap);

    var bar = el("div", null, "btnrow");
    var copy = button("Copy list", "navbtn", function () {
      var text = listText(t);
      var done = function (m) { copy.textContent = m; setTimeout(function () { copy.textContent = "Copy list"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done("Copied!"); }, function () { done("Copy failed"); });
      else done("Copy not supported");
    });
    bar.appendChild(copy);
    bar.appendChild(button("Clear list", "navbtn", function () { list = {}; saveObj("forever-list", list); updateListCount(); render(); }));
    box.appendChild(bar);
    box.appendChild(note("Prices use your selected auction house and the \"Buy reagents at\" setting. Cheapest house compares all houses in the data; you would need to travel there to buy."));
  }

  // ---- tab: craft vs buy
  function renderCvb(s) {
    var box = $("cvbBody");
    box.textContent = "";
    var rows = craftVsBuyRows(data, s);
    if ($("cvbOnly").checked) rows = rows.filter(function (r) { return r.save > 0; });
    if (!rows.length) { box.appendChild(note("Nothing to show for " + s.profession + " here. Crafting is not cheaper than buying for any priced recipe, or prices are missing.", "empty")); return; }
    var t = makeTable([{ label: "Recipe" }, { label: "Craft cost", num: true }, { label: "Buy it for", num: true }, { label: "You save", num: true }, { label: "Saving", num: true, hideSm: true }]);
    rows.slice(0, 200).forEach(function (r) {
      var name = el("div");
      name.appendChild(el("div", r.name, "rname"));
      if (r.tier) name.appendChild(el("div", r.tier, "rtier"));
      addRow(t, [name, formatGold(r.craft), formatGold(r.buy), el("span", formatGold(r.save), r.save >= 0 ? "pos" : "neg"), pct(r.pct)]);
    });
    box.appendChild(t.wrap);
  }

  // ---- tab: raid consumables
  function renderCons(s) {
    var box = $("consBody");
    box.textContent = "";
    var rows = consumableRows(data, s);
    if (!rows.length) { box.appendChild(note("No consumables found in the loaded professions.", "empty")); return; }
    var totals = el("div", null, "stats");
    box.appendChild(totals);
    var t = makeTable([{ label: "Consumable" }, { label: "Profession", hideSm: true }, { label: "Craft cost (per item)", num: true }, { label: "Buy price", num: true }, { label: "Needed", num: true }]);
    function refresh() {
      var sums = consumableTotals(rows, raid);
      totals.textContent = "";
      totals.appendChild(stat("Cost if you craft", formatGold(sums.craft)));
      totals.appendChild(stat("Cost if you buy", formatGold(sums.buy)));
      var diff = sums.buy - sums.craft;
      totals.appendChild(stat(diff >= 0 ? "Crafting saves" : "Buying saves", formatGold(Math.abs(diff)), diff >= 0 ? "pos" : "neg"));
    }
    rows.forEach(function (r) {
      var qty = el("input", null, "qty");
      qty.type = "number"; qty.min = "0"; qty.step = "1"; qty.value = String(raid[r.key] || 0);
      qty.setAttribute("aria-label", "Number of " + r.name + " needed");
      qty.addEventListener("change", function () {
        var n = Math.max(0, Math.floor(parseFloat(qty.value) || 0));
        if (n > 0) raid[r.key] = n; else delete raid[r.key];
        saveObj("forever-raid", raid); refresh();
      });
      addRow(t, [r.name, r.prof, r.craft === null ? "no price" : formatGold(r.craft / r.qty), r.buy === null ? "none listed" : formatGold(r.buy), qty]);
    });
    box.appendChild(t.wrap);
    refresh();
    box.appendChild(note("Enter how many of each item you need for a raid night. Found by name (flasks, elixirs, potions, oils, stones, bandages and all of Cooking), so a few may be missing or extra."));
  }

  // ---- tab: leveling helper
  function renderLvl(s) {
    var box = $("lvlBody");
    box.textContent = "";
    var rows = levelingRows(data, s);
    if (!rows.length) { box.appendChild(note("No priced recipes found. Try clearing the filters.", "empty")); return; }
    var t = makeTable([{ label: "Recipe" }, { label: "Reagent cost", num: true }, { label: "Resale value", num: true, hideSm: true }, { label: "Net cost", num: true }]);
    rows.slice(0, 200).forEach(function (r) {
      var name = el("div");
      name.appendChild(el("div", r.name, "rname"));
      var sub = (r.tier || "") + (r.sellable ? "" : (r.tier ? " - " : "") + "no auction price, counted as not resellable");
      if (sub) name.appendChild(el("div", sub, "rtier"));
      addRow(t, [name, formatGold(r.cost), r.sellable ? formatGold(r.resale) : "-", el("span", formatGold(r.net), r.net <= 0 ? "pos" : "")]);
    });
    box.appendChild(t.wrap);
  }

  // ---- main render
  function render() {
    var s = currentSettings();
    document.title = "Crafter's Ledger - " + s.profession + " profits in WoW: Forever";
    $("title").textContent = s.profession + " profits in WoW: Forever";
    $("profIcon").innerHTML = iconFor(s.profession);
    renderHint(s.profession);
    saveSettings(s);
    syncUrl(s);
    updateListCount();
    TABS.forEach(function (t) {
      $("tab-" + t).hidden = t !== activeTab;
      var b = document.querySelector('[data-tab="' + t + '"]');
      b.className = "tab" + (t === activeTab ? " on" : "");
      b.setAttribute("aria-selected", String(t === activeTab));
    });
    if (activeTab === "rank") renderRank(s);
    else if (activeTab === "list") renderList(s);
    else if (activeTab === "cvb") renderCvb(s);
    else if (activeTab === "cons") renderCons(s);
    else if (activeTab === "lvl") renderLvl(s);
  }

  function syncUrl(s) {
    try { history.replaceState(null, "", "#p=" + encodeURIComponent(s.profession) + "&h=" + encodeURIComponent(s.house) + "&t=" + activeTab); } catch (e) { /* ignore */ }
  }
  function readHash() {
    var out = {};
    String(location.hash || "").replace(/^#/, "").split("&").forEach(function (part) {
      var kv = part.split("=");
      if (kv[0] && kv[1]) { try { out[kv[0]] = decodeURIComponent(kv[1]); } catch (e) { /* ignore */ } }
    });
    return out;
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = $("themeBtn");
    if (btn) btn.textContent = theme === "light" ? "Dark mode" : "Light mode";
    try { localStorage.setItem("forever-theme", theme); } catch (e) { /* ignore */ }
  }
  function ahTypeFromCut(p) { return p === 5 ? "faction" : (p === 15 ? "neutral" : "custom"); }
  function agoText(ms) {
    var m = Math.round(ms / 60000);
    if (m < 2) return "just now";
    if (m < 90) return m + " minutes ago";
    var h = Math.round(m / 60);
    return h < 48 ? h + " hours ago" : Math.round(h / 24) + " days ago";
  }

  function onProfessionChange() {
    $("profWrap").className = "select-wrap touched";
    fillTiers($("profession").value, "");
    render();
  }

  function init() {
    var saved = loadSettings();
    var hash = readHash();
    var houseSelect = $("house");
    data.houses.forEach(function (h) {
      var option = el("option", houseLabel(h));
      option.value = String(h.id);
      houseSelect.appendChild(option);
    });
    if (hash.h && data.prices[hash.h]) saved.house = hash.h;
    houseSelect.value = saved.house && data.prices[saved.house] ? saved.house : String(data.default_house);

    var professionSelect = $("profession");
    var names = professionNames();
    names.forEach(function (n) {
      var option = el("option", n);
      option.value = n;
      professionSelect.appendChild(option);
    });
    if (hash.p && names.indexOf(hash.p) !== -1) saved.profession = hash.p;
    professionSelect.value = saved.profession && names.indexOf(saved.profession) !== -1 ? saved.profession : names[0];
    fillTiers(professionSelect.value, saved.tier);

    var wantTab = hash.t || saved.tab;
    activeTab = TABS.indexOf(wantTab) !== -1 ? wantTab : "rank";

    $("buyBasis").value = saved.buyBasis || "p25";
    $("sellBasis").value = saved.sellBasis || "p25";
    $("cut").value = saved.cut !== undefined ? Math.round(saved.cut * 1000) / 10 : data.ah_cut * 100;
    $("rankBy").value = saved.rankBy || "profit";
    $("minListings").value = saved.minListings || 0;
    $("hideIncomplete").checked = saved.hideIncomplete !== false;
    $("hideScarce").checked = !!saved.hideScarce;
    $("favOnly").checked = !!saved.favOnly;
    $("ahType").value = ahTypeFromCut(parseFloat($("cut").value));
    $("ahType").addEventListener("change", function () {
      if ($("ahType").value === "faction") $("cut").value = 5;
      if ($("ahType").value === "neutral") $("cut").value = 15;
      render();
    });
    $("cut").addEventListener("input", function () { $("ahType").value = ahTypeFromCut(parseFloat($("cut").value)); });
    $("themeBtn").addEventListener("click", function () {
      applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
    $("shareBtn").addEventListener("click", function () {
      var btn = $("shareBtn");
      var done = function (msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = "Copy link"; }, 2200); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(function () { done("Link copied!"); }, function () { done("Copy the address bar"); });
      } else { done("Copy the address bar"); }
    });
    TABS.forEach(function (t) {
      document.querySelector('[data-tab="' + t + '"]').addEventListener("click", function () { activeTab = t; render(); });
    });
    $("cvbOnly").addEventListener("change", render);
    $("rulesetLine").textContent = "This page shows " + String(data.region || "us").toUpperCase() + " " + (RULESETS[data.ruleset] || "ruleset " + data.ruleset) +
      " auction houses (" + data.houses.length + " of them).";
    var byName = {}, datalist = $("findItems");
    Object.keys(data.names || {}).forEach(function (id) {
      var anyPrice = data.houses.some(function (h) { return data.prices[String(h.id)] && data.prices[String(h.id)][id]; });
      if (!anyPrice) return;
      byName[data.names[id].toLowerCase()] = id;
      var o = document.createElement("option");
      o.value = data.names[id];
      datalist.appendChild(o);
    });
    $("findBtn").addEventListener("click", function () {
      var entries = [];
      [1, 2, 3].forEach(function (n) {
        var id = byName[$("findItem" + n).value.trim().toLowerCase()];
        var price = parseFloat($("findPrice" + n).value);
        if (id && price > 0) entries.push({ itemId: id, price: price });
      });
      var out = $("findResults");
      out.textContent = "";
      if (!entries.length) { out.appendChild(note("Pick at least one item from the list and enter its lowest price in gold.", "warn")); return; }
      var found = findHouses(data, entries).slice(0, 3);
      var clear = found.length > 1 && found[0].score < found[1].score * 0.6;
      out.appendChild(note(clear ? "Best match:" : "Closest matches (not a clear winner - add another item to be sure):", "hint"));
      found.forEach(function (f) {
        var row = el("div", null, "hrow");
        row.appendChild(el("span", houseLabel(f.house), "hname"));
        row.appendChild(el("span", f.matched + " of " + f.entries + " items matched", "htext"));
        row.appendChild(button("Use this house", "navbtn", function () { $("house").value = String(f.house.id); render(); }));
        out.appendChild(row);
      });
    });
    if (data.repo) {
      var fb = $("feedbackLink");
      fb.href = "https://github.com/" + data.repo + "/issues/new";
      fb.hidden = false;
    }

    ["house", "buyBasis", "sellBasis", "cut", "rankBy", "minListings", "tier", "hideIncomplete", "hideScarce", "favOnly"].forEach(function (id) {
      $(id).addEventListener("change", render);
    });
    professionSelect.addEventListener("change", onProfessionChange);
    $("search").addEventListener("input", render);

    var updated = new Date(data.updated);
    var ageHours = (Date.now() - updated.getTime()) / 3600000;
    $("updated").textContent = "Last updated " + updated.toLocaleString() + " (" + agoText(Date.now() - updated.getTime()) + ")" +
      (ageHours > 4 ? " - this data is " + Math.round(ageHours) + " hours old, so the hourly update may have stopped." : "");
    if (ageHours > 4) $("updatedBox").className = "status stale";
    if (data.errors && data.errors.length) {
      var errBox = $("errors");
      errBox.textContent = "Some data could not be loaded and is missing from this page: " + data.errors.join(" | ");
      errBox.hidden = false;
    }
    render();
  }

  var startTheme = "dark";
  try { startTheme = localStorage.getItem("forever-theme") || "dark"; } catch (e) { /* ignore */ }
  applyTheme(startTheme === "light" ? "light" : "dark");

  fetch("data.json?v=" + Date.now())
    .then(function (response) { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then(function (json) { data = json; init(); })
    .catch(function (err) {
      $("updated").textContent = "Could not load the price data (" + err.message + "). If this page was just set up, wait for the first update to finish.";
      $("updatedBox").className = "status stale";
      if (window.console) console.error(err);
    });
})();
