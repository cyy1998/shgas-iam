# 架构守卫规范

Architecture Guard 是仓库级的维护性依赖图检查。它保护稳定的 module seam、依赖方向、owner 路径和 Docker build
closure，帮助维护者尽早发现跨 module 的所有权回退。

它不证明仓库中的全部架构事实，也不是 security sandbox。业务语义、transaction 语义、runtime wiring、数据库行为和外部资源
行为应由各自最高的 module interface 或专用验证通道负责，不能为了把这些事实塞进静态扫描而扩大 analyzer。
`pnpm check:architecture` 是唯一的静态架构入口；它在根目录一次加载受保护的 production source，不进入 package
普通测试。

当前 source roots、未覆盖范围及其他验证 owner 见[架构验证归属](architecture-verification.md#静态类型与收集验证)。

## 验证层选择

新增或迁移约束前，先选择能直接观察该事实的验证层：

| 要验证的事实 | 负责的验证层 |
|---|---|
| 类型或结构兼容 | typecheck 或 type contract |
| package public surface | package exports 加 consumer typecheck |
| 业务行为与 transaction 语义 | module interface 的 behavior/contract test |
| runtime wiring 与 readiness | process smoke |
| 数据库或其他外部资源行为 | PostgreSQL、浏览器、Gateway 等对应专用通道 |
| 稳定 import owner 或依赖方向 | Architecture Guard |
| 迁移墓碑 | feature-scoped 临时检查；必须记录 owner、reason 和 removal date，不进入永久规则集合 |

[测试编排架构](testing-architecture.md)负责通道、资源预算与执行顺序；本文只负责 Architecture Guard 的设计、规则准入和
复杂度边界。

## 允许的观察模型

永久规则只能对下列仓库事实建立 predicate：

1. production source 的仓库相对路径；
2. 规范 ECMAScript 静态 `import` 与静态 re-export，包括规范化后的 module specifier、type/value 分类，以及
   import/re-export 分类；
3. production `*.port.ts` 中直接 `Pick<T, ...>` 的未解析基类型文本名；这是 `consumer-owned-port` 为保护既有约定保留的
   唯一例外，不得扩展为通用 type 或 symbol 分析；
4. workspace package manifests 声明的 workspace dependency closure；
5. Dockerfile 字面量 `COPY` 的 source。

静态 side-effect import 属于 value dependency。Module specifier 规范化可以识别仓库现有的 `@api`、`@admin-api`、
`~api/src`、`~admin-api/src` aliases，并归一化仓库惯例中的扩展名。相对 module path 可以仅依据当前 source path
做词法拼接与 `.`/`..`、扩展名归一化；这些操作不读取目标 module，也不做 module resolution 或 type resolution。
规则声明的 canonical workspace package 可以同时保留原 specifier 并按已声明 source root 产生 production-source
候选，使 canonical subpath 与 repository-relative path 进入同一 owner 判断；该映射不读取 package exports。
第三方 package-root pattern 只匹配 package root 本身或其 `/` subpath，不使用普通文本前缀，因此 `hono/*` 属于
`hono` owner，而 `honorable` 不属于。

Architecture Guard 只能对上述事实作判断。规则需要的新事实不在此列表中时，必须停止并重新选择 seam 或验证层。

## Canonical syntax contract

Architecture Guard 只覆盖仓库规范的静态写法。对同一依赖边采用奇异 TypeScript 语法而绕过检查，不自动构成 guard bug；
这类非规范代码首先由编码约定、lint 与 code review 处理。

如果架构事实不能从 module 路径直接看见，应优先：

1. 收缩 package exports；
2. 增加职责单一的公开 subpath；
3. 加深 module interface，让调用方只看见稳定能力；
4. 改用 type、behavior/contract 或 process smoke 等更合适的验证层。

不得以增强扫描器作为默认解决方案。Architecture Guard 永久禁止扩展到：

- import/export symbol 名称或其 provenance；
- namespace、member 或 property access；
- 除允许观察模型明确列出的 `Pick` 基类型名、module specifier 与 Docker `COPY` source 外，identifier、string literal、
  template literal 或 comment 扫描；
- barrel export graph、module resolution 或 type resolution；
- call arguments、factory、callback 或 variable binding；
- control flow 或 data flow；
- 动态或计算 `import`/`require`；
- 非规范 casing、quoted destructuring 或刻意混淆的写法；
- exact factory shape、method allowlist；
- 旧文件、旧 identifier 或其他迁移墓碑。

## 永久规则准入

一条永久规则必须同时满足以下全部条件：

1. 它对应 `Current` 文档中的当前架构事实；
2. 它能完全由“允许的观察模型”表达；
3. 它防止真实的跨 module 所有权或依赖方向回退；
4. typecheck、package exports、behavior/contract test、process smoke 或专用外部资源通道不能更直接地覆盖它；
5. 合法 owner 例外只需按少量路径或 module 表达，不需要枚举 implementation 细节；
6. 通过公开 interface `analyzeRepositoryArchitecture(repoRoot)` 至少提供一个允许和一个违规的 canonical fixture；
7. violation 具有稳定的 rule ID、文件、行号和维护者可理解的诊断。

只要规则需要新增索引事实，或需要允许观察模型之外的 symbol/member/literal/callback/dataflow/provenance、实现方法枚举，
或本质上只是迁移墓碑，准入流程就必须停止；该规则不得加入永久集合。

## 永久规则封闭目录

当前 Architecture Guard 只包含下列永久规则族：

- `client-subject-projection-owner`
- `consumer-owned-port`
- `dependency-direction`
- `role-resolution-owner`
- `user-profile-owner`
- `session-runtime-owner`，包含 Session Kernel 不依赖 API Core、Custom SSO 与 app 的 owner 边界、Custom SSO 包不得依赖 app provider/HTTP/数据库实例、OIDC 不依赖 Custom SSO，以及两协议单向消费 Kernel/Snapshot 的 module dependency owner
- `worker-ownership`
- `docker-build-closure`

新 `packages/oidc` 同属 `session-runtime-owner`：不依赖 Custom SSO、旧 Provider、app、HTTP 或数据库 owner，
Kernel 不反向依赖 OIDC。此规则沿已有静态 import/路径模型保护协议独立性，允许正常 Kernel/Snapshot 注入能力；
新包纳入 source roots、canonical workspace mapping 与 Docker closure。API 的默认 HTTP 负责 transport，见
[候选契约](../features/oidc/authorization-candidate.md)。

`client-subject-projection-owner` 只观察 package 内 production source path 与规范静态依赖。除普通测试外，Projection core 全部受保护，不能反向依赖 client 协议配置、数据库、User Profile
implementation、shared provider DTO、app/Gateway runtime 或协议 transport，也不能依赖 Custom SSO 协议包。Custom
SSO 的 `packages/custom-sso/src/wire.ts` 只能从 package root public Projection Interface 取得 core 类型或能力，不能直接依赖其他 core
subpath、Facts persistence、client 配置、runtime、transport 或本包服务端入口。两个 package 的 canonical subpath 与
repository-relative path 使用同一 production-source owner 判断；全部 app 与 Gateway workspace manifest 中的
canonical package name 均映射到各自 production source owner。Package exports、结构兼容与投影/wire 语义分别由
typecheck 和公开 contract tests 证明。

`docker-build-closure` 检查每个 `apps/*/Dockerfile`。Image owner 在 `dependencies`、`devDependencies` 和
`optionalDependencies` 中以 `workspace:` 声明的依赖，以及 Dockerfile 以字面量 `COPY` 引入的其他 workspace
`package.json`，共同构成 closure roots；规则沿相同的 workspace dependency sections 前进。`peerDependencies`
由消费方满足，不作为声明方拥有的 build edge。通向受保护 architecture workspace 的每个中间 workspace 必须已
`COPY` manifest，受保护 workspace 的 manifest 与 source 则必须都已 `COPY`。该规则不解释 `RUN`、shell、build
argument 或 package-manager 命令语义。

`transaction-bound-invalidation` AST 规则和 authority-key literal 规则不属于该目录。未来规则只有在完全沿用同一观察模型
且满足准入流程时才能单独提出。

## 测试纪律

- Architecture Guard 只通过 `analyzeRepositoryArchitecture(repoRoot)` 测试。
- 每条语义事实至少有一个允许 fixture 和一个违规 fixture。
- 共享静态 dependency extraction/normalization 可以通过该外部 interface 的少量 canonical fixtures 覆盖静态
  import、side-effect import、re-export、type/value 分类和受支持 alias class；这是共享观察模型的契约，不按业务规则
  重复。
- 每条业务规则只有 owner 路径或 module edge 不同时才增加 fixture；不重复建立
  named/default/namespace/star/alias/property 等语法矩阵。
- 不测试内部 visitor、source index、rule helper 或扫描顺序。
- warm command 小于 1 秒是观察性目标，不是自动 gate，也不能通过放宽 timeout 或 retry 维持。
