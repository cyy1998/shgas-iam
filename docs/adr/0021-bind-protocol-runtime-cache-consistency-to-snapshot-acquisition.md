---
status: accepted
---

# 将协议 Runtime 缓存一致性绑定到 Snapshot 获取

OIDC 与 Custom SSO 的 Runtime 配置缓存以成功取得 Runtime Snapshot 的时刻作为一致性边界：读取方捕获 Redis control 的 `{ epoch, generation }`，从缓存或 PostgreSQL 取得配置，并只在 control 未变化时返回或发布该 Snapshot；control 已变化时必须丢弃结果并重试或失败关闭。请求一旦成功取得 Snapshot，即使后续 Admin mutation 完成，也可以继续使用该 Snapshot，不在 Code、Token、Credential 等后续副作用前再次校验 generation，也不为配置切换排空在途请求；本保证防止晚到旧读取重新污染缓存，但不提供 Admin 配置切换的线性化语义。

PostgreSQL 继续只拥有 Client 配置事实，不持久化 cache revision。每个 Client 只有一个由 OIDC、Custom SSO 与 Client Traffic Gate 共享的 Redis control；三个 Runtime payload 保持分离，任一相关 Admin mutation 都原子推进该 control 并使三份旧 payload 不可用，接受无关 Runtime 随后额外回源，以换取单一失效与 repair 路径。control 使用 `epoch` 区分重建代际并避免 ABA，使用 `generation` 排序同一代际内的失效；缓存发布必须对捕获的 control 执行 CAS，Pub/Sub 只承担通知。协议配置版本仍只表达各协议 artifact 生命周期，不兼任缓存新鲜度。Client Traffic Gate 采用相同的一致性边界并移除既有强 mutation fencing；其运行时传播失败语义由 ADR-0022 记录，首次发布采用下文定义的停流整代硬切换。

数据库事务 callback 已完成但 COMMIT 结果无法确认时，仍存活的 Admin 进程必须保留原始数据库错误，并立即尝试一次保守的 client-wide invalidation，不运行或模拟正常 after-commit workflow。该操作无论事务最终 commit 或 rollback 都安全：后续 Snapshot 都从 PostgreSQL 当前事实重载；若 Redis 操作也失败，则记录为需要显式 repair，不增加事务 outbox、PostgreSQL cache revision 或后台自动恢复。

Redis backup restore 可能同时恢复彼此匹配但已经过时的 control 与 payload，Redis-only 模型无法自行识别该回退。任何 Redis backup restore 都必须在协议流量保持关闭时运行 Worker 全量 Runtime repair，轮换或清空全部 Client Runtime control 与 payload，并在验证完成后才重新放流；系统不增加 Redis 外部 restore incarnation，也不允许依赖 TTL 或逐 Client 访问自然收敛。

请求发现共享 control 缺失或损坏时，必须先原子 bootstrap：使用调用方生成的随机新 `epoch` 写入 `{ epoch, generation: 0 }`，同时删除该 Client 的三份 Runtime payload；并发 bootstrap 只有一个获胜，其他调用方重新读取获胜 control。control 不设置 TTL，bootstrap、Redis 访问或后续 PostgreSQL 回源任一步失败都失败关闭；不得把缺失 control 解释为固定 generation，也不得接受残留 payload。完整旧备份中的 control 仍然格式有效，不能由该机制识别，继续遵守受控 restore repair。

共享协调实现必须成为 `@iam/api-core` 中的 deep Module：外部 Interface 只暴露 Runtime Snapshot acquisition、per-Client invalidation 与受控全量 restore repair，隐藏 Redis key inventory、编码、control bootstrap、epoch/generation、Lua、publish CAS、返回值解析和 process-local single-flight。OIDC、Custom SSO 与 Client Traffic Gate 的 Adapter 只提供各自的 PostgreSQL loader、payload codec、TTL 和错误映射，不取得或传递 control token。所有公开 Client mutation 都无条件注册一次 required client-wide invalidation，包括只修改 generic presentation 或 legacy 字段的 mutation；接受无关 Runtime 的额外回源，以避免维护字段差异矩阵。

