# Conventions

- TypeScript throughout; 2-space indentation.
- Backend/shared/gateway packages use Antfu ESLint; configured style is double quotes, semicolons, about 120-char soft line length.
- Admin/SSO frontends use Prettier: single quotes, trailing commas, 80-char wrap, organize-import/packagejson plugins.
- Preserve domain file naming patterns: `*.service.ts`, `*.repository.ts`, `*.schema.ts`, `*.routes.ts`, `*.handlers.ts`, `*.adapter.ts`, `*.trpc.ts`, `*.type.ts`.
- Backend route handlers return shared envelopes from `@iam/api-core/http`, e.g. `c.json(resp.ok(data))`; prefer domain/API errors when middleware maps them.
- OpenAPI route definitions and explicit non-200 responses use `@iam/api-core/core/http-status-codes` constants rather than numeric literals.
- Runtime diagnostics use app loggers (`@api/lib/logger`, `@admin-api/lib/logger`) with structured Pino calls: data object first, message second.
- Avoid `console.*` in application code; acceptable in env validation, singleton/process lifecycle code, tests, one-off scripts, centralized error handler.
- Cross-app enums/stable business contracts belong in `packages/contracts`; app-private enums may stay in the owning app.
- Prefer Zod-derived types via `z.infer<typeof Schema>` when a schema is the source of truth.
- Keep narrow changes; avoid unrelated refactors/format churn.
- Recent commits use Conventional Commits with scopes; completed feature/behavior changes should be committed automatically with Chinese commit messages unless user asks otherwise.