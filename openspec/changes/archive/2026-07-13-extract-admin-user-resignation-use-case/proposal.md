## Why

`apps/admin-api/src/services/employment/employment.service.ts` 当前让 `resignUser` 在 Employment 领域 facade 中协调 User 与
Employment 两个生命周期、transaction、audit 和 profile dirty 副作用，职责已经超出领域对齐 Application Service。作为 umbrella
的第四个 child，需要在保持 Admin REST/tRPC、transaction 和 session 行为不变的前提下，将离职流程提取为明确的跨领域 use-case。

## What Changes

- 新增 `use-cases/employment/resign-user` Application Use Case，由单一 UnitOfWork 拥有用户查询、结束全部 active employments、禁用用户、
  原有 audit 与两类 profile dirty reason。
- 为离职 use-case 建立直接声明消费方法与中立数据 shape 的 consumer-owned port，并由 composition 映射现有 transaction ports。
- 在 Admin API 新增独立 `composition/use-cases` 聚合，通过 `useCases.employment.resignUser` 向 employment adapter 注入离职 facade；
  `EmploymentService` 不再暴露 `resignUser`。
- 保持现有 employment REST path、schema、tRPC `resignUser` key、成功结果、错误、transaction 顺序、audit payload、afterCommit context 与
  `EmploymentUpdated`/`UserUpdated` dirty reasons 不变，不新增 session revocation。
- 扩展 characterization tests 与 architecture guards，锁定 REST/tRPC dispatch、跨领域 transaction ownership、consumer-owned port 和
  composition 分类，并关闭 umbrella 已记录的 Admin API test lint baseline。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `backend-functional-di`: 明确 Admin User Resignation 由跨 User/Employment 的 caller-goal use-case 拥有，并由 consumer-owned port 与
  architecture guard 防止 workflow 返回 `EmploymentService`。
- `backend-structure-conventions`: 固定 `resign-user` use-case、Admin `composition/use-cases` 与 employment adapter 的位置和 wiring，同时要求
  既有 REST/tRPC、transaction、audit、profile dirty 与 session 语义保持不变。

## Impact

- 影响 `apps/admin-api/src/services/employment`、新增的 `apps/admin-api/src/use-cases/employment/resign-user`、Admin composition、employment
  adapter、focused tests 与 architecture tests。
- 保留现有 employment route/schema、tRPC router shape、User/Employment repository behavior、audit builder、UnitOfWork、profile dirty
  marker 和 afterCommit job wiring。
- 不改变 database schema、Redis keyspace、Session Kernel/session revocation behavior、workspace dependency、external contract 或
  deployment topology；不提前处理 OIDC components 或全局 historical port hardening。
