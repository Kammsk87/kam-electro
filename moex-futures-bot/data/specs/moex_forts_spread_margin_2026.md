# MOEX / NCC calendar spread margining for BR — PARTIAL

Retrieved: 2026-08-06, by network fetch under operator instruction.
Status: **rule obtained, numeric parameter missing.**

## What was obtained — the margining rule

Source: <https://www.nationalclearingcentre.ru/catalog/030902> (NCC, risk parameters)

> «По противоположно направленным позициям в контрактах, входящих в группы
> межмесячных спредов в зависимости от типа маржирования календарных спредов,
> блокируется большее из двух ГО (если тип маржирования календарных спредов —
> полунетто), либо величина процентного риска (если тип маржирования календарных
> спредов — нетто).»

Source: <https://www.moex.com/s206> and <https://www.moex.com/ru/derivatives/parameters.aspx> (MOEX, derivatives parameters)

- BR (Brent) is included in intermonth spread groups.
- **BR uses the «нетто» rule through the second monthly expiration**, with
  «полунеттинг» applying to later terms.
- BR sits in intercontract spread Group 10 together with mini Brent.
- The number-of-clearings parameter `ncl` governing semi-netting is published in
  the NCC static risk parameters.

## What this means for the front/second pair

The discount is not a percentage anyone chooses. It is one of two rules:

| rule | margin blocked on the pair | applies to |
|---|---|---|
| нетто | величина процентного риска | BR through the **second** monthly expiration |
| полунетто | **the greater of the two legs' ГО**, not the sum | later terms |

The front/second spread measured in `TASK-MX-001` is exactly the second monthly
expiration, so **нетто applies to it**.

`TASK-MX-001` charged the full sum of both legs' initial margin. That is now known
to be wrong for this pair, and wrong in the conservative direction.

## What is still missing

The numeric **величина процентного риска** for BR. Without it the нетто case
cannot be quantified, only bounded.

Attempted: <https://www.nationalclearingcentre.ru/rates/derivativesStaticParams> —
the page is a client-rendered application and returns no parameter values to a
plain fetch. It requires selecting a date and asset in the browser and using the
export function.

**What the operator needs to do:** open that page, select BR and the current
date, export, and drop the export here. That single number closes the margin
side of `TASK-MX-002`.

## The missing number matters less than it looks

The two rules are ordered. «Полунетто» blocks the greater of the two legs' ГО —
a figure we already have from ISS params. «Нетто» blocks the interest-rate risk
instead, and it is applied to the *nearer* expirations, where the two legs are
most correlated and the residual risk is smallest. A netting regime reserved for
the most-correlated pairs that produced a *higher* margin than the semi-netting
regime would be incoherent.

Treating полунетто as an **upper bound on the front/second funding cost** is
therefore well grounded. Labelled an inference from the published rule
structure, not a measurement.

That bound is enough to decide most of the question. Maximum broker fee per
contract per side at which the median spread move still covers the all-in cost:

| horizon | under the sum of both legs (what Stage 0 charged) | under the полунетто bound |
|---|---:|---:|
| 1d | 1.64 ₽ | 3.99 ₽ |
| 3d | 5.49 ₽ | 12.54 ₽ |
| 5d | 1.59 ₽ | 13.33 ₽ |
| 10d | dead at any fee | 19.83 ₽ |

So the 3d, 5d and 10d horizons survive any broker tariff below roughly 12 ₽ per
contract per side — a level no retail FORTS tariff approaches. The numeric
interest-rate risk can only improve those three further.

**What still genuinely depends on the missing number: the 1d horizon**, whose
tolerance is 3.99 ₽ under the bound and unknown above it.

## Evidence basis

`PUBLISHED_VENUE_PARAMS` for the rule. The numeric interest-rate risk has no
basis yet and stays in `undetermined`. The bound above is an inference and must
not be written into `derived_floor` as a measurement.
