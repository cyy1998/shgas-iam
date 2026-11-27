# @iam/documents

## 共享发布与恢复

`@iam/documents/user` 与 `@iam/documents/organization` 共享更新编排，各自维护数据、事务、构建与发布适配器。
API/Admin API composition 注入 producer，查询 composition 注入 repository，Worker composition 接入 consumer。

1. **源写入与版本登记**：与文档相关的源写入会在同一事务中提交业务事实、审计记录及实际发生变化的 Outbox。提交后基于同一快照展开受影响目标，原子登记目标重建版本和 Outbox 完成凭据；重复投递已完成消息时，仅按原版本触发唤醒。
2. **有界队列唤醒**：队列消息仅用于唤醒重建。同类通知按事务合并，提交后分批入队并共享本次入队总预算；入队失败时保留 Outbox，由两阶段 repair 回收失败或过期任务并重新投递。
3. **快照构建与原子发布**：领取重建版本与处理 token 后，构建器在同一只读源快照中生成文档并校验覆盖完整性。发布按条目数和文档字节数分组，锁定并重新校验版本与当前 owner，原子提交文档（或墓碑）、`processed` 标记以及待执行的缓存与访问屏障任务。
4. **并发隔离与故障重试**：repair 会跳过活跃事务，重新领取时更换处理 token，旧 owner 即使持有同版本也不能完成提交。确认已回滚的局部错误可在预算内重试或拆分批次；遇到连接异常、配置错误或提交结果未知时，立即停止拆分重试。已确认提交的对象仍会进入后处理。

`@iam/jobs/documents/user` 和 `@iam/jobs/documents/organization` 装配对应的 BullMQ producer 和 Worker。分批、预算、身份、确认和连接关闭由 `@iam/jobs` 管理。HTTP producer 与维护命令使用专用快速失败连接，常驻 Worker 保留长期重连。
[共享重建编排](src/update/batch-rebuild.ts) · [周期修复与监控](../../docs/releases/data-maintenance.md#周期任务与监控)

## User Document 失效

Outbox 记录变更来源、直接关联的用户及必要的原有绑定关系，消费者在事务提交后再展开受影响用户集合。删除角色分配、结束任职或组织责任时，仍会覆盖原本受影响的目标用户。

- **展开范围**：覆盖组织子树内的任职用户、跨树组织责任持有人（holder）、岗位、角色及其分配关系。
- **组合角色处理**：包含关系变更时登记包含方，角色状态变更时登记该角色自身；展开时沿当前包含关系向上查找祖先组合分配，断开包含关系的编辑也会单独登记受影响范围。受影响用户解析不依赖角色 `code` 前缀。
- **完成语义**：Outbox 标记为 `processed` 表示目标用户的重建需求已持久登记，不代表最终文档已发布完成。

## User Document 与 Subject Facts 发布

按同次唤醒有界批量构建，各用户独立版本与结果。人工全量 backfill 按源库存成页登记版本和完成凭据，再唤醒重建。
构建固定观察时点，校验开放任职、岗位、组织和完整路径，按任职保存全局与按 Client 分组的应用角色。旧文档缺省的全局角色按空集合处理。
PostgreSQL 每个用户只保存一份业务文档与技术元数据，Admin 保持专属模型。

- **重试预算与恢复** 发布事务会登记待执行的缓存与访问屏障任务，确认提交后再依次处理 Facts 缓存和 Subject Access。正常消费与 repair 共用同一版本的尝试预算，逐用户执行并按版本与 token 确认完成。
  缓存更新失败会保留待恢复任务，预算耗尽后交人工处理，且重置预算与重新领取须原子完成。Access lease 在实际修复该主体时领取。账号解除 blocking 遵循 [Subject Access 恢复与重新启用](../subject-access/README.md#恢复与重新启用)。
  [后处理器](src/user/worker/user-document-post-publication.processor.ts) · [日常修复](../../docs/releases/data-maintenance.md#user-document-日常修复)

- **墓碑与缓存回源** 只有已删除的用户发布墓碑，Pause/Disable 仍发布完整文档，源行缺失是异常。Redis 保留带版本墓碑以阻止旧发布或回填复活，比较保留 bigint 精度。
  Facts 缓存缺失、损坏或主体错配时合并回源，由已发布 PG 文档派生同版本 Facts 或墓碑。回填失败可使用合法 PG 结果，Redis 读取故障直接失败。
  [Facts reader](src/user/subject-facts/document-facts.reader.ts)

- **双存储只读门禁** PG gate 在 `REPEATABLE READ READ ONLY` 事务中完整核对源用户、文档与墓碑、Outbox、Rebuild State、处理凭据、待执行的缓存与访问屏障任务、源事实及孤立记录；
  Redis gate 对照同一 PG 快照核验完整 Facts、墓碑与访问屏障。所有只读门禁均不写入、不入队也不触发修复，中途取消或中断不会返回完整核验通过结果。
  任职完整性另由 [Ops 的独立只读诊断](../../apps/ops/README.md#任职只读诊断)检查。
  [数据维护](../../docs/releases/data-maintenance.md#user-document-全量重建) · [Ops 维护测试](../../apps/ops/test-integration/user-document/user-document-maintenance.integration.test.ts)

## Organization Search 发布与核验

组织文档独立持有 Outbox、Rebuild State 和 Document。创建、状态变化与删除登记自身，code/name/type 变化登记子树，零行修改不登记。
提交后按当前闭包展开，后创建的后代由各自变化覆盖。单对象任务接入共享编排，在同一只读源快照验证完整路径。
已删除对象发布带版本墓碑，源行缺失属于完整性错误。

独立 verifier 同样在 `REPEATABLE READ READ ONLY` 事务中只读核对源组织、闭包、文档与墓碑、处理版本、Outbox 凭据及孤立记录。
历史完成凭据可指向较早版本，不能指向未完成的更高版本；核验失败后须重新全量检查。
[核验测试](test-integration/organization/verification/verification.integration.test.ts) · [组织维护](../../docs/releases/data-maintenance.md#组织搜索全量重建)

## Internal 搜索与详情

用户与组织的 Internal 搜索和详情只读当前 schema 的可见已发布文档，允许发布延迟，无需联查源表、管理模型或执行全量覆盖检查。
详情接口无可读文档时返回 404（表示当前目录中无可读记录，对象可能尚未发布或已删除）；读取损坏文档或查询失败返回 503。

用户搜索按认证 Client 生成公开文档并完整校验，再执行 select。角色匹配、计数与输出均使用有效全局角色及当前 Client 的有效应用角色。
公开结构由 schema 定义。查询侧负责执行、结果预算、排序和超时，入口负责 HTTP 错误映射。
[搜索契约](../contracts/src/document-search.ts) · [Filter 引擎](../filter-engine/README.md) · [搜索接入](../../docs/guides/search.md)
