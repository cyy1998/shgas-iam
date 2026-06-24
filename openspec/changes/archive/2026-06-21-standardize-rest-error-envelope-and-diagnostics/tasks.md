## 1. Shared Contracts And Helpers

- [x] 1.1 Add `ApiErrorCode.ValidationFailed = "COMMON.VALIDATION_FAILED"` in the common error code section.
- [x] 1.2 Extend `resp.fail(code, message, data?)` while preserving all existing two-argument calls.
- [x] 1.3 Add shared OpenAPI error response schemas for standard errors, validation failures, and internal errors.
- [x] 1.4 Add a reusable `commonErrorResponses` helper covering `400`, `401`, `403`, `404`, `409`, `422`, and `500`.

## 2. Runtime Error Behavior

- [x] 2.1 Update the Hono/OpenAPI `defaultHook` to return the standardized validation failure envelope with `requestId` and original validation issues.
- [x] 2.2 Ensure validation failures do not emit a dedicated error or warning log.
- [x] 2.3 Update centralized REST error handling so `HTTPException` responses use `resp.fail(...)`, preserve `err.status` and `err.message`, and include `requestId` when available.
- [x] 2.4 Update unknown error handling to return HTTP `500`, include `requestId` when available, and use the dynamic internal-error message.
- [x] 2.5 Enrich unknown error logs with `err`, `traceId`, `method`, `path`, and `route` while preserving `requestId`, `source`, `errorName`, and `errorMessage`.
- [x] 2.6 Preserve existing `CustomError` and domain business error response behavior, including `data: null` and existing tRPC mapper semantics.

## 3. REST OpenAPI Documentation

- [x] 3.1 Add common error responses to all `apps/api` REST route definitions, including SSO redirect routes and CAP protocol success routes.
- [x] 3.2 Add common error responses to all `apps/admin-api` admin REST route definitions.
- [x] 3.3 Preserve existing success response schemas, redirect descriptions, route paths, HTTP methods, and tRPC route behavior.

## 4. Tests And Verification

- [x] 4.1 Add or update `@iam/api-core` tests for `resp.fail(code, message, data?)`.
- [x] 4.2 Add or update validation hook tests covering HTTP `422`, `COMMON.VALIDATION_FAILED`, original issues, requestId, and absence of top-level `success/error`.
- [x] 4.3 Update centralized error handler tests for unknown error HTTP `500`, requestId response data, enriched log fields, and no `console.error`.
- [x] 4.4 Add or update `HTTPException` tests covering preserved status/message and requestId response data.
- [x] 4.5 Add OpenAPI route definition tests or focused assertions covering common error responses on representative normal JSON, SSO redirect, and CAP routes.
- [x] 4.6 Run `pnpm --filter @iam/contracts typecheck`.
- [x] 4.7 Run `pnpm --filter @iam/api-core test` and `pnpm --filter @iam/api-core typecheck`.
- [x] 4.8 Run `pnpm --filter @iam/api typecheck` and `pnpm --filter @iam/admin-api typecheck`.
