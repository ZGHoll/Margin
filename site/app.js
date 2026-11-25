// WoW: Forever profit calculator - page logic.
// The calculation functions are plain and testable; the page code at the bottom only runs in a browser.
(function () {
  "use strict";

  var BASIS = { lowest: 0, p25: 1, median: 2 };

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
      var reagents = recipe.reagents.map(function (r) {
        var found = priceFor(data, s.house, r.id, s.buyBasis, true);
        var name = r.name || data.names[String(r.id)] || "Item " + r.id;
        if (!found) {
          missing.push(name);
          return { name: name, qty: r.qty, price: null, source: "missing" };
        }
        cost += found.price * r.qty;
        return { name: name, qty: r.qty, price: found.price, source: found.source };
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
        name: recipe.name,
        tier: recipe.tier || "",
        qty: recipe.qty || 1,
        sell: sellFound ? sellFound.price : null,
        sellSource: sellFound ? sellFound.source : null,
        listings: listings,
        cost: status === "ok" ? cost : null,
        reagents: reagents,
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
      if (s.minListings > 0 && (r.status !== "ok" || r.listings < s.minListings)) return false;
      return true;
    });

    var key = s.rankBy === "roi" ? "roi" : "profit";
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { computeRows: computeRows, priceFor: priceFor, formatGold: formatGold, recipesFor: recipesFor };
  }
  if (typeof document === "undefined") return;

  // ------------------------------------------------------------------ page
  var $ = function (id) { return document.getElementById(id); };
  var data = null;

  var ICONS = {
    Tailoring: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 26 24 6"/><ellipse cx="25" cy="5" rx="1.6" ry="2.6" transform="rotate(40 25 5)"/><path d="M9 10c6-4 9 4 14 0M7 16c6-4 9 4 14 0M11 22c4-2 7 2 11 0" opacity=".8"/></svg>',
    Blacksmithing: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h17c0 4-3 6-7 6v3h5v4H9v-4h5v-3C9 15 6 13 4 9z"/><path d="M21 9h6c-1 3-3 4-6 4"/><path d="M8 27h16"/></svg>',
    _: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l3 8 8 1-6 6 2 9-7-4-7 4 2-9-6-6 8-1z"/></svg>'
  };
  function iconFor(name) { return ICONS[name] || ICONS._; }

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem("forever-settings") || "{}"); } catch (e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem("forever-settings", JSON.stringify(s)); } catch (e) { /* private mode: ignore */ }
  }

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
    };
  }

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
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
      chip.addEventListener("click", function () {
        $("profession").value = n;
        onProfessionChange();
      });
      hint.appendChild(chip);
    });
    hint.appendChild(el("span", "(use the box above or tap a name)"));
  }

  function podiumCard(r, place) {
    var card = el("div", null, "medal r" + place);
    card.appendChild(el("div", "#" + place + " best craft", "rank"));
    card.appendChild(el("h3", r.name));
    card.appendChild(el("div", r.tier || " ", "tier"));
    card.appendChild(el("div", formatGold(r.profit), "big"));
    card.appendChild(el("div", "profit per craft" + (r.roi === null ? "" : " - " + Math.round(r.roi * 100) + "% return"), "sub"));
    return card;
  }

  function render() {
    var s = currentSettings();
    document.title = "Crafter's Ledger - " + s.profession + " profits in WoW: Forever";
    $("title").textContent = s.profession + " profits in WoW: Forever";
    $("profIcon").innerHTML = iconFor(s.profession);
    renderHint(s.profession);
    saveSettings(s);
    var rows = computeRows(data, s);
    var body = $("rows");
    body.textContent = "";

    var incomplete = computeRows(data, Object.assign({}, s, { hideIncomplete: false, search: "", tier: "", minListings: 0 }))
      .filter(function (r) { return r.status !== "ok"; }).length;
    $("summary").textContent = rows.length + " recipes shown" +
      (incomplete ? " - " + incomplete + " recipes in total are missing a price" : "");

    var podium = $("podium");
    podium.textContent = "";
    var best = rows.filter(function (r) { return r.profit !== null; }).slice(0, 3);
    best.forEach(function (r, i) { podium.appendChild(podiumCard(r, i + 1)); });
    $("podiumSection").hidden = best.length === 0;

    var maxProfit = 0;
    rows.forEach(function (r) { if (r.profit !== null && r.profit > maxProfit) maxProfit = r.profit; });

    if (!rows.length) {
      var emptyRow = el("tr");
      var emptyCell = el("td", "No recipes match. Try clearing the search, or untick \"Hide recipes missing a price\" in the filters.", "empty");
      emptyCell.colSpan = 7;
      emptyRow.appendChild(emptyCell);
      body.appendChild(emptyRow);
    }

    rows.forEach(function (r, index) {
      var tr = el("tr", null, "main");
      tr.tabIndex = 0;
      tr.setAttribute("aria-expanded", "false");
      tr.appendChild(el("td", String(index + 1), "rk"));

      var nameCell = el("td");
      nameCell.appendChild(el("div", r.name, "rname"));
      if (r.tier) nameCell.appendChild(el("div", r.tier, "rtier"));
      if (r.status !== "ok") nameCell.appendChild(el("div", r.status, "warn"));
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
      tr.appendChild(el("td", formatGold(r.sell), "num"));
      tr.appendChild(el("td", String(r.listings), "num"));
      tr.appendChild(el("td", formatGold(r.cost), "num"));

      var detail = el("tr", null, "detail");
      detail.hidden = true;
      var dcell = el("td");
      dcell.colSpan = 7;
      var wrap = el("div", null, "reag");
      r.reagents.forEach(function (g) {
        var chip = el("span", g.qty + " x " + g.name + (g.price === null ? "" : "  " + formatGold(g.price) + " each = " + formatGold(g.price * g.qty)));
        chip.appendChild(el("em", g.source === "missing" ? "no price" : g.source, "src-" + g.source));
        wrap.appendChild(chip);
      });
      if (r.qty > 1) wrap.appendChild(el("span", "Makes " + r.qty + " per craft"));
      dcell.appendChild(wrap);
      detail.appendChild(dcell);

      function toggle() {
        detail.hidden = !detail.hidden;
        tr.setAttribute("aria-expanded", String(!detail.hidden));
      }
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
      body.appendChild(tr);
      body.appendChild(detail);
    });
  }

  function onProfessionChange() {
    $("profWrap").className = "select-wrap touched";
    fillTiers($("profession").value, "");
    render();
  }

  function init() {
    var saved = loadSettings();
    var houseSelect = $("house");
    data.houses.forEach(function (h) {
      var option = el("option", h.name + " (ID " + h.id + ")");
      option.value = String(h.id);
      houseSelect.appendChild(option);
    });
    var wanted = saved.house && data.prices[saved.house] ? saved.house : String(data.default_house);
    houseSelect.value = wanted;

    var professionSelect = $("profession");
    var names = professionNames();
    names.forEach(function (n) {
      var option = el("option", n);
      option.value = n;
      professionSelect.appendChild(option);
    });
    professionSelect.value = saved.profession && names.indexOf(saved.profession) !== -1 ? saved.profession : names[0];
    fillTiers(professionSelect.value, saved.tier);

    $("buyBasis").value = saved.buyBasis || "p25";
    $("sellBasis").value = saved.sellBasis || "p25";
    $("cut").value = saved.cut !== undefined ? Math.round(saved.cut * 1000) / 10 : data.ah_cut * 100;
    $("rankBy").value = saved.rankBy || "profit";
    $("minListings").value = saved.minListings || 0;
    $("hideIncomplete").checked = saved.hideIncomplete !== false;

    ["house", "buyBasis", "sellBasis", "cut", "rankBy", "minListings", "tier", "hideIncomplete"].forEach(function (id) {
      $(id).addEventListener("change", render);
    });
    professionSelect.addEventListener("change", onProfessionChange);
    $("search").addEventListener("input", render);

    var updated = new Date(data.updated);
    var ageHours = (Date.now() - updated.getTime()) / 3600000;
    $("updated").textContent = "Prices updated " + updated.toLocaleString() +
      (ageHours > 4 ? " - this data is " + Math.round(ageHours) + " hours old, so the hourly update may have stopped." : "");
    if (ageHours > 4) $("updatedBox").className = "status stale";
    if (data.errors && data.errors.length) {
      var note = $("errors");
      note.textContent = "Some data could not be loaded and is missing from this page: " + data.errors.join(" | ");
      note.hidden = false;
    }
    render();
  }

  fetch("data.json?v=" + Date.now())
    .then(function (response) { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then(function (json) { data = json; init(); })
    .catch(function (err) {
      $("updated").textContent = "Could not load the price data (" + err.message + "). If this page was just set up, wait for the first update to finish.";
      $("updatedBox").className = "status stale";
    });
})();
