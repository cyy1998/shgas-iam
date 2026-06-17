## Context

`packages/contracts` 已经定义 `ClientStatus`、`UserStatus`、`EmploymentStatus`，后端 Drizzle schema、admin-api Zod schema 与服务层也已围绕这些枚举建模。但两个前端仍存在局部重复类型和魔法数字：`apps/sso` 将公开 client status 响应中的 `status` 定义为裸 `number`，维护页使用 `2` 判断维护状态；`apps/admin` 多处将状态转换为 `1 | 2 | 3`，雇佣页还直接用 `3` 和 `[1, 2]` 表达结束和活跃状态集合。

SSO 维护页还有额外行为问题：刷新重试固定调用 `/open/client/status?clientCode=tender`。当前 custom SSO 登录链路中，登录页和 request wrapper 会保留 `client` 与 `redirectUrl` 查询参数，因此维护页具备从 URL 获取目标 client 的上下文。

## Goals / Non-Goals

**Goals:**

- 前端状态判断和状态接口入参复用已有 `@iam/contracts` 状态枚举或 tRPC 推断类型。
- SSO 维护页根据当前 URL 的 `client` 查询参数检查对应 client 状态。
- SSO 维护页使用 `ClientStatus.Maintance` 判断维护状态。
- 保持现有 REST/tRPC API 形状不变。

**Non-Goals:**

- 不新增 `@iam/contracts` 导出。
- 不重命名 `ClientStatus.Maintance`。
- 不处理 `SmsUsage`、`HumanVerificationAction` 等目前尚未共享的本地 union 类型。
- 不处理登录页固定域名提示、Grafana dashboard/path、Umi `base/publicPath`、nginx path、dev proxy target 或应用默认 endpoint。
- 不改变 OIDC `oidcReturn` 登录模式的回跳安全模型。

## Decisions

### Decision: 复用既有状态枚举，不创建新契约

前端 SHALL 直接使用 `@iam/contracts` 中已有的 `ClientStatus`、`UserStatus`、`EmploymentStatus`。SSO 的 client status 响应类型应避免与枚举同名冲突，可改为 `ClientStatusResult` 之类的响应类型名，并将字段定义为共享 `ClientStatus`。

替代方案是新增前端本地状态常量或在每个页面创建转换 helper。该方案仍会制造第二套状态语义，不能解决契约漂移问题，因此不采用。

### Decision: Admin service wrapper 使用 tRPC 推断输入类型作为边界

`apps/admin` 的 service wrapper 已经从 `AppRouter` 推断 user/client 输入类型。雇佣状态更新也应对齐这一模式，将 `updateEmploymentStatus` 的 `status` 参数改为 `AdminEmploymentInputs['updateStatus']['status']`，页面层再使用 `EmploymentStatus` 枚举传值。

替代方案是在 service wrapper 中直接声明 `EmploymentStatus`。这也可行，但 tRPC 推断类型能让 wrapper 边界随 admin-api 输入 schema 自动同步，更符合当前 admin 前端服务层模式。

### Decision: 维护页只信任 `client` 查询参数

维护页刷新重试 SHALL 从当前 URL 读取 `client`，并用该值调用 `/open/client/status`。当 `client` 缺失时，页面 SHALL NOT fallback 到 `tender`、`UMI_APP_SSO_CLIENT_CODE` 或从 `redirectUrl` 猜测业务系统；页面保留维护状态，并提示缺少应用上下文。

替代方案包括继续保留默认 client、从 `redirectUrl` host/path 推断 client，或要求后端错误响应携带 client。默认 client 会导致错误系统状态被检查；`redirectUrl` 推断依赖部署命名且不可靠；后端携带上下文需要扩大 API 行为，因此本轮不采用。

### Decision: 本轮不处理 OIDC 维护上下文

OIDC 登录页使用 opaque `oidcReturn`，前端不解析原始 OIDC client。若 OIDC 维护场景需要类似重试能力，应由 provider resume 或后端错误上下文提供安全的 client 信息。本变更只修复 custom SSO 已有 `client` 查询参数场景，避免破坏 OIDC login return handle 约束。

## Risks / Trade-offs

- [Risk] 某些维护页入口没有携带 `client`，刷新重试不再检查任何业务系统。 → Mitigation: 页面明确保留维护态并提示缺少应用上下文，要求从业务系统重新发起登录；不使用错误 fallback。
- [Risk] `get*StatusOptions()` 返回的 `StatusOption.value` 类型当前是 `number`，页面可能仍需要局部类型收窄。 → Mitigation: 页面 handler 使用共享 enum 类型，必要时通过共享 enum cast，而不是回到 `1 | 2 | 3`。
- [Risk] `ClientStatus.Maintance` 拼写错误继续存在。 → Mitigation: 本轮只复用既有契约名，不跨包重命名；后续如需修正，应单独设计兼容别名或迁移。
- [Risk] 变更涉及两个前端，类型错误可能在单个 app typecheck 中暴露。 → Mitigation: 分别运行 `pnpm --filter @iam/sso typecheck` 和 `pnpm --filter @iam/admin typecheck`。

## Migration Plan

本变更不需要数据库迁移或 API 迁移。前端构建产物发布后，新代码会继续调用相同接口，只改变前端类型引用和维护页重试目标 client 的选择逻辑。回滚方式是回退前端代码变更。

## Open Questions

- 是否要在后续变更中把 `SmsUsage` 与 `HumanVerificationAction` 上移到 `@iam/contracts`。
- 是否要在后续变更中清理登录页固定域名提示和其他部署相关硬编码。
