#!/usr/bin/env python3
"""
Praxis Capital — daily mark-to-market engine.

Runs on a weekday cron (GitHub Actions). Deterministic and research-free:
it prices the book, rolls cash forward, appends a NAV snapshot, and raises
signals. It never opens or closes a position — trade decisions are made by
the GP (Claude) on review, and land in positions.json / trades.json.

On the first run it establishes the book: target weights are converted into
share counts at that day's real close, so no entry price is ever invented.

Stdlib only. Sources: Stooq daily CSV, Yahoo Finance chart JSON as fallback.
"""

import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "fund")

FUND_F = os.path.join(DATA, "fund.json")
POS_F = os.path.join(DATA, "positions.json")
TRADES_F = os.path.join(DATA, "trades.json")
NAV_F = os.path.join(DATA, "nav_history.json")
MARKS_F = os.path.join(DATA, "marks.json")

UA = "Mozilla/5.0 (compatible; PraxisCapitalSim/1.0; +https://github.com/seanker10/apparatus)"
TIMEOUT = 25


# ---------------------------------------------------------------- io helpers
def load(path, default):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(path, obj):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read().decode("utf-8", errors="replace")


# ------------------------------------------------------------- price sources
def fetch_stooq(symbol):
    """Daily history CSV from Stooq. Returns [(date, close), ...] oldest first."""
    url = f"https://stooq.com/q/d/l/?s={symbol}&i=d"
    text = http_get(url)
    if not text or text.lstrip().startswith("<") or "Date" not in text[:80]:
        return []
    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        close = (row.get("Close") or "").strip()
        day = (row.get("Date") or "").strip()
        if not day or close in ("", "N/D"):
            continue
        try:
            rows.append((day, float(close)))
        except ValueError:
            continue
    return rows[-90:]


def fetch_yahoo(ticker):
    """Fallback: Yahoo chart JSON. Returns [(date, close), ...] oldest first."""
    sym = ticker.replace(".", "-")
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
        "?range=6mo&interval=1d"
    )
    payload = json.loads(http_get(url))
    result = payload["chart"]["result"][0]
    stamps = result.get("timestamp") or []
    closes = result["indicators"]["quote"][0].get("close") or []
    rows = []
    for ts, close in zip(stamps, closes):
        if close is None:
            continue
        day = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        rows.append((day, float(close)))
    return rows[-90:]


def get_history(position):
    """Try Stooq, then Yahoo. Returns [] if both fail (position holds last mark)."""
    for source, fn, arg in (
        ("stooq", fetch_stooq, position["quote_symbol"]),
        ("yahoo", fetch_yahoo, position["ticker"]),
    ):
        try:
            rows = fn(arg)
            if rows:
                return rows, source
        except (urllib.error.URLError, urllib.error.HTTPError, KeyError,
                IndexError, ValueError, TimeoutError, json.JSONDecodeError):
            continue
        finally:
            time.sleep(0.12)
    return [], None


def pct_change(series, lookback):
    """Percent change over `lookback` sessions, or None if history is short."""
    if len(series) <= lookback:
        return None
    prior = series[-1 - lookback][1]
    if not prior:
        return None
    return (series[-1][1] / prior - 1.0) * 100.0


