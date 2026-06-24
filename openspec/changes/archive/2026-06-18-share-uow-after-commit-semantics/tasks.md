## 1. Shared UoW Infrastructure

- [x] 1.1 Add `packages/api-core/src/uow/` with generic `createUnitOfWork`, `UnitOfWorkPort<TxPorts>`, `TransactionContext<TxPorts>`, `AfterCommitPort`, `mapUnitOfWork`, and after-commit task types.
- [x] 1.2 Implement required/best-effort after-commit execution semantics: post-commit only, registration-order `await`, all tasks attempted, best-effort failures logged only, required failures aggregated and thrown after all attempts.
- [x] 1.3 Add `AfterCommitRequiredTaskError` or equivalent structured API runtime error using `ApiErrorCode.InternalError` and HTTP 500 while retaining internal failure details.
- [x] 1.4 Add shared UoW test fake support for immediate transactions with matching after-commit required/best-effort behavior.
- [x] 1.5 Export the shared UoW module through `@iam/api-core/uow` and keep it free of `@iam/db` and app-local imports.

## 2. App Composition Migration

- [x] 2.1 Replace duplicated app-local `composition/tx/unit-of-work.ts` implementations in `apps/api` and `apps/admin-api` with imports from `@iam/api-core/uow`.
- [x] 2.2 Keep app-local `createApiUnitOfWork` and `createAdminApiUnitOfWork` as composition adapters that pass the Drizzle transaction executor and app-local tx port factories to shared UoW.
- [x] 2.3 Replace app-local `createMappedUnitOfWork` helpers in backend composition modules with shared `mapUnitOfWork`.
- [x] 2.4 Update backend service and route UnitOfWork port types so mapped transaction contexts retain `afterCommit`.

## 3. Admin API Side-Effect Migration

- [x] 3.1 Move admin client create/update/delete client cache writes into `tx.afterCommit.required(...)` while preserving existing cache consistency behavior.
- [x] 3.2 Move admin client OIDC runtime invalidation into `tx.afterCommit.bestEffort(...)` and remove the service-local best-effort logging helper.
- [x] 3.3 Remove `logger` from admin client service deps if it is no longer needed after UoW-owned after-commit logging.
- [x] 3.4 Move admin user disable/delete token revocation into `tx.afterCommit.required(...)` while preserving reset password token behavior.
- [x] 3.5 Preserve existing REST/tRPC response DTOs and avoid changing DB schema or public API paths.

## 4. Tests And Verification

- [x] 4.1 Add focused tests for shared UoW required/best-effort task ordering, failure aggregation, transaction failure discard, and mapped UoW `afterCommit` preservation.
- [x] 4.2 Update `api` and `admin-api` service tests to use shared immediate UoW fake behavior.
- [x] 4.3 Update admin client service tests to assert cache tasks and OIDC invalidation are attempted with the new after-commit semantics.
- [x] 4.4 Update admin user service tests to assert token revocation is attempted through required after-commit semantics for disable/delete flows.
- [x] 4.5 Run focused Bun tests for touched services and shared UoW.
- [x] 4.6 Run `pnpm --filter @iam/api-core typecheck`, `pnpm --filter @iam/admin-api typecheck`, and `pnpm --filter @iam/api typecheck`.
- [x] 4.7 Run `openspec validate --change share-uow-after-commit-semantics` or the repository-equivalent OpenSpec validation command.
