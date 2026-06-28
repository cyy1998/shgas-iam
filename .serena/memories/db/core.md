# DB Core

- Database package is `packages/db`; current stack is Drizzle ORM + PostgreSQL.
- Table definitions live under `packages/db/src/schema/<domain>/*.ts`; relation definitions live under `packages/db/src/relations/<domain>/*.ts`; migrations live under `packages/db/src/migrations/`.
- Keep domain and top-level schema/relation exports synchronized, e.g. `packages/db/src/schema/core/index.ts`, `packages/db/src/relations/core/index.ts`, `schema/index.ts`, and `relations/index.ts`.
- Drizzle schema uses `snakeCase.table` / `snakeCase.schema`; do not depend on runtime casing conversion.
- TypeScript property names stay camelCase; database table/column names stay snake_case.
- Use `drizzle-orm/zod` for table-derived Zod schemas.
- Relations stay outside table definition files.
- Repositories use Drizzle from `@iam/db` and are created through `createXRepository(db)` factories bound to either the root `DbClient` or a transaction `DbClient`; business service methods should not pass `tx` arguments to repository calls.
- Transactional backend workflows should use the app-local `UnitOfWork`; transaction callbacks receive tx-bound repository and audit writer ports.
- Redis/cache/OIDC/SMS/fetch side effects must run outside the transaction callback or through best-effort `afterCommit`.
- Join-table primary keys, indexes, and uniqueness constraints should be explicit.
- Use `db:push` for local schema sync; use `db:generate` + `db:migrate` when producing migrations.