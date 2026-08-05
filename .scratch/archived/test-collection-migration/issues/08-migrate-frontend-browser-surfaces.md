# 08 — 迁移 Frontend Unit 与 Mock-browser Surfaces

**What to build:** 把 Admin/SSO ordinary Vitest 与 6 个 mock-backend Playwright files 迁为完整 package-local
`test:unit`/`component`/`browser` commands；browser 保留现有 API mocks、webServer 与 Chromium 行为。

**Blocked by:** 07 — 迁移 Pure Shared Packages 与 Gateway Unit Surfaces

**Status:** resolved

**Repository invariant:** Frontend package surfaces 从出现起完整；旧 `e2e` scripts 在 root cutover 前仍运行相同 mocked
collections。

**Focused verification:**

- 运行两个 Vitest lists/commands、两个 Playwright `--list --reporter=json` 与聚焦 browser tests。
- 运行两个 frontend workspace lint/typecheck，并与 Ticket 01 做 equality diff。

- [x] Admin 28 tests/3 Playwright files、SSO 4 tests/3 files 的 JSON list 与旧 baseline 相等，不称为 Full-system E2E。
- [x] Vitest include/exclude、Playwright `testDir`/`baseURL`/`webServer`、lint/tsconfig 同步，不与未来 `test:e2e` 混用。
- [x] 不新增 journey、Gateway stack 或 `page.route` 禁令，只保持现有 browser Integration 行为。
