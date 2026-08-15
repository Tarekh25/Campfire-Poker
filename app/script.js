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

// Bump when a saved game's shape changes in a way old data won't already have.
// Lets future code branch on game.schemaVersion to migrate old localStorage data.
const SCHEMA_VERSION = 1;

const state = {
  players: [], // [{ name, caisses (cumulative total), roundCaisses (this round only) }]
  chipConfig: null, // { types: [{ value, qty, label }], realPerCaisse, caisseFaceValue }
  lastChipRowsKey: null, // tracks what buildChipRows() was last built from
  games: [], // saved games, loaded from localStorage
  currentGame: null, // { id, createdAt, updatedAt, schemaVersion, chipConfig, players, rounds, roundNumber }
  roundMode: false, // true while entering a new round for an existing game
  resultPages: [],
  currentPageIndex: 0,
};

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
document.getElementById("btn-new-round").addEventListener("click", () => startNewRound(state.currentGame));
document.getElementById("btn-close-game").addEventListener("click", closeCurrentGame);
document.getElementById("btn-page-prev").addEventListener("click", () => showResultsPage(state.currentPageIndex - 1));
document.getElementById("btn-page-next").addEventListener("click", () => showResultsPage(state.currentPageIndex + 1));

function showStep(step) {
  [stepHome, stepSetup, stepCustom, stepPlayers, stepChips, stepResults].forEach((s) => s.classList.add("hidden"));
  step.classList.remove("hidden");
}

// ---------- Storage ----------

function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Fills in defaults for fields that didn't exist in older saved games, so a
// schema change here doesn't break games already sitting in someone's browser.
function normalizeGame(game) {
  return {
    schemaVersion: 0,
    rounds: [],
    ...game,
  };
}

