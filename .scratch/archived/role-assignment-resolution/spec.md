# Centralize Role Assignment Resolution

**Status:** approved

**Created:** 2026-07-18

**Approved:** 2026-07-18

## Problem Statement

IAM 目前在 admin 用户与任职详情、User Profile 构建和 OIDC 授权快照中分别解析角色分配。每条路径都需要理解任职直接分配、岗位分配、组织精确分配、下级组织继承、角色有效性和去重，但这些规则由不同的 SQL 与内存聚合重复实现。User Profile 的 dirty scope 还以反向查询再次表达同一组任职、岗位和组织匹配关系；API 中则保留了一份已经没有生产调用方的旧解析链路。

重复实现已经产生可观察的语义差异：OIDC 对任职、岗位、组织和角色采用严格有效性过滤，User Profile 对组织状态的处理较宽松，admin 又缺少部分软删除和目标状态过滤。admin 用户详情还逐条任职查询角色，形成 N+1。现有测试分散在调用方内部，其中一部分只覆盖内存聚合或旧副本，不能证明所有生产调用方共享同一套 PostgreSQL 行为。

维护者希望把角色分配解析收拢为一个深模块，使正向有效角色解析和反向受影响用户展开共享同一处规则知识，并彻底删除旧副本。修复必须统一授权语义、保留各调用方自己的 DTO/read-model/claim 映射、避免数据库 schema 与外部协议变化，并在不由测试自行启动 Docker 容器的前提下建立真实 PostgreSQL 接口测试。

## Solution

新增独立 workspace package `@iam/role-assignment-resolution`，作为角色分配解析的唯一公开 seam。模块接收组合层提供的 `DbClient`，隐藏 Drizzle 查询、组织闭包匹配、跨来源合并、有效性过滤、去重和排序。

正向解析批量接收任职 ID，并可选限定 client；它按任职返回最终 `Effective Role`，只暴露角色 ID 与编码。`Effective Role` 使用统一严格口径：任职及其岗位、任职组织、实际角色分配目标和角色都必须启用且未删除。用户自身状态仍由调用方判断。

反向解析批量接收角色 ID，返回需要重建 User Profile 的保守用户集合。它只要求匹配任职启用且未删除，不过滤角色、岗位或组织当前状态，从而保证角色刚被停用后仍能找到可能保留旧授权的用户。

各 app 或 package composition root 创建 resolver 并注入调用方。admin、OIDC 和 User Profile 逐步切换到新接口后，旧 API 解析链、各调用方的本地解析函数及被替代测试全部删除，不保留 wrapper、re-export、production 双读或结果比对。

## User Stories