Module 在 composition 创建时注册当前进程使用的 canonical payload Adapter，并通过 `reader(kind)` 绑定只暴露 `acquire(clientCode)` 的类型化窄 Reader；业务调用方不逐请求传入或替换 Adapter，也不直接处理 payload kind。共享 Module 另行暴露 `invalidateClient(clientCode)` 与要求显式确认协议流量已关闭的 `repairAllAfterRedisRestore(...)`。Admin 只注入 invalidation 窄 Interface，Worker 只注入 maintenance 窄 Interface；保证全部 Client mutation 注册 required invalidation 与 unknown-COMMIT 保守失效的 mutation wrapper 留在 `admin-api` 本地，不把 UnitOfWork 或事务 ordering 纳入共享 Module Interface。

payload kind 使用封闭的 canonical catalog，当前只包含 `oidc`、`custom-sso` 与 `traffic-gate`；各进程只注册自己读取的子集，新增 Runtime 必须显式扩展 catalog 和 Module-owned key inventory。成功 acquisition 返回 `{ kind: "present", value }` 或 `{ kind: "absent" }`，明确区分 negative Snapshot 与无法取得可信 Snapshot；payload Adapter 分别声明 present TTL 与可选 absent TTL，后者为空时仍校验 control 未变化但不发布 negative cache。

主 Interface 只公开按操作区分的低熵错误：Snapshot acquisition unavailable、client invalidation failed 与 restore repair failed。Redis phase、key、epoch、generation、CAS retry、payload body 和 loader 内部错误不得成为协议业务分支或对外响应，只能进入脱敏 observer；各 Runtime Adapter 将 acquisition unavailable 映射为自己的 fail-closed/unavailable 结果，Admin 与 Worker 分别把 invalidation/repair failure 映射为已约定的 required error 和运维失败。

Module 拥有一个闭集、同步且 best-effort 的 observability port，由 composition 映射为单一稳定 Pino 结构化事件。事件只包含有界的 `operation`、`outcome`、`durationMs` 以及必要的 canonical payload kind、maintenance mode 或 phase 枚举；observer 抛错不得改变 acquisition、invalidation 或 repair 结果。高频 acquisition、bootstrap 与 CAS 事件不记录 `clientCode`，只有 invalidation failure、单 Client repair result 等低频处置日志可以把它作为普通 JSON 字段；`clientCode`、Redis key、epoch、generation、payload、原始 loader/Redis error 不得进入事件名、Loki label 或未来 metric label。本次不为 Runtime Snapshot 引入新的 metrics SDK、trace/span、Dashboard、alert threshold 或 SLO。

Runtime cache freshness 与协议 artifact/session lifecycle 保持独立。共享 invalidation 只推进 control 并删除三份 Runtime payload，不发布 OIDC cleanup，也不接受 revocation reason 或协议开关；ClientService 继续只为相应业务 mutation 单独注册 OIDC、Custom SSO 与全协议 revocation。Worker repair 和 unknown-COMMIT 保守 invalidation 不因缓存修复而额外撤销协议 artifact 或 Session。

`admin-api` 本地 mutation wrapper 使用一次性的 target-bound nested callback：外层 transaction 完成查找或锁行，取得 canonical `clientCode` 后进入内部 Client mutation callback；wrapper 在执行该 callback 前注册首个 required client-wide invalidation，并拒绝成功返回但从未绑定 target 的 mutation。它是 rollback-confirmation side channel 的唯一消费者：confirmed rollback 不失效，任何未确认 rollback 的错误都保留为主错误并对已捕获 target 尝试一次保守 invalidation，后者也失败时只记录显式 repair 要求。该形状覆盖事务前已知 code 的入口与只在锁定 legacy ID row 后才取得 code 的入口，且不允许 Client code rename。

