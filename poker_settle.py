"""
Poker chip settlement calculator.

Chip set per caisse (buy-in): 1x$5, 3x$1, 2x$0.50, 4x$0.25 = $10 face value.
Each caisse actually costs $2 real money.
So real$ = chip_face_value * (2 / 10) = chip_face_value * 0.2
"""

CHIP_VALUES = [5, 1, 0.5, 0.25]
CHIP_LABELS = ["$5", "$1", "50c", "25c"]
CHIPS_PER_CAISSE_VALUE = 10  # face value of one caisse's worth of chips
REAL_COST_PER_CAISSE = 2     # actual $ cost of one caisse


def input_float(prompt, default=None):
    while True:
        raw = input(prompt).strip()
        if raw == "" and default is not None:
            return default
        try:
            return float(raw)
        except ValueError:
            print("  Please enter a number.")


def input_int(prompt, default=None):
    while True:
        raw = input(prompt).strip()
        if raw == "" and default is not None:
            return default
        try:
            return int(raw)
        except ValueError:
            print("  Please enter a whole number.")


def get_players():
    num_players = input_int("How many players? ")
    players = []
    print("Enter player names:")
    for i in range(num_players):
        name = input(f"  Player {i + 1}: ").strip()
        players.append(name)
    return players


def get_caisses(players):
    caisses = {}
    print("\nHow many caisses did each player take (buy-ins + rebuys)?")
    for p in players:
        caisses[p] = input_int(f"  {p} caisses: ", default=1)
    return caisses


def get_final_chips(players):
    chip_values = {}
    print("\nEnter final chip counts for each player.")
    for p in players:
        print(f"  -- {p} --")
        total = 0.0
        for label, value in zip(CHIP_LABELS, CHIP_VALUES):
            count = input_int(f"    {label} count: ", default=0)
            total += count * value
        chip_values[p] = total
    return chip_values


def compute_settlement(players, caisses, chip_values):
    results = {}
    for p in players:
        paid_in = caisses[p] * REAL_COST_PER_CAISSE
        final_real = chip_values[p] * (REAL_COST_PER_CAISSE / CHIPS_PER_CAISSE_VALUE)
        net = final_real - paid_in
        results[p] = {
            "caisses": caisses[p],
            "paid_in": paid_in,
            "chip_face_value": chip_values[p],
            "final_real": final_real,
            "net": net,
        }
    return results


def sanity_check(players, caisses, chip_values):
    total_caisses = sum(caisses.values())
    expected_chip_total = total_caisses * CHIPS_PER_CAISSE_VALUE
    actual_chip_total = sum(chip_values.values())
    diff = round(actual_chip_total - expected_chip_total, 2)
    if abs(diff) > 0.001:
        print(f"\nWarning: chips on the table (${actual_chip_total:.2f}) don't match "
              f"expected total from caisses (${expected_chip_total:.2f}). Off by ${diff:+.2f}.")


def simplify_debts(results):
    # Positive net = should receive money, negative = owes money
    creditors = []  # [name, amount]
    debtors = []
    for name, r in results.items():
        amt = round(r["net"], 2)
        if amt > 0.001:
            creditors.append([name, amt])
        elif amt < -0.001:
            debtors.append([name, -amt])

    creditors.sort(key=lambda x: -x[1])
    debtors.sort(key=lambda x: -x[1])

    transactions = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        debtor_name, debt_amt = debtors[i]
        creditor_name, credit_amt = creditors[j]
        pay = min(debt_amt, credit_amt)
        transactions.append((debtor_name, creditor_name, round(pay, 2)))

        debtors[i][1] -= pay
        creditors[j][1] -= pay
        if debtors[i][1] < 0.001:
            i += 1
        if creditors[j][1] < 0.001:
            j += 1

    return transactions


def print_results(results, transactions):
    print("\n===== Summary =====")
    for name, r in results.items():
        sign = "+" if r["net"] >= 0 else "-"
        print(f"{name}: {r['caisses']} caisses (${r['paid_in']:.2f} in) | "
              f"final chips ${r['chip_face_value']:.2f} (${r['final_real']:.2f} real) | "
              f"net {sign}${abs(r['net']):.2f}")

    print("\n===== Who pays who =====")
    if not transactions:
        print("Everyone's even, no payments needed.")
    else:
        for debtor, creditor, amount in transactions:
            print(f"{debtor} pays {creditor}: ${amount:.2f}")


def main():
    print("=== Poker Settlement Calculator ===\n")
    players = get_players()
    if len(players) < 2:
        print("Need at least 2 players.")
        return

    caisses = get_caisses(players)
    chip_values = get_final_chips(players)

    sanity_check(players, caisses, chip_values)

    results = compute_settlement(players, caisses, chip_values)
    transactions = simplify_debts(results)

    print_results(results, transactions)


if __name__ == "__main__":
    main()