function loadGames() {
  try {
    const raw = localStorage.getItem(GAMES_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list.map(normalizeGame);
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
  state.currentGame = null;
  state.roundMode = false;
  state.players = [];
  state.chipConfig = null;
  state.lastChipRowsKey = null;
  playerRows.innerHTML = "";
  chipRows.innerHTML = "";
  chipTypeRows.innerHTML = "";
  renderGamesList();
  showStep(stepHome);
}

function renderGamesList() {
  state.games = loadGames();
  gamesListEl.innerHTML = "";

  if (state.games.length === 0) {
    noGamesHint.classList.remove("hidden");
    return;
  }
  noGamesHint.classList.add("hidden");

  const sorted = [...state.games].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
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
      <button type="button" class="game-delete" title="Delete game" aria-label="Delete game">&times;</button>
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
  const game = state.games.find((g) => g.id === id);
  if (!game) return;
  const dateStr = new Date(game.createdAt).toLocaleDateString();
  if (!window.confirm(`Delete the game from ${dateStr}? This can't be undone.`)) return;
  deleteGameById(id);
  renderGamesList();
}

function openGame(id) {
  const game = state.games.find((g) => g.id === id);
  if (!game) return;
  state.currentGame = JSON.parse(JSON.stringify(game));
  state.chipConfig = state.currentGame.chipConfig;
  state.roundMode = false;
  renderResultsFromGame(state.currentGame);
  showStep(stepResults);
}

// ---------- New game / caisse setup ----------

function startNewGame() {
  state.currentGame = null;
  state.roundMode = false;
  state.players = [];
  state.chipConfig = null;
  state.lastChipRowsKey = null;
  playerRows.innerHTML = "";
  chipRows.innerHTML = "";
  chipTypeRows.innerHTML = "";
  showStep(stepSetup);
}

function chooseClassic() {
  state.chipConfig = buildChipConfig(CLASSIC_CHIP_TYPES, DEFAULT_REAL_PER_CAISSE);
  state.lastChipRowsKey = null;
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
    <button type="button" class="remove-btn hidden" title="Remove chip type" aria-label="Remove chip type">&minus;</button>
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

// Shared by the player rows and the chip type rows: toggles each row's
// remove button based on whatever visibility rule the caller passes in.
function setRemoveButtonsVisible(rows, shouldShow) {
  rows.forEach((row) => {
    const btn = row.querySelector(".remove-btn");
    if (btn) btn.classList.toggle("hidden", !shouldShow(row));
  });
}

function updateChipTypeRemoveButtons() {
  const rows = Array.from(chipTypeRows.querySelectorAll(".chip-type-row"));
  const showRemove = rows.length >= 2;
  setRemoveButtonsVisible(rows, () => showRemove);
}

function confirmCustomSetup() {
  const rows = chipTypeRows.querySelectorAll(".chip-type-row");
  const types = Array.from(rows).map((row) => {
    const value = parseFloat(row.querySelector(".chip-value-input").value) || 0;
    const qty = parseInt(row.querySelector(".chip-qty-input").value, 10) || 0;
    return { value, qty };
  });

  const realPerCaisse = parseFloat(realPerCaisseInput.value) || 0;
  state.chipConfig = buildChipConfig(types, realPerCaisse);
  state.lastChipRowsKey = null;
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
  if (state.roundMode) {
    playersHint.textContent =
      "Existing players are locked in from before — enter their caisses for this round only. " +
      "You can add new players, but not remove or rename existing ones.";
    playersHint.classList.remove("hidden");
  } else {
    playersHint.classList.add("hidden");
  }
}

function backFromPlayers() {
  if (state.roundMode && state.currentGame) {
    renderResultsFromGame(state.currentGame);
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

  const caissesTitle = state.roundMode ? "Caisses this round" : "Caisses";
  const nameHtml = locked
    ? `<span class="player-name-label">${escapeHtml(name)}</span>`
    : `<input type="text" class="name-input" placeholder="Player name" value="${escapeHtml(name)}" />`;
  const removeBtnHtml = locked
    ? ""
    : `<button type="button" class="remove-btn hidden" title="Remove player" aria-label="Remove player">&minus;</button>`;

  row.innerHTML = `
    ${nameHtml}
    <div class="stepper">
      <button type="button" class="step-btn step-minus" title="Decrease caisses" aria-label="Decrease caisses">&minus;</button>
      <input type="number" class="caisses-input" min="0" value="${caisses}" title="${caissesTitle}" />
      <button type="button" class="step-btn step-plus" title="Increase caisses" aria-label="Increase caisses">+</button>
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
  if (!state.roundMode) {
    const rows = playerRows.querySelectorAll(".player-row");
    if (rows.length <= MIN_PLAYERS) return;
  }
  row.remove();
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const rows = Array.from(playerRows.querySelectorAll(".player-row"));
  const showRemove = rows.length >= 3;
  setRemoveButtonsVisible(rows, (row) => (state.roundMode ? !row.dataset.locked : showRemove));
}

// ---------- New round ----------

function startNewRound(game) {
  if (!game) return;
  state.currentGame = game;
  state.chipConfig = game.chipConfig;
  state.roundMode = true;
  state.lastChipRowsKey = null;
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
    const caisses = parseInt(caissesInput.value, 10);
    if (caisses < 0) {
      alert("Caisses can't be negative. Please enter 0 or more.");
      caissesInput.focus();
      return;
    }
    if (!(caisses > 0)) {
      alert("Every player needs at least 1 caisse.");
      caissesInput.focus();
      return;
    }
  }

  state.players = [];
  rows.forEach((row, i) => {
    const nameInput = row.querySelector(".name-input");
    const label = row.querySelector(".player-name-label");
    const name = nameInput ? nameInput.value.trim() || `Player ${i + 1}` : label.textContent;
    const roundCaisses = parseInt(row.querySelector(".caisses-input").value, 10) || 0;

    let totalCaisses = roundCaisses;
    if (state.roundMode) {
      const existing = state.currentGame.players.find((p) => p.name === name);
      totalCaisses = (existing ? existing.totalCaisses : 0) + roundCaisses;
    }
    state.players.push({ name, caisses: totalCaisses, roundCaisses });
  });

  const key = state.players.map((p) => p.name).join("|");
  if (key !== state.lastChipRowsKey) {
    buildChipRows();
    state.lastChipRowsKey = key;
  }
  chipsWarningBanner.classList.add("hidden");
  showStep(stepChips);
}

function buildChipRows() {
  chipRows.innerHTML = "";
  state.players.forEach((player, i) => {
    const card = document.createElement("div");
    card.className = "chip-card";
    card.dataset.playerIndex = i;

    const inputsHtml = state.chipConfig.types.map(
      (type, j) => `
        <div>
          <label>${type.label}</label>
          <input type="number" class="chip-input" data-chip-index="${j}" min="0" value="0" />
        </div>`
    ).join("");

    card.innerHTML = `
      <div class="chip-name">${escapeHtml(player.name)}</div>
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
    total += count * state.chipConfig.types[idx].value;
  });
  return total;
}

// ---------- Results ----------

function attemptCalculate() {
  const cards = chipRows.querySelectorAll(".chip-card");
  let totalRoundCaisses = 0;
  let totalChipValue = 0;
  state.players.forEach((player, i) => {
    totalRoundCaisses += player.roundCaisses;
    totalChipValue += getChipTotalFromCard(cards[i]);
  });

  const { isOff, message } = computeChipDiscrepancy(totalRoundCaisses, totalChipValue, state.chipConfig.caisseFaceValue);

  if (isOff) {
    chipsWarningBanner.textContent = `${message} Fix the counts before calculating.`;
    chipsWarningBanner.classList.remove("hidden");
    return;
  }

  chipsWarningBanner.classList.add("hidden");
  calculateAndShowResults();
}

function calculateAndShowResults() {
  const cards = chipRows.querySelectorAll(".chip-card");
  const results = state.players.map((player, i) => {
    const card = cards[i];
    const chipFaceValue = getChipTotalFromCard(card); // this round's ending pot
    const paidIn = player.caisses * state.chipConfig.realPerCaisse; // lifetime paid in (informational)
    const finalReal = chipValueToReal(chipFaceValue, state.chipConfig); // this round's pot in real $

    // Net is a running score: each round's own (potReal - potPaidIn) adds to whatever
    // was carried over, since chips reset every round and don't carry real value forward.
    const roundPaidIn = player.roundCaisses * state.chipConfig.realPerCaisse;
    const roundNet = finalReal - roundPaidIn;
    const existing = state.currentGame && state.currentGame.players.find((p) => p.name === player.name);
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

  state.resultPages = buildResultPages(state.currentGame);
  showResultsPage(state.resultPages.length - 1); // land on Total

  showStep(stepResults);
}

function commitResultsToGame(results) {
  if (!state.currentGame) {
    state.currentGame = {
      id: generateId(),
      createdAt: Date.now(),
      schemaVersion: SCHEMA_VERSION,
      chipConfig: state.chipConfig,
      players: [],
      rounds: [],
      roundNumber: 0,
    };
  }
  state.currentGame.chipConfig = state.chipConfig;
  state.currentGame.players = results.map((r) => ({
    name: r.name,
    totalCaisses: r.caisses,
    lastChipValue: r.chipFaceValue,
    lastRoundCaisses: r.roundCaisses,
    cumulativeNet: r.net,
  }));
  if (!state.currentGame.rounds) state.currentGame.rounds = [];
  state.currentGame.rounds.push({
    players: results.map((r) => ({
      name: r.name,
      caisses: r.roundCaisses,
      paidIn: r.roundPaidIn,
      chipFaceValue: r.chipFaceValue,
      finalReal: r.finalReal,
      net: r.roundNet,
    })),
  });
  state.currentGame.roundNumber = (state.currentGame.roundNumber || 0) + 1;
  state.currentGame.updatedAt = Date.now();
}

// ---------- Results pager (Round 1, Round 2, ..., Results) ----------

function buildTotalResultsPage(game, label) {
  return {
    label,
    results: game.players.map((p) => ({
      name: p.name,
      caisses: p.totalCaisses,
      paidIn: p.totalCaisses * game.chipConfig.realPerCaisse,
      chipFaceValue: p.lastChipValue,
      finalReal: chipValueToReal(p.lastChipValue, game.chipConfig),
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
  if (state.resultPages.length === 0) return;
  state.currentPageIndex = ((index % state.resultPages.length) + state.resultPages.length) % state.resultPages.length;
  const page = state.resultPages[state.currentPageIndex];

  document.getElementById("page-label").textContent = page.label;
  const showArrows = state.resultPages.length > 1;
  document.getElementById("btn-page-prev").classList.toggle("hidden", !showArrows);
  document.getElementById("btn-page-next").classList.toggle("hidden", !showArrows);

  if (page.showWarning) {
    renderWarning(page.warningCaisses, page.warningChipValue, state.currentGame.chipConfig.caisseFaceValue);
  } else {
    warningBanner.classList.add("hidden");
  }
  renderResultsTable(page.results);
  renderSettlement(page.results);
}

function renderResultsFromGame(game) {
  state.resultPages = buildResultPages(game);
  showResultsPage(state.resultPages.length - 1); // land on Total
}

function renderWarning(totalRoundCaisses, totalChipValue, caisseFaceValue) {
  const { isOff, message } = computeChipDiscrepancy(totalRoundCaisses, totalChipValue, caisseFaceValue);
  if (isOff) {
    warningBanner.textContent = message;
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
      <td>${escapeHtml(r.name)}</td>
      <td>${r.caisses}</td>
      <td>$${r.paidIn.toFixed(2)}</td>
      <td>$${r.finalReal.toFixed(2)}</td>
      <td class="${netClass}">${netSign}$${Math.abs(r.net).toFixed(2)}</td>
    `;
    resultsBody.appendChild(tr);
  });
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
    li.innerHTML = `${escapeHtml(t.from)} pays <strong>${escapeHtml(t.to)}</strong>: $${t.amount.toFixed(2)}`;
    settlementList.appendChild(li);
  });
}

// ---------- Close ----------

function closeCurrentGame() {
  if (state.currentGame) upsertGame(state.currentGame);
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
