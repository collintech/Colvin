# Colvin

A security-focused production-oriented monorepo for a vehicle identification and history platform.

> **Start here for a visual explanation:** [Architecture and Production Guide](docs/ARCHITECTURE_GUIDE.md)
> It shows request flows, file relationships, production replacement points, and integration examples.

## Runtime architecture

```text
React/Vite browser client
        |
        | HTTPS + bearer access token
        v
Node/Express API gateway
   |                    |
   | internal API key   | internal API key
   v                    v
Go VIN decoder      Go history service
                         |
                         v
                     PostgreSQL

API gateway <----> Redis cache
```

The browser never calls either Go service or PostgreSQL directly. The API gateway owns public authentication, request validation, rate limiting, response aggregation, lookup logging, and cache access.

## Directory map

- `apps/web-client`: React UI and API client integration.
- `apps/api-gateway`: public Express API, authentication, orchestration, PostgreSQL repositories, Redis caching.
- `apps/services-go/vin-decoder`: isolated VIN parsing and validation service.
- `apps/services-go/history-service`: isolated history-query service.
- `database/migrations`: PostgreSQL schema.

## Frontend-to-backend mapping

| Frontend file                     | Public endpoint             | Gateway route/controller/service                            | Internal dependency                 |
| --------------------------------- | --------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| `features/auth/auth.api.js`       | `POST /auth/register`       | `auth.routes` → `auth.controller` → `auth.service`          | PostgreSQL users and refresh tokens |
| `features/auth/auth.api.js`       | `POST /auth/login`          | same chain                                                  | PostgreSQL + bcrypt + JWT           |
| `features/vehicle/vehicle.api.js` | `POST /vehicles/decode`     | `vehicle.routes` → `vehicle.controller` → `vehicle.service` | Redis → Go VIN decoder → PostgreSQL |
| `features/vehicle/vehicle.api.js` | `GET /vehicles/:vin/report` | same chain                                                  | PostgreSQL + Go history service     |

Frontend modules do not import backend files. They integrate through versioned HTTP contracts. Direct cross-runtime imports between browser JavaScript, Node.js, and Go would be incorrect and insecure.

## Start with Docker

1. Copy `.env.example` to `.env`.
2. Replace every placeholder secret. Use at least 32 random characters for JWT secrets and a long internal API key.
3. Ensure `REDIS_PASSWORD` is also present in `.env`.
4. Run:

```bash
docker compose up --build
```

5. Open `http://localhost:5173`.
6. API health: `http://localhost:4000/health`.

The database migration runs automatically only when the PostgreSQL volume is first created. During development, reset it with:

```bash
docker compose down -v
docker compose up --build
```

This removes local development data.

## Local development without Docker for Node/React

PostgreSQL, Redis, and both Go services must still be available and reflected in `.env`.

```bash
npm install
npm run dev:api
npm run dev:web
```

## Security decisions included

- Public requests terminate at one gateway.
- Go services are exposed only to the Docker network.
- Internal calls require a separate API key.
- Strict environment validation prevents insecure startup.
- Passwords use bcrypt with configurable cost.
- Access and refresh tokens use separate secrets.
- Refresh tokens are hashed at rest and rotated.
- Helmet, CORS allowlisting, HPP protection, body-size limits, and rate limiting are enabled.
- SQL values use parameterized queries.
- VIN values are canonicalized and validated at each trust boundary.
- IP addresses are hashed before lookup logging.
- Logs redact authentication and password fields.
- Redis and PostgreSQL are not published to the host network.

## Important production upgrades

Before a public launch:

- Put TLS at a managed load balancer or reverse proxy.
- Store secrets in a cloud secret manager, not `.env` files.
- Use managed PostgreSQL and Redis with TLS and network policies.
- Replace the shared internal API key with mTLS or workload identity.
- Add email verification, password reset, account lockout, and optional MFA.
- Add CSRF protection if authentication moves to cookies.
- Add database migrations through a dedicated migration tool.
- Add OpenTelemetry tracing, metrics, alerts, audit retention, backups, and disaster-recovery tests.
- Review the legality and licensing of every vehicle-history data provider.
- Never expose private previous-owner identities without a lawful basis.

## Dependency inventory

### Browser

`react`, `react-dom`, `react-router-dom`, `axios`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`, `vite`.

### API gateway

`express`, `axios`, `pg`, `ioredis`, `zod`, `bcryptjs`, `jsonwebtoken`, `helmet`, `cors`, `compression`, `hpp`, `express-rate-limit`, `pino`, `pino-http`, `dotenv`.

### Go

The VIN decoder uses only the standard library. The history service uses `github.com/jackc/pgx/v5` for PostgreSQL.

## Scope

This repository is a clean, runnable foundation—not a finished commercial data product. The VIN decoder includes validation and a deliberately small WMI map. Real make/model/year enrichment and accident, auction, customs, theft, mileage, and ownership data require licensed or authoritative providers. Keep source attribution and confidence values with every history record.
