# Broker FORTS tariff — NOT OBTAINED

Attempted: 2026-08-06, by network fetch under operator instruction.
Status: **failed. No admissible figure exists.**

This file deliberately carries no number. It records the attempt so the next
session does not repeat it, and so that no one mistakes the absence for an
oversight.

## Assumption that had to be made

The broker is **not named anywhere in the repository**. Finam was inferred from
the codebase (`src/moex_futures_bot/finam_client.py`, `tools/finam_probe.py`,
the Finam-based data pipeline). If the account is at a different broker, every
attempt below was aimed at the wrong document.

## What was attempted

| URL | result |
|---|---|
| <https://zaoik.finam.ru/documents/commissionrates/derivativesmarket/> | HTTP 403 |
| <https://zaoik.finam.ru/documents/commissionrates/otheroperations/> | HTTP 403 |
| <https://broker.finam.ru/landing/tariffs-n6-trader/> | HTTP 403 |

Finam blocks automated fetches across all three paths. The pages are public in a
browser.

## What was seen, and why it is not admissible

A secondary source (a T-Bank community post, not Finam) states a rate of
**0.45 ₽ per futures contract** on a Finam «Инвестор» plan with a 200 ₽ monthly
account fee offset against commission paid.

This is **not** written into the schedule, for three reasons:

1. **Wrong basis.** A third-party forum post is not `PUBLISHED_BROKER_TARIFF`. It
   is `ASSUMED`, which the task declares inadmissible.
2. **Wrong plan, possibly.** «Инвестор» may not be the plan this account holds.
3. **It is not even a constant.** The same sources indicate the rate depends on
   *both* the day's turnover *and* end-of-day net asset value, each mapping to a
   different rate. So a tier structure exists and neither coordinate of it is
   knowable from outside the account.

Point 3 is the substantive one. Even a successful fetch of Finam's page would
have produced a *table*, not a number. The tier this account occupies is
information only the operator has.

## Bracketing, for scale only

Not a measurement. From `TASK-MX-002`'s frozen frontier, the broker fee `b` per
contract per side that the contour can absorb at zero margin discount is 1.34 ₽
at 1d, 4.84 ₽ at 3d, 0.34 ₽ at 5d, and no value at 10d. The unverified 0.45 ₽
would sit inside three of those four. That is a reason to obtain the real figure,
not a substitute for it.

## What the operator needs to do

Open the broker's tariff page in a browser, save it here as
`broker_forts_tariff_2026.pdf` or `.html`, and state which tariff plan the
account is on and roughly what monthly contract turnover it would run. Without
the tier, the page alone is still not enough.
