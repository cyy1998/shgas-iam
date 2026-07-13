## Context

`apps/oidc-provider` 已使用 app-local functional composition，并通过 `provider/claims.ts` 实现 `oidc-provider` 的 `findAccount`、access-token extra 和 claims hook。该模块的输入输出包含 `oidc-provider` token types，实际角色是 protocol adapter；但当前 factory/type 仍使用 `OidcClaimsService` 命名。

当前 `composition/services/index.ts` 同时创建 claims adapter、interaction policy、client auth rate limiter、client secret verifier，并把 `session.oidcSession` 再包装成 `globalSessionResolver`。这些对象分别属于 provider、security 和 session runtime，不构成领域对齐的 Application Services 聚合。Umbrella 已要求本 child 在 Consumer-Owned Ports child 之前校正该分类，并保持全部 OIDC 协议行为。

## Goals / Non-Goals

**Goals:**

- 用 `createOidcClaimsAdapter`、`OidcClaimsAdapter` 和 `CreateOidcClaimsAdapterDeps` 准确表达 claims protocol hook 的角色。
- 删除异构的 `composition/services`，让 provider、security、session composition 直接拥有各自组件。
- 通过 characterization tests 锁定 snapshot、token extra、binding/config validation、credential revocation 和 provider wiring。
- 通过 architecture guard 阻止 Claims Service 命名、混合 services 聚合和 session resolver 二次分类回退。

**Non-Goals:**

- 不把 claims 迁入 Application Service 或 domain package，不从 protocol adapter 中抽取新的业务 abstraction。
- 不在本 child 重写 `claims.port.ts`、`interaction.port.ts` 或其他 production port 的 shape ownership；该工作保留给 `strengthen-backend-consumer-owned-ports`。
- 不改变 `oidc-provider` configuration、supported flows、issuer endpoints、token/session lifetime、Redis/provider storage 或数据库 schema。
- 不新增 dependency、migration、deployment component 或 session revocation policy。

## Decisions

### 1. Claims 保留 provider 位置并改用 Adapter 命名

`provider/claims.ts` 继续直接接收和返回 `oidc-provider` 的 token/account types。factory/type/deps 分别重命名为 `createOidcClaimsAdapter`、`OidcClaimsAdapter`、`CreateOidcClaimsAdapterDeps`，调用点和测试同步更新；不保留旧 `*Service` alias。

这比迁移到 `services/claims` 更准确，因为模块的稳定边界是 provider hook，而不是可被 route 或其他 app consumer 调用的 application facade。也不拆分纯 snapshot service，因为当前 snapshot build 与 token scope、provider binding 和 `findAccount` 生命周期紧密耦合，提前拆分只会增加抽象面。

### 2. 按 provider、security、session ownership 替代 services 聚合

- `composition/security/index.ts` 创建 client auth rate limiter 与 client secret verifier，并导出 `OidcProviderSecurity`。
- `composition/provider/index.ts` 创建 Claims Adapter 与 interaction policy，再把它们与 security/session/store dependencies 注入 provider runtime 和 interaction handler。
- `composition/session/index.ts` 继续创建 `kernel` 与 `oidcSession`；provider/interaction wiring 直接使用 `session.oidcSession`，不再产生 `globalSessionResolver` alias。
- composition root 的创建顺序调整为 repositories → stores → session → security → provider runtime，并返回 `security`，不再返回 `services`。

该方案复用现有 composition ownership，且依赖方向保持单向：provider composition 可以依赖 repositories/stores/session/security 的返回类型；security composition 只依赖 env、repository 与 store；session composition 不反向依赖 provider composition。

替代方案是在 `composition/components` 下保留一个异构聚合。虽然名称不再暗示 Application Service，但仍会隐藏 session resolver 的真实 owner，也无法满足 umbrella 对 provider/security/session 分类的明确目标，因此不采用。

### 3. Characterization tests 先锁定行为，再触发命名与 architecture red signal

production 修改前扩展 focused tests，至少覆盖：

- 按 scope 固化的 UserInfo snapshot、ID Token 排除 authorization claim、access-token extra 字段与 auth time。
- provider session/global session binding 不一致、client config version 不一致、credential metadata/binding 不一致时拒绝 claims。
- 可解析但无效的 access-token credential 被按原 credential id revoke；无法解析 credential 时保持无额外 revoke。
- provider configuration、protocol payload extension、client secret verification 和 provider runtime wiring 继续接收同一类 hook/components。

随后先把测试期望切换到 Adapter 命名并加入 architecture guard，得到旧 production 结构无法满足的 red signal；再完成最小 production 改动使其转绿。测试不得通过修改 expected claims、TTL、flow 或 error semantics 来适配重构。

### 4. Architecture guard 同时检查命名、分类与依赖边界

OIDC architecture test 将验证：

- `provider/claims.ts` 暴露 Adapter factory/type，且 production source 不再出现 `OidcClaimsService`/`createOidcClaimsService`。
- `composition/services` 与 `createOidcProviderServices` 不存在；security factories 仅由 `composition/security` 物化。
- provider wiring 直接使用 session composition，不出现 `services.globalSessionResolver` 或等价二次分类。
- 既有 non-Hono DI guard 继续保证 claims/provider protocol module 不静态绑定 DB、Redis、logger 或 concrete repository。

guard 聚焦本 child 已迁移模式，不全局禁止 `Service` 单词，以免误伤合法 Application Service。

### 5. 外部协议与运行时状态全部保持

本变更只调整命名和 composition wiring。discovery metadata、authorization code flow、PKCE、client authentication、redirect validation、claims snapshot timing、token extra、config/binding checks、invalid credential revocation、Session Kernel、provider storage 与 Redis key/TTL 均沿用现有实现。没有数据迁移或渐进发布要求。

## Risks / Trade-offs

- [Risk] composition 重接线漏传 claims/security/session dependency，导致 provider 启动或 token flow 失败 → Mitigation：先锁定 provider wiring/configuration/token flow tests，并在 focused 后运行 OIDC full test。
- [Risk] 重命名时保留兼容 alias，导致错误角色继续被新代码引用 → Mitigation：不保留 alias，architecture guard 扫描 production symbol。
- [Risk] architecture guard 对目录或字符串检查过宽造成误报 → Mitigation：只检查已迁移的 production paths/symbols，并保留现有 AST import guard。
- [Trade-off] provider composition 的 deps 列表比单一 `services` 聚合更显式、更长 → 接受该冗长度以换取 ownership 与依赖方向可见性。

## Migration Plan

1. 扩展 claims、configuration/provider wiring 与 architecture characterization tests，记录预期 red signal 和既有行为基线。
2. 重命名 Claims Adapter factory/type/deps 及全部 production/test imports。
3. 新建 security composition，移动 provider-owned component wiring，删除 services composition 和 session resolver alias。
4. 运行 focused tests、architecture test、OIDC full test/typecheck/lint、OpenSpec strict validation，并人工复核外部契约矩阵。
5. 验证通过后按 Archive workflow squash merge 回 umbrella feature 分支；若失败，回退本 child commit 即可，无数据或 Redis rollback。

## Open Questions

无阻断性开放问题。
