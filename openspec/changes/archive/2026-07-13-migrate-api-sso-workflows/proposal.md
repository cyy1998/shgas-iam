## Why

`apps/api/src/routes/sso/sso.service.ts` 当前以单一 `SsoService` 承载 authorize、callback、code exchange、OA、WeChat 与
logout 六个调用方目标，使 route boundary 同时拥有 application workflow、状态协调和协议适配职责。作为 umbrella 的第三个 child，
需要在保持 SSO、Session Kernel、Redis、ORCAS、audit 和 redirect 行为不变的前提下，将这些流程迁为 operation-specific use-cases。

## What Changes

- 将 authorize、callback、code exchange、OA login、WeChat login 与 logout 建模为六个独立的 SSO Application Use Case，由
  composition 的 `useCases.sso` 字段提供给 SSO route。
- 让 SSO route 继续拥有 cookie、query/header precedence、callback/authorize redirect 拼装、endpoint configuration 与 response
  adaptation，不把 Hono protocol context 传入 use-case。
- 将 redirect allowlist matching、WeChat retry/cache 等跨 operation collaborator 收口为职责明确的 SSO support modules，并保持
  client validation、ORCAS、Redis key/TTL、session 与 audit/error 顺序不变。
- 删除 `routes/sso/sso.service.ts`、`sso.port.ts` 与 `services.sso` wiring；新 use-case ports 直接声明消费方法和中立 shape，由
  production composition 结构化适配现有 service、Session Kernel adapter 与 integration ports。
- 扩展 characterization tests 与 architecture guards，锁定六个 public operation seams、route protocol behavior 和 migrated SSO
  port ownership，防止单一 `SsoService` 或 route-owned stateful workflow 回退。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `backend-functional-di`: 明确六个 SSO operation 由 caller-goal use-cases 拥有，shared collaborators 使用明确职责，并由
  architecture guard 阻止 omnibus route service 与 provider-owned port 回退。
- `backend-structure-conventions`: 固定 SSO use-case、support、route/composition 的位置和命名，同时要求既有 SSO endpoint、cookie、
  redirect、Session Kernel、ORCAS、Redis、OA/WeChat 与 audit 行为保持不变。

## Impact

- 影响 `apps/api/src/routes/sso`、新增的 `apps/api/src/use-cases/sso`、可能新增的 `apps/api/src/services/sso`、API composition 与
  相邻 characterization/architecture tests。
- 保留现有 REST/OpenAPI path、method、schema、response/error、cookie attributes、query/header token precedence、client redirect
  allowlist、Custom SSO Session Kernel adapter、ORCAS/OA/WeChat integration、audit builders 与 Redis key/TTL。
- 不改变 database schema、Redis keyspace、workspace dependency、session lifetime、外部 integration contract 或 deployment topology。
