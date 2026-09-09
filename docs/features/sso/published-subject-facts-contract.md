# 已发布 Subject Facts 的授权交付

[Issue #156](https://github.com/cyy1998/shgas-iam/issues/156) 按 [ADR-0032](../../adr/0032-consume-published-subject-facts-for-authorization.md)
统一 Custom SSO 与 OIDC 的主体读取。实现已移除授权新鲜度 port、Reader 的 Dirty 查询及对应观测事件，保留现有缓存、发布与账号保护。
生产环境尚未切换，升级流程见[保留对象升级](../../releases/published-subject-facts-upgrade.md)。

## 行为与责任

所有已选 Claim 共用一次取得的合法 Facts。Redis 命中不查询 PostgreSQL；缺失、损坏、格式不支持或主体错配时，
Reader 按 Subject single-flight 读取一行 `user_profile`，严格解析并尽力单调回填。只回源已发布读模型，
不读取 Dirty 状态、Legacy Detail/Search 或现场聚合源业务表。Redis 读取错误不触发回源；数据库查询错误原样传播；
数据库无合法行时整份投影 Not Ready，回填错误不推翻合法数据库结果。仅 Subject Identifier 仍不读取 Facts。

`iam:authorization` 接受源权限已改变后的旧 Facts，重建失败时仍允许旧权限交付。既有缓存还可能落后于数据库已发布行，
有效命中不为了发现更高版本回源，因此“已发布”不等于“全系统最新”。没有固定撤权传播期限，也不增加缓存 TTL 或 Redis 新鲜度屏障。
后台 Dirty、原子发布、单调 CAS、repair/readiness 及 Subject Access 恢复条件保持。

Custom SSO 每次交付重新取得 Facts；同一有效 Credential 在 Facts 更新后可取得新属性。OIDC 仅在授权时创建 Snapshot，
Code、Token 与 UserInfo 重放原内容，新 Facts 只进入之后读取到它的新授权。第三方复制后自行刷新。
账号禁用/代际、Client 裁剪、字段/schema 与协议生命周期继续有效；本次不调整 Admin 请求时业务授权。
Facts 缺失仍保留兑换失败重新授权、UserInfo 原凭据重试及 OIDC 不签发 Code 的区别。

## 行为验证归属

| 公开入口 | 直接证据 | 证明边界 |
|---|---|---|
| Reader 与 Projection | [Reader Component](../../../packages/user-profile-read-model/test-integration/component/subject-facts-reader.contract.integration.test.ts) | 真实工厂组合、缓存命中授权零数据库调用、失效回源、错误和 single-flight；缓存/数据库出站替身不证明真实存储。 |
| Projection | [Projection Component](../../../packages/client-subject-projection/test-integration/component/client-subject-projection.contract.integration.test.ts) | 当前操作许可、主体一致、按 Client 裁剪、同一次读取组成全部字段，以及新调用采用新版本。 |
| PostgreSQL 回源 | [Reader PostgreSQL](../../../packages/user-profile-read-model/test-integration/postgres/subject-facts-reader.integration.test.ts) | 真实 Profile 和 Dirty 为 pending/processing/failed/较新 processed/缺失时，数据库回源和随后缓存均交付已发布角色；不模拟完整角色命令事务。 |
| Redis publisher | [单调发布](../../../packages/user-profile-read-model/test-integration/redis/subject-facts-publisher-v3.integration.test.ts) | 保留正式 Redis CAS 的旧版本不覆盖新版本、格式与缓存边界；不代表跨数据库事务。 |
| Custom SSO 操作 | [完整操作 Redis](../../../packages/custom-sso/test-integration/redis/custom-sso-operation.integration.test.ts) | 实际 Grant/Credential、账号许可、无 Facts 失败和消费不可重放；外部 ORCAS 为替身。 |
| Custom SSO HTTP | [UserInfo HTTP](../../../apps/api/test-integration/redis/custom-sso-operation-http.integration.test.ts)、[兑换 HTTP](../../../apps/api/test-integration/redis/custom-sso-redemption-operation-http.integration.test.ts) | 独立 issuer 创建的当前格式对象由正式 consumer 使用；四模式原凭据在资料失败后恢复、权限随后更新，三模式消费失败与同根新授权。Facts 出站替身不证明数据库。 |
| OIDC HTTP | [Provider HTTP/Redis](../../../apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts) | 正式装配与真实 Redis，授权缓存命中零数据库调用；新版本发布后旧 Code 兑换和旧 Token UserInfo 保留旧角色，新授权取得新角色；scope、Gate、账号与资料缺失仍拒绝。 |

原“授权必须查询 Dirty”“pending/processing/failed 必须拒绝”“freshness 刷新整份 Facts”及其观测断言不再成立，
已替换为上述已发布事实行为。旧刷新分支的主体错配测试由唯一 Facts 读取的主体错配测试覆盖，
原协议 freshness 失败 fixture 改为 Facts 缺失，保留消费后失败与会话恢复的独立保护目标。
不新增仅断言旧符号缺席的永久测试或 Architecture Guard。

上述测试证明当前格式的保存、读取与协议行为；未执行两个发布二进制之间的真实环境升级或浏览器 E2E。
生产保留集、实例排空、统一候选与 smoke 由发布 owner 核验。生产 p95/p99、负载和登录成功率未测量，
不作为本次验收门槛，也不据查询减少推断具体性能收益。

## 本地验证记录

2026-09-09 在本次功能分支执行以下 owner commands，均通过。Redis 8.8.0 与 PostgreSQL 18.4 来自本次独立临时容器，
通过 owner 专用测试 URL 显式提供，不使用开发或生产资源；完整系统 E2E 与真实环境升级未执行。

| 命令范围 | 结果 |
|---|---|
| `typecheck`：Projection、Read Model、Custom SSO、API、OIDC | 五个受影响 workspace 通过。 |
| `test:unit`：Read Model、Custom SSO、API、OIDC | 128 项通过。Projection 没有独立 Unit collection。 |
| `test:integration:component`：Projection、Read Model、Custom SSO、API、OIDC | 646 项通过。 |
| `test:integration:redis`：Read Model、Custom SSO、API、OIDC | 233 项通过；均为完整 owner Redis collection。 |
| `test:integration:postgres`：Read Model | 57 项通过，包含真实发布、Dirty 状态与缓存回源。 |

上述命令通过 `pnpm --filter '<workspace>' <command>` 调用；批量 Redis owner 使用 `--workspace-concurrency=1`。
首次缓存命中授权回归先在旧实现下因访问 PostgreSQL 失败，移除屏障后通过。静态检查、最终候选及双轴评审结果
在交付时单独报告，不能把本表视为生产环境或未来修改的验收。
