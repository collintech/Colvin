# Gate 6C — Provider Orchestration, Economics & Resilience

Gate 6C makes external vehicle-data calls operationally safe before additional paid providers are introduced.

## Guarantees

- **Shared daily budget:** provider calls are reserved atomically in PostgreSQL (`provider_usage_daily`), so multiple history-service replicas share the same budget.
- **Circuit breaker:** consecutive failures are persisted in `provider_runtime_state`. Once the threshold is reached, external calls are paused for the configured open interval.
- **Single-flight coalescing:** simultaneous lookups for the same provider/VIN in one process share one upstream refresh operation.
- **Bounded retries:** Vincario retries only transient failures (network errors, HTTP 408, 429, and 5xx) with bounded exponential backoff. Permanent 4xx responses are not retried.
- **Evidence reconciliation:** positive theft evidence takes precedence over a clear provider check, while the report explicitly exposes the conflict instead of hiding it.
- **Provider telemetry:** history responses expose non-secret provider health metadata: daily usage/budget, consecutive failures, circuit state, and success/failure totals.

## Budget semantics

`HISTORY_PROVIDER_DAILY_BUDGET` counts attempted paid provider calls. A failed provider request still consumes a reservation because commercial providers may charge or rate-limit attempted requests.

The counter resets by UTC calendar day. A value must be a positive integer; there is intentionally no unlimited production default.

## Circuit semantics

After `HISTORY_PROVIDER_CIRCUIT_FAILURE_THRESHOLD` consecutive failures, the circuit opens for `HISTORY_PROVIDER_CIRCUIT_OPEN_SECONDS`.

- In `hybrid` mode, Colvin serves stored evidence plus a warning while the circuit is open or the daily budget is exhausted.
- In strict `vincario` mode, the lookup fails instead of silently degrading.
- Any successful provider call resets consecutive failures and closes the circuit.

## Reconciliation

A clear provider check is scoped to that provider's checked sources. If stored evidence reports theft while a provider check is clear, Colvin returns `theftStatus: reported` and emits a `conflicting_evidence` entry naming the relevant sources.

This is the first reconciliation rule. Gate 6C establishes the contract so future accident/title/auction providers can add field-specific rules without changing the public history response shape.

## What this gate does not do

It does not add another commercial provider. Provider B/C integrations should be added only after their coverage, licensing, data-retention rights, cost model, and Nigeria/Africa applicability are verified.
