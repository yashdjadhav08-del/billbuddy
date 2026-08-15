# BillBuddy Demo Script

Estimated time: **90 seconds**

## Pre-demo setup (before the presentation)

1. Fund four Testnet accounts via Friendbot
2. Deploy the contract and set `VITE_SOROBAN_CONTRACT_ID`
3. Create Apartment 204, add all four members (Alice, Bob, Charlie, David)
4. Add Rent ($800, Alice paid), Electricity ($72, Bob paid), Water ($28, Bob paid)
5. Confirm balances show: Alice +$575, Bob -$125, Charlie -$225, David -$225
6. Open the app in a browser with Freighter connected as **Charlie**

---

## Live demo steps

### Step 1 — Connect wallet (0:00)

> "I'm connected as Charlie with a Testnet Freighter wallet."

Point to the wallet badge: `GCH…LIE · Testnet`

---

### Step 2 — Open Apartment 204 dashboard (0:05)

> "This is our household. August 2026. Three bills already added."

Show the bill list: Rent $800 ✓, Electricity $72 ✓, Water $28 ✓

Show Charlie's balance card: **You owe $225.00**

---

### Step 3 — Add Internet bill (0:20)

Click **+ Add Bill**

Fill in:
- Name: `Internet`
- Category: `Internet 📡`
- Amount: `$30`
- Split: `Equal`

> "Watch the live split preview — $7.50 each. Split is valid ✓"

Click **Add Bill**

---

### Step 4 — Balances update (0:35)

Return to dashboard.

> "Balances recalculated instantly. Charlie now owes $232.50."

---

### Step 5 — Open Settlements (0:45)

Click **Settle** in the bottom nav.

Show the settlement plan:

```
Charlie → Alice   $182.50
David   → Alice   $182.50
Charlie → Bob     $50.00
David   → Bob     $50.00
```

> "Four transfers zero all balances. The optimizer finds the minimum."

---

### Step 6 — Pay with Stellar (0:55)

Click **Pay** next to `Charlie → Alice $182.50`

The transaction modal opens.

> "I'm paying Alice directly on Stellar Testnet."

---

### Step 7 — Sign in Freighter (1:00)

Freighter popup appears automatically.

> "Freighter shows the exact XLM amount. I sign it — private key never leaves the wallet."

Click **Approve** in Freighter.

---

### Step 8 — Watch confirmation (1:05)

The modal steps through:

```
✓ Building transaction
✓ Waiting for Freighter signature
✓ Submitting to Stellar
⟳ Waiting for confirmation…
```

Wait ~3 seconds.

```
✓ Confirmed on-chain
```

---

### Step 9 — Show transaction hash (1:10)

> "Real transaction hash. SettlementCompleted event emitted on-chain."

Click **View on Stellar Explorer** → opens `stellar.expert/explorer/testnet/tx/…`

Show the real transaction on-chain.

---

### Step 10 — Return to dashboard (1:20)

Go back to Settlements → repeat for Charlie → Bob $50.

Then open **Monthly Close**.

> "All Charlie's obligations settled."

---

### Step 11 — Monthly Close (1:30)

> "Once all four members settle, the owner can close August."

Show the progress bar at 100%.

Click **Close August 2026** → Confirm.

---

### Step 12 — Celebration screen (1:40)

```
🎉 August 2026 is settled!

12 bills · 4 members · $0 outstanding
```

> "Done. Split bills. Settled simply. On Stellar."

---

## Bonus — Delete a bill (optional, 0:15)

> "Mistakes are easy to undo — only the bill creator or the household owner can
> delete a bill, and settled bills are locked on-chain."

Long-press a bill card on the dashboard → **Delete** → confirm.

> "Watch the bill disappear everywhere — from the shared ledger and from every
> member's view. Try deleting one of the other bills and the UI tells you you're
> not allowed."

---

## Fallback (if Freighter or Testnet unavailable)

Switch to `VITE_MOCK_MODE=true` before the presentation.
All flows work identically with simulated 400ms latency.
A clearly visible **[MOCK MODE]** badge is shown in the header.

Mock mode shares one server (`node mock-server.mjs`, port 8787) so every browser
sees the same data. State persists in `mock-state.json`; reset it to a clean
slate for the demo before presenting:

```bash
node mock-server.mjs          # start the shared server (terminal 1)
npm run dev                   # start the app            (terminal 2)
curl -X DELETE http://127.0.0.1:8787/api/state   # fresh empty demo state
```

Then create the household, members, and bills through the UI as the pre-demo
setup describes.
