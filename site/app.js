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

  function computeRows(data, s) {
    var rows = [];
    data.recipes.forEach(function (recipe) {
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
    module.exports = { computeRows: computeRows, priceFor: priceFor, formatGold: formatGold };
  }
  if (typeof document === "undefined") return;

  // ------------------------------------------------------------------ page
  var $ = function (id) { return document.getElementById(id); };
  var data = null;

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem("forever-settings") || "{}"); } catch (e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem("forever-settings", JSON.stringify(s)); } catch (e) { /* private mode: ignore */ }
  }

  function currentSettings() {
    return {
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

  function render() {
    var s = currentSettings();
    saveSettings(s);
    var rows = computeRows(data, s);
    var body = $("rows");
    body.textContent = "";

    var incomplete = computeRows(data, Object.assign({}, s, { hideIncomplete: false, search: "", tier: "", minListings: 0 }))
      .filter(function (r) { return r.status !== "ok"; }).length;
    $("summary").textContent = rows.length + " recipes shown" +
      (incomplete ? " - " + incomplete + " recipes in total are missing a price" : "");

    rows.forEach(function (r, index) {
      var tr = el("tr", null, "main");
      tr.appendChild(el("td", String(index + 1), "num"));
      var nameCell = el("td", r.name);
      if (r.status !== "ok") nameCell.appendChild(el("div", r.status, "warn"));
      tr.appendChild(nameCell);
      tr.appendChild(el("td", r.tier, "tier"));
      var profit = el("td", formatGold(r.profit), "num " + (r.profit !== null ? (r.profit >= 0 ? "pos" : "neg") : ""));
      tr.appendChild(profit);
      tr.appendChild(el("td", r.roi === null ? "-" : Math.round(r.roi * 100) + "%", "num"));
      tr.appendChild(el("td", formatGold(r.sell), "num"));
      tr.appendChild(el("td", String(r.listings), "num"));
      tr.appendChild(el("td", formatGold(r.cost), "num"));

      var detail = el("tr", null, "detail");
      detail.hidden = true;
      var dcell = el("td");
      dcell.colSpan = 8;
      var list = el("ul");
      r.reagents.forEach(function (g) {
        var line = g.qty + " x " + g.name + (g.price === null ? ": no price" :
          ": " + formatGold(g.price) + " each (" + g.source + ") = " + formatGold(g.price * g.qty));
        list.appendChild(el("li", line));
      });
      if (r.qty > 1) list.appendChild(el("li", "Makes " + r.qty + " per craft."));
      dcell.appendChild(list);
      detail.appendChild(dcell);
      tr.addEventListener("click", function () { detail.hidden = !detail.hidden; });
      body.appendChild(tr);
      body.appendChild(detail);
    });
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

    var tiers = [];
    data.recipes.forEach(function (r) { if (r.tier && tiers.indexOf(r.tier) === -1) tiers.push(r.tier); });
    tiers.forEach(function (t) { var o = el("option", t); o.value = t; $("tier").appendChild(o); });

    $("buyBasis").value = saved.buyBasis || "p25";
    $("sellBasis").value = saved.sellBasis || "p25";
    $("cut").value = saved.cut !== undefined ? Math.round(saved.cut * 1000) / 10 : data.ah_cut * 100;
    $("rankBy").value = saved.rankBy || "profit";
    $("minListings").value = saved.minListings || 0;
    $("hideIncomplete").checked = saved.hideIncomplete !== false;

    ["house", "buyBasis", "sellBasis", "cut", "rankBy", "minListings", "tier", "hideIncomplete"].forEach(function (id) {
      $(id).addEventListener("change", render);
    });
    $("search").addEventListener("input", render);

    var updated = new Date(data.updated);
    var ageHours = (Date.now() - updated.getTime()) / 3600000;
    $("updated").textContent = "Prices updated " + updated.toLocaleString() +
      (ageHours > 4 ? " - this data is " + Math.round(ageHours) + " hours old, so the hourly update may have stopped." : "");
    if (ageHours > 4) $("updated").className = "warn";
    $("title").textContent = "WoW: Forever " + data.profession + " profit";
    document.title = "WoW: Forever " + data.profession + " profit";
    render();
  }

  fetch("data.json?v=" + Date.now())
    .then(function (response) { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then(function (json) { data = json; init(); })
    .catch(function (err) {
      $("updated").textContent = "Could not load the price data (" + err.message + "). If this page was just set up, wait for the first update to finish.";
      $("updated").className = "warn";
    });
})();
