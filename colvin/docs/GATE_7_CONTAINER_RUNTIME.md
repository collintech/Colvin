# Gate 7 — Production containerization and runtime topology

## Goals

Gate 7 makes the complete Colvin stack reproducible as containers while preserving the existing fast local infrastructure workflow.

### Development/default Compose

`docker-compose.yml` remains the default file. Existing commands such as `docker compose up -d postgres redis` continue to work. A one-shot `migrate` service now ensures a clean full-stack startup applies every numbered migration before API/history traffic begins.

### Production Compose

`docker-compose.production.yml` is a hardened single-host topology:

- only `web-client` publishes a host port;
- API Gateway, Go services, PostgreSQL, and Redis are private;
- the `backend` Docker network is marked `internal`;
- the web edge reverse-proxies `/api/*` to the API Gateway;
- application containers run without root privileges;
- Linux capabilities are dropped from stateless application containers;
- `no-new-privileges` is enabled;
- migrations run as a one-shot dependency before application services;
- health checks participate in startup ordering;
- PostgreSQL and Redis use named persistent volumes;
- graceful-stop windows are explicit.

## Images

The Node services build on Node 24 LTS. Go services build with Go 1.27 and run on the supported Alpine 3.24 runtime branch. The web edge uses NGINX 1.30 in the verified unprivileged NGINX image family. Every application Dockerfile uses a multi-stage build so compilers/dev dependencies do not need to exist in the runtime image.

## Secrets

`.dockerignore` excludes `.env`, `.env.*` (except examples), build artifacts, logs, and `docker/secrets` from root build contexts. No production credential is copied into an image.

`docker-compose.production.yml` requires the most important secret values at runtime. For a real hosted environment, Gate 8/9 deployment manifests should inject those values from the deployment platform's secret manager rather than committing a populated env file.

Never put `VITE_*` secrets in the frontend. Vite build arguments are public browser configuration.

## Clean full-stack verification

Development-like full stack:

```bash
docker compose build --pull
docker compose up -d --wait

docker compose ps
```

The one-shot `migrate` container should exit with code 0; long-running services should report healthy/running.

Test the edge:

```bash
curl http://localhost:5173/healthz
```

Expected body: `ok`.

Inspect service logs if necessary:

```bash
docker compose logs migrate
docker compose logs api-gateway
docker compose logs history-service
docker compose logs vin-decoder
```

Stop without deleting data:

```bash
docker compose down
```

Delete local container data only when intentionally resetting development state:

```bash
docker compose down -v
```

## Production topology validation

Create a non-committed env file based on `.env.production.example`, then validate Compose before starting anything:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
```

Bring the production topology up:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --wait
```

Only the web port should be published on the host. PostgreSQL, Redis, API Gateway, VIN decoder, and history service must not expose host ports.

## TLS boundary

The production API uses secure refresh cookies. Real production must therefore place HTTPS/TLS in front of the web edge (managed load balancer, ingress, reverse proxy, or equivalent). The Compose file intentionally does not generate or self-manage public TLS certificates.

## Gate 8 handoff

Gate 8 should build immutable images in CI, run quality/integration/container smoke tests, scan images/dependencies, push versioned images to a registry, and deploy them to staging using managed secrets rather than rebuilding source code on the host.
