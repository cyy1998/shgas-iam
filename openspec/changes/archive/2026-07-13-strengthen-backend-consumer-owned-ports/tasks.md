## 1. 基线与 TDD Guards

- [x] 1.1 盘点三个 backend 的全部 production `*.port.ts`，在 `verification.md` 记录 30 个文件、13 个 repository/service-derived 违规文件、OIDC interaction type ownership 复核项，以及 focused/full tests、typecheck、lint 与 architecture baseline
- [x] 1.2 在 API、Admin API 与 OIDC Provider architecture suites 中使用 TypeScript AST 增加全 production-port guard，覆盖 `*.repository(.ts)`、`repositories/**` 与 multiline `Pick<...Repository/Service>`，并为 `Pick<...Port>`/platform type 合法样例建立防误报断言
- [x] 1.3 在修改 production ports 前运行三个 architecture guards，记录当前 14 个目标文件产生的预期 red signal，再固定迁移后的空违规列表验收

## 2. API Consumer-Owned Ports

- [x] 2.1 将 `services/{client,mobile,organization,user}`、`services/privilege/privilegeDelegation.port.ts` 和 `use-cases/internal/register-purveyor-contact/register-purveyor-contact.port.ts` 中的 repository/service-derived dependencies 改为消费方直接声明的窄接口
- [x] 2.2 把 API port 使用的 repository/service-owned input/result types 移到既有 domain/contracts 或相邻 `*.type.ts`，同步 repository/service imports，且不通过 re-export 保留 provider ownership
- [x] 2.3 增加 API provider-to-port compile-time compatibility assertions，必要时只在 composition 添加有测试的 semantic adapter，并确认无 unchecked assertion 或 behaviorless wrapper
- [x] 2.4 运行 API port/相关 service/use-case focused tests、architecture test、typecheck 与 lint，确认 repository 调用、transaction、audit、notification、session 与 Redis 行为保持不变

## 3. Admin API Consumer-Owned Ports

- [x] 3.1 将 `services/{client,employment,organization,position,role,user}/*.port.ts` 的 transaction 与 service dependencies 改为消费方直接声明的 reader/writer/store interfaces
- [x] 3.2 把 Admin port 使用的 repository-owned input/result types 移到既有 domain/contracts 或相邻 `*.type.ts`，同步 repositories 与 UnitOfWork structural typing
- [x] 3.3 增加 Admin provider-to-port compile-time compatibility assertions，并确认 production composition 不使用 unchecked assertion 或空转 adapter
- [x] 3.4 运行 Admin port/六个 service/resign-user focused tests、architecture test、typecheck 与 lint，确认 REST/tRPC、transaction、audit、session revocation 与 profile dirty 行为保持不变

## 4. OIDC Provider Protocol Ports

- [x] 4.1 让 `provider/claims.port.ts` 从独立 authorization claim owner 取得 DTO，并直接保持 Claims Adapter 所需的方法签名，不再依赖 authorization repository ownership
- [x] 4.2 将 client runtime metadata 移出 `repositories/**` ownership，复核 `interaction/interaction.port.ts` 的 global session、provider binding 与 return-handle types 均来自单一 neutral protocol/session owner
- [x] 4.3 增加 OIDC repository/session/provider-to-port compile-time compatibility assertions，确认 composition 结构接线无需 unchecked assertion 或 behaviorless wrapper
- [x] 4.4 运行 claims、interaction、provider wiring、session/binding focused tests、OIDC architecture test、typecheck 与 lint，确认 claims snapshot、token extra、interaction、validation 与 revocation 语义保持不变

## 5. 文档与完整验证

- [x] 5.1 更新 `docs/architecture/backend-architecture.md` 与 `docs/development/backend-implementation.md`，说明 production port 全局 guard、neutral type ownership、合法 `Pick<...Port>` 和 explicit semantic adapter 规则
- [x] 5.2 运行 API、Admin API 与 OIDC Provider 的 full tests、typecheck、lint、architecture tests，以及 `pnpm check:docs`、child strict validation、umbrella strict validation、`pnpm check:openspec` 和 `git diff --check`
- [x] 5.3 人工复核 REST/OpenAPI、tRPC、OIDC/SSO、session、Redis、audit、notification、profile dirty 与 persistence compatibility matrix，并在 `verification.md` 记录无 schema/dependency/env/deployment drift、smoke 结果和任何环境限制
