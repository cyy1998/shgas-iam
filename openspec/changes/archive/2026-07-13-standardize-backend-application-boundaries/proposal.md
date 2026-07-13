## Why

首轮 route boundary 迁移已经建立 Application Use Case 与领域对齐 Application Service 的基本规则，但 API 的 auth/open/SSO 模块、Admin 离职流程和 OIDC provider claims 仍使用与实际职责不一致的位置或 `*Service` 命名。继续保留这些例外会让新代码难以判断 workflow、协议 adapter 与领域 facade 的合法依赖方向，也会削弱 consumer-owned port 和 architecture guard 的约束力。

## What Changes

- 建立一个跨后端 app 的 umbrella 迁移方案，并通过独立 child changes 分批收敛 API Account Recovery、Authentication、SSO、Admin User Resignation、OIDC provider protocol adapter 与 consumer-owned ports。
- 将 `apps/api/src/routes/auth`、`routes/open`、`routes/sso` 中的 application workflow、状态型 helper 和 service factory 迁出 route 目录；route 只保留协议解析、cookie/header/redirect、presenter/mapper 与 response 适配。
- 将 Account Recovery 建模为调用方目标下的 Application Use Cases；共享的绑定手机号解析能力仅作为内部 collaborator，不再以 `OpenService` 表达。
- 将 Admin `resignUser` 从 `EmploymentService` 提取为跨 User 与 Employment 的 Application Use Case，同时保持 transaction、audit 与 profile dirty 语义。
- 将 OIDC claims 组件明确为 provider protocol adapter/resolver，而不是领域对齐 Application Service，并校正 composition 中异构组件的分类名称。
- 让新建或迁移的 service/use-case 使用真正的 consumer-owned ports；在业务迁移稳定后，再收敛现有 `Pick<Repository>` 和 repository-owned DTO 泄漏，并用 architecture tests 防止回退。
- 全程保持 REST/OpenAPI、tRPC、OIDC/OAuth、SSO、session、Redis、audit、notification、profile dirty 与数据库行为兼容；本 umbrella 不直接实施 child change 的业务代码。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `backend-functional-di`: 扩展 Application Use Case、protocol adapter、领域对齐 Application Service 与 consumer-owned port 的职责边界，并要求 architecture guard 覆盖 route service factory、反向依赖和 repository-owned port shape 回退。
- `backend-structure-conventions`: 明确 Hono route、Admin REST/tRPC adapter 与 non-Hono OIDC provider 组件的位置和命名，并规定 auth/open/SSO、User Resignation 和 OIDC claims 的迁移后结构及外部契约保持要求。

## Impact

- 影响 `apps/api/src/routes/auth`、`routes/open`、`routes/sso`，以及新增或扩展的 `apps/api/src/use-cases`、`services` 和 composition wiring。
- 影响 `apps/admin-api` 的 employment/user route composition、Application Use Case wiring 与相关 transaction ports。
- 影响 `apps/oidc-provider/src/provider`、`interaction`、`composition` 中 claims、resolver、policy、security component 的分类和 port type ownership。
- 影响三个后端 app 的 architecture tests、focused characterization tests、typecheck/lint/test 验证矩阵，以及后端架构与实现文档。
- 不改变数据库 schema、外部 endpoint、HTTP method、response envelope、tRPC router key、OIDC metadata/claims contract、Redis key、session/token 生命周期或部署拓扑；不新增 workspace dependency。
