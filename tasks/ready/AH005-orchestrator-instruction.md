# AH-005A Orchestrator Instruction

This instruction resolves the pending AH-005A questions without changing the
frozen AH-005 signal rule.

## Frozen universe

The frozen universe is exactly the 109 sorted top-level keys of:

`/opt/botalin-edge/data/bars_xs/bars.json`

Read the source file, write its SHA-256 and the complete sorted symbol array
into the AH-005A provenance manifest, and compare it with every downloaded
symbol. Do not reduce the universe to the 100 symbols that happened to return
data and do not substitute any symbol.

If a frozen symbol is absent from public Bybit linear 1h data for the requested
window, record the exact symbol and cause. The only valid result in that case is
`DATA_INADEQUATE`; do not continue to AH-005.

## Entry-realism decision

For the frozen AH-005 ideal-fill OOS test only, the official open of the next
one-hour bar is accepted as a causal temporal proxy. It must be labelled
`BAR_OPEN_IDEAL_FILL_ONLY` everywhere. It may assess signal quality but cannot
be presented as an executable fill or execution evidence.

This does not alter the frozen signal rule. It explicitly reserves execution
realism for a later event-time L2/trade replay gate.

## Order of work

1. Finalize and commit AH-005A using the exact decision above.
2. Run AH-005 only if AH-005A returns exact 109-symbol coverage and
   `DATA_READY_FOR_FROZEN_AH005_IDEAL_FILL_ONLY`.
3. Do not start AH-008 until AH-005A is committed. If AH-005A is
   `DATA_INADEQUATE`, report the block and wait for a separate data decision.

No live/paper/trading infrastructure action is authorized.