1. 作为 IAM 管理员，我希望用户详情中的角色遵循唯一规则，以便 admin 视角与实际授权一致。
2. 作为 IAM 管理员，我希望任职详情中的角色与同一用户详情中的角色一致，以便不同管理页面不会给出相互矛盾的结果。
3. 作为 OIDC client，我希望授权快照只包含当前 client 的有效角色，以便其他 client 的授权不会泄漏到本 client。
4. 作为 OIDC client，我希望组织、岗位或任职失效后相关角色不再进入新授权快照，以便失效业务事实立即反映在新 token 中。
5. 作为 User Profile 消费方，我希望档案中的角色与 admin 和 OIDC 使用相同的分配规则，以便搜索、授权和展示基于一致事实。
6. 作为 User Profile 消费方，我希望档案中的角色按稳定顺序产生，以便相同事实不会因查询返回顺序产生无意义差异。
7. 作为安全管理员，我希望角色直接分配给任职时只对该有效任职生效，以便授权范围不会扩散到同一用户的其他任职。
8. 作为安全管理员，我希望岗位角色只对使用该有效岗位的有效任职生效，以便岗位授权范围准确。
9. 作为安全管理员，我希望组织精确分配在目标组织本身生效，以便不需要依赖下级继承开关表达本组织授权。
10. 作为安全管理员，我希望组织分配只有在允许下级继承时才对子组织任职生效，以便组织授权范围可控。
11. 作为安全管理员，我希望同一角色通过任职、岗位和组织多次命中时只出现一次，以便权限聚合不会重复。
12. 作为安全管理员，我希望被停用或软删除的角色不再成为 Effective Role，以便无效角色不会继续授权。
13. 作为安全管理员，我希望被停用或软删除的岗位不再产生 Effective Role，以便失效岗位不会继续授权。
14. 作为安全管理员，我希望被停用或软删除的任职组织不再产生 Effective Role，以便失效组织不会继续授权。
15. 作为安全管理员，我希望失效的角色分配目标不再产生 Effective Role，以便分配记录不能绕过目标生命周期。
16. 作为调用方维护者，我希望用户状态由所属流程单独判断，以便角色解析模块不替代登录、管理查询或档案保留策略。
17. 作为 OIDC 维护者，我希望 resolver 原生支持 client 范围，以便 OIDC repository 不再理解角色 client 归属过滤。
18. 作为 admin 维护者，我希望一次批量解析多个任职，以便用户详情不再按任职产生 N+1 查询。
19. 作为 worker 维护者，我希望一个批次的全部任职通过固定数量查询解析，以便档案重建成本不会随任职数线性增加数据库往返。
20. 作为 User Profile 维护者，我希望角色变更后能够展开全部可能受影响用户，以便档案不会残留旧授权。
21. 作为 User Profile 维护者，我希望角色停用后反向解析仍能找到此前命中的用户，以便状态更新顺序不会造成漏重建。
22. 作为 User Profile 维护者，我愿意接受保守集合带来的少量额外重建，以便换取不漏掉陈旧授权的安全保证。
23. 作为 User Profile 维护者，我希望反向结果去重并稳定排序，以便相同用户通过多个任职或分配来源命中时只安排一次重建。
24. 作为后端维护者，我希望角色分配规则集中在独立 package，以便修改一次即可覆盖 admin、OIDC 和 User Profile。
25. 作为后端维护者，我希望该规则不放入数据库基础设施包，以便 `@iam/db` 不拥有授权业务语义。
26. 作为领域模型维护者，我希望纯领域包不依赖数据库，以便 `@iam/domain` 保持无 I/O。
27. 作为 OIDC 和 admin 维护者，我希望无需依赖 User Profile read model 才能解析角色，以便投影模块不成为核心授权依赖。
28. 作为模块调用方，我希望接口只返回共同需要的最终角色结果，以便不用理解 assignment 来源或组织闭包。
29. 作为模块调用方，我希望请求中的每个任职都有结果，即使结果为空，以便缺失任职和无角色都能安全处理。
30. 作为测试维护者，我希望通过新模块公开接口覆盖规则矩阵，以便测试在内部 SQL 重构后仍然有效。
31. 作为测试维护者，我希望 PostgreSQL 测试使用独立测试库和隔离 schema，以便不会污染开发数据。
32. 作为开发者，我希望默认测试不自行启动 Docker 容器，以便当前测试工作流不引入容器生命周期依赖。
33. 作为开发者，我希望需要数据库验证时有明确的 `test:postgres` 命令，以便真实 PostgreSQL 行为能够在交付前重复验证。
34. 作为开发者，我希望未配置专用测试库时数据库测试明确失败，以便测试不会静默跳过或误连开发库。
35. 作为代码维护者，我希望旧 API 解析链和所有生产规则副本在迁移后被删除，以便未来搜索只发现一个事实来源。
36. 作为代码维护者，我希望不保留 compatibility wrapper 或旧函数 re-export，以便新模块通过删除测试真正证明自身深度。
37. 作为调用方维护者，我希望原有 DTO、read-model 和 OIDC claim 形状不变，以便本次架构修复不扩散到外部协议。
38. 作为数据库维护者，我希望本次不改变角色分配表或迁移数据，以便规则收拢与 schema 演进保持独立。
39. 作为发布维护者，我希望所有运行时继续从同一 `role_assignment` 事实读取，以便现有统一发布与回滚边界保持有效。
40. 作为未来维护者，我希望 Effective Role 术语和跨 package 决策留在领域文档与 ADR 中，以便不会重新引入语义不同的副本。

## Implementation Decisions

