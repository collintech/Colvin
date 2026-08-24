# Gate 4 — Migration Environment Boundary

Colvin uses two PostgreSQL network contexts during local Docker development:

- `DATABASE_URL` is consumed by containers and therefore uses the Docker service hostname `postgres`.
- `MIGRATION_DATABASE_URL` is consumed by the host-side migration command and therefore uses `localhost` plus the published PostgreSQL port.

The migration runner explicitly loads the repository root `.env`; it no longer depends on the terminal's current working directory or manually exported variables.

## Local setup

Ensure `.env` contains values equivalent to:

```env
POSTGRES_PORT=5432
DATABASE_URL=postgresql://colvin_app:<password>@postgres:5432/colvin
MIGRATION_DATABASE_URL=postgresql://colvin_app:<password>@localhost:5432/colvin
```

Use the same database name, username, and password configured for the `postgres` Compose service.

Start PostgreSQL before running migrations:

```bash
docker compose up -d postgres
```

Then run:

```bash
npm run db:migrate
```

Run the migration command a second time to verify that already-applied migrations are skipped and their checksums remain valid.