# ------------------------------------------------------------------ the mark
def main():
    fund = load(FUND_F, None)
    positions = load(POS_F, [])
    trades = load(TRADES_F, [])
    nav_history = load(NAV_F, [])

    if not fund or not positions:
        print("missing fund.json or positions.json", file=sys.stderr)
        return 1

    print(f"pricing {len(positions)} positions…")
    quotes, failures = {}, []
    for pos in positions:
        series, source = get_history(pos)
        if not series:
            failures.append(pos["ticker"])
            continue
        quotes[pos["id"]] = {
            "series": series,
            "price": series[-1][1],
            "asof": series[-1][0],
            "source": source,
            "d1": pct_change(series, 1),
            "d5": pct_change(series, 5),
            "d21": pct_change(series, 21),
        }

    if not quotes:
        print("no quotes retrieved — aborting without writing", file=sys.stderr)
        return 1
    if failures:
        print(f"warning: no quote for {', '.join(failures)}", file=sys.stderr)

    as_of = max(q["asof"] for q in quotes.values())
    today = date.today().isoformat()
    stamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    cash = float(fund["cash_usd"])
    first_run = fund.get("inception_date") is None

    # ---- first run: convert target weights into real share counts ----
    if first_run:
        capital = float(fund["inception_capital_usd"])
        print(f"establishing book at {as_of} close…")
        for pos in positions:
            q = quotes.get(pos["id"])
            if not q or not q["price"]:
                continue
            notional = capital * pos["target_weight_pct"] / 100.0
            shares = round(notional / q["price"], 2)
            pos["entry_price"] = round(q["price"], 4)
            pos["entry_date"] = q["asof"]
            pos["shares"] = shares
            cash += shares * q["price"] * (1 if pos["side"] == "short" else -1)
            trades.append({
                "date": q["asof"],
                "ticker": pos["ticker"],
                "action": "SELL SHORT" if pos["side"] == "short" else "BUY",
                "shares": shares,
                "price": round(q["price"], 4),
                "notional": round(shares * q["price"], 2),
                "rationale": "Inception — book established at target weights.",
                "logged_at": stamp,
            })
        fund["inception_date"] = as_of
        fund["status"] = "live"
        print(f"inception set {as_of}, {len(trades)} fills logged")

    # ---- accrue cash interest since the last snapshot ----
    interest = 0.0
    if nav_history:
        last_day = nav_history[-1]["date"]
        try:
            elapsed = (date.fromisoformat(as_of) - date.fromisoformat(last_day)).days
        except ValueError:
            elapsed = 0
        if elapsed > 0:
            rate = fund["cash_rate_annual"] if cash >= 0 else fund["margin_rate_annual"]
            interest = cash * rate * elapsed / 365.0
            cash += interest

    # ---- mark every line ----
    marks, long_mv, short_mv, day_pnl = [], 0.0, 0.0, 0.0
    for pos in positions:
        q = quotes.get(pos["id"])
        entry = pos.get("entry_price")
        shares = pos.get("shares")
        if not q or entry is None or shares is None:
            continue

        price = q["price"]
        gross = shares * price
        direction = 1.0 if pos["side"] == "long" else -1.0
        unrealized = (price - entry) * shares * direction
        cost = entry * shares
        ret_pct = ((price / entry - 1.0) * 100.0 * direction) if entry else 0.0

        if pos["side"] == "long":
            long_mv += gross
        else:
            short_mv += gross

        # On inception day the book did not exist through that session's move,
        # so day P&L is zero by definition rather than a phantom mark.
        if q["d1"] is not None and not first_run:
            prev = price / (1 + q["d1"] / 100.0)
            day_pnl += (price - prev) * shares * direction

        marks.append({
            "id": pos["id"],
            "ticker": pos["ticker"],
            "name": pos["name"],
            "side": pos["side"],
            "sleeve": pos["sleeve"],
            "shares": shares,
            "entry_price": entry,
            "entry_date": pos["entry_date"],
            "price": round(price, 4),
            "asof": q["asof"],
            "market_value": round(gross, 2),
            "cost_basis": round(cost, 2),
            "unrealized_pnl": round(unrealized, 2),
            "return_pct": round(ret_pct, 2),
            "day_pct": round(q["d1"], 2) if q["d1"] is not None else None,
            "week_pct": round(q["d5"], 2) if q["d5"] is not None else None,
            "month_pct": round(q["d21"], 2) if q["d21"] is not None else None,
            "target_weight_pct": pos["target_weight_pct"],
            "thesis": pos["thesis"],
            "catalyst": pos["catalyst"],
            "falsifier": pos.get("falsifier"),
            "sparkline": [round(c, 4) for _, c in q["series"][-30:]],
            "source": q["source"],
        })

    nav = cash + long_mv - short_mv
    capital = float(fund["inception_capital_usd"])

    for m in marks:
        m["weight_pct"] = round(m["market_value"] / nav * 100.0, 2) if nav else 0.0

    # ---- NAV snapshot (idempotent per session date) ----
    snapshot = {
        "date": as_of,
        "nav": round(nav, 2),
        "cash": round(cash, 2),
        "long_mv": round(long_mv, 2),
        "short_mv": round(short_mv, 2),
        "gross_pct": round((long_mv + short_mv) / nav * 100.0, 2) if nav else 0.0,
        "net_pct": round((long_mv - short_mv) / nav * 100.0, 2) if nav else 0.0,
        "day_pnl": round(day_pnl, 2),
        "interest": round(interest, 2),
        "return_pct": round((nav / capital - 1.0) * 100.0, 4),
    }
    if nav_history and nav_history[-1]["date"] == as_of:
        nav_history[-1] = snapshot
    else:
        nav_history.append(snapshot)

    # ---- signals: things the GP should look at ----
    signals = []
    for m in marks:
        limit = -25.0 if m["sleeve"] == "Convex" else -15.0
        if m["side"] == "long" and m["return_pct"] <= limit:
            signals.append(f"{m['ticker']}: {m['return_pct']:.1f}% vs entry — breached {limit:.0f}% review level.")
        if m["side"] == "short" and m["return_pct"] <= -30.0:
            signals.append(f"{m['ticker']}: short {m['return_pct']:.1f}% adverse — cover discipline triggered.")
        drift = m["weight_pct"] - m["target_weight_pct"]
        if abs(drift) >= 2.0:
            signals.append(f"{m['ticker']}: weight {m['weight_pct']:.1f}% vs {m['target_weight_pct']:.1f}% target ({drift:+.1f}pt drift).")

    net, gross = snapshot["net_pct"], snapshot["gross_pct"]
    band = fund["mandate"]["net_band_pct"]
    if not band[0] <= net <= band[1]:
        signals.append(f"Net exposure {net:.1f}% outside mandate band {band[0]}–{band[1]}%.")
    if gross > fund["mandate"]["gross_cap_pct"]:
        signals.append(f"Gross exposure {gross:.1f}% above {fund['mandate']['gross_cap_pct']}% cap.")

    save(MARKS_F, {
        "as_of": as_of,
        "generated_at": stamp,
        "run_date": today,
        "nav": snapshot["nav"],
        "cash": snapshot["cash"],
        "capital": capital,
        "total_return_pct": snapshot["return_pct"],
        "total_pnl": round(nav - capital, 2),
        "day_pnl": snapshot["day_pnl"],
        "long_mv": snapshot["long_mv"],
        "short_mv": snapshot["short_mv"],
        "gross_pct": gross,
        "net_pct": net,
        "positions": marks,
        "signals": signals,
        "stale_tickers": failures,
    })

    fund["cash_usd"] = round(cash, 2)
    fund["last_marked"] = as_of
    save(FUND_F, fund)
    save(POS_F, positions)
    save(TRADES_F, trades)
    save(NAV_F, nav_history)

    print(f"as_of={as_of} NAV=${nav:,.0f} ({snapshot['return_pct']:+.2f}%) "
          f"day P&L=${day_pnl:,.0f} gross={gross:.0f}% net={net:.0f}%")
    for s in signals:
        print(f"  signal: {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
