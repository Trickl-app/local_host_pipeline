# Local Postgres

The local Postgres database stores Metropolis application state, starting with generated recommendations.

## Connection

Docker Compose exposes Postgres on host port `5433` to avoid conflicts with local Postgres installs on `5432`.

```text
postgresql://metropolis:metropolis@localhost:5433/metropolis
```

## Start Postgres

From the `local_host_pipeline` repo root:

```bash
docker compose up -d postgres
```

## Apply Schema

From the `smart_metrics` folder:

```bash
npm run db:migrate
```

The migration reads:

```text
db/schema.sql
```

## Recommendations Table

The `recommendations` table stores pending, accepted, and declined recommendations.

`yaml_content` is nullable for now. The MVP can persist recommendations and user decisions before YAML generation is implemented.