- 新模块是独立 workspace package `@iam/role-assignment-resolution`，拥有角色分配解析的公开接口和 PostgreSQL 实现。
- 模块接收 `DbClient`，不静态绑定 app-local 数据库 singleton。Drizzle、表结构、组织闭包和查询组合全部隐藏在模块内部。
- 模块同时拥有正向的 Effective Role 解析和反向的受影响用户解析；两者共享角色分配目标与组织继承知识，但有意采用不同有效性口径。
- 正向操作批量接收任职 ID，并接受可选 client ID。未提供 client 时返回全部 client 的有效角色；提供 client 时只返回归属该 client 的有效角色。
- 正向结果以任职 ID 分组，每个请求的任职 ID 都存在一个结果。角色只包含 ID 与角色编码，不暴露 assignment 来源、target、组织路径或状态字段。
- 正向结果跨任职直接分配、岗位分配、组织精确分配和组织下级继承合并，按角色 ID 去重，并按角色编码稳定排序。
- 组织精确分配对目标组织本身生效；只有组织分配明确允许下级继承时，才通过组织闭包对深度大于零的后代生效。
- Effective Role 要求任职启用且未删除、任职岗位启用且未删除、任职组织启用且未删除、分配目标启用且未删除、角色启用且未删除。用户状态不属于 resolver 的过滤条件。
- 对任职直接分配，分配目标是该任职；对岗位分配，分配目标是对应岗位；对组织分配，分配目标是被授予角色的精确或祖先组织。
- 反向操作批量接收角色 ID，只返回去重并按用户 ID 升序排列的用户 ID，不暴露命中的任职、assignment 来源或影响原因。
- 反向解析是保守 dirty-scope 展开，不是 Effective Role 的严格逆运算。它只要求匹配任职启用且未删除，不过滤角色、岗位或组织当前状态。
- 两个操作均对重复输入去重，并对空输入直接返回空结果而不访问数据库。
- 每个批量操作使用固定数量的 set-based 查询；数据库往返次数不得随输入 ID 数量增长。具体 SQL 条数和合并位置是可重构实现细节。
- resolver 只在 app composition root 或 package composition root 创建。叶子 repository 和 service 通过注入消费，不自行构造 resolver 或绑定 production database singleton。
- admin 用户详情必须一次解析该用户的全部任职，消除逐任职角色查询；单任职详情可以使用同一批量接口传入一个 ID。
- OIDC 继续负责读取授权快照所需的任职、组织路径、权限和 claim 映射，但角色 assignment 匹配、有效性和 client 过滤移交 resolver。
- User Profile 构建继续负责档案数据集与权限映射，但角色行由 resolver 提供；dirty scope repository 将 Role/Privilege 展开所需的角色反向解析移交 resolver。
- Privilege 聚合、角色管理 CRUD、assignment 写入与 dirty marker 编排不进入新模块。
- 迁移采用 replace-don't-layer。所有调用方切换后删除旧 API 解析链、admin/OIDC/User Profile 的本地规则实现及被新接口测试替代的测试。
- 不保留旧函数 re-export、compatibility wrapper、production 双读、shadow comparison 或结果比对日志。
- 调用方特有的 DTO、read-model、claim 与 privilege 映射继续留在调用方，并保留其可观察行为测试。
- 本次不修改数据库 schema、migration、角色管理 HTTP/tRPC contract、OIDC claim contract 或 User Profile schema。
- Effective Role 领域定义由根领域词汇表维护；独立 package seam、非对称正反向语义和测试约束由已接受 ADR 维护。

## Testing Decisions

