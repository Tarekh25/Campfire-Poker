// Classic caisse: 1x$5, 3x$1, 2x50c, 4x25c = $10 face value, costs $2 real.
const CLASSIC_CHIP_TYPES = [
  { value: 5, qty: 1 },
  { value: 1, qty: 3 },
  { value: 0.5, qty: 2 },
  { value: 0.25, qty: 4 },
];
const DEFAULT_REAL_PER_CAISSE = 2;

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;
const MIN_CHIP_TYPES = 1;
const MAX_CHIP_TYPES = 10;

const GAMES_STORAGE_KEY = "campfirePokerGames";

let players = []; // [{ name, caisses (cumulative total), roundCaisses (this round only) }]
let chipConfig = null; // { types: [{ value, qty, label }], realPerCaisse, caisseFaceValue }
let lastChipRowsKey = null; // tracks what buildChipRows() was last built from
let games = []; // saved games, loaded from localStorage
let currentGame = null; // { id, createdAt, updatedAt, chipConfig, players: [{name, totalCaisses, lastChipValue, lastRoundCaisses}], roundNumber }
let roundMode = false; // true while entering a new round for an existing game

const stepHome = document.getElementById("step-home");
const stepSetup = document.getElementById("step-setup");
const stepCustom = document.getElementById("step-custom");
const stepPlayers = document.getElementById("step-players");
const stepChips = document.getElementById("step-chips");
const stepResults = document.getElementById("step-results");

const gamesListEl = document.getElementById("games-list");
const noGamesHint = document.getElementById("no-games-hint");

const chipTypeRows = document.getElementById("chip-type-rows");
const realPerCaisseInput = document.getElementById("real-per-caisse");

const playersHint = document.getElementById("players-hint");
const playerRows = document.getElementById("player-rows");
const chipRows = document.getElementById("chip-rows");
const resultsBody = document.getElementById("results-body");
const settlementList = document.getElementById("settlement-list");
const warningBanner = document.getElementById("warning-banner");
const chipsWarningBanner = document.getElementById("chips-warning-banner");

document.getElementById("btn-new-game").addEventListener("click", startNewGame);
document.getElementById("btn-classic").addEventListener("click", chooseClassic);
document.getElementById("btn-custom").addEventListener("click", showCustomSetup);
document.getElementById("btn-add-chip-type").addEventListener("click", () => addChipTypeRow());
document.getElementById("btn-cancel-custom").addEventListener("click", () => showStep(stepSetup));
document.getElementById("btn-confirm-custom").addEventListener("click", confirmCustomSetup);
document.getElementById("btn-setup-back").addEventListener("click", goHome);
document.getElementById("btn-add-player").addEventListener("click", () => addPlayerRow());
document.getElementById("btn-back-to-setup").addEventListener("click", backFromPlayers);
document.getElementById("btn-to-chips").addEventListener("click", goToChipsStep);
document.getElementById("btn-back-to-players").addEventListener("click", () => showStep(stepPlayers));
document.getElementById("btn-calculate").addEventListener("click", attemptCalculate);
document.getElementById("btn-new-round").addEventListener("click", () => startNewRound(currentGame));
document.getElementById("btn-close-game").addEventListener("click", closeCurrentGame);
document.getElementById("btn-page-prev").addEventListener("click", () => showResultsPage(currentPageIndex - 1));
document.getElementById("btn-page-next").addEventListener("click", () => showResultsPage(currentPageIndex + 1));

function showStep(step) {
  [stepHome, stepSetup, stepCustom, stepPlayers, stepChips, stepResults].forEach((s) => s.classList.add("hidden"));
  step.classList.remove("hidden");
}

// ---------- Storage ----------

