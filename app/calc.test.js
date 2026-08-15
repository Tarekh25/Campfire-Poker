const test = require("node:test");
const assert = require("node:assert/strict");
const {
  escapeHtml,
  formatChipLabel,
  buildChipConfig,
  computeChipDiscrepancy,
  chipValueToReal,
  simplifyDebts,
} = require("./calc.js");

test("escapeHtml neutralizes markup and quotes", () => {
  assert.equal(escapeHtml(`<b>Mo "Shark" O'Brien</b> & co`), "&lt;b&gt;Mo &quot;Shark&quot; O&#39;Brien&lt;/b&gt; &amp; co");
  assert.equal(escapeHtml("Bob"), "Bob");
});

test("formatChipLabel formats dollar and cent chips", () => {
  assert.equal(formatChipLabel(5), "$5");
  assert.equal(formatChipLabel(1.25), "$1.25");
  assert.equal(formatChipLabel(0.5), "50c");
  assert.equal(formatChipLabel(0.25), "25c");
});

test("buildChipConfig computes classic caisse face value ($10)", () => {
  const classicTypes = [
    { value: 5, qty: 1 },
    { value: 1, qty: 3 },
    { value: 0.5, qty: 2 },
    { value: 0.25, qty: 4 },
  ];
  const config = buildChipConfig(classicTypes, 2);
  assert.equal(config.caisseFaceValue, 10);
  assert.equal(config.realPerCaisse, 2);
  assert.equal(config.types[0].label, "$5");
  assert.equal(config.types[2].label, "50c");
});

test("computeChipDiscrepancy reports no warning when totals match", () => {
  const result = computeChipDiscrepancy(3, 30, 10);
  assert.equal(result.isOff, false);
  assert.equal(result.message, "");
});

test("computeChipDiscrepancy reports a warning with correct sign when totals mismatch", () => {
  const short = computeChipDiscrepancy(3, 25, 10); // 5 short
  assert.equal(short.isOff, true);
  assert.match(short.message, /Off by \$-5\.00/);

  const over = computeChipDiscrepancy(3, 35, 10); // 5 over
  assert.equal(over.isOff, true);
  assert.match(over.message, /Off by \$\+5\.00/);
});

test("chipValueToReal converts chip face value to real dollars", () => {
  const config = { realPerCaisse: 2, caisseFaceValue: 10 };
  assert.equal(chipValueToReal(20, config), 4);
  assert.equal(chipValueToReal(0, config), 0);
});

test("simplifyDebts settles a simple two-player debt", () => {
  const results = [
    { name: "Alice", net: 10 },
    { name: "Bob", net: -10 },
  ];
  const transactions = simplifyDebts(results);
  assert.deepEqual(transactions, [{ from: "Bob", to: "Alice", amount: 10 }]);
});

test("simplifyDebts settles multiple debtors/creditors with minimal transactions", () => {
  const results = [
    { name: "Alice", net: 10 },
    { name: "Bob", net: -4 },
    { name: "Carl", net: -6 },
  ];
  const transactions = simplifyDebts(results);
  const totalPaidToAlice = transactions.filter((t) => t.to === "Alice").reduce((sum, t) => sum + t.amount, 0);
  assert.equal(totalPaidToAlice, 10);
  assert.equal(transactions.every((t) => t.to === "Alice"), true);
});

test("simplifyDebts returns no transactions when everyone is even", () => {
  const results = [
    { name: "Alice", net: 0 },
    { name: "Bob", net: 0.0005 }, // within the 0.001 rounding tolerance
  ];
  assert.deepEqual(simplifyDebts(results), []);
});