- 好的测试穿过 `@iam/role-assignment-resolution` 的公开接口，只断言 Effective Role 或受影响用户结果，不断言私有 helper、SQL 文本、查询条数的精确值或中间 assignment 集合。
- 新模块公开接口是角色分配规则的最高测试 seam，也是规则矩阵的唯一权威行为测试面。调用方不得复制同一规则矩阵。
- PostgreSQL 接口测试使用显式 `test:postgres` 命令，并要求 `IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL` 指向专用测试数据库。
- 测试运行在随机隔离 schema 中，应用当前数据库 migrations，结束后清理。未提供 URL 或无法安全建立隔离环境时测试明确失败，不回退到开发数据库。
- 测试暂不自行启动 Docker 或其他数据库容器，也暂不纳入根目录默认 `pnpm test`。查询迁移完成前必须人工运行并记录 `test:postgres` 通过证据。
- 正向矩阵覆盖任职直接、岗位、组织精确、组织下级继承和禁止下级继承五类路径。
- 正向矩阵覆盖同一角色跨多个来源命中时的去重、多个角色的稳定排序、重复任职输入、空输入、未知任职和无角色任职。
- 正向矩阵分别覆盖任职、岗位、任职组织、分配目标和角色的启用、停用、软删除状态，证明严格 Effective Role 口径。
- 正向矩阵覆盖不传 client 时返回全部有效角色、传入 client 时只返回所属角色，以及其他 client 角色不会泄漏。
- 反向矩阵覆盖任职直接、岗位、组织精确和组织下级范围，并覆盖同一用户通过多个任职或来源命中时的去重与稳定排序。
- 反向矩阵必须证明角色已经停用或软删除、岗位或组织已经停用时仍能返回匹配的活跃任职用户，同时证明停用或软删除任职不进入影响集。
- 测试验证空输入不访问数据库；固定数量 set-based 查询通过避免 per-ID 协作者调用或聚焦查询观测验证，不把某个精确 SQL 条数固化为永久接口。
- admin 调用方测试保留 DTO 与 privilege 映射断言，并新增批量 resolver 协作断言，证明用户详情不再逐任职调用。
- OIDC 调用方测试保留 claim、权限与稳定排序断言，并验证当前 client 被传给 resolver；原 assignment 聚合单元测试由 package 接口测试替代。
- User Profile 调用方测试保留档案构建、权限和 dirty workflow 断言，并验证 build/scope repository 使用注入的 resolver；本地 SQL 规则测试被删除。
- composition 与 port contract 测试证明 resolver 在 composition root 物化、叶子模块不静态绑定 concrete production instance，并防止旧解析 repository 回归。
- 受影响 package 的 lint、typecheck、默认测试和显式 PostgreSQL 测试构成 ticket 级验证；全部 tickets 完成后执行仓库规定的全仓验证、文档检查、diff check 和 Standards / Spec 双轴评审。

## Out of Scope

- 修改 `role_assignment`、role、employment、position、organization 或 closure 的数据库 schema、索引、约束和 migration。
- 迁移、backfill、修复或清理现有角色分配数据。
- 改变角色、角色分配、任职、岗位或组织的管理端 CRUD 行为。
- 把 privilege 聚合或 role-privilege 关系移动到新模块。
- 让 resolver 判断用户账号状态、登录资格、session 有效性或 OIDC token 生命周期。
- 改变 admin REST、tRPC、OpenAPI、前端页面或 service wrapper contract。
- 改变 OIDC `iam:authorization` claim 的外部结构、scope 或快照生命周期。
- 改变 User Profile schema、dirty queue contract、worker job contract 或持久化格式。
- 为 PostgreSQL 测试引入 Testcontainers、Docker Compose 生命周期或任何由测试自行管理的容器。
- 在当前阶段把显式 PostgreSQL 测试接入根目录默认测试或 CI；未来可通过单独决策提升为强制门禁。
- 保留 production shadow read、遥测比对或渐进式双实现 rollout。
- 处理架构评审报告中的其他深模块候选。
- 对角色分配解析之外的 repository、service 或 package 做一般性重构。
- 改变组织闭包模型、组织状态传播策略或中间祖先状态的既有业务含义。

## Further Notes

- 根领域词汇表已经定义 `Effective Role`；实现和测试应使用该术语，不再使用含义模糊的 “parsed role” 或 “assigned role” 指代最终结果。
- ADR-0002 已接受独立 package seam、严格正向语义、保守反向语义、client 过滤、接口最小化、composition ownership、测试策略和 replace-don't-layer 迁移。
- 现有 `role_assignment` 统一发布手册仍是数据库迁移和运行时一致性 smoke 的事实来源；本功能只深化其解析模块，不重做历史表迁移。
- 专用测试数据库 URL 是显式授权边界。测试 harness 必须拒绝不安全或无法隔离的目标，并保证清理只作用于本次创建的 schema。
- PostgreSQL 测试暂不属于默认测试，不表示可以省略。每个迁移角色解析 SQL 的 ticket 都必须在 Resolution 中记录相关 `test:postgres` 证据。
- Ticket 发布后本规格转为 approved，并成为实现基线。任何改变有效性口径、反向保守范围、package seam、公开接口或测试数据库策略的发现，都必须先回到设计确认并追加 amendment。
