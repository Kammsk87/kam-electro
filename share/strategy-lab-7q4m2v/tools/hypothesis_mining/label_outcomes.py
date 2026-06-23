#!/usr/bin/env python3
"""
Botalin — разметка rejected_signals гипотетическим исходом.

Для каждого отклонённого сигнала (есть features.atrPct/score, нет ещё hypotheticalOutcome)
приближённо восстанавливает entry/stop/target1/target2 (та же ATR-стоп-модель и rr1/rr2,
что в evaluateCandidate/calculateAtrStopModel server-autobot.mjs — держать в синхроне
вручную, если там поменяются константы) и прогоняет вперёд до 20 настоящих свечей Bybit,
проверяя стоп/target2/target1 по приоритету (как runBacktest в server-autobot.mjs).

P&L считается НЕТТО (за вычетом издержек), той же логикой, что и исполненные сделки в
живом боте (calculatePnlForQuantity: round-trip fee+slippage от нотионала) — иначе
сравнивать гипотетический исход с исполненными сделками некорректно (gross vs net).
Если у сигнала есть реально измеренный features.bidAskSpreadPct — используется он
(точнее для конкретного актива), иначе фиксированное предположение FEE_PCT+SLIPPAGE_PCT.

Запуск: SUPABASE_URL=... SUPABASE_KEY=... python3 label_outcomes.py [--dry-run] [--stats]
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime
from collections import defaultdict
import bisect

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("SUPABASE_URL и SUPABASE_KEY должны быть заданы в окружении (см. /etc/botalin.env на VPS)")

TF_MS = {"1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000,
         "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000}
TF_BYBIT = {"1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
            "1h": "60", "4h": "240", "1d": "D"}
FORWARD_BARS = 20

# Те же значения, что config.feePct/config.slippagePct в server-autobot.mjs (Bybit spot
# flat-комиссия, подтверждена через сайт Bybit 2026-06-22 — не пессимистичное допущение).
FEE_PCT = 0.1
SLIPPAGE_PCT_FALLBACK = 0.03

# Bybit linear perps quote some low-unit-price coins per 1000 units (price is 1000x "real"
# per-token price) and name the ticker accordingly. Since price ratios (entry/stop/target)
# are unaffected by a constant scale factor, only the symbol name needs mapping.
BYBIT_SYMBOL_OVERRIDES = {
    "PEPEUSDT": "1000PEPEUSDT",
    "BONKUSDT": "1000BONKUSDT",
}

# Зеркалит rr1/rr2 и calculateAtrStopModel из server-autobot.mjs (evaluateCandidate) —
# держать в синхроне, если там поменяются константы.
RR = {
    "scalping": (1.3, 1.9),
    "pullback": (1.35, 2.0),
    "momentum": (2.2, 3.8),
    "rsi-reversal": (1.2, 1.8),
    "vwap-reversion": (1.2, 1.8),
}
RR_DEFAULT = (1.6, 2.2)

ENTRY_OFFSET = {
    "pullback": (0.9985, 1.0015),
    "rsi-reversal": (0.9992, 1.0008),
    "vwap-reversion": (0.9992, 1.0008),
}
ENTRY_OFFSET_DEFAULT = (1.0003, 0.9997)


def parse_dt(v):
    v = v.replace("Z", "+00:00")
    m = re.match(r"^(.*\.)(\d+)(\+\d\d:\d\d)$", v)
    if m:
        v = m.group(1) + m.group(2).ljust(6, "0")[:6] + m.group(3)
    return datetime.fromisoformat(v)


def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def fetch_rejected_signals():
    url = f"{SUPABASE_URL}/rest/v1/rejected_signals?select=id,asset,timeframe,side,strategy,recorded_at,features"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Range-Unit": "items",
        "Range": "0-200000",
    }
    return http_get(url, headers)


def fetch_bybit_klines(bybit_symbol, bybit_interval, start_ms, end_ms):
    candles = []
    cursor = start_ms
    while cursor < end_ms:
        url = (f"https://api.bybit.com/v5/market/kline?category=linear&symbol={bybit_symbol}"
               f"&interval={bybit_interval}&start={cursor}&end={end_ms}&limit=1000")
        try:
            data = http_get(url)
        except Exception as e:
            print(f"  bybit fetch failed {bybit_symbol} {bybit_interval}: {e}")
            break
        rows = (data.get("result") or {}).get("list") or []
        if not rows:
            break
        rows.sort(key=lambda r: int(r[0]))
        for r in rows:
            candles.append({"t": int(r[0]), "o": float(r[1]), "h": float(r[2]), "l": float(r[3]), "c": float(r[4])})
        last_t = int(rows[-1][0])
        if last_t <= cursor:
            break
        cursor = last_t + 1
        if len(rows) < 1000:
            break
        time.sleep(0.05)
    seen = {}
    for c in candles:
        seen[c["t"]] = c
    return sorted(seen.values(), key=lambda c: c["t"])


def get_rr(strategy):
    return RR.get(strategy, RR_DEFAULT)


def get_entry_offset(strategy, side):
    lo, hi = ENTRY_OFFSET.get(strategy, ENTRY_OFFSET_DEFAULT)
    return lo if side == "LONG" else hi


def atr_stop_pct(atr_pct, scalping, wide):
    min_pct = 0.15 if scalping else (0.5 if wide else 0.35)
    max_pct = 0.5 if scalping else (4 if wide else 2.5)
    mult = 0.58 if scalping else (1.1 if wide else 0.75)
    atr_based = atr_pct * mult if atr_pct is not None else min_pct
    return max(min_pct, min(max_pct, atr_based))


def round_trip_cost_pct(features):
    """Round-trip cost as a percentage-point deduction from a direction-adjusted price move,
    matching calculatePnlForQuantity's (entryNotional+exitNotional)*(fee+slippage)/100 scaled
    to %-of-position terms. Uses the real measured spread when we have it (per-asset, more
    precise than a flat assumption), else falls back to the same flat rate the live bot uses."""
    spread = features.get("bidAskSpreadPct")
    if spread is not None and spread > 0:
        return 2 * FEE_PCT + spread
    return 2 * (FEE_PCT + SLIPPAGE_PCT_FALLBACK)


def label_row(row, candles_times, candles):
    feats = row["features"]
    atr_pct = feats.get("atrPct")
    if atr_pct is None:
        return None
    strategy = row["strategy"]
    side = row["side"]
    recorded_ms = int(parse_dt(row["recorded_at"]).timestamp() * 1000)

    entry_idx = bisect.bisect_right(candles_times, recorded_ms) - 1
    if entry_idx < 0:
        return None
    if entry_idx + FORWARD_BARS >= len(candles):
        return None  # not enough forward data yet — label on a future run

    close = candles[entry_idx]["c"]
    entry = close * get_entry_offset(strategy, side)
    scalping = strategy == "scalping"
    wide = strategy == "momentum"
    stop_pct = atr_stop_pct(atr_pct, scalping, wide)
    distance = entry * (stop_pct / 100)
    rr1, rr2 = get_rr(strategy)

    if side == "LONG":
        stop = entry - distance
        target1 = entry + distance * rr1
        target2 = entry + distance * rr2
    else:
        stop = entry + distance
        target1 = entry - distance * rr1
        target2 = entry - distance * rr2

    outcome = "timeout"
    exit_price = candles[entry_idx + FORWARD_BARS]["c"]
    bars_to_resolve = FORWARD_BARS
    for k in range(1, FORWARD_BARS + 1):
        c = candles[entry_idx + k]
        if side == "LONG":
            if c["l"] <= stop:
                outcome, exit_price, bars_to_resolve = "stop", stop, k
                break
            if c["h"] >= target2:
                outcome, exit_price, bars_to_resolve = "target2", target2, k
                break
            if c["h"] >= target1:
                outcome, exit_price, bars_to_resolve = "target1", target1, k
                break
        else:
            if c["h"] >= stop:
                outcome, exit_price, bars_to_resolve = "stop", stop, k
                break
            if c["l"] <= target2:
                outcome, exit_price, bars_to_resolve = "target2", target2, k
                break
            if c["l"] <= target1:
                outcome, exit_price, bars_to_resolve = "target1", target1, k
                break

    direction = 1 if side == "LONG" else -1
    gross_pnl_pct = ((exit_price - entry) / entry) * direction * 100 if entry > 0 else 0
    cost_pct = round_trip_cost_pct(feats)
    net_pnl_pct = gross_pnl_pct - cost_pct

    return {
        "outcome": outcome,
        "pnlPct": round(net_pnl_pct, 3),
        "grossPnlPct": round(gross_pnl_pct, 3),
        "costPct": round(cost_pct, 3),
        "barsToResolve": bars_to_resolve,
        "method": "approx_atr_stop_v2_net_of_cost",
    }


def main():
    print("Fetching rejected_signals...")
    rows = fetch_rejected_signals()
    print(f"total rows: {len(rows)}")

    # Перелабелим и старые записи, размеченные предыдущей версией метода (gross pnl, без
    # издержек) — иначе датасет окажется смесью несопоставимых единиц pnlPct.
    CURRENT_METHOD = "approx_atr_stop_v2_net_of_cost"
    candidates = [r for r in rows if (r.get("features") or {}).get("score") is not None
                  and ((r.get("features") or {}).get("hypotheticalOutcome") or {}).get("method") != CURRENT_METHOD]
    print(f"eligible (missing or outdated label): {len(candidates)}")

    groups = defaultdict(list)
    for r in candidates:
        groups[(r["asset"], r["timeframe"])].append(r)
    print(f"unique asset+timeframe groups: {len(groups)}")

    now_ms = int(time.time() * 1000)
    updates = []
    skipped_no_data = 0
    skipped_too_recent = 0

    for gi, ((asset, timeframe), group_rows) in enumerate(groups.items(), 1):
        bybit_symbol = asset.replace("/", "")
        bybit_symbol = BYBIT_SYMBOL_OVERRIDES.get(bybit_symbol, bybit_symbol)
        bybit_interval = TF_BYBIT.get(timeframe)
        tf_ms = TF_MS.get(timeframe)
        if not bybit_interval or not tf_ms:
            continue
        min_recorded = min(int(parse_dt(r["recorded_at"]).timestamp() * 1000) for r in group_rows)
        start_ms = min_recorded - tf_ms * 2
        end_ms = now_ms
        candles = fetch_bybit_klines(bybit_symbol, bybit_interval, start_ms, end_ms)
        if not candles:
            skipped_no_data += len(group_rows)
            print(f"[{gi}/{len(groups)}] {asset} {timeframe}: no candle data, skip {len(group_rows)} rows")
            continue
        candles_times = [c["t"] for c in candles]

        labeled_here = 0
        for row in group_rows:
            label = label_row(row, candles_times, candles)
            if label is None:
                skipped_too_recent += 1
                continue
            merged_features = dict(row["features"])
            merged_features["hypotheticalOutcome"] = label
            updates.append({"id": row["id"], "features": merged_features})
            labeled_here += 1
        print(f"[{gi}/{len(groups)}] {asset} {timeframe}: {len(candles)} candles, labeled {labeled_here}/{len(group_rows)}")

    print(f"\nTotal to write: {len(updates)} (skipped: no_data={skipped_no_data}, too_recent_or_insufficient={skipped_too_recent})")

    if "--stats" in sys.argv or "--dry-run" in sys.argv:
        from collections import Counter
        by_strategy = defaultdict(lambda: Counter())
        for u in updates:
            strat = u["features"].get("strategy", "?")
            by_strategy[strat][u["features"]["hypotheticalOutcome"]["outcome"]] += 1
        print("\nГипотетический результат по стратегиям (net of cost):")
        for strat, c in sorted(by_strategy.items()):
            n = sum(c.values())
            wins = c.get("target1", 0) + c.get("target2", 0)
            print(f"  {strat:20} n={n:4} target2={c.get('target2',0):4} target1={c.get('target1',0):4} stop={c.get('stop',0):4} timeout={c.get('timeout',0):4}  winrate~{100*wins/n:.1f}%")

    if "--dry-run" in sys.argv:
        print("\n--dry-run set, not writing. Sample of 5 labels:")
        for u in updates[:5]:
            print(u["id"], u["features"]["hypotheticalOutcome"])
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    written = 0
    chunk_size = 200
    url = f"{SUPABASE_URL}/rest/v1/rejected_signals?on_conflict=id"
    for i in range(0, len(updates), chunk_size):
        chunk = updates[i:i + chunk_size]
        body = [{"id": u["id"], "features": u["features"]} for u in chunk]
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp.read()
            written += len(chunk)
            print(f"  written {written}/{len(updates)}")
        except Exception as e:
            print(f"  batch upsert failed at offset {i}: {e}")
    print(f"Done. Written {written}/{len(updates)}")


if __name__ == "__main__":
    main()
