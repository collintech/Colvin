# Gate 6A — VIN Provider Foundation (Vincario)

Colvin treats VIN specification sources as adapters with provenance rather than binding the product to one vendor schema.

## Modes

- `local`: deterministic VIN validation, WMI hints and check digit only. No network dependency and no paid lookup.
- `hybrid`: Vincario API 3.2 is attempted and normalized; provider failure falls back to local data with a warning.
- `vincario`: Vincario is required; provider failure fails the decode.

For development, use `local`. For production-like operation, `hybrid` is the intended default once valid Vincario credentials and a lookup budget are configured.

## Why Vincario is the Gate 6A external provider

Vincario documents global VIN decoding with extended European and North American support, multiple vehicle types, and a substantially richer specification response than Colvin's local decoder. Its API 3.2 uses a REST GET request with an API key and a 10-character SHA-1 control sum derived locally from `UPPERCASE_VIN|decode|API_KEY|SECRET_KEY`. The secret key is never transmitted.

Vincario is a commercial enriched-data provider, not the vehicle manufacturer itself. Colvin therefore records its source as `commercial-enriched` with `authoritative: false`. Later reconciliation can distinguish provider-supplied data from OEM/government sources.

## Normalization

Colvin maps stable top-level fields (`make`, `model`, `modelYear`, `manufacturer`, `country`, `bodyClass`, `engine`) and stores additional normalized provider attributes such as drive, fuel, doors, seats, dimensions, weights, emissions, version and variant.

Every stored vehicle retains:

- `provider_sources`
- `provider_warnings`
- `provider_attributes`
- `provider_refreshed_at`

This preserves provenance and richer provider data without leaking Vincario's raw response shape into Colvin's frontend contract.

## Cost and quota boundary

Vincario is credit/subscription based and documents rate limits on paid plans. Gate 6A does not call the provider in normal unit tests and defaults to `local` mode. Gate 6C will add explicit lookup-budget controls, balance/credit monitoring, provider metrics and circuit-breaking before production traffic is enabled.

## Gate 6B

Gate 6B will evaluate and integrate history-specific capabilities separately. Vincario's VIN decoder does not imply accident, ownership, maintenance or complete cross-border title history. Stolen checks, market value and any commercial history endpoints must have their own contracts, coverage metadata and user-facing provenance.
