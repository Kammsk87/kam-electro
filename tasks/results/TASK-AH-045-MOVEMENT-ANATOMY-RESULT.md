# TASK-AH-045 Movement Anatomy Result

Verdict: `EXPLANATION_MAP_NOT_A_STRATEGY`.

This map separates movement magnitude from direction using 26,563 valid
post-snapshot observations and a fixed 15-minute horizon.

## What Explains Movement Size

The strongest stable observation is liquidity condition:

| Condition | Strong 15m move rate, train | Forward | Meaning |
| --- | ---: | ---: | --- |
| Baseline | 32.5% | 30.2% | Normal event-time movement |
| Wide spread or thin depth | 47.5% | 45.4% | Movement is substantially more likely |
| Tight spread and deep depth | 17.0% | 10.9% | Movement is substantially less likely |
| High event volatility | 70.4% | 51.6% | Large moves are more likely, but sparse |

Strong top-10 imbalance also raises the strong-move rate modestly (37.3%
train, 28.9% forward), but not enough to identify direction.

## What Does Not Explain Direction Yet

Direction accuracy for book imbalance stays near chance: 50.0% train and
50.6% forward. Event direction is 45.4% train and 50.5% forward. BTC/ETH
agreement changes from 42.1% train to 59.2% forward, which is too unstable to
interpret as an edge.

## Practical Interpretation

The static book can serve as a volatility or no-trade context:

- thin/wide liquidity means an impulse is more likely;
- tight/deep liquidity means an impulse is less likely;
- neither condition tells a reliable long versus short direction after costs.

The active 2-second dynamics collector can test the missing directional
mechanism: whether withdrawal and replenishment before the move resolve the
directional ambiguity.
