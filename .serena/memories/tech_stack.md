# Tech Stack

- Root package manager pin: `pnpm@11.14.0`; Turbo orchestrates workspace tasks (`turbo@^2.10.5`).
- Workspaces use `@typescript/native` as an alias to stable `typescript@7.0.2` for the `tsc` CLI; the `typescript` dependency aliases `@typescript/typescript6@6.0.2` for compiler-API consumers such as ESLint and editor tooling.
- Public/admin API apps, worker app, shared backend packages, and gateway tooling run on Bun; `apps/oidc-provider` runs on Node 24 with `tsx`.
- Public/admin APIs: Hono `^4.12.30`, `@hono/zod-openapi` `^1.5.1`, Scalar API Reference, tRPC server `^11.18.0`, Zod `^4.4.3`, Pino/hono-pino, ioredis where needed.
- OIDC provider app: `oidc-provider` `9.9.1`, `jose` `^6.1.3`, Node 24, `vitest` `4.1.10`.
- Worker/jobs: `apps/worker` uses Bun + Hono for health/Bull Board, `@bull-board/api`/`@bull-board/hono`, and `packages/jobs` wraps BullMQ `^5.80.6`.
- User-profile read model: `packages/user-profile-read-model` owns producer/query/dirty marker/worker module logic and depends on `@iam/jobs`, `@iam/db`, `@iam/domain`, and `@iam/contracts`.
- Database: Drizzle ORM `1.0.0-rc.2`, Drizzle Kit `1.0.0-rc.2`, and PostgreSQL via the `postgres` driver.
- Frontends: Umi Max `^4.6.79`, React/ReactDOM `^19.2.7`, Ant Design `^6.5.1`, `@ant-design/icons` `^6.3.2`; Admin pins Ant Design Pro Components `3.1.14-2`, while SSO does not depend on ProComponents.
- Frontend tests: Vitest `4.1.10`, React Testing Library, MSW, and Playwright mocked smoke E2E.
- Admin frontend consumes admin-api tRPC types via workspace dependency on `@iam/admin-api`.
- SSO frontend includes `cap-widget` for human verification.
- Gateway/APISIX package uses Bun scripts plus `yaml` parser `^2.8.2`.
