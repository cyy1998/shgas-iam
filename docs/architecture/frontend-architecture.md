# 前端架构

本文记录 `apps/admin` 和 `apps/sso` 下 Umi Max + React 前端 app 的结构与 composition 约定。编码风格见
[../development/coding-style.md](../development/coding-style.md)，验证选择见
[../workflows/verify.md](../workflows/verify.md)。

## App 边界

- `apps/admin` 是管理前端。它应通过 `src/services/` 下的 page-side wrapper 消费 admin 能力，并把 tRPC client
  集中在 `src/lib/api-client.ts`。
- `apps/sso` 是 SSO 门户。它应通过 `src/services/` 下的 wrapper 消费 public/auth/self-service 能力，并把共享
  request 与浏览器 helper 集中在 `src/lib/` 和 `src/utils/`。
- Umi runtime integration 放在 `src/app.ts`、`src/access.ts` 和 app-local `src/models/`。这些文件只聚焦 runtime
  bootstrap、layout/auth hooks 和全局状态 wiring。
- 构建时公开 env 必须留在 Umi `UMI_APP_` 前缀和 env contract 定义的 app-specific namespace 之后。不要在
  page component 中散落 raw deployment env 名称。

## Pages、Components 与 Hooks

- Route-level screen 放在 `src/pages/` 下，并拥有 page workflow state，例如筛选条件、选中记录、modal open state
  和 submit orchestration。
- Page-private component 放在 page 目录下，通常是 `components/` 或 `_components/`。
- 多个 page 复用的 UI 放在 `src/components/`。
- 共享 hook 在表达可复用浏览器行为或 UI 行为时放在 `src/hooks/`；page-only hook 放在对应 page 旁边。
- `src/models/` 应保持薄层，只承载多个 route 都需要的 Umi/global state。

## API 与 Contract 边界

- Page 和 component code 应优先使用 app-local service wrapper，而不是直接导入低层 request client。
- Admin service wrapper 可以调用 `apiClient`，并应对 page component 隐藏 tRPC procedure path、response
  normalization 和推断出的 request/response type。
- SSO service wrapper 应对 page component 隐藏 raw REST path、request options、auth redirect 和 response-envelope
  handling。
- 优先使用来自 `@iam/contracts` 的共享 contract 或推断出的 tRPC type，避免本地 magic number 和重复 enum 定义，
  尤其是 user、client、employment、organization、position 和 role status 值。
- 当 component 当前为了狭窄 UI flow 需要低层 client access 时，先保持局部访问；当该 flow 变得共享、复杂或涉及
  contract 敏感逻辑时，再迁移到 service wrapper。

## 测试与生成路径

- 前端测试应在可用时使用 app-local Vitest setup、React Testing Library helper、MSW handler 和 Umi runtime mock。
  当前 test workflow contract 见
  [../../openspec/specs/frontend-test-workflow/spec.md](../../openspec/specs/frontend-test-workflow/spec.md).
- 不要直接编辑 Umi generated directory 或 frontend build output；generated 和 vendored path 规则见
  [repository-map.md](repository-map.md)。
