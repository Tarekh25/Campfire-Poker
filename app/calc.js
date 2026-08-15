// Pure calculation helpers — no DOM access, so these can be unit tested
// directly with `node --test` (see calc.test.js) as well as used by the app.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

// Shared by the chips-step warning and the results-page warning: checks whether
// the chips actually on the table match what this round's caisses should add up to.
function computeChipDiscrepancy(totalCaisses, totalChipValue, caisseFaceValue) {
  const expected = totalCaisses * caisseFaceValue;
  const diff = Math.round((totalChipValue - expected) * 100) / 100;
  const isOff = Math.abs(diff) > 0.001;
  const message = isOff
    ? `Warning: chips on the table ($${totalChipValue.toFixed(2)}) don't match ` +
      `expected total from this round's caisses ($${expected.toFixed(2)}). Off by $${diff > 0 ? "+" : ""}${diff.toFixed(2)}.`
    : "";
  return { expected, diff, isOff, message };
}

// Converts a chip face value (e.g. "$20 worth of chips") into real dollars,
// based on this game's real-cost-per-caisse vs face-value-per-caisse ratio.
function chipValueToReal(chipFaceValue, config) {
  return chipFaceValue * (config.realPerCaisse / config.caisseFaceValue);
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

// Recomputes every derived field (paidIn, finalReal, net, and each player's cumulative
// totals) from the raw per-round inputs (caisses + chipFaceValue) stored in game.rounds.
// This is what makes editing a past round safe: change one round's chip counts, call
// this, and every round's numbers plus the running cumulative net are consistent again —
// there's no separate "patch the totals" logic that could drift out of sync.
// Mutates round-player objects and game.players in place, matching how the rest of the
// app treats a game object (see commitResultsToGame).
function recomputeGameDerived(game) {
  const cumulative = {}; // name -> { totalCaisses, cumulativeNet, lastChipValue, lastRoundCaisses }

  game.rounds.forEach((round) => {
    round.players.forEach((rp) => {
      const prev = cumulative[rp.name] || { totalCaisses: 0, cumulativeNet: 0 };
      const paidIn = rp.caisses * game.chipConfig.realPerCaisse;
      const finalReal = chipValueToReal(rp.chipFaceValue, game.chipConfig);
      const net = finalReal - paidIn;

      rp.paidIn = paidIn;
      rp.finalReal = finalReal;
      rp.net = net;

      cumulative[rp.name] = {
        totalCaisses: prev.totalCaisses + rp.caisses,
        cumulativeNet: prev.cumulativeNet + net,
        lastChipValue: rp.chipFaceValue,
        lastRoundCaisses: rp.caisses,
      };
    });
  });

  game.players = game.players.map((p) => {
    const c = cumulative[p.name];
    return c
      ? { ...p, totalCaisses: c.totalCaisses, lastChipValue: c.lastChipValue, lastRoundCaisses: c.lastRoundCaisses, cumulativeNet: c.cumulativeNet }
      : p;
  });
}

// `module` doesn't exist in the browser, so this block only runs under Node —
// it lets calc.test.js `require()` these functions while the browser keeps
// using them as plain globals loaded via <script>.
if (typeof module !== "undefined") {
  module.exports = {
    escapeHtml,
    formatChipLabel,
    buildChipConfig,
    computeChipDiscrepancy,
    chipValueToReal,
    simplifyDebts,
    recomputeGameDerived,
  };
}
