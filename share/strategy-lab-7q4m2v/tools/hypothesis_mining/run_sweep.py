#!/usr/bin/env python3
"""
Botalin — автоматизированная "охота за доходностью".

Перебирает ~600 гипотез о связи признаков (rsi/adx/volumeRatio/atrPct/...) с исходом
сделки, на chronological train/test split, и сверяет результат с реестром в Postgres
(hypothesis_registry на db.kamtok.ru) — гипотеза считается готовой к внедрению в
живой скоринг (status=ready_for_review) только после 2 ПОДРЯД успешных прогонов
(не суммарно когда-либо, а именно подряд — один провал сбрасывает счётчик).

Это формализует дисциплину, выведенную вручную 2026-06-22/23: ни одна находка не
внедряется в server-autobot.mjs по результату одного прогона на одной выборке.

Зависимости: только стандартная библиотека Python (urllib, json, statistics) —
рутина может не иметь numpy/sklearn, поэтому здесь их нет.

Запуск: SUPABASE_URL=... SUPABASE_KEY=... python3 run_sweep.py [--dry-run]
(те же переменные окружения, что использует server-autobot.mjs/server-health.mjs)
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from collections import defaultdict, Counter
from datetime import datetime
import statistics

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("SUPABASE_URL и SUPABASE_KEY должны быть заданы в окружении (см. /etc/botalin.env на VPS)")

MIN_BUCKET = 15
MIN_GROUP = 60
STRONG_TRAIN = 0.15
STRONG_TEST = STRONG_TRAIN * 0.5

NUM_FEATS = ["rsi", "adx", "volumeRatio", "atrPct", "mtfScoreDelta", "altBtcRelStrength",
             "fundingRatePct", "oiChangePct", "historyWinRate", "historyAvgPnlPct", "score"]


def http_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def http_post(url, headers, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()


def auth_headers(extra=None):
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    if extra:
        h.update(extra)
    return h


def parse_dt(v):
    if not v:
        return None
    v = v.replace("Z", "+00:00")
    m = re.match(r"^(.*\.)(\d+)(\+\d\d:\d\d)$", v)
    if m:
        v = m.group(1) + m.group(2).ljust(6, "0")[:6] + m.group(3)
    try:
        return datetime.fromisoformat(v)
    except Exception:
        return None


def fetch_combined_dataset():
    print("Загружаю исполненные сделки...")
    url = (f"{SUPABASE_URL}/rest/v1/crypto_strategy_trades?select=opened_at,status,trade"
           f"&status=in.(target,stop)&order=opened_at.asc")
    headers = auth_headers({"Range-Unit": "items", "Range": "0-200000"})
    trades = http_get(url, headers)
    print(f"  {len(trades)} сделок")

    print("Загружаю отклонённые сигналы с гипотетическим исходом...")
    url = (f"{SUPABASE_URL}/rest/v1/rejected_signals?select=recorded_at,reject_reason,features"
           f"&features-%3EhypotheticalOutcome=not.is.null")
    rejected = http_get(url, headers)
    print(f"  {len(rejected)} отклонённых сигналов")

    rows = []
    for r in trades:
        t = r.get("trade") or {}
        feats = t.get("features")
        if not feats or feats.get("score") is None:
            continue
        dt = parse_dt(r.get("opened_at"))
        if not dt:
            continue
        rows.append({"dt": dt, "label": 1 if r["status"] == "target" else 0, "f": feats,
                     "src": "trade", "reject_reason": None})

    for r in rejected:
        feats = r.get("features") or {}
        ho = feats.get("hypotheticalOutcome")
        if not ho or ho.get("outcome") == "timeout":
            continue
        dt = parse_dt(r.get("recorded_at"))
        if not dt:
            continue
        label = 1 if ho["outcome"] in ("target1", "target2") else 0
        rows.append({"dt": dt, "label": label, "f": feats,
                     "src": "rejected", "reject_reason": r.get("reject_reason")})

    rows.sort(key=lambda r: r["dt"])
    print(f"Итого размеченных сэмплов: {len(rows)}")
    if rows:
        print(f"Период: {rows[0]['dt']} -> {rows[-1]['dt']}")
    return rows


def has_variance(data, feat):
    vals = [r["f"].get(feat) for r in data if r["f"].get(feat) is not None]
    if len(vals) < MIN_GROUP:
        return False
    return statistics.pstdev(vals) > 1e-9


def quartile_thresh(data, feat):
    vals = sorted(r["f"].get(feat) for r in data if r["f"].get(feat) is not None)
    n = len(vals)
    q = n // 4
    if q < MIN_BUCKET:
        return None
    return vals[q - 1], vals[3 * q]


def eval_rule(data, feat, thresh, direction):
    if direction == "high":
        pos = [r["label"] for r in data if r["f"].get(feat) is not None and r["f"].get(feat) >= thresh]
        neg = [r["label"] for r in data if r["f"].get(feat) is not None and r["f"].get(feat) < thresh]
    else:
        pos = [r["label"] for r in data if r["f"].get(feat) is not None and r["f"].get(feat) <= thresh]
        neg = [r["label"] for r in data if r["f"].get(feat) is not None and r["f"].get(feat) > thresh]
    if len(pos) < MIN_BUCKET or len(neg) < MIN_BUCKET:
        return None
    return statistics.fmean(pos), statistics.fmean(neg), len(pos), len(neg)


COMBOS = [
    ("funding<0 & LONG", lambda f: f.get("side") == "LONG" and f.get("fundingRatePct") is not None and f["fundingRatePct"] < 0),
    ("funding>0 & SHORT", lambda f: f.get("side") == "SHORT" and f.get("fundingRatePct") is not None and f["fundingRatePct"] > 0),
    ("oiChangePct>0.3 & volumeRatio>1.5", lambda f: (f.get("oiChangePct") or -99) > 0.3 and (f.get("volumeRatio") or 0) > 1.5),
    ("macd==supertrend agree", lambda f: f.get("macdBullish") is not None and f.get("supertrendBullish") is not None and f["macdBullish"] == f["supertrendBullish"]),
    ("ADX>=28 & |altBtcRel|>1.5 aligned", lambda f: (f.get("adx") or 0) >= 28 and f.get("altBtcRelStrength") is not None and
        ((f.get("side") == "LONG" and f["altBtcRelStrength"] > 1.5) or (f.get("side") == "SHORT" and f["altBtcRelStrength"] < -1.5))),
    ("RSI extreme & ADX<18", lambda f: f.get("rsi") is not None and (f["rsi"] >= 65 or f["rsi"] <= 35) and (f.get("adx") or 99) < 18),
    ("historyWinRate>=60 & historyTrades>=3", lambda f: (f.get("historyWinRate") or 0) >= 60 and (f.get("historyTrades") or 0) >= 3),
    ("volumeRatio>=2 & atrPct<=0.5", lambda f: (f.get("volumeRatio") or 0) >= 2 and (f.get("atrPct") or 99) <= 0.5),
    ("score>=90", lambda f: (f.get("score") or 0) >= 90),
    ("mtfScoreDelta>=10", lambda f: (f.get("mtfScoreDelta") or -99) >= 10),
    ("oiChangePct<0 (declining OI)", lambda f: (f.get("oiChangePct") if f.get("oiChangePct") is not None else 1) < 0),
    ("|funding| top decile-ish (>0.02)", lambda f: abs(f.get("fundingRatePct") or 0) > 0.02),
    ("historyAvgPnlPct>0 & historyTrades>=3", lambda f: (f.get("historyAvgPnlPct") or -1) > 0 and (f.get("historyTrades") or 0) >= 3),
    ("rsi 45-55 (neutral)", lambda f: f.get("rsi") is not None and 45 <= f["rsi"] <= 55),
    ("btcTrend aligned with side", lambda f: (f.get("side") == "LONG" and f.get("btcTrend") == "LONG") or (f.get("side") == "SHORT" and f.get("btcTrend") == "SHORT")),
    ("btcTrend opposed to side", lambda f: (f.get("side") == "LONG" and f.get("btcTrend") == "SHORT") or (f.get("side") == "SHORT" and f.get("btcTrend") == "LONG")),
    ("distancePastLevelPct>=1.0 (breakout)", lambda f: (f.get("distancePastLevelPct") or -1) >= 1.0),
    ("atrPct top quartile-ish (>0.8)", lambda f: (f.get("atrPct") or 0) > 0.8),
    ("volumeRatio bottom (<0.8)", lambda f: f.get("volumeRatio") is not None and f["volumeRatio"] < 0.8),
    ("adx<15 (no trend)", lambda f: (f.get("adx") or 99) < 15),
]


def run_sweep(rows):
    split = int(len(rows) * 0.6)
    train, test = rows[:split], rows[split:]
    train_by_strat = defaultdict(list)
    test_by_strat = defaultdict(list)
    for r in train:
        train_by_strat[r["f"].get("strategy", "?")].append(r)
    for r in test:
        test_by_strat[r["f"].get("strategy", "?")].append(r)

    results = []

    def add_result(group, label, train_lift, test_lift, test_n):
        results.append({"group": group, "label": label, "train_lift": train_lift,
                         "test_lift": test_lift, "test_n": test_n})

    # Group A: single feature, pooled per strategy
    for strat, tr in train_by_strat.items():
        if len(tr) < MIN_GROUP:
            continue
        te = test_by_strat.get(strat, [])
        for feat in NUM_FEATS:
            if not has_variance(tr, feat):
                continue
            thr = quartile_thresh(tr, feat)
            if not thr:
                continue
            q1, q4 = thr
            for thresh, direction, tag in [(q4, "high", "topQ"), (q1, "low", "botQ")]:
                r_tr = eval_rule(tr, feat, thresh, direction)
                if not r_tr:
                    continue
                train_lift = r_tr[0] - r_tr[1]
                r_te = eval_rule(te, feat, thresh, direction)
                test_lift = (r_te[0] - r_te[1]) if r_te else None
                test_n = (r_te[2] + r_te[3]) if r_te else 0
                add_result("A", f"{strat} | {feat} {tag}", train_lift, test_lift, test_n)

    # Group B: single feature, per (strategy, side)
    for strat, tr in train_by_strat.items():
        for side in ("LONG", "SHORT"):
            sub = [r for r in tr if r["f"].get("side") == side]
            if len(sub) < MIN_GROUP:
                continue
            te_sub = [r for r in test_by_strat.get(strat, []) if r["f"].get("side") == side]
            for feat in NUM_FEATS:
                if not has_variance(sub, feat):
                    continue
                thr = quartile_thresh(sub, feat)
                if not thr:
                    continue
                q1, q4 = thr
                for thresh, direction, tag in [(q4, "high", "topQ"), (q1, "low", "botQ")]:
                    r_tr = eval_rule(sub, feat, thresh, direction)
                    if not r_tr:
                        continue
                    train_lift = r_tr[0] - r_tr[1]
                    r_te = eval_rule(te_sub, feat, thresh, direction)
                    test_lift = (r_te[0] - r_te[1]) if r_te else None
                    test_n = (r_te[2] + r_te[3]) if r_te else 0
                    add_result("B", f"{strat}/{side} | {feat} {tag}", train_lift, test_lift, test_n)

    # Group C: curated combos
    def combo_eval(data, cond_fn):
        pos = [r["label"] for r in data if cond_fn(r["f"])]
        neg = [r["label"] for r in data if not cond_fn(r["f"])]
        return pos, neg

    for strat, tr in train_by_strat.items():
        if len(tr) < MIN_GROUP:
            continue
        te = test_by_strat.get(strat, [])
        for name, cond in COMBOS:
            pos_tr, neg_tr = combo_eval(tr, cond)
            if len(pos_tr) < MIN_BUCKET or len(neg_tr) < MIN_BUCKET:
                continue
            train_lift = statistics.fmean(pos_tr) - statistics.fmean(neg_tr)
            pos_te, neg_te = combo_eval(te, cond)
            if len(pos_te) >= MIN_BUCKET and len(neg_te) >= MIN_BUCKET:
                test_lift = statistics.fmean(pos_te) - statistics.fmean(neg_te)
                test_n = len(pos_te) + len(neg_te)
            else:
                test_lift, test_n = None, len(pos_te) + len(neg_te)
            add_result("C", f"{strat} | {name}", train_lift, test_lift, test_n)

    # Group D: by-asset, top assets within best-sampled strategies
    for strat in ("vwap-reversion", "pullback", "rsi-reversal", "breakout"):
        tr = train_by_strat.get(strat, [])
        if len(tr) < MIN_GROUP:
            continue
        asset_counts = Counter(r["f"].get("asset") for r in tr)
        top_assets = [a for a, c in asset_counts.most_common(6) if c >= MIN_GROUP]
        for asset in top_assets:
            sub = [r for r in tr if r["f"].get("asset") == asset]
            te_sub = [r for r in test_by_strat.get(strat, []) if r["f"].get("asset") == asset]
            for feat in ["rsi", "adx", "volumeRatio", "oiChangePct"]:
                if not has_variance(sub, feat):
                    continue
                thr = quartile_thresh(sub, feat)
                if not thr:
                    continue
                _, q4 = thr
                r_tr = eval_rule(sub, feat, q4, "high")
                if not r_tr:
                    continue
                train_lift = r_tr[0] - r_tr[1]
                r_te = eval_rule(te_sub, feat, q4, "high")
                test_lift = (r_te[0] - r_te[1]) if r_te else None
                test_n = (r_te[2] + r_te[3]) if r_te else 0
                add_result("D", f"{strat}/{asset} | {feat} topQ", train_lift, test_lift, test_n)

    # Group E: gap between rejected-signal hypothetical winrate and the strategy's own
    # executed winrate, by reject_reason bucket — нашли вручную 2026-06-23 (score_low и
    # gate:pullback стабильно показывали гипотетический winrate выше исполненных сделок).
    # "lift" здесь = hypothetical_wr - executed_wr (а не разница квартилей, как в A-D), но
    # та же логика подтверждения 2 раза подряд применяется без изменений.
    def reason_bucket(reason):
        if not reason:
            return None
        if reason.startswith("gate:") or reason.startswith("early:"):
            return reason
        if reason.startswith("score_low"):
            return "score_low"
        if reason.startswith("limit_or_cooldown"):
            return "limit_or_cooldown"
        return reason

    def executed_wr(data, strat):
        sub = [r["label"] for r in data if r["src"] == "trade" and r["f"].get("strategy") == strat]
        return (statistics.fmean(sub), len(sub)) if len(sub) >= MIN_BUCKET else (None, 0)

    def rejected_wr(data, strat, bucket):
        sub = [r["label"] for r in data if r["src"] == "rejected" and r["f"].get("strategy") == strat
               and reason_bucket(r["reject_reason"]) == bucket]
        return (statistics.fmean(sub), len(sub)) if len(sub) >= MIN_BUCKET else (None, 0)

    all_strats = set(r["f"].get("strategy") for r in rows if r["f"].get("strategy"))
    all_buckets = set(reason_bucket(r["reject_reason"]) for r in rows if r["reject_reason"]) - {None}
    for strat in all_strats:
        exec_wr_tr, exec_n_tr = executed_wr(train, strat)
        if exec_wr_tr is None:
            continue
        exec_wr_te, exec_n_te = executed_wr(test, strat)
        for bucket in all_buckets:
            rej_wr_tr, rej_n_tr = rejected_wr(train, strat, bucket)
            if rej_wr_tr is None:
                continue
            train_lift = rej_wr_tr - exec_wr_tr
            if exec_wr_te is None:
                test_lift, test_n = None, 0
            else:
                rej_wr_te, rej_n_te = rejected_wr(test, strat, bucket)
                if rej_wr_te is None:
                    test_lift, test_n = None, 0
                else:
                    test_lift = rej_wr_te - exec_wr_te
                    test_n = rej_n_te + exec_n_te
            add_result("E", f"{strat} | rejected({bucket}) vs executed", train_lift, test_lift, test_n)

    return results


def fetch_registry():
    url = f"{SUPABASE_URL}/rest/v1/hypothesis_registry?select=*"
    headers = auth_headers({"Range-Unit": "items", "Range": "0-50000"})
    rows = http_get(url, headers)
    return {r["id"]: r for r in rows}


def write_registry(updates):
    if not updates:
        return
    headers = auth_headers({"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
    url = f"{SUPABASE_URL}/rest/v1/hypothesis_registry?on_conflict=id"
    chunk = 200
    for i in range(0, len(updates), chunk):
        http_post(url, headers, updates[i:i + chunk])


def main():
    dry_run = "--dry-run" in sys.argv
    rows = fetch_combined_dataset()
    if len(rows) < 200:
        print("Слишком мало данных для прогона, выхожу.")
        return

    print("\nЗапускаю перебор гипотез...")
    results = run_sweep(rows)
    testable = [r for r in results if r["test_lift"] is not None]
    print(f"Всего гипотез: {len(results)}, с данными для test: {len(testable)}")

    registry = fetch_registry()
    now_iso = datetime.utcnow().isoformat() + "Z"

    updates = []
    new_count = 0
    reconfirmed = []
    newly_ready = []
    streak_broken = []

    for r in testable:
        confirmed_this_round = (abs(r["train_lift"]) >= STRONG_TRAIN and abs(r["test_lift"]) >= STRONG_TEST
                                 and (r["train_lift"] > 0) == (r["test_lift"] > 0))
        existing = registry.get(r["label"])
        if existing:
            prev_streak = existing.get("consecutive_confirmations", 0)
            new_streak = prev_streak + 1 if confirmed_this_round else 0
            times_tested = existing.get("times_tested", 0) + 1
            best = max(existing.get("best_consecutive", 0), new_streak)
            hist = existing.get("history") or []
            if prev_streak >= 2 and new_streak == 0:
                streak_broken.append(r["label"])
            if new_streak >= 2 and prev_streak < 2:
                newly_ready.append(r)
            elif confirmed_this_round and new_streak >= 1:
                reconfirmed.append((r, new_streak))
        else:
            new_streak = 1 if confirmed_this_round else 0
            times_tested = 1
            best = new_streak
            hist = []
            new_count += 1

        status = "ready_for_review" if new_streak >= 2 else ("confirmed_once" if new_streak == 1 else "not_confirmed")
        hist = (hist + [{
            "tested_at": now_iso, "train_lift": round(r["train_lift"], 4),
            "test_lift": round(r["test_lift"], 4), "confirmed": confirmed_this_round
        }])[-10:]

        updates.append({
            "id": r["label"], "label": r["label"], "strategy_group": r["group"],
            "last_tested_at": now_iso, "times_tested": times_tested,
            "consecutive_confirmations": new_streak, "best_consecutive": best,
            "last_train_lift": round(r["train_lift"], 4), "last_test_lift": round(r["test_lift"], 4),
            "status": status, "history": hist
        })

    print(f"\n{'='*70}")
    print(f"НОВЫЕ гипотезы (впервые протестированы): {new_count}")
    print(f"Подтвердились повторно (streak растёт): {len(reconfirmed)}")
    for r, streak in sorted(reconfirmed, key=lambda x: -x[1])[:15]:
        print(f"  [{streak}x подряд] {r['label']:55} train={r['train_lift']*100:+.1f}pp test={r['test_lift']*100:+.1f}pp")

    print(f"\n🎯 НОВЫЕ ГОТОВЫЕ К ВНЕДРЕНИЮ (только сейчас набрали 2+ подряд): {len(newly_ready)}")
    for r in newly_ready:
        print(f"  [{r['group']}] {r['label']:55} train={r['train_lift']*100:+.1f}pp test={r['test_lift']*100:+.1f}pp")

    print(f"\n💔 Серия прервана (было подтверждено, в этот раз нет): {len(streak_broken)}")
    for label in streak_broken[:15]:
        print(f"  {label}")
    print(f"{'='*70}")

    if dry_run:
        print("\n--dry-run: реестр не записан.")
        return

    write_registry(updates)
    print(f"\nРеестр обновлён: {len(updates)} записей.")


if __name__ == "__main__":
    main()