现有 legacy cache protocol 与本模型不能在开放 Client mutation 时安全混跑，尤其旧 OIDC reader 的无条件晚到写入无法由 dual-delete 修复。首次发布必须关闭 Custom SSO/OIDC 协议流量，冻结全部 Client 与 client-protocol mutation 和 one-shot writer，drain 所有旧 API、Admin API、OIDC Provider 与 Worker，整体部署新代并运行全量 Runtime repair、readiness 与 mutation smoke；只有证明旧实例和旧 writer 已退出后才一次性恢复协议流量与 mutation。本次切换不实现 legacy dual-read、dual-write 或在线 bridge。

首次发布由 [Client Runtime Snapshot hard-cutover 与验收手册](../releases/client-runtime-snapshot-hard-cutover.md) 的人工 release owner 编排；应用不实现自动 freeze、drain、切流或 production receipt orchestrator。Worker 分别提供幂等 repair 与独立只读 verify，命令的安全结构化 report、人工 freeze/drain/PONR receipt 以及新代 mutation/acquisition smoke 共同构成放流证据，任一单项都不能替代其余 gate。

新实现使用独立的版本化 Redis namespace，共享 control 与三份 payload 对同一 Client 使用相同 hash tag；新 envelope 不写入任何 legacy key。硬切换在停流状态下同时清空新 namespace 与三套 legacy Runtime key，避免旧格式被新 reader读取或新格式被旧 parser误读。新代越过发布激活点后只允许保持停流并 forward-fix，不再整代或部分恢复旧 API、Admin API、OIDC Provider、Worker 或 legacy cache protocol。

旧实例全部 drain 且 candidate 预检通过后，cutover owner 必须在开始清理 legacy 与新 Runtime namespace 前记录 point-of-no-return receipt；namespace reset 一旦开始即进入 forward-only，后续 repair、readiness 或 smoke 失败都保持协议流量与 Client mutation 关闭并修复新代。point of no return 之前可以在继续停流的前提下放弃 candidate，但不得在其后重新启动旧 reader、writer 或 one-shot owner。

Snapshot acquisition 在 source load 后 publish CAS 失败时，由 Module 重新执行一次完整 acquisition；第二次仍因共享 control 变化而失败，就抛出 Snapshot unavailable，不持续退避或重试到请求 deadline。cache hit 不增加额外往返，重试预算、CAS phase 与 control 内容均保持在 Implementation 内。

共享 control 可信但目标 payload 损坏、过期、与 client/kind/control 不匹配或 codec 不支持时，Module 将该 payload 视为 cache miss，从 PostgreSQL source 重新加载并执行正常 publish CAS；不得把坏 payload 返回给调用方，也不因可重建 payload 单独要求人工 repair。只有回源、编码、Redis 或有界 CAS acquisition 失败时才返回 Snapshot unavailable；control 缺失或损坏继续使用随机 epoch bootstrap。

验收以 `@iam/api-core` 的 Component 与真实 Redis contract 为核心，使用可控 source latch、独立 Redis client 和确定性 hook 覆盖 late refill、CAS 一次重试与二次冲突、epoch ABA、并发 bootstrap winner、坏 payload 自愈、targeted/full repair 及部分失败重跑。OIDC、Custom SSO 与 Traffic Gate 各自在 app-local Component contract 验证 Adapter 映射；Admin API 以 Component 与 PostgreSQL contract 验证 target binding、confirmed rollback、unknown COMMIT、required invalidation failure 和原错误保留；Worker 以 Component、Process 及新增的 owner-specific Redis Integration profile 验证 CLI 参数互斥、production wiring、safe report、退出码和 full reset。真实 I/O 测试必须先普通 `await` 再同步断言，Redis 测试使用任务独占 namespace 或 cleanup identity，禁止 `FLUSHDB`/`FLUSHALL`。

本 ADR 描述的 deep Module、三类 Runtime acquisition、Admin target-bound wrapper、legacy 在线协议退役、Worker targeted/full
repair 与独立 verify 均已实现；固定候选验证由发布平台或 release owner 按 Current runbook 逐项调用 owner commands 并保存证据，
仓库不提供 feature-specific root runner。首次 production 激活仍必须人工执行，并另行取得具体窗口与环境授权。
