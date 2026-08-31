# Gate 6B — Vehicle History Evidence Layer

Gate 6B changes Colvin history from a flat list of generic records into an evidence-oriented model.

## Evidence model

Every history record can now retain:

- evidence status (`observed`, `reported`, `confirmed`, `cleared`, `unknown`)
- jurisdiction
- provider event ID
- deterministic evidence fingerprint for deduplication
- observation time
- provider check time
- provider/source reference and confidence

A separate `history_provider_checks` table records negative and indeterminate provider checks. This is important because "no stolen match" is not itself a historical event and must not be stored as if it were proof the vehicle has never been stolen.

## Vincario stolen-check adapter

The first Gate 6B adapter uses Vincario API 3.2's separate `stolen-check` endpoint. It shares the Vincario API/secret credentials already introduced in Gate 6A.

Provider modes:

- `local`: never calls a paid external history provider; returns stored evidence only.
- `hybrid`: calls Vincario when the existing provider check is stale, but falls back to stored evidence if Vincario is unavailable.
- `vincario`: provider failures fail the history lookup.

A successful provider check is persisted with a `valid_until` timestamp. Reopening a VIN inside that TTL does not generate another provider lookup.

## Semantics

`theftStatus=clear_in_checked_sources` means exactly that: none of the sources checked by the configured provider matched the VIN. It must never be presented as a global guarantee that the vehicle has never been stolen.

`theftStatus=reported` means at least one stored evidence record reports or confirms theft.

`theftStatus=unknown` means Colvin has neither theft evidence nor a current clear provider check.

## Next phase

Gate 6C adds multi-provider reconciliation, provider quotas/cost controls, circuit breakers, provider health metrics, and explicit conflict handling. Dedicated accident/title/auction/listing sources should be added as adapters rather than expanding the Vincario stolen-check adapter beyond its documented responsibility.
