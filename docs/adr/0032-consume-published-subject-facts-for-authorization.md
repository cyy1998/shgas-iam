---
status: accepted
---

# 授权主体属性采用已发布 Subject Facts

[Issue #156](https://github.com/cyy1998/shgas-iam/issues/156) 讨论授权新鲜度检查与主体交付可用性的取舍。维护者于 2026-09-09 确认以下决定，以接受已发布旧权限换取主体交付与重建进度的解耦。本文局部取代 [ADR-0008](0008-adopt-client-subject-projection.md) 的请求时授权新鲜度要求；读取实现已迁移，环境尚未切换。

## 已确认的修改目标

- 主体投影优先读取 Redis 中的 Subject Facts，缓存缺失时读取 PostgreSQL。PostgreSQL 仍保留业务事实及已发布读模型；“唯一事实来源”不表示移除数据库或禁止缓存缺失回源。
- `iam:authorization` 接受最后成功发布的事实，不再为了证明其与当前源事实一致而执行请求时新鲜度检查。源权限已撤销但新 Facts 尚未发布时，允许继续交付旧权限；Worker 持续失败时也接受该窗口持续存在，不承诺固定时间内完成撤权传播。
- 两个协议统一采用上述读取与新鲜度语义。Custom SSO 在每次主体交付时读取已发布 Facts；OIDC 只在创建 Claims Snapshot 时读取，后续 Token 与 UserInfo 继续复用协议快照，不随 Facts 更新自动刷新。
- 缓存损坏、格式不支持或主体错配均按缓存失效处理，回源只读取 `user_profile` 中已发布的 Facts 并尝试回填 Redis；不查询 Dirty 或现场聚合源业务表。数据库读模型缺失或无效时，整份投影暂态失败，不省略已声明的授权字段。
- Redis 读取超时或连接故障仍返回暂态失败，不尝试数据库回源；只有明确缓存缺失或内容无效才回源。这一决定不改变其他认证状态对 Redis 的依赖。

这是以放宽授权主体属性的新鲜度承诺换取交付解耦的契约选择，不能仅描述为查询优化。尚未测量生产时延、数据库负载或登录成功率，不能据此声明性能收益已被验证。

## 保留的责任与失败语义

第三方复制权限到自有会话或存储后，继续自行负责刷新；本决定不新增推送撤权或强制刷新机制。账号禁用和访问代际仍由 Subject Access Barrier 与操作许可保护，投影仍按 Client 和已声明 Claim 裁剪，不扩大披露范围；Admin 请求时业务授权不属于本次投影读取调整。

Subject Projection Not Ready 仍表示暂态不可用，但不再由 Dirty 的待处理、处理中、失败或版本落后单独触发。数据库中没有合法的已发布 Facts 时，仍不能交付整份投影。数据库访问故障沿用既有失败路径，回填 Redis 失败仍不推翻已取得的合法数据库 Facts。

Custom SSO 消费 Grant 后发生投影失败，仍须重新授权；有效根会话可复用，UserInfo 保留现有有效 Credential 并允许稍后重试。OIDC 无可用投影时仍不签发 Authorization Code；Token 与 UserInfo 不重新构建 Claims Snapshot。上述主体资料策略不替代凭据生命周期、协议配置或账号访问检查。

后台源事实失效、重建、Profile 与 Dirty 的原子发布、Redis 单调发布和恢复责任保持。取消在线新鲜度屏障不等于删除 Dirty 数据或改变发布完整性检查，也不在 Redis 中另建替代的新鲜度屏障。

## 发布决定

本次明确属于读取一致性策略调整，不属于 Claim disclosure 变化。Claim 集合、字段结构和跨 Client 披露范围不变，保持 Catalog、Custom SSO Wire、OIDC Snapshot 版本及协议 epoch；不因本次变更清理有效 Principal Session、Grant、Credential 或 OIDC Snapshot，也不重建旧 Snapshot。

采用协调部署统一受影响的 API 与 OIDC 消费者，使放流后的读取语义一致，并核验升级前合法对象在升级后仍可使用。已有对象继续遵守自身过期、消费、撤销和配置版本规则。“保留”不延长有效期，也不恢复已经失效的对象。生产部署与环境核验须另行执行，本文不代表已完成切换。

该决定不启动 [ADR-0016](0016-own-subject-claim-catalog-version-server-side.md) 的 Catalog 升级流程；未来字段或披露范围变化仍遵守该 ADR 的代际与清理要求。

## 验证决定

以行为验证完成本次改动，生产 p95/p99、数据库负载、登录成功率及重建延迟的测量另行跟踪，不作为本次完成门槛。验证须直接覆盖：

- 选择 `iam:authorization` 且缓存有效时不读 PostgreSQL；仅 Subject Identifier 的投影仍不读 Facts。
- 缓存缺失、损坏、格式不支持或主体错配时读取已发布 Profile 并尝试回填；不查 Dirty、不现场聚合，保留并发回源归并和单调发布行为。
- 权限源已改变且处于待重建、处理中或失败状态时仍交付读取到的合法旧 Facts；新版本发布后，Custom SSO 后续查询取得新事实，OIDC 既有 Snapshot 保持原内容。
- Redis 读取故障失败，数据库无合法 Facts 时整份投影暂态失败，回填失败仍可交付合法数据库 Facts；不省略已声明字段。
- 两协议正式入口继续执行账号保护、Client 裁剪和既有失败恢复；旧合法对象跨升级继续使用，协议版本与字段结构保持。

实施时沿现有 Reader、Projection 与协议公开入口选择直接相关的行为及资源验证，迁移旧 freshness 专用断言，保留仍成立的保护目标；不以类型检查或代码搜索代替行为证明。具体公开入口、替代断言与证明边界见[行为契约](../features/sso/published-subject-facts-contract.md)。已执行受影响模块的 Unit、Component、真实 Reader PostgreSQL 与两协议 HTTP/Redis 行为验证；完整命令结果与最终评审单独记录，生产测量未执行。

## 实施状态

Reader 保留缓存失效时的窄行 `user_profile` 读取，Projection 与两协议装配已删除 Authorization Freshness port、Dirty 查询及其观测事件。缓存有效命中不证明源事实没有新变化，本决定明确接受这一差异。Catalog、wire、Snapshot 和协议 epoch 保持；[升级手册](../releases/published-subject-facts-upgrade.md)记录原 #156 固定旧候选的保留对象边界。包含 #170 的当前候选按[全体下线手册](../releases/online-auth-redis-time-cutover.md)统一切换并重新登录，实际环境未执行。
