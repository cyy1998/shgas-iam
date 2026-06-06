# DB Core

- Database package is `packages/db`; current stack is Drizzle ORM + PostgreSQL.
- Table definitions live under `packages/db/src/schema/` (`core`, `log`, `_shard` currently exist); relation definitions live under `packages/db/src/relations/`; migrations live under `packages/db/src/migrations/`.
- Keep schema exports in `packages/db/src/schema/core/index.ts` and relation registration in `packages/db/src/relations/core/index.ts` synchronized for core entities.
- Drizzle schema uses `snakeCase.table` / `snakeCase.schema`; do not depend on runtime casing conversion.
- TypeScript property names stay camelCase; database table/column names stay snake_case.
- Use `drizzle-orm/zod` for table-derived Zod schemas.
- Relations stay outside table definition files.
- Repositories use Drizzle from `@iam/db` and accept optional `tx: DbClient = db` for transaction-friendly calls.
- Join-table primary keys, indexes, and uniqueness constraints should be explicit.
- Use `db:push` for local schema sync; use `db:generate` + `db:migrate` when producing migrations.