# Frontend Core

- `apps/admin`: Umi Max + React management frontend.
- Admin pages live in `apps/admin/src/pages/`; reusable UI in `src/components/`; tRPC client setup in `src/lib/api-client.ts`; page-side API wrappers in `src/services/`.
- Admin page domains currently include users, organizations, positions, employments, roles, clients, audit logs, and system logs.
- `apps/sso`: Umi Max + React SSO portal.
- SSO pages live in `apps/sso/src/pages/`; assets in `src/assets/`; API wrappers in `src/services/`; shared browser helpers in `src/lib/` and `src/utils/`.
- SSO pages currently include login, reset-password, user-info, and system-maintenance.
- Both frontends use Ant Design/Pro Components and Prettier, not backend Antfu formatting style.
- Do not hand-edit generated Umi directories or frontend `dist/` outputs.
- Frontend packages have `dev`, `build`, `lint`, `test`, `test:watch`, `test:coverage`, `e2e`, `typecheck`, and `format` scripts.
- Unit tests use Vitest + React Testing Library + MSW; mocked smoke E2E uses Playwright.
- For admin tRPC surface changes, typecheck both `@iam/admin-api` and `@iam/admin`.