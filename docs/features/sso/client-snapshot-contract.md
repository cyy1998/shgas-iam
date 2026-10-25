# Client Snapshot 契约

本文定义普通配置、敏感凭据读取与提交后传播的接口及观察边界，决策理由见
[ADR-0021](../../adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md)。
管理操作见[Client 配置](../admin/client-sso-configuration.md)。

## 读取与提交传播

API Core 的 `@iam/api-core/client-snapshot/composition` 提供 `createClientSnapshots`，在 composition 中连接
Redis 与 source，公开读取能力按用途分离：

| 能力                                                       | 结果与约束                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/client-snapshot` 的 `ClientSnapshotReader`               | 同次取得 `clientCode/status/ssoEnabled/ssoConfig`；`kind:absent` 只表示源行不存在或已删除，`ssoConfig:null` 表示现存 Client 尚未配置协议。 |
| `gate.acquire`                                             | 复用普通 reader，只返回 `clientCode/status`；不要求协议配置或 SSO 启用。                                                                   |
| `/client-snapshot/credentials` 的 `ClientCredentialReader` | 供认证 owner 读取当前 Secret、凭据 ID 和更新时间。                                                                                         |

敏感结果中的更新时间规范化为 ISO 字符串。普通与敏感 reader 分别形成观察，不承诺同一个 PostgreSQL 时点。
普通读取及其源查询不含 Secret 或 Internal 凭据；
源结果和缓存结果均经对应 schema 校验，额外字段与缓存控制信息不返回消费者。
Admin 的 `createClientSnapshotRepository` 提供这两类窄 source，其他 composition 可按相同 source port 注入 repository。

敏感出口提供 `createClientSecretAuthenticator(reader).authenticate(clientCode, secret)`。
它每次通过敏感 reader 取得缓存观察，以固定长度摘要的 constant-time 比较验证 Secret；成功只返回 Client code、凭据 ID 和
更新时间，错误 Secret 或无凭据返回 null，缓存故障保持原暂态错误。该认证结果固定，后续交付不重新获取；
协议 owner 仍负责适用的 Public/托管例外、入口解析及后续操作。该接口不把普通配置与认证提升为同一 PG 时点。

`createClientSsoSnapshotManagement` 提供管理写入与 Snapshot 失效的统一入口。
哪些写操作执行同行锁、审计和 required after-commit，统一见[Client 配置操作](../admin/client-sso-configuration.md#配置操作与结果)；
readSecret 只读取并记审计，不参与缓存失效。成功失效同时清除普通/敏感 payload。
确认提交后传播失败仍返回 `ADMIN_MUTATION_COMMITTED`，Unknown COMMIT 保留原错误并尝试保守失效；不重放 mutation。
失败传播期间旧 payload 可继续被独立 reader 接受；页面刷新/修复提示仍由 Client 管理入口拥有。

## 缓存与恢复边界

每次获取独立观察 Redis；缓存缺失或解析失败才从对应窄 source 回源，Redis 连接或读取失败不回源放行。
默认正缓存 30 秒、负缓存 3 秒，两个参数可注入。并发回源只在同 Client、同实际 reader、同失效观察下合并；
Gate 与普通 reader 共用回源。发布遇失效冲突时，每个调用方至多重新获取一次，再冲突返回暂态失败。

成功失效阻止晚到的旧结果重新填入缓存。失效后的新调用也不能复用其他在途调用在失效前取得的正/负缓存观察；
已经接受观察的原调用仍可完成。缓存 TTL 不代表传播成功，失效不追溯修改已接受观察。
控制状态、存储布局与发布机制由模块封装，所有权见[后端架构](../../architecture/backend-architecture.md#client-subject-projection)。

`/client-snapshot/maintenance` 独立公开：

- `createClientSnapshotMaintenance(redis).repairClient(code)`：使目标普通/敏感缓存同时失效，保留其他 Client。
- `repairAllAfterRedisRestore({protocolTrafficStopped:true})`：清除当前 Snapshot owner 的已知缓存库存。
- `createClientSnapshotVerifier(scanOnlyRedis).verifyAllAfterRedisRestore({protocolTrafficStopped:true})`：独立只读扫描，
  返回 `matchingKeys`；只有完整成功且计数为零才能由 CLI 判定恢复完成。扫描失败抛出安全错误。

维护能力不读写 PostgreSQL、不轮换 Secret、不撤销会话、不处理旧 Snapshot 或其他 owner，未知键族保留。
全量恢复必须先停流并排空，repair 后独立 verify；失败保持停流。
精确范围、Worker 命令与恢复步骤见[维护手册](../../releases/authentication-and-session.md#client-snapshot-修复)。

## 验证入口

普通/敏感字段隔离、缓存故障、传播窗口和真实恢复分别由 Core Redis、Admin composition 与 Worker CLI 验证，
见[架构验证归属](../../architecture/architecture-verification.md#行为资源与系统验证)。局部缓存调用成本不等于完整端点性能。
