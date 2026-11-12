# @iam/documents

## 共享发布与恢复

`@iam/documents/user` 与 `@iam/documents/organization` 共享更新编排，各自维护数据、事务、构建与发布适配器。
API/Admin API composition 注入 producer，查询 composition 注入 repository，Worker composition 接入 consumer。

1. 文档相关源写入将事实、审计和实际变化的 Outbox 同事务提交。提交后按一致观察展开，原子登记目标重建版本和 Outbox 完成凭据。重复投递已完成消息时只唤醒原版本。
2. 队列仅唤醒。每类通知按事务合并，提交后分批、共享本次入队总预算。失败保留 Outbox，由两阶段 repair 回收失败或过期工作并重新投递。
3. 领取版本与处理 token 后，构建器在同一只读源快照中构建并校验覆盖。发布按数量和文档字节分组，锁定并重验版本和 owner，原子提交文档或墓碑、processed 与后续义务。
4. repair 跳过活跃事务，重领更换 token，旧 owner 即使同版本也不能完成。确定回滚的目标局部错误可有界重试或拆分，连接、配置或提交未知时停止扩散重试。已确认提交的对象仍进入后处理。

`@iam/jobs` 管理分批、预算、身份、确认和连接关闭。HTTP producer 与维护命令使用专用快速失败连接，常驻 Worker 保留长期重连。
[共享重建编排](src/update/batch-rebuild.ts) · [周期修复与监控](../../docs/releases/data-maintenance.md#周期任务与监控)

## User Document 失效

Outbox 保存变化来源、直接用户及必要的原关联，消费者在提交后展开受影响集合。删除分配、结束任职与责任仍须覆盖原目标。
展开覆盖组织子树任职者、跨树 holder、岗位、角色及分配。组合角色包含关系变更登记包含方，状态变化登记该角色。
沿当前包含关系向上查祖先组合分配，断链编辑另有自己的登记。受影响用户解析不依赖角色 code 前缀。Outbox processed 表示重建要求已持久登记。

## User Document 与 Subject Facts 发布

按同次唤醒有界批量构建，各用户独立版本与结果。人工全量 backfill 按源库存成页登记版本和完成凭据，再唤醒重建。
构建固定观察时点，校验开放任职、岗位、组织和完整路径，按任职保存全局与按 Client 分组的应用角色。旧文档缺省的全局角色按空集合处理。
PostgreSQL 每个用户只保存一份业务文档与技术元数据，Admin 保持专属模型。

发布事务登记后续义务，确认提交后才处理 Facts 缓存和 Subject Access。正常消费与 repair 共用同版本尝试预算，逐用户执行并按版本/token 完成。
缓存失败保留恢复义务，耗尽交人工处理，重置预算与领取须原子完成。Access lease 在该主体实际修复时领取。账号解除 blocking 遵循 [Subject Access 恢复与重新启用](../subject-access/README.md#恢复与重新启用)。
[后处理器](src/user/worker/user-document-post-publication.processor.ts) · [日常修复](../../docs/releases/data-maintenance.md#user-document-日常修复)

只有已删除的用户发布墓碑，Pause/Disable 仍发布完整文档，源行缺失是异常。Redis 保留带版本墓碑以阻止旧发布或回填复活，比较保留 bigint 精度。
Facts 缓存缺失、损坏或主体错配时合并回源，由已发布 PG 文档派生同版本 Facts 或墓碑。回填失败可使用合法 PG 结果，Redis 读取故障直接失败。
[Facts reader](src/user/subject-facts/document-facts.reader.ts)

PG gate 在 `REPEATABLE READ READ ONLY` 事务完整核对源用户、文档与墓碑、Outbox、Rebuild State、处理凭据、后续义务、源事实及孤立记录。
Redis gate 对照一致 PG 库存核验完整 Facts、墓碑与屏障。两者均只读，不入队、不修复，取消或中断不能返回完整核验结果。
任职完整性另由 [Ops 的独立只读诊断](../../apps/ops/README.md#任职只读诊断)检查。
[数据维护](../../docs/releases/data-maintenance.md#user-document-全量重建) · [Ops 维护测试](../../apps/ops/test-integration/user-document/user-document-maintenance.integration.test.ts)

## Organization Search 发布与核验

组织文档独立持有 Outbox、Rebuild State 和 Document。创建、状态变化与删除登记自身，code/name/type 变化登记子树，零行修改不登记。
提交后按当前闭包展开，后创建的后代由各自变化覆盖。单对象任务接入共享编排，在同一只读源快照验证完整路径。
已删除对象发布带版本墓碑，源行缺失属于完整性错误。

独立 verifier 在 `REPEATABLE READ READ ONLY` 事务完整核对源组织、闭包、文档/墓碑、处理版本、Outbox 凭据与孤立记录。
历史完成凭据可指向较早版本，不能指向未完成的更高版本。核验不写入或派发任务，失败后须重新全量检查。
[核验测试](test-integration/organization/verification/verification.integration.test.ts) · [组织维护](../../docs/releases/data-maintenance.md#组织搜索全量重建)

## Internal 搜索与详情

用户与组织的 Internal 搜索和详情只读当前 schema 的可见已发布文档，允许发布延迟，无需联查源表、管理模型或执行全量覆盖检查。
详情无可读条目返回 404。读取损坏文档或查询失败返回 503。404 无法证明源对象不存在。

用户搜索按认证 Client 生成公开文档并完整校验，再执行 select。角色匹配、计数与输出均使用有效全局角色及当前 Client 的有效应用角色。
公开结构由 schema 定义。查询侧负责执行、结果预算、排序和超时，入口负责 HTTP 错误映射。
[搜索契约](../contracts/src/document-search.ts) · [Filter 引擎](../filter-engine/README.md) · [搜索接入](../../docs/guides/search.md)
