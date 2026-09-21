# Client Snapshot 契约

本文定义普通配置、敏感凭据读取与提交后传播的当前接口，决策理由见
[ADR-0021](../../adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md)。
在线只使用统一 Snapshot，不双读旧 reader/Gate。管理操作见[Client 配置](../admin/client-sso-configuration.md)。

## 读取与提交传播

API Core 的 `@iam/api-core/client-snapshot/composition` 提供 `createClientSnapshots`，只在 composition 中连接
Redis 与 source。普通消费者通过 `/client-snapshot` 的 `ClientSnapshotReader` 取得 `clientCode/status/ssoEnabled/ssoConfig`；
`kind:absent` 只表示源行不存在或已删除，`ssoConfig:null` 是现存 Client 尚未配置协议。
`gate.acquire` 从同一实际普通 reader 裁剪到 `clientCode/status`，不要求配置或 SSO 启用，不另建 Gate payload。
认证 owner 只接收 `/client-snapshot/credentials` 的 `ClientCredentialReader`，返回当前 Secret、凭据 ID 和更新时间。
两个 reader 分别形成观察，不承诺同一个 PostgreSQL 时点。

敏感出口提供 `createClientSecretAuthenticator(reader).authenticate(clientCode, secret)`。
它每次通过敏感 reader 取得缓存观察，以固定长度摘要的 constant-time 比较验证 Secret；成功只返回 Client code、凭据 ID 和
更新时间，错误 Secret 或无凭据返回 null，缓存故障保持原暂态错误。该认证结果固定，不在后续交付时重新 acquisition；
协议 owner 仍负责适用的 Public/托管例外、入口解析及后续操作。该接口不把普通配置与认证提升为同一 PG 时点。

Admin 的 `createClientSnapshotRepository` 使用两项显式窄 SELECT；普通 SELECT 不读取 Secret 或 Internal 凭据。
敏感 SELECT 只读取新代凭据三列，规范化数据库时间到 ISO。模块对冷返回及 warm payload 都执行各自 schema，
额外源字段不会穿过普通输出，控制信息不返回消费者。新代协议 composition 可按相同 source port 注入自己的 repository。

`createClientSsoSnapshotManagement` 将正式管理 service、REST/tRPC adapter 与真实 Snapshot 失效能力装配在一起。
哪些写操作执行同行锁、审计和 required after-commit，统一见[Client 配置操作](../admin/client-sso-configuration.md#配置操作与结果)；
readSecret 只读取并记审计，不参与缓存失效。成功失效同时清除普通/敏感 payload。
确认提交后传播失败仍返回 `ADMIN_MUTATION_COMMITTED`，Unknown COMMIT 保留原错误并尝试保守失效；不重放 mutation。
失败传播期间旧 payload 可继续被独立 reader 接受；页面刷新/修复提示仍由 Client 管理入口拥有。

## 缓存与恢复边界

新 namespace 为 `client-snapshot:v1`；每个 Client 有一个 control hash、一个普通 payload 和一个敏感 payload，
各键共享 Client hash tag。Lua 一次读取 control 与所需 payload；坏 control 原子替换随机 epoch 并清除两个 payload。
Payload 缺失或解析失败才窄行回源；发布比较原 epoch/generation。冲突执行一次完整 acquisition 重试，再冲突暂态失败。
Redis 连接或读取失败不回源放行。默认正缓存 30 秒、负缓存 3 秒，两个参数可注入。每次 acquisition 先独立取得 Redis
control/payload 观察，warm 不加入其他在途 Promise；只有 miss 回源按 Client、实际 reader 与本次观察的 epoch/generation
合并 single-flight，Gate 与普通 reader 共用此冷回源。发布冲突后每位调用方按自己的预算重新观察，至多重试一次。
因此其他进程成功失效后的新调用不会复用失效前延迟返回的 warm/负缓存观察，原在途调用仍可完成。
TTL 不代表传播成功，失效不追溯修改已接受观察。

`/client-snapshot/maintenance` 独立公开：

- `createClientSnapshotMaintenance(redis).repairClient(code)`：推进目标 control 并删除目标双 payload，保留其他 Client。
- `repairAllAfterRedisRestore({protocolTrafficStopped:true})`：按本 owner 三类 inventory SCAN、分批 UNLINK 并有界重扫。
- `createClientSnapshotVerifier(scanOnlyRedis).verifyAllAfterRedisRestore({protocolTrafficStopped:true})`：独立只读扫描，
  返回 `matchingKeys`；只有完整成功且计数为零才能由 CLI 判定恢复完成。扫描失败抛出安全错误。

Full repair 前必须停协议流量并排空；部分失败保持停流，从头重跑后用新连接/进程独立 verify。
它们不读写 PostgreSQL、不轮换 Secret、不撤销会话、不处理旧 Snapshot 或其他 owner，未知键族保留。
Worker 提供 `client-snapshot:repair/verify`、统一退出码及新进程核验，见[维护手册](../../releases/unified-session-maintenance.md)。
完整 verify 使用独立 scan-only capability；不能以 owner 连接测试或 CLI 成功代替真实环境停流、排空与放流验收。

## 验证入口

普通/敏感字段隔离、缓存故障、传播窗口和真实恢复分别由 Core Redis、Admin composition 与 Worker CLI 验证，
见[架构验证归属](../../architecture/architecture-verification.md#行为资源与系统验证)。局部缓存调用成本不等于完整端点性能。
