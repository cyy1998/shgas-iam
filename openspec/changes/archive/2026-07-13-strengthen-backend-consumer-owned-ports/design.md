## Context

前五个 child changes 已经归档，并为新建的 Account Recovery、Authentication、SSO、Admin User Resignation 与 OIDC Claims Adapter 边界建立了 consumer-owned ports。当前对三个 backend 的 30 个 production `*.port.ts` 进行静态盘点后，仍发现 13 个文件直接 import `*.repository.ts` 或通过 `Pick<...Repository>`/`Pick<...Service>` 派生契约：API 6 个、Admin API 6 个、OIDC Provider 1 个。`interaction/interaction.port.ts` 虽已直接声明方法，但仍从 `repositories/client-metadata.ts` 和具体 session/interaction modules 取得共享数据 shape，也属于 umbrella 指定的复核范围。

这些依赖全部是 type-only，不会直接改变运行时对象图，但它们让 port 的方法与 DTO 演进受 provider 侧接口控制。最后一个 child 需要在不改变 repository query/write、UnitOfWork、OIDC/session 行为的前提下统一收口，并让三个 backend 的 architecture tests 覆盖全部 production ports，而不是只保护前五批新模块。

## Goals / Non-Goals

**Goals:**

- 让 API、Admin API 与 OIDC Provider 的 production ports 直接声明消费方需要的方法签名。
- 让 port 使用 domain/contracts、consumer-owned `*.type.ts` 或明确的中立 protocol/session type，而不是 repository-owned DTO。
- 保持现有依赖对象字段名和结构兼容接线；只有签名确实不兼容时才在 composition 创建显式 adapter。
- 先建立会枚举现有违规文件的 architecture red tests，再分 app 迁移并用 compile-time compatibility assertions 锁定 provider-to-port 适配。
- 保持三个 backend 的全部外部和运行时契约，并把规则同步到后端架构与实现文档。

**Non-Goals:**

- 不改变 repository SQL、Drizzle query、write 顺序、transaction 边界或 persistence DTO 的运行时 shape。
- 不重命名 endpoint、route、tRPC operation、OIDC hook、Redis key/TTL、audit action、notification 或 profile dirty reason。
- 不要求移除对 `Pick<...Port>`、Node/platform type 或 shared contract 的合法窄化；本 change 禁止的是 concrete `Repository`/`Service` 派生 ownership。
- 不新增 database migration、workspace dependency、部署配置或跨 app shared package。
- 不借 port 迁移拆分现有 domain-aligned services 或重构业务流程。

## Decisions

### 1. Guard 覆盖全部 production ports，迁移范围由静态违规决定

三个 app 的 architecture tests 将扫描各自 `src/**` 下所有非测试 `*.port.ts`，并报告：

- import path 指向 `*.repository.ts`、`*.repository` 或 `repositories/**`；
- `Pick` 的来源 type 名以 `Repository` 或 `Service` 结尾。

Guard 使用 TypeScript AST 识别 import 和 type reference，避免 multiline generic 与普通文本匹配造成漏报。`Pick<RedisPort>`、`Pick<PasswordHasherPort>`、`Pick<IncomingMessage>` 及名称以 `Port` 结尾的 consumer/runtime contracts 不属于违规。当前 guard 预期先枚举 14 个目标文件：13 个 repository/service-derived ports，以及 OIDC `interaction.port.ts` 的 repository-area type ownership；迁移后列表必须为空。

替代方案是只给 umbrella 点名的 Admin 六个和 OIDC 两个文件增加白名单式检查。未采用，因为 API 盘点已发现同类 production ports，白名单无法满足“三个 backend 防回退”的验收条件。

### 2. Port 直接声明方法，provider 通过结构兼容满足

每个消费模块为依赖角色声明窄接口，例如 reader、writer、transaction store、query 或 collaborator；现有 deps 字段名（如 `userRepository`、`clientRepository`）可保留，以减少 wiring 和测试 fixture 漂移。方法参数、返回值、optional/readonly 语义和 Promise 边界从当前 provider contract 等价迁入 port。

Repository/service factory 返回对象默认直接传给新 port，因为 TypeScript 的 structural typing 会验证其兼容性。新增 type-level assertions 覆盖各 app 的代表性 repository/service 与 transaction dependency，生产 composition 禁止使用 `as` 或空转 wrapper 掩盖不兼容。只有 provider 与 consumer 的语义 shape 确实不同，才允许在 composition 建立有名字的 adapter 并通过测试锁定映射。

