# Intake contract for TASK-MX-002

This directory is the drop-off point for the two published specifications that
`TASK-MX-002` is blocked on. Nothing here is fetched by any script. The operator
places the files; the task then reads them.

Status: **awaiting both documents**. Until both are present the task reports
`BLOCKED_ON_OPERATOR` and no figure is substituted in their place.

## 1. Broker FORTS tariff

Any of `broker_forts_tariff_2026.{pdf,html,json,txt}`.

Must be sufficient to answer, without interpretation:

- the commission **per contract per side** for FORTS futures, in roubles;
- the **turnover tiers** the rate depends on, if it depends on turnover;
- which entity and which tariff plan it belongs to;
- the date the tariff is effective from.

A single rate with no tier attached is not usable. If the tariff is
turnover-dependent, the tier the account would actually occupy has to be
nameable, otherwise the number is a constant without provenance and the task's
whole purpose is defeated.

Recorded in the schedule as `PUBLISHED_BROKER_TARIFF`.

## 2. MOEX / NCC inter-contract spread margin

Any of `moex_forts_spread_margin_2026.{json,csv,pdf,html}`.

Must be sufficient to answer:

- the **inter-contract (calendar) spread margin treatment** for BR pairs —
  either the discount applied to the sum of both legs' initial margin, or the
  spread margin figure itself;
- whether the treatment depends on the distance between the two expiries;
- the date the risk parameters are effective from.

Recorded in the schedule as `PUBLISHED_VENUE_PARAMS`.

## What happens next

Both values are appended to a new dated fee-schedule entry, moved out of
`undetermined`, and `tools/stage0_br_calendar_feasibility.py` is re-run
**unchanged**. The verdict is then a lookup in the frontier table frozen in the
task file on 2026-08-06 — not a judgement formed after seeing the numbers.

## What must not happen

- No figure is inferred from an account statement, a broker session, or any
  credentialed source. Published specifications only.
- No plausible-looking default is substituted for a missing document.
- The frozen Stage 0 script is not edited to accommodate whatever arrives.

## Not blocked on these files

The exercise-route differential is fully determined by ISS contract params
already retained, and is measured in
`data/reports/stage0_exit_route_differential_20260806.md`.
