# Frontend Core

- `apps/admin`: Umi Max + React management frontend.
- Admin pages live in `apps/admin/src/pages/`; reusable UI in `src/components/`; tRPC client setup in `src/lib/api-client.ts`; page-side API wrappers in `src/services/`.
- `apps/sso`: Umi Max + React SSO portal.
- SSO pages live in `apps/sso/src/pages/`; assets in `src/assets/`; API wrappers in `src/services/`; shared browser helpers in `src/lib/` and `src/utils/`.
- Both frontends use Ant Design/Pro Components and Prettier, not backend ESLint scripts.
- Do not hand-edit generated Umi directories or frontend `dist/` outputs.
- Frontend packages have `dev`, `build`, `typecheck`, `format`; no inherited Bun-test semantics unless a frontend-specific runner is added.
- For admin tRPC surface changes, typecheck both `@iam/admin-api` and `@iam/admin`.