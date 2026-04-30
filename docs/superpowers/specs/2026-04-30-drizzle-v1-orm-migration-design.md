# Drizzle v1 ORM Migration Design

## Goal

Migrate `apps/api` from Prisma to Drizzle v1 completely. The final state removes Prisma runtime, Prisma schema, Prisma-generated client and Zod schemas, and Prisma migration tooling. Drizzle becomes the single source for database schema definitions, runtime queries, migrations, and table-derived Zod schemas.

## Decisions

- Migration style: complete replacement, implemented in phases.
- Schema source: code-first from the current `apps/api/src/db/schema.prisma`.
- Data policy: preserve existing database data. The first Drizzle migration is a baseline and must not recreate existing tables.
- Query style: mixed. Simple CRUD can use Drizzle relational queries or query builder helpers; complex authorization, organization, employment, and nested relation filters use explicit SQL builder queries.

## Target Structure

```text
apps/api/
  drizzle.config.ts
  src/db/
    index.ts
    errors.ts
    schema/
      index.ts
      iam.ts
      relations.ts
      zod.ts
    migrations/
      meta/
      0000_baseline.sql
```

`src/db/index.ts` exports the Drizzle database singleton and transaction/executor types. Business code imports only from `@/db`, keeping driver initialization out of services and repositories.

`src/db/schema/iam.ts` defines all existing tables from `schema.prisma`: users, organizations, organization closure, positions, employment, clients, roles, role join tables, privileges, privilege delegation, delegation detail, and login logs. TypeScript property names keep current business naming such as `orgCode` and `createTime`, while database columns keep existing names such as `org_code` and `create_time`.

`src/db/schema/relations.ts` defines Drizzle relations separately from table definitions. `src/db/schema/zod.ts` exports `createSelectSchema`, `createInsertSchema`, and `createUpdateSchema` outputs that replace imports from `@/db/generated/schemas`.

## Migration Phases

### Phase 1: Drizzle Foundation

Add Drizzle dependencies and configuration. Create code-first table definitions, relations, the Drizzle client singleton, and the baseline migration. The baseline migration records the current schema state and must not perform destructive DDL against existing environments.

### Phase 2: Zod Schema Replacement

Replace service-level imports from `@/db/generated/schemas` with Drizzle-derived Zod schemas. Keep existing service DTO files such as `user.schema.ts` and `organization.schema.ts` as the stable OpenAPI and route validation layer. Only their base schema imports change.

### Phase 3: Repository Migration

Migrate repositories by risk:

1. Low-risk modules: `client`, `session`, `position`, `privilege`.
2. Medium-risk modules: `organization`, `employment`, `user`.
3. Highest-risk modules: `role` and permission aggregation queries.

Repository functions continue to accept an optional executor argument, now typed as a Drizzle executor or transaction. Simple reads and writes use `select`, `insert`, `update`, `delete`, or `db.query.*` with `with`. Complex Prisma nested filters, `some` clauses, relation counts, `groupBy`, and permission inheritance are rewritten as explicit SQL using joins, `exists`, `and`, `or`, `inArray`, `ilike`, and `sql`.

### Phase 4: Prisma Removal

After all repositories and services compile and smoke tests pass, remove `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `prisma-zod-generator`, `schema.prisma`, `src/db/generated`, and Prisma commands from docs and scripts.

## Transactions

Service transaction boundaries remain unchanged conceptually. Calls like `prisma.$transaction(async tx => ...)` become `db.transaction(async tx => ...)`. Repository functions receive the transaction object when called inside a service transaction. Nested transaction support may use Drizzle savepoints when required, but the first migration should not introduce new transaction nesting.

## Error Handling

Replace Prisma-specific error handling with PostgreSQL error helpers in `src/db/errors.ts`. Business services should call helpers such as `isUniqueViolation(err)`, `isForeignKeyViolation(err)`, `isNotNullViolation(err)`, and `isCheckViolation(err)`. These helpers map PostgreSQL SQLSTATE codes including `23505`, `23503`, `23502`, and `23514`.

## Validation And Rollout

Every phase must pass:

- `pnpm --filter @iam/api typecheck`
- `pnpm --filter @iam/api lint`

Each migrated module needs smoke coverage through the affected REST or tRPC endpoints in Scalar UI. High-risk paths require fixed sample checks for user search, organization tree and closure queries, employment pagination, role inheritance, and privilege delegation.

Before applying the baseline, compare the current production schema with `schema.prisma`. If the live database differs, update Drizzle table definitions intentionally before declaring the baseline. The first deployment should apply only Drizzle metadata and no table-recreating DDL.

Integration tests are recommended for repository behavior against PostgreSQL. Mock-only tests are not sufficient for this migration because the main risk is SQL semantics.