替代方案是在每个 dependency 外再包一层 forwarding adapter。未采用，因为当前方法大多结构兼容，空转 wrapper 会增加运行时层级而不增加边界价值。

### 3. 数据 shape 移向现有 neutral owner，必要时新增相邻 `*.type.ts`

数据类型按以下顺序选择 owner：

1. 已存在的 `@iam/contracts` 或 `@iam/domain/*` 公共 contract；
2. 消费模块相邻的 `*.type.ts`；
3. 被多个同 app protocol components 共享时，使用职责明确的中立 `*.type.ts`。

若类型当前定义在 `*.repository.ts`，将 type 声明移动到对应 consumer/neutral type module，repository 与 port 同时 import 它；不得只通过 repository re-export 继续维持反向 ownership。OIDC authorization claim 使用独立的 authorization claim type owner，client runtime metadata 不再由 `repositories/**` 路径拥有；claims/interaction 共用的 session、binding 与 return-handle shape 保持单一中立定义，不复制出可能漂移的平行 DTO。

替代方案是在 port 中使用 `ReturnType<Repository[...]>` 或 repository re-export。未采用，因为这仍由 provider 侧签名决定消费契约，只是隐藏了直接 import。

### 4. 以行为零变更为迁移原则，按 app 分片验证

本 change 只改变 TypeScript ownership 与必要的 type import/wiring。测试按 API、Admin API、OIDC Provider 三个切片推进：先记录 focused/full tests、typecheck、lint 和 architecture baseline；新增 guard 得到预期 red；随后每个 app 完成 port 与 type owner 迁移并转绿。每片复用现有 service/use-case/repository tests 验证方法调用、transaction、audit、session、notification 和 profile dirty 行为，最后运行三个 app 的完整矩阵与 docs/OpenSpec guards。

任何需要修改 SQL、Redis operation、runtime DTO construction 或 endpoint contract 的发现都视为范围漂移，停止实施并先更新 child 与 umbrella artifacts。

## Risks / Trade-offs

- [Risk] 手工展开 repository 方法签名时丢失 optional、union、readonly 或 nullability → Mitigation：在 production typecheck 之外增加 provider-to-port compile-time assertions，并按 app 小步迁移。
- [Risk] 将 repository-owned DTO 移到中立 owner 时形成循环 import → Mitigation：type module 只依赖 schema/domain/contracts 等静态类型，不反向 import repository、service 或 composition。
- [Risk] 全局 guard 误报合法的 platform/shared `Pick` → Mitigation：AST 规则只拒绝来源名称精确以 `Repository`/`Service` 结尾，允许显式 `*Port` 和 platform types。
- [Risk] 结构兼容让 provider 多余方法继续可见于 composition → Mitigation：消费模块只以窄 port 类型接收依赖，测试 fixture 与 compile-time assertions 以 consumer contract 为准。
- [Trade-off] 直接声明方法会产生少量签名重复 → 换取消费契约独立演进、架构守卫可执行和 provider 替换能力。

## Migration Plan

1. 记录三个 backend 的 port inventory、architecture/focused/full test、typecheck 与 lint 基线。
2. 为三个 architecture suites 增加全 production-port AST guard，确认当前 repository import、repository-area type 与 `Pick<...Repository/Service>` 产生预期 red。
3. 先迁移 API ports，再迁移 Admin API ports；每片直接声明方法、移动必要类型、增加 compile-time compatibility assertions，并运行该 app 的 focused tests、architecture test、typecheck 与 lint。
4. 迁移 OIDC `claims.port.ts` 并复核 `interaction.port.ts` 的共享 protocol/session type ownership，运行 claims、interaction、provider wiring 和 architecture tests。
5. 更新后端架构/实现文档，运行三个 backend 的 full tests、typecheck、lint、architecture tests、docs guard、OpenSpec strict validation 与 `git diff --check`。
6. 归档后 squash merge 回 `feature/standardize-backend-application-boundaries`，在 feature 分支重跑同一验证矩阵；无数据迁移或分阶段发布步骤。

Rollback 只需回退本 child 的 squash commit。由于 repository runtime、数据库和 Redis 均不迁移，不需要额外数据或运维回滚。

## Open Questions

无阻断性开放问题。实现中若发现某个 provider 方法无法结构兼容 consumer contract，必须用有名字的 composition adapter 显式记录语义映射，不得用 type assertion 绕过。
