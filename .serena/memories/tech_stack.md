# Tech Stack

- Root package manager pin: `pnpm@11.5.0`; Turbo orchestrates workspace tasks (`turbo@^2.9.16`).
- Workspace override pins `typescript: 6.0.3`; packages use `@typescript/native-preview` and `pnpm exec tsgo --noEmit` for typecheck.
- Backend/shared/gateway runtime is Bun; backend app `devEngines.runtime.version` is `1.3.14`.
- Public/admin APIs: Hono 4, `@hono/zod-openapi`, Scalar API Reference, tRPC server v11, Zod v4, Pino/hono-pino, ioredis where needed.
- Database: Drizzle ORM `1.0.0-rc.2`, Drizzle Kit `1.0.0-rc.2`, PostgreSQL via `postgres` driver; historical MySQL migration script remains in `apps/api`.
- Frontends: Umi Max `^4.6.58`, React/ReactDOM 18.3, Ant Design 5, Ant Design Pro Components, `@ant-design/icons` 6.
- Admin frontend consumes admin-api tRPC types via workspace dependency on `@iam/admin-api`.
- SSO frontend includes `cap-widget` for human verification.
- Gateway/APISIX package uses Bun scripts plus `yaml` parser.