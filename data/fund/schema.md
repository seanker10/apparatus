# Praxis Capital — Ledger Schema

Simulated long/short equity fund. LP provides notional capital, GP (Claude) researches and allocates. No real money, no brokerage, no orders. The ledger is five JSON files in this directory, backed by git history — every mark and every fill is a commit.

**Division of labour:** the daily cron job is deterministic and research-free — it prices the book, rolls cash, appends a NAV snapshot and raises signals. It never opens or closes a position. Trades are decisions, and decisions are made by the GP on review.

---

## `fund.json` — mandate and state

```jsonc
{
  "inception_capital_usd": 1000000000,  // committed capital, fixed
  "cash_usd": 415000000,                // authoritative cash; job accrues interest, GP adjusts on trades
  "cash_rate_annual": 0.0425,           // earned on positive balances
  "margin_rate_annual": 0.055,          // charged on negative balances
  "inception_date": null,               // stamped by the first mark run
  "status": "awaiting_first_mark",      // -> "live"
  "aggression": 7.5,                    // 1-10; drives gross, concentration, convexity
  "mandate": { "gross_cap_pct": 175, "net_band_pct": [35, 75], ... },
  "risk_rules": [ "..." ]
}
```

## `positions.json` — the book

```jsonc
{
  "id": "ceg",                    // stable kebab id
  "ticker": "CEG",
  "quote_symbol": "ceg.us",       // Stooq symbol (dots become dashes: brk-b.us)
  "name": "Constellation Energy",
  "side": "long",                 // long | short
  "sleeve": "Power & Grid",       // see sleeves below
  "target_weight_pct": 6.5,       // % of NAV; sign-agnostic (shorts are absolute exposure)
  "thesis": "why we own it — surfaced in the UI",
  "catalyst": "what is moving it now — surfaced in the UI",
  "falsifier": "what would prove the thesis wrong",
  "horizon": "2–5 years",        // expected time to payoff; every line has one
  "horizon_note": "...",         // shorts only: what actually resolves the trade
  "entry_date": null,             // stamped by first mark
  "entry_price": null,            // stamped by first mark — never invented
  "shares": null                  // derived: target_weight × capital ÷ entry_price
}
```

**Sleeves.** Longs: `Power & Grid`, `Compute Chokepoints`, `Value & Ballast`, `Hard Assets`, `Convex`. Shorts: `Index Hedge`, `AI Disruption Victims`, `Valuation & Crowding`, `Consumer & Rate Stress`.

**Horizons.** Shorts do not share a clock, and the difference drives how each is managed. Fastest to slowest:

| Clock | Lines | What resolves it |
|---|---|---|
| `3–9 months` | BFH | Monthly charge-off and delinquency data |
| `2–4 quarters` | SMCI, W, LULU | Quarterly margin and comp prints |
| `6–18 months` | MSTR | Bitcoin cycle plus convertible maturities |
| `12–24 months` | CRWV, ITB | Mechanical depreciation, debt maturities, housing cycle |
| `12–30 months` | CNXC | Leverage compressing equity ahead of revenue |
| `18–36 months` | EPAM, IT | Annual enterprise renewal cycles |
| `Cycle-dependent` | HOOD | Retail risk appetite; instant in a drawdown |
| `Catalyst-dependent` | PLTR, TSLA | Nothing forces it — size is the only control |
| `Continuous` | QQQ, IWM | Insurance, not a bet; no payoff date |

Catalyst-dependent shorts carry the tightest size discipline precisely because the clock is not ours.

## `trades.json` — immutable blotter

Append-only. Every fill: `date`, `ticker`, `action` (BUY / SELL / SELL SHORT / BUY TO COVER), `shares`, `price`, `notional`, `rationale`, `logged_at`.

## `nav_history.json` — the equity curve

One snapshot per session date, idempotent (a re-run replaces the same date rather than duplicating): `date`, `nav`, `cash`, `long_mv`, `short_mv`, `gross_pct`, `net_pct`, `day_pnl`, `interest`, `return_pct`.

## `marks.json` — latest state, written by the job

Everything the dashboard reads: fund-level totals, plus a `positions[]` array carrying price, `day_pct` / `week_pct` / `month_pct`, `unrealized_pnl`, `return_pct`, `weight_pct`, a 30-session `sparkline`, and the three narrative fields. Also `signals[]` (risk breaches and weight drift for GP review) and `stale_tickers[]` (quotes that failed — those lines hold their previous mark rather than showing a false price).

---

## Accounting

- `NAV = cash + Σ(long market value) − Σ(short market value)`
- Long P&L `= (price − entry) × shares`; short P&L `= (entry − price) × shares`
- Opening a long debits cash; opening a short credits proceeds to cash
- Interest accrues on the cash balance for elapsed calendar days between marks
- At inception: cash 100% − longs 103.5% + short proceeds 45.0% = **41.5% cash**, NAV exactly $1.000B

## Running it

```bash
python3 fund/mark_to_market.py     # stdlib only, no API keys
```

Automated by `.github/workflows/fund-mark.yml` at 21:10 UTC Mon–Fri (after the US close year-round), committing the updated ledger back to `main`. Trigger manually from the Actions tab via **Run workflow**. Prices come from Stooq daily CSV with Yahoo Finance as fallback; if both fail for a ticker it is reported in `stale_tickers` and holds its last mark.
