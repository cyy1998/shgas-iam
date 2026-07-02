# Tech Stack

- Root package manager pin: `pnpm@11.5.0`; Turbo orchestrates workspace tasks (`turbo@^2.9.16`).
- Workspace override pins `typescript: 6.0.3`; packages use `@typescript/native-preview` and `pnpm exec tsgo --noEmit` where package scripts opt into tsgo.
- Public/admin API apps, worker app, shared backend packages, and gateway tooling run on Bun; `apps/oidc-provider` runs on Node 24 with `tsx`.
- Public/admin APIs: Hono `^4.12.23`, `@hono/zod-openapi` `^1.4.0`, Scalar API Reference, tRPC server `^11.17.0`, Zod `^4.4.3`, Pino/hono-pino, ioredis where needed.
- OIDC provider app: `oidc-provider` `9.8.4`, `jose` `^6.1.3`, Node 24, `vitest` `0.34.6`.
- Worker/jobs: `apps/worker` uses Bun + Hono for health/Bull Board, `@bull-board/api`/`@bull-board/hono`, and `packages/jobs` wraps BullMQ `^5.79.2`.
- User-profile read model: `packages/user-profile-read-model` owns producer/query/dirty marker/worker module logic and depends on `@iam/jobs`, `@iam/db`, `@iam/domain`, and `@iam/contracts`.
- Database: Drizzle ORM `1.0.0-rc.2`, Drizzle Kit `1.0.0-rc.2`, PostgreSQL via `postgres` driver; historical MySQL migration script remains in `apps/api`.
- Frontends: Umi Max `^4.6.58`, React/ReactDOM `^18.3.1`, Ant Design `^5.29.3`, Ant Design Pro Components `^2.8.10`, `@ant-design/icons` `^6.2.5`.
- Frontend tests: Vitest `0.34.6`, React Testing Library, MSW, and Playwright mocked smoke E2E.
- Admin frontend consumes admin-api tRPC types via workspace dependency on `@iam/admin-api`.
- SSO frontend includes `cap-widget` for human verification.
- Gateway/APISIX package uses Bun scripts plus `yaml` parser `^2.8.2`.