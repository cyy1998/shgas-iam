# 架构守卫规范

Architecture Guard 检查稳定的依赖方向、模块归属和 Docker 构建依赖。它是维护工具，不是安全沙箱。
修改规则前先按[验证选择](testing.md#验证选择)判断静态检查是否合适。

唯一入口是 `pnpm check:architecture`，扫描范围、规则 ID 与路径例外由
[analyzer](../../scripts/architecture-guard.ts)维护，package 普通测试不扫描其他 workspace 源码。
依赖目标被识别不代表其内部被扫描，现有守卫也不覆盖全部通用共享包、前端、DTO 或运行时规则。

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

## 测试纪律

- Architecture Guard 只通过 `analyzeRepositoryArchitecture(repoRoot)` 测试。
- 每条语义事实至少有一个允许 fixture 和一个违规 fixture。
- 共享静态 dependency extraction/normalization 可以通过该外部 interface 的少量 canonical fixtures 覆盖静态
  import、side-effect import、re-export、type/value 分类和受支持 alias class；这是共享观察模型的契约，不按业务规则
  重复。
- 每条业务规则只有 owner 路径或 module edge 不同时才增加 fixture；不重复建立
  named/default/namespace/star/alias/property 等语法矩阵。
- 不测试内部 visitor、source index、rule helper 或扫描顺序。
- 性能目标作为观测，不新增自动 gate，也不通过放宽 timeout 或重试维持。

## 特殊边界

协议与投影的单向依赖约束见[后端架构](../architecture/backend-architecture.md#认证会话与访问控制)，守卫按路径和静态边检查它们。

Docker closure 以 image owner 的 workspace dependencies、devDependencies、optionalDependencies 和 Dockerfile
字面量 COPY 的 workspace manifest 为根，沿相同依赖段展开。peerDependencies 由消费者满足。
通向受保护包的中间包须复制 manifest，受保护包须复制 manifest 和源码；不解释 RUN、shell、build argument 或包管理器语义。

规则清单不在文档重复；新增规则仍必须满足准入条件，不得借修改既有规则扩张观察模型。