function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadGames() {
  try {
    const raw = localStorage.getItem(GAMES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGamesRaw(list) {
  localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(list));
}

function upsertGame(game) {
  const list = loadGames();
  const copy = JSON.parse(JSON.stringify(game));
  const idx = list.findIndex((g) => g.id === copy.id);
  if (idx >= 0) list[idx] = copy;
  else list.push(copy);
  saveGamesRaw(list);
}

function deleteGameById(id) {
  saveGamesRaw(loadGames().filter((g) => g.id !== id));
}

// ---------- Home screen ----------

function goHome() {
  currentGame = null;
  roundMode = false;
  players = [];
  chipConfig = null;
  lastChipRowsKey = null;
  playerRows.innerHTML = "";
  chipRows.innerHTML = "";
  chipTypeRows.innerHTML = "";
  renderGamesList();
  showStep(stepHome);
}

function renderGamesList() {
  games = loadGames();
  gamesListEl.innerHTML = "";

  if (games.length === 0) {
    noGamesHint.classList.remove("hidden");
    return;
  }
  noGamesHint.classList.add("hidden");

  const sorted = [...games].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  sorted.forEach((game) => {
    const row = document.createElement("div");
    row.className = "game-row";
    const dateStr = new Date(game.createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    row.innerHTML = `
      <button type="button" class="game-open">
        <span class="game-title">${dateStr}</span>
        <span class="game-meta">Round ${game.roundNumber} &middot; ${game.players.length} players</span>
      </button>
      <button type="button" class="game-delete" title="Delete game">&times;</button>
    `;
    row.querySelector(".game-open").addEventListener("click", () => openGame(game.id));
    row.querySelector(".game-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeleteGame(game.id);
    });
    gamesListEl.appendChild(row);
  });
}

function confirmDeleteGame(id) {
  const game = games.find((g) => g.id === id);
  if (!game) return;
  const dateStr = new Date(game.createdAt).toLocaleDateString();
  if (!window.confirm(`Delete the game from ${dateStr}? This can't be undone.`)) return;
  deleteGameById(id);
  renderGamesList();
}

function openGame(id) {
  const game = games.find((g) => g.id === id);
  if (!game) return;
  currentGame = JSON.parse(JSON.stringify(game));
  chipConfig = currentGame.chipConfig;
  roundMode = false;
  renderResultsFromGame(currentGame);
  showStep(stepResults);
}

// ---------- New game / caisse setup ----------

function startNewGame() {
  currentGame = null;
  roundMode = false;
  players = [];
  chipConfig = null;
  lastChipRowsKey = null;
  playerRows.innerHTML = "";
  chipRows.innerHTML = "";
  chipTypeRows.innerHTML = "";
  showStep(stepSetup);
}

function formatChipLabel(value) {
  if (value >= 1) return `$${parseFloat(value.toFixed(2))}`;
  return `${Math.round(value * 100)}c`;
}

function buildChipConfig(types, realPerCaisse) {
  const withLabels = types.map((t) => ({ ...t, label: formatChipLabel(t.value) }));
  const caisseFaceValue = withLabels.reduce((sum, t) => sum + t.value * t.qty, 0);
  return { types: withLabels, realPerCaisse, caisseFaceValue };
}

function chooseClassic() {
  chipConfig = buildChipConfig(CLASSIC_CHIP_TYPES, DEFAULT_REAL_PER_CAISSE);
  lastChipRowsKey = null;
  proceedToPlayers();
}

function showCustomSetup() {
  if (chipTypeRows.children.length === 0) {
    addChipTypeRow();
    addChipTypeRow();
  }
  showStep(stepCustom);
}

function addChipTypeRow() {
  if (chipTypeRows.children.length >= MAX_CHIP_TYPES) return;

  const row = document.createElement("div");
  row.className = "chip-type-row";
  row.innerHTML = `
    <div>
      <label>Value ($)</label>
      <input type="number" class="chip-value-input" min="0.01" step="0.01" value="1" />
    </div>
    <div>
      <label>Qty per caisse</label>
      <input type="number" class="chip-qty-input" min="1" value="1" />
    </div>
    <button type="button" class="remove-btn hidden" title="Remove chip type">&minus;</button>
  `;
  row.querySelector(".remove-btn").addEventListener("click", () => removeChipTypeRow(row));
  chipTypeRows.appendChild(row);

  updateChipTypeRemoveButtons();
}

function removeChipTypeRow(row) {
  if (chipTypeRows.children.length <= MIN_CHIP_TYPES) return;
  row.remove();
  updateChipTypeRemoveButtons();
}

function updateChipTypeRemoveButtons() {
  const rows = chipTypeRows.querySelectorAll(".chip-type-row");
  const showRemove = rows.length >= 2;
  rows.forEach((row) => {
    row.querySelector(".remove-btn").classList.toggle("hidden", !showRemove);
  });
}

function confirmCustomSetup() {
  const rows = chipTypeRows.querySelectorAll(".chip-type-row");
  const types = Array.from(rows).map((row) => {
    const value = parseFloat(row.querySelector(".chip-value-input").value) || 0;
    const qty = parseInt(row.querySelector(".chip-qty-input").value, 10) || 0;
    return { value, qty };
  });

  const realPerCaisse = parseFloat(realPerCaisseInput.value) || 0;
  chipConfig = buildChipConfig(types, realPerCaisse);
  lastChipRowsKey = null;
  proceedToPlayers();
}

function proceedToPlayers() {
  if (playerRows.children.length === 0) {
    addPlayerRow();
    addPlayerRow();
  }
  updatePlayersHint();
  showStep(stepPlayers);
}

// ---------- Players step ----------

function updatePlayersHint() {
  if (roundMode) {
    playersHint.textContent =
      "Existing players are locked in from before — enter their caisses for this round only. " +
      "You can add new players, but not remove or rename existing ones.";
    playersHint.classList.remove("hidden");
  } else {
    playersHint.classList.add("hidden");
  }
}

function backFromPlayers() {
  if (roundMode && currentGame) {
    renderResultsFromGame(currentGame);
    showStep(stepResults);
  } else {
    showStep(stepSetup);
  }
}

function addPlayerRow({ name = "", caisses = 1, locked = false } = {}) {
  if (playerRows.children.length >= MAX_PLAYERS) return;

  const row = document.createElement("div");
  row.className = locked ? "player-row locked" : "player-row";
  if (locked) row.dataset.locked = "true";

  const caissesTitle = roundMode ? "Caisses this round" : "Caisses";
  const nameHtml = locked
    ? `<span class="player-name-label">${name}</span>`
    : `<input type="text" class="name-input" placeholder="Player name" value="${name}" />`;
  const removeBtnHtml = locked ? "" : `<button type="button" class="remove-btn hidden" title="Remove player">&minus;</button>`;

  row.innerHTML = `
    ${nameHtml}
    <div class="stepper">
      <button type="button" class="step-btn step-minus" title="Decrease caisses">&minus;</button>
      <input type="number" class="caisses-input" min="0" value="${caisses}" title="${caissesTitle}" />
      <button type="button" class="step-btn step-plus" title="Increase caisses">+</button>
    </div>
    ${removeBtnHtml}
  `;

  const caissesInput = row.querySelector(".caisses-input");
  row.querySelector(".step-minus").addEventListener("click", () => stepCaisses(caissesInput, -1));
  row.querySelector(".step-plus").addEventListener("click", () => stepCaisses(caissesInput, 1));

  if (!locked) {
    row.querySelector(".remove-btn").addEventListener("click", () => removePlayerRow(row));
  }
  playerRows.appendChild(row);

  updateRemoveButtons();
}

function stepCaisses(input, delta) {
  const min = parseInt(input.min, 10) || 0;
  const current = parseInt(input.value, 10) || 0;
  input.value = Math.max(min, current + delta);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function removePlayerRow(row) {
  if (row.dataset.locked) return;
  if (!roundMode) {
    const rows = playerRows.querySelectorAll(".player-row");
    if (rows.length <= MIN_PLAYERS) return;
  }
  row.remove();
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const rows = Array.from(playerRows.querySelectorAll(".player-row"));
  if (roundMode) {
    rows.forEach((row) => {
      if (row.dataset.locked) return;
      const btn = row.querySelector(".remove-btn");
      if (btn) btn.classList.remove("hidden");
    });
  } else {
    const showRemove = rows.length >= 3;
    rows.forEach((row) => {
      const btn = row.querySelector(".remove-btn");
      if (btn) btn.classList.toggle("hidden", !showRemove);
    });
  }
}

// ---------- New round ----------

function startNewRound(game) {
  if (!game) return;
  currentGame = game;
  chipConfig = game.chipConfig;
  roundMode = true;
  lastChipRowsKey = null;
  playerRows.innerHTML = "";
  game.players.forEach((p) => addPlayerRow({ name: p.name, caisses: 0, locked: true }));
  updatePlayersHint();
  showStep(stepPlayers);
}

// ---------- Chips step ----------

function goToChipsStep() {
  const rows = playerRows.querySelectorAll(".player-row");

  for (const row of rows) {
    const caissesInput = row.querySelector(".caisses-input");
    if (parseInt(caissesInput.value, 10) < 0) {
      alert("Caisses can't be negative. Please enter 0 or more.");
      caissesInput.focus();
      return;
    }
  }

  players = [];
  rows.forEach((row, i) => {
    const nameInput = row.querySelector(".name-input");
    const label = row.querySelector(".player-name-label");
    const name = nameInput ? nameInput.value.trim() || `Player ${i + 1}` : label.textContent;
    const roundCaisses = parseInt(row.querySelector(".caisses-input").value, 10) || 0;

    let totalCaisses = roundCaisses;
    if (roundMode) {
      const existing = currentGame.players.find((p) => p.name === name);
      totalCaisses = (existing ? existing.totalCaisses : 0) + roundCaisses;
    }
    players.push({ name, caisses: totalCaisses, roundCaisses });
  });

  const key = players.map((p) => p.name).join("|");
  if (key !== lastChipRowsKey) {
    buildChipRows();
    lastChipRowsKey = key;
  }
  chipsWarningBanner.classList.add("hidden");
  showStep(stepChips);
}

function buildChipRows() {
  chipRows.innerHTML = "";
  players.forEach((player, i) => {
    const card = document.createElement("div");
    card.className = "chip-card";
    card.dataset.playerIndex = i;

    const inputsHtml = chipConfig.types.map(
      (type, j) => `
        <div>
          <label>${type.label}</label>
          <input type="number" class="chip-input" data-chip-index="${j}" min="0" value="0" />
        </div>`
    ).join("");

    card.innerHTML = `
      <div class="chip-name">${player.name}</div>
      <div class="chip-inputs">${inputsHtml}</div>
      <div class="chip-total">Value: $0.00</div>
    `;

    chipRows.appendChild(card);

    const chipInputs = card.querySelectorAll(".chip-input");
    const totalLabel = card.querySelector(".chip-total");
    chipInputs.forEach((input) => {
      input.addEventListener("input", () => {
        const total = getChipTotalFromCard(card);
        totalLabel.textContent = `Value: $${total.toFixed(2)}`;
        chipsWarningBanner.classList.add("hidden");
      });
    });
  });
}

function getChipTotalFromCard(card) {
  const chipInputs = card.querySelectorAll(".chip-input");
  let total = 0;
  chipInputs.forEach((input) => {
    const idx = parseInt(input.dataset.chipIndex, 10);
    const count = parseInt(input.value, 10) || 0;
    total += count * chipConfig.types[idx].value;
  });
  return total;
}

// ---------- Results ----------

function attemptCalculate() {
  const cards = chipRows.querySelectorAll(".chip-card");
  let totalRoundCaisses = 0;
  let totalChipValue = 0;
  players.forEach((player, i) => {
    totalRoundCaisses += player.roundCaisses;
    totalChipValue += getChipTotalFromCard(cards[i]);
  });

  const expected = totalRoundCaisses * chipConfig.caisseFaceValue;
  const diff = Math.round((totalChipValue - expected) * 100) / 100;

  if (Math.abs(diff) > 0.001) {
    chipsWarningBanner.textContent =
      `Warning: chips on the table ($${totalChipValue.toFixed(2)}) don't match ` +
      `expected total from this round's caisses ($${expected.toFixed(2)}). Off by $${diff > 0 ? "+" : ""}${diff.toFixed(2)}. ` +
      `Fix the counts before calculating.`;
    chipsWarningBanner.classList.remove("hidden");
    return;
  }

  chipsWarningBanner.classList.add("hidden");
  calculateAndShowResults();
}

function calculateAndShowResults() {
  const cards = chipRows.querySelectorAll(".chip-card");
  const results = players.map((player, i) => {
    const card = cards[i];
    const chipFaceValue = getChipTotalFromCard(card); // this round's ending pot
    const paidIn = player.caisses * chipConfig.realPerCaisse; // lifetime paid in (informational)
    const finalReal = chipFaceValue * (chipConfig.realPerCaisse / chipConfig.caisseFaceValue); // this round's pot in real $

    // Net is a running score: each round's own (potReal - potPaidIn) adds to whatever
    // was carried over, since chips reset every round and don't carry real value forward.
    const roundPaidIn = player.roundCaisses * chipConfig.realPerCaisse;
    const roundNet = finalReal - roundPaidIn;
    const existing = currentGame && currentGame.players.find((p) => p.name === player.name);
    const net = (existing ? existing.cumulativeNet : 0) + roundNet;

    return {
      name: player.name,
      caisses: player.caisses,
      roundCaisses: player.roundCaisses,
      chipFaceValue,
      paidIn,
      finalReal,
      roundPaidIn,
      roundNet,
      net,
    };
  });

  commitResultsToGame(results);

  resultPages = buildResultPages(currentGame);
  showResultsPage(resultPages.length - 1); // land on Total

  showStep(stepResults);
}

function commitResultsToGame(results) {
  if (!currentGame) {
    currentGame = {
      id: generateId(),
      createdAt: Date.now(),
      chipConfig,
      players: [],
      rounds: [],
      roundNumber: 0,
    };
  }
  currentGame.chipConfig = chipConfig;
  currentGame.players = results.map((r) => ({
    name: r.name,
    totalCaisses: r.caisses,
    lastChipValue: r.chipFaceValue,
    lastRoundCaisses: r.roundCaisses,
    cumulativeNet: r.net,
  }));
  if (!currentGame.rounds) currentGame.rounds = [];
  currentGame.rounds.push({
    players: results.map((r) => ({
      name: r.name,
      caisses: r.roundCaisses,
      paidIn: r.roundPaidIn,
      chipFaceValue: r.chipFaceValue,
      finalReal: r.finalReal,
      net: r.roundNet,
    })),
  });
  currentGame.roundNumber = (currentGame.roundNumber || 0) + 1;
  currentGame.updatedAt = Date.now();
}

// ---------- Results pager (Round 1, Round 2, ..., Results) ----------

let resultPages = [];
let currentPageIndex = 0;

function buildTotalResultsPage(game, label) {
  return {
    label,
    results: game.players.map((p) => ({
      name: p.name,
      caisses: p.totalCaisses,
      paidIn: p.totalCaisses * game.chipConfig.realPerCaisse,
      chipFaceValue: p.lastChipValue,
      finalReal: p.lastChipValue * (game.chipConfig.realPerCaisse / game.chipConfig.caisseFaceValue),
      net: p.cumulativeNet,
    })),
    showWarning: false,
  };
}

function buildResultPages(game) {
  const rounds = game.rounds || [];

  // Only one round played: no need to page between round-vs-total, just the result.
  if (rounds.length <= 1) {
    return [buildTotalResultsPage(game, "Result")];
  }

  const pages = rounds.map((round, i) => {
    const roundCaissesTotal = round.players.reduce((sum, p) => sum + p.caisses, 0);
    const chipValueTotal = round.players.reduce((sum, p) => sum + p.chipFaceValue, 0);
    return {
      label: `Round ${i + 1}`,
      results: round.players,
      showWarning: true,
      warningCaisses: roundCaissesTotal,
      warningChipValue: chipValueTotal,
    };
  });

  pages.push(buildTotalResultsPage(game, "Results"));
  return pages;
}

function showResultsPage(index) {
  if (resultPages.length === 0) return;
  currentPageIndex = ((index % resultPages.length) + resultPages.length) % resultPages.length;
  const page = resultPages[currentPageIndex];

  document.getElementById("page-label").textContent = page.label;
  const showArrows = resultPages.length > 1;
  document.getElementById("btn-page-prev").classList.toggle("hidden", !showArrows);
  document.getElementById("btn-page-next").classList.toggle("hidden", !showArrows);

  if (page.showWarning) {
    renderWarning(page.warningCaisses, page.warningChipValue, currentGame.chipConfig.caisseFaceValue);
  } else {
    warningBanner.classList.add("hidden");
  }
  renderResultsTable(page.results);
  renderSettlement(page.results);
}

function renderResultsFromGame(game) {
  resultPages = buildResultPages(game);
  showResultsPage(resultPages.length - 1); // land on Total
}

function renderWarning(totalRoundCaisses, totalChipValue, caisseFaceValue) {
  const expected = totalRoundCaisses * caisseFaceValue;
  const diff = Math.round((totalChipValue - expected) * 100) / 100;

  if (Math.abs(diff) > 0.001) {
    warningBanner.textContent =
      `Warning: chips on the table ($${totalChipValue.toFixed(2)}) don't match ` +
      `expected total from this round's caisses ($${expected.toFixed(2)}). Off by $${diff > 0 ? "+" : ""}${diff.toFixed(2)}.`;
    warningBanner.classList.remove("hidden");
  } else {
    warningBanner.classList.add("hidden");
  }
}

function renderResultsTable(results) {
  resultsBody.innerHTML = "";
  results.forEach((r) => {
    const tr = document.createElement("tr");
    const netClass = r.net >= 0 ? "positive" : "negative";
    const netSign = r.net >= 0 ? "+" : "-";
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.caisses}</td>
      <td>$${r.paidIn.toFixed(2)}</td>
      <td>$${r.chipFaceValue.toFixed(2)}</td>
      <td>$${r.finalReal.toFixed(2)}</td>
      <td class="${netClass}">${netSign}$${Math.abs(r.net).toFixed(2)}</td>
    `;
    resultsBody.appendChild(tr);
  });
}

function simplifyDebts(results) {
  const creditors = [];
  const debtors = [];

  results.forEach((r) => {
    const amt = Math.round(r.net * 100) / 100;
    if (amt > 0.001) creditors.push({ name: r.name, amount: amt });
    else if (amt < -0.001) debtors.push({ name: r.name, amount: -amt });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(debtor.amount, creditor.amount);
    transactions.push({ from: debtor.name, to: creditor.name, amount: Math.round(pay * 100) / 100 });

    debtor.amount -= pay;
    creditor.amount -= pay;
    if (debtor.amount < 0.001) i++;
    if (creditor.amount < 0.001) j++;
  }

  return transactions;
}

function renderSettlement(results) {
  const transactions = simplifyDebts(results);
  settlementList.innerHTML = "";

  if (transactions.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Everyone's even, no payments needed.";
    settlementList.appendChild(li);
    return;
  }

  transactions.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `${t.from} pays <strong>${t.to}</strong>: $${t.amount.toFixed(2)}`;
    settlementList.appendChild(li);
  });
}

// ---------- Close ----------

function closeCurrentGame() {
  if (currentGame) upsertGame(currentGame);
  goHome();
}

// ---------- Init ----------

renderGamesList();

function updateOfflineStatus() {
  const el = document.getElementById("offline-status");
  if (!el || !navigator.serviceWorker.controller) return;
  el.textContent = "Ready for offline use";
  el.classList.remove("hidden");
  el.classList.add("ready");
}

if ("serviceWorker" in navigator) {
  // The page that registers the service worker is never itself controlled by it
  // (that's how the spec works) — so reload once, automatically, the moment a
  // worker takes control. Without this, offline only starts working on the NEXT
  // visit, which is easy to mistake for "it doesn't work."
  let hasReloadedForSW = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForSW) return;
    hasReloadedForSW = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });

  navigator.serviceWorker.ready.then(updateOfflineStatus);
  updateOfflineStatus();
}