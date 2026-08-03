"""Small long/flat baseline backtest engine for daily bars."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from statistics import mean, pstdev


@dataclass(frozen=True)
class Bar:
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    funding_long_rub: float = 0.0
    exchange_fee_rub: float = 0.0
    broker_fee_rub: float = 0.0
    minstep: float = 0.0
    stepprice: float = 0.0
    source_symbol: str = ""
    roll_flag: bool = False


@dataclass(frozen=True)
class BacktestResult:
    strategy_name: str
    symbol: str
    timeframe: str
    params: dict[str, float | int | str]
    metrics: dict[str, float | int | str]


def run_momentum(
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    fast: int,
    slow: int,
    cost_bps: float,
    eval_start_index: int = 1,
) -> BacktestResult:
    signals: list[int] = []
    closes = [bar.close for bar in bars]
    for index in range(len(bars)):
        if index + 1 < slow:
            signals.append(0)
            continue
        fast_ma = mean(closes[index + 1 - fast : index + 1])
        slow_ma = mean(closes[index + 1 - slow : index + 1])
        signals.append(1 if fast_ma > slow_ma else 0)
    return _result("momentum_sma", symbol, timeframe, bars, signals, {"fast": fast, "slow": slow, "cost_bps": cost_bps}, cost_bps, eval_start_index)


def run_breakout(
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    lookback: int,
    cost_bps: float,
    eval_start_index: int = 1,
) -> BacktestResult:
    signals: list[int] = []
    in_position = False
    for index, bar in enumerate(bars):
        if index < lookback:
            signals.append(0)
            continue
        prior_window = bars[index - lookback : index]
        prior_high = max(item.high for item in prior_window)
        prior_low = min(item.low for item in prior_window)
        if not in_position and bar.close > prior_high:
            in_position = True
        elif in_position and bar.close < prior_low:
            in_position = False
        signals.append(1 if in_position else 0)
    return _result("breakout_high_low", symbol, timeframe, bars, signals, {"lookback": lookback, "cost_bps": cost_bps}, cost_bps, eval_start_index)


def run_mean_reversion(
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    lookback: int,
    threshold_pct: float,
    cost_bps: float,
    eval_start_index: int = 1,
) -> BacktestResult:
    signals: list[int] = []
    closes = [bar.close for bar in bars]
    for index, bar in enumerate(bars):
        if index + 1 < lookback:
            signals.append(0)
            continue
        avg_close = mean(closes[index + 1 - lookback : index + 1])
        discount = (avg_close - bar.close) / avg_close if avg_close else 0
        signals.append(1 if discount >= threshold_pct / 100 else 0)
    return _result(
        "mean_reversion_sma",
        symbol,
        timeframe,
        bars,
        signals,
        {"lookback": lookback, "threshold_pct": threshold_pct, "cost_bps": cost_bps},
        cost_bps,
        eval_start_index,
    )


def run_atr_breakout(
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    lookback: int,
    atr_period: int,
    atr_mult: float,
    cost_bps: float,
    eval_start_index: int = 1,
) -> BacktestResult:
    signals: list[int] = []
    true_ranges = _true_ranges(bars)
    in_position = False
    warmup = max(lookback, atr_period)
    for index, bar in enumerate(bars):
        if index < warmup:
            signals.append(0)
            continue
        prior_window = bars[index - lookback : index]
        prior_high = max(item.high for item in prior_window)
        prior_low = min(item.low for item in prior_window)
        atr = mean(true_ranges[index + 1 - atr_period : index + 1])
        if not in_position and bar.close > prior_high + atr * atr_mult:
            in_position = True
        elif in_position and bar.close < prior_low:
            in_position = False
        signals.append(1 if in_position else 0)
    return _result(
        "atr_breakout",
        symbol,
        timeframe,
        bars,
        signals,
        {"lookback": lookback, "atr_period": atr_period, "atr_mult": atr_mult, "cost_bps": cost_bps},
        cost_bps,
        eval_start_index,
    )


def run_trend_volatility(
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    fast: int,
    slow: int,
    vol_period: int,
    max_vol_pct: float,
    cost_bps: float,
    eval_start_index: int = 1,
) -> BacktestResult:
    signals: list[int] = []
    closes = [bar.close for bar in bars]
    returns = _close_returns(bars)
    warmup = max(slow, vol_period + 1)
    for index in range(len(bars)):
        if index + 1 < warmup:
            signals.append(0)
            continue
        fast_ma = mean(closes[index + 1 - fast : index + 1])
        slow_ma = mean(closes[index + 1 - slow : index + 1])
        realized_vol = pstdev(returns[index + 1 - vol_period : index + 1]) * math.sqrt(252) * 100
        signals.append(1 if fast_ma > slow_ma and realized_vol <= max_vol_pct else 0)
    return _result(
        "trend_volatility",
        symbol,
        timeframe,
        bars,
        signals,
        {"fast": fast, "slow": slow, "vol_period": vol_period, "max_vol_pct": max_vol_pct, "cost_bps": cost_bps},
        cost_bps,
        eval_start_index,
    )


def run_roll_aware_breakout(
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    lookback: int,
    roll_cooldown: int,
    cost_bps: float,
    eval_start_index: int = 1,
) -> BacktestResult:
    signals: list[int] = []
    in_position = False
    roll_distance = _roll_distance(bars)
    for index, bar in enumerate(bars):
        if index < lookback:
            signals.append(0)
            continue
        in_roll_window = roll_distance[index] <= roll_cooldown
        if in_roll_window:
            in_position = False
            signals.append(0)
            continue
        prior_window = bars[index - lookback : index]
        prior_high = max(item.high for item in prior_window)
        prior_low = min(item.low for item in prior_window)
        if not in_position and bar.close > prior_high:
            in_position = True
        elif in_position and bar.close < prior_low:
            in_position = False
        signals.append(1 if in_position else 0)
    return _result(
        "roll_aware_breakout",
        symbol,
        timeframe,
        bars,
        signals,
        {"lookback": lookback, "roll_cooldown": roll_cooldown, "cost_bps": cost_bps},
        cost_bps,
        eval_start_index,
    )


def _result(
    strategy_name: str,
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    signals: list[int],
    params: dict[str, float | int | str],
    cost_bps: float,
    eval_start_index: int = 1,
) -> BacktestResult:
    returns: list[float] = []
    equity = 1.0
    equity_curve: list[float] = [equity]
    trades = 0
    exposure_days = 0

    start_index = max(1, eval_start_index)
    for index in range(start_index, len(bars)):
        prev_signal = signals[index - 1]
        current_signal = signals[index]
        if prev_signal:
            exposure_days += 1
        if current_signal != prev_signal:
            trades += 1
        raw_return = (bars[index].close / bars[index - 1].close - 1) if bars[index - 1].close else 0
        trade_cost = abs(current_signal - prev_signal) * (
            cost_bps / 10_000 + _fee_return(bars[index], bars[index - 1].close)
        )
        funding_cost = prev_signal * _funding_return(bars[index], bars[index - 1].close)
        daily_return = prev_signal * raw_return - trade_cost - funding_cost
        returns.append(daily_return)
        equity *= 1 + daily_return
        equity_curve.append(equity)

    total_return = equity - 1
    max_drawdown = _max_drawdown(equity_curve)
    sharpe = _annualized_sharpe(returns)
    active_returns = [
        value
        for value, signal in zip(returns, signals[start_index - 1 : len(bars) - 1])
        if signal
    ]
    win_rate = sum(1 for value in active_returns if value > 0) / len(active_returns) if active_returns else 0.0

    metrics: dict[str, float | int | str] = {
        "bars": len(bars),
        "evaluated_bars": max(len(bars) - start_index, 0),
        "start_ts": bars[start_index].ts.isoformat() if bars else "",
        "end_ts": bars[-1].ts.isoformat(),
        "total_return_pct": total_return * 100,
        "max_drawdown_pct": max_drawdown * 100,
        "sharpe_daily_annualized": sharpe,
        "trades": trades,
        "exposure_pct": exposure_days / max(len(bars) - 1, 1) * 100,
        "win_rate_active_days_pct": win_rate * 100,
        "final_equity": equity,
        "uses_funding_rub": any(bar.funding_long_rub for bar in bars),
        "uses_exchange_fee_rub": any(bar.exchange_fee_rub for bar in bars),
        "uses_broker_fee_rub": any(bar.broker_fee_rub for bar in bars),
    }
    return BacktestResult(strategy_name, symbol, timeframe, params, metrics)


def _true_ranges(bars: list[Bar]) -> list[float]:
    ranges: list[float] = []
    for index, bar in enumerate(bars):
        if index == 0:
            ranges.append(max(bar.high - bar.low, 0.0))
            continue
        prev_close = bars[index - 1].close
        ranges.append(max(bar.high - bar.low, abs(bar.high - prev_close), abs(bar.low - prev_close), 0.0))
    return ranges


def _close_returns(bars: list[Bar]) -> list[float]:
    returns = [0.0]
    for index in range(1, len(bars)):
        prev_close = bars[index - 1].close
        returns.append(bars[index].close / prev_close - 1 if prev_close else 0.0)
    return returns


def _roll_distance(bars: list[Bar]) -> list[int]:
    roll_indices = [index for index, bar in enumerate(bars) if bar.roll_flag]
    if not roll_indices:
        return [10**9 for _ in bars]
    distances = []
    for index in range(len(bars)):
        distances.append(min(abs(index - roll_index) for roll_index in roll_indices))
    return distances


def _max_drawdown(equity_curve: list[float]) -> float:
    peak = equity_curve[0] if equity_curve else 1.0
    max_dd = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        if peak:
            max_dd = max(max_dd, (peak - value) / peak)
    return max_dd


def _annualized_sharpe(returns: list[float]) -> float:
    if len(returns) < 2:
        return 0.0
    avg = mean(returns)
    vol = pstdev(returns)
    if vol == 0 or math.isnan(vol):
        return 0.0
    return avg / vol * math.sqrt(252)


def _fee_return(bar: Bar, reference_price: float) -> float:
    if reference_price <= 0:
        return 0.0
    fee_rub = bar.exchange_fee_rub + bar.broker_fee_rub
    return _rub_to_price_units(fee_rub, bar) / reference_price


def _funding_return(bar: Bar, reference_price: float) -> float:
    if reference_price <= 0:
        return 0.0
    return _rub_to_price_units(bar.funding_long_rub, bar) / reference_price


def _rub_to_price_units(value_rub: float, bar: Bar) -> float:
    if value_rub == 0:
        return 0.0
    if bar.minstep > 0 and bar.stepprice > 0:
        return value_rub * bar.minstep / bar.stepprice
    return value_rub
