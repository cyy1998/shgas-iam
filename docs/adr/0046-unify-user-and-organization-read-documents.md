---
status: accepted
---

# 统一用户与组织的文档模型和搜索契约

原用户搜索按 Search Document 匹配，却从类型化列返回摘要，详情与 Facts 又有独立持久副本；组织搜索直接返回完整文档。
本决定统一为单份规范业务 Document，并同时解决可靠更新与 Client 角色隔离，减少平行事实的维护成本。

本决定记录当前统一模型与取舍；代码验收与目标环境发布分别判断。
原统一模型的实施要求与验收状态由 [Spec #283](https://github.com/cyy1998/shgas-iam/issues/283) 跟踪；
下述文档根结构与过滤语法修订是后续已接受的调整，不代表 #283 已包含该目标。

## 已确认的方向

- 用户与组织文档的统一名称为 User Document、Organization Document，搜索与详情共用这些名称，
  不再各自引入 Profile Search Document 或 Organization Search Document 作为另一种文档概念。
  内部存储 schema 与公开 schema 仍明确区分，命名统一不意味着把内部事实全部交付调用方。
- 用户搜索改为返回完整匹配文档，不再固定返回五字段 User Profile Base。接受响应体积增加及调用方适配成本。
- 收敛范围覆盖整个 User Profile 的底层存储，不限于另建纯搜索文档；目标是以一个 `document` 字段承载业务事实，
  每项业务事实只保存一次，详情、搜索和 Subject Facts 按需派生，不持久化三个平行副本。
  主键、版本、发布时间等技术元数据继续独立成列；索引由当前查询需要决定，不构成应用维护的第二份事实。
- 内部完整事实文档与公开搜索文档分离。公开搜索文档从同一版本的内部事实派生，不另存一份副本；
  内部新增字段不自动获得公开搜索或返回资格。
- Internal 用户与组织详情纳入契约修改范围，去除数据库主键等内部字段；精确详情与搜索单项使用相同公开文档，
  用户在同一发布版本及同一披露上下文下得到相同内容。Admin 保留实时管理专属模型、历史资料及操作引用。
- 两类 Internal 详情只读取已发布目录，接受与搜索相同的更新延迟，包含未删除的 Enable、Pause、Disable 对象。
  没有可读的当前条目返回 404，损坏文档或查询失败返回 503，不回源拼装另一份详情；404 只表示当前目录不可见，
  不保证源对象不存在。源账号查询、登录和账号恢复不受这一目录查询语义替代。
- 搜索、详情和 SSO 统一业务字段语义及共用结构，SSO 保留按 Client 披露字段和仅交付该 Client 角色的规则，
  OIDC 保留标准字段映射。登录和 SSO 的现有业务能力继续保留，内部读取和派生方式可以调整。
- Internal 角色筛选、搜索返回和详情只能观察当前已认证 Client 的角色，所有组合与否定条件均在这个可见集合上解释。
  Client 身份由认证固定，角色归属使用明确保存的关系，不依赖 code 前缀或调用方提供的 Client 参数。
  有效 Internal Client 可以查询自己的角色，不新增 Internal 披露开关，也不要求启用 SSO 或配置 SSO 授权声明。
- 用户文档的主体基本信息按下述根结构修订提升到根节点，与 `employments` 并列；角色放在每条有效任职的 `roles` 中。
  没有本 Client 角色的任职仍保留，其 `roles` 为 `[]`。Internal 不重复返回另一组 `authorization.employments`；
  SSO 按协议需要生成授权结构和用户级角色并集。
- 用户任职、组织责任、独立组织文档和 SSO 共用组织基础结构 `code/name/type/path`，路径节点统一包含
  `code/name/type/level/distanceToTarget`。完整路径从根到目标且包含自身，根 level 为 1、自身 distanceToTarget 为 0；
  层级与距离可从路径位置派生，无需保存平行数组。独立组织根额外包含 status、isVirtual、isEntity 等自身属性，
  不自动向每个组织引用扩张这些属性；OIDC 保留协议字段映射。
- PostgreSQL 只保存规范业务文档，保留供 SSO 使用的派生 Redis Facts 缓存，其内容只能由同版本 document 和技术元数据生成，
  不拥有独立业务事实或写入口。缓存可丢弃、重建并执行版本校验；搜索和详情直接查询 PostgreSQL，不新增文档缓存。
- 用户与组织仅在已删除时发布 `document = null` 的墓碑，保留必要身份、schema、源版本、发布时间与处理记录。
  未删除的 Pause、Disable 对象仍发布完整目录文档。删除后停止重造完整 Facts，Redis 使用带版本的墓碑防止旧任务回填；
  不能用直接删除缓存替代版本协调。全部对象仍参与完整核验，缺行不等于墓碑，deleted 用户的访问屏障必须保持禁用。
  重新启用未删除账号仍须通过完整 Facts 发布门禁，这些变化不清除有效会话或凭据。
- 用户与组织共用源变化登记、任务领取、关联展开、版本仲裁和失败恢复的核心实现，各自提供构建与关联规则，
  分别拥有文档、版本和处理进度。一类构建失败不阻断另一类，不要求跨对象或跨类型原子发布；
  用户仍承担 Facts 缓存和 Subject Access 恢复责任。
- 可靠更新覆盖全部需要展开关联用户的源变化，包括组织、岗位、角色、角色分配和组织责任，逐项审计登记、
  展开与恢复责任，不限于 #239 已证实的组织变更路径；未经验证的并发交错不预先宣称为已复现缺陷。
- 采用维护窗口内的单代硬切换：停止并排空受影响读写与旧 Worker，迁移结构、全量重建并完整核验，
  再由新调用方与新服务共同恢复，不增加旧详情或旧响应兼容层。全量重建同时修复已有 processed 但内容陈旧的档案。
  保留有效会话和凭据，不清会话或推进 session/protocol 代际；Custom SSO 输出协调升级为 wire 4，Catalog 3 与 OIDC 标准映射保持；回退依赖匹配旧制品与备份。

## 文档根结构与过滤语法修订（2026-10-27 已接受）

原候选实现的 User Document 使用 `{ user: { ... }, employments }`，Organization Document 使用
`{ organization: { ... } }`。两类文档的结果根已经明确主体，继续包裹自身基本信息增加了返回结构和查询路径的层级。
本次决定将 `user`、`organization` 内的全部自身字段提升到各自 Document 根节点，用户的 `employments` 仍与基本信息并列。

内部持久化文档、公开 schema、Internal 搜索与详情，以及由公开结构派生的 Filter DSL 路径整体调整；
例如 `user.username` 改为 `username`，独立组织文档的 `organization.path` 改为 `path`。
任职内的 `organization` 和责任内的 `targetOrganization` 表达关联对象，保留其结构；Custom SSO 的 `profile`
与 OIDC 标准映射仍由协议拥有，本次只适配 Document 到 Subject Facts 的派生输入。

同时整体移除 `withinSubtreeOf`，覆盖独立组织文档、任职所属组织和责任目标组织。子树条件统一使用
`exists` 进入相应组织的完整 `path`，再以 `code eq` 匹配目标组织；扁平化后的独立组织使用 `path`，
任职元素内使用 `organization.path`，责任元素内使用 `targetOrganization.path`。完整路径包含自身，
因此替代后仍匹配目标组织自身及后代。组合条件保留原任职、责任和 `not` 的作用范围。

该操作符没有独有的匹配语义，移除后减少 DSL 的组织专用规则，不新增根对象专用语法或兼容别名。
旧操作符按非法查询返回 422。沿用现有查询预算，每处替换增加一个 AST 节点并使该分支深度增加一层；
接受部分接近预算上限的旧查询改写后须进一步简化，不因移除语法糖扩大查询预算，也不将此调整视为性能提升。

带根包装的上一版候选尚未实际部署，本次直接修正未发布契约，两类 Document 与派生 Facts 的 schema 版本保持 1，
不新增版本、数据库迁移或旧候选到新候选的升级流程。响应、过滤路径、操作符和持久化布局整体调整，
不保留旧包装、旧路径别名、双读或逐对象回退；调用方按最终契约接入。
首次部署仍沿用本决定原有的完整构建与核验要求，保留有效会话与凭据。
这避免仅在响应上去层、内部长期保留另一种根结构的维护成本，也避免为未发布的中间形状维护版本切换。

## 已知约束与取舍

User Document 除搜索与目录详情外，还为 Subject Facts 和 Subject Access 恢复提供已发布事实。
单一持久化文档必须承接这些消费方所需事实；公开搜索响应只包含有意公开的结构，不等于完整内部文档。
接口适配和披露边界仍须显式定义，不能仅把现有三个文档嵌套到新字段就视为已消除重复事实。
旧公开 Search Document 丢弃角色所属 Client，因此不能作为 Facts 的唯一输入；内部 Document 显式保存 Client 归属。
旧详情退出后，剩余登录、审计和账号恢复所需的内部用户 ID 可来自行级元数据或已有源账号解析器；
没有发现继续保存任职内部 ID、期间、描述、排序和审计字段的剩余业务消费需求。
文档可围绕公开用户资料、有效任职、组织责任和角色 Client 归属收敛，旧查询方法和核验器须随模型调整，
不能将它们的旧实现当作保留重复详情的理由。登录与恢复仍保留各自的源账号检查和失败语义。

[#239](https://github.com/cyy1998/shgas-iam/issues/239) 已记录组织变更与新增任职并发时遗漏用户 dirty 的复现。
缺口发生在源事务内过早展开受影响用户，不是文档列数造成的；统一存储本身不能修复该问题。
两类 Document 使用共享 Outbox 核心，在提交后展开并原子登记目标重建要求与消息完成凭据。
用户发布还承担 Subject Facts 缓存和 Subject Access 恢复责任，不能直接以组织搜索发布器替换。

全关联审计还确认：角色分配会物理删除，持久变化必须保留删除前的关联目标；任职或责任结束必须保留已知用户，
不能期待提交后从当前有效关联中重新找到。生产端登记还须核对实际修改对象与各 mutation 的覆盖，
不能只搬运已有失效调用。相关入口见[失效模块](../../packages/user-document/src/invalidation/user-document-invalidation.ts)
与[角色管理](../../apps/admin-api/src/services/role/role.service.ts)。除 #239 外的并发窗口仍需运行验证。

本决定修订 [ADR-0015](0015-adopt-schema-driven-user-profile-filter-dsl.md) 的固定摘要与跨副本一致性取舍，
以及全部 Internal Client 共用角色搜索事实的既有边界；同时修订
[ADR-0043](0043-retire-public-and-legacy-internal-directory-search.md) 保留的详情契约与用户响应边界。
涉及 Subject Facts 存储和读取方式时，需保持 [ADR-0032](0032-consume-published-subject-facts-for-authorization.md)
的协议中性投影、已发布事实和 Client 披露约束；内部持久化来源和删除后的缓存表示按本决定调整。
组织精确详情读取改为已发布文档，修订 [ADR-0042](0042-search-organizations-with-published-documents.md) 中保留旧详情的边界，
继续保留按对象异步发布和独立恢复的取舍。

## 落实本决定的约束

内部文档围绕当前公开用户资料、有效任职、组织与责任事实及明确的角色 Client 归属构建，
不因为旧 DTO 曾包含某字段就继续保存。内部身份及发布版本属于技术元数据，不进入公开结构；
公开 schema 与内部存储 schema 明确分离，公开结构驱动合法过滤路径，存储映射负责 Client 隔离和必要派生。
不得将内部 Client 归属路径暴露为调用方可选择的过滤字段，也不得先按全局角色筛选再裁剪响应。

同一文档的内容使用一致源快照和固定构建观察时点；公开投影与 Facts 消费该已发布结果，
不在读取时重新按墙上时间解释任职或回源拼装关联。类型化查询列与索引按真实查询需求设计，
不重新引入由应用分别维护的基础资料或搜索副本。

源变化与持久处理义务同事务提交，提交后在一致观察下展开依赖；保留已知直接用户和删除前的关联目标，
采用保守覆盖避免遗漏旧范围。展开产生的重建要求 与消费完成凭据原子提交，重复投递复用已登记工作，
任务重领更换处理所有权，旧 owner 不能完成或覆盖新工作。发布文档或墓碑与 processed 原子提交；
PostgreSQL 提交后才发布 Redis，并保留可恢复的缓存与访问屏障后续责任。

源事件和重建两阶段都须能恢复失败、丢失唤醒与过期处理，队列仅负责唤醒。User Document 与 Organization Document 的周期 repair
按下述修订由 Worker 承担。不将查询请求变为修复入口；责任类型 Catalog 仍由代码发布管理，不为统一失效新增运行时管理接口。

搜索的操作符按上述修订收敛，继续保持同元素作用域、精确值语义、稳定排序、500 项上限、结构预算和超时保护；
非法或超预算查询整体返回 422，无匹配返回空数组，损坏或查询失败整体返回 503，不截断或返回部分结果。
详情语义不替代登录、账号恢复和脱敏手机号接口各自的源账号判断与失败处理。

实施验收须证明真实 PostgreSQL 下关联变更的并发交错、两阶段恢复与版本仲裁，以及 Client 隔离同时作用于过滤和响应。
Redis 验收覆盖墓碑、旧任务迟到、缓存回填与重新启用门禁；正式入口还须覆盖详情与搜索一致、SSO 披露和协议映射。
切换验收完整检查所有文档或墓碑、持久工作、Facts 缓存和访问屏障，不能因删除对象不再有完整 Facts 而跳过它们。
完整验收状态由 Spec 与固定候选证据记录；目标环境停流、备份和恢复另按发布流程执行。

## Document 周期恢复修订（2026-11-02 已接受）

User Document 与 Organization Document 的自动恢复分别由启用对应 consumer 的 Worker 持有专用周期任务，
各自通过环境变量控制开关、轮次间隔、限额和截止时间。这取代两类文档原先仅依赖部署侧调度的决定，
减少漏配外部任务导致持久 Outbox 长期不被重新唤醒的风险。两类调度共用实现并独立运行，手动 repair 仍可独立执行。

每轮通过 Worker 自有的 repair 执行入口，复用与人工维护入口相同的完整恢复能力，使用独立子进程和连接；
上一轮结束且资源清理确认后才安排下一轮。人工命令与共享执行能力的归属按
[ADR-0047](0047-separate-operations-cli-from-worker.md) 调整，当前实现仍沿[Worker 运行与维护](../architecture/backend-architecture.md#worker-运行与维护)核对。
代价是每轮创建进程和连接，收益是正常消费与补偿恢复的取消边界清晰，超时和停机可以停止本轮，不关闭消费者的共享资源。
清理失败时停止后续自动轮次并记录错误，避免在旧执行者状态不明时叠加新轮次。
多实例允许重复唤醒，持久工作仍由现有领取、版本和 token 仲裁，不为该周期任务新增全局锁或通用调度平台。
该决定不扩大每个发布版本的后处理自动尝试预算，超限仍由人工显式重试。

## 命名收敛

统一使用 User Document 与 Organization Document 作为文档概念和模块命名基础；User Search 与 Organization Search
是它们提供的查询能力。User Profile 继续表示领域中的用户档案，不再作为用户文档实现的命名前缀。
文档表名为 `user_document`、`organization_document`。源变化处理记录与每文档重建状态的命名按实际职责收敛，
不继续沿用含义不充分的 `_change`、`_dirty`。采用下面的完整命名组合：

| 职责                                 | 用户                          | 组织                                  |
| ------------------------------------ | ----------------------------- | ------------------------------------- |
| 已发布文档或删除墓碑                 | `user_document`               | `organization_document`               |
| 随源事务登记的待处理文档更新消息     | `user_document_outbox`        | `organization_document_outbox`        |
| 每个目标文档最新的重建要求与处理状态 | `user_document_rebuild_state` | `organization_document_rebuild_state` |

Outbox 表示随源业务事务持久登记、由后台可靠处理的文档更新消息；消息包含变化来源及必要的原关联信息，
后台负责展开受影响对象并登记重建要求。它不表示立刻隐藏已有合法文档，完成条件是目标重建要求及消费完成凭据
已经原子提交，不以队列投递成功或全部目标发布完成为准。Rebuild State 按目标文档保存最新要求和处理状态，
不是一条队列 job 对应一行；完成后仍保留状态，用于和已发布版本比较。用户的 Outbox 表是本次新增阶段，不能误记为已有表改名。

模块包名同步采用 `@iam/user-document`、`@iam/organization-document`。TypeScript 表符号对应
`userDocuments` / `organizationDocuments`、`userDocumentOutboxEntries` / `organizationDocumentOutboxEntries`、
`userDocumentRebuildStates` / `organizationDocumentRebuildStates`；类型、schema、repository、Worker、维护命令与可观测事件
统一沿用同一职责词汇。队列 job 单独表达展开失效与重建文档，不把状态表称为 job。
内部存储类型与公开类型通过明确限定或模块边界区分，不另造一份业务文档；这种区分不构成第二份持久化事实。

选择 Outbox 强调事务性登记和可靠处理，Invalidation 仍可描述使文档需要重建的动作，不作为该消息表的实体名称。
表名不限定必须使用外部消息总线，具体消费义务由上述完成条件定义。Rebuild State 保留独立名称，不能将其混称为 Outbox、
队列 job 或 Checkpoint；它保存的是每个文档的当前重建要求，没有连续日志消费位置。
既有两类 `search-dsl` 路径及精确详情路径本来已经对称，保留路径并通过硬切换更新响应契约。
具体共享核心的文件布局、索引和 SQL 选择由实施设计落实，不能改变上述语义与所有权约束。

当前实现入口见[后端架构](../architecture/backend-architecture.md#user-document-subject-facts-publication)
与[组织搜索发布](../architecture/backend-architecture.md#organization-search-发布与核验)。
