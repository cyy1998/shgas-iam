# 统一 Client Snapshot 候选

本文记录 [#181](https://github.com/cyy1998/shgas-iam/issues/181) 的公开能力与证明范围；目标来自
[ADR-0035](../../adr/0035-unify-user-and-client-session-lifecycles.md) 和 [Spec #178](https://github.com/cyy1998/shgas-iam/issues/178)。
#194 已将正式消费者统一到本能力并删除旧三类 reader/Gate；没有双读、双写同步或旧值 fallback，环境未切换。

## 读取与提交传播

API Core 的 `@iam/api-core/client-snapshot/composition` 提供 `createClientSnapshots`，只在 composition 中连接
Redis 与 source。普通消费者通过 `/client-snapshot` 的 `ClientSnapshotReader` 取得 `clientCode/status/ssoEnabled/ssoConfig`；
`kind:absent` 只表示源行不存在或已删除，`ssoConfig:null` 是现存 Client 尚未配置协议。
`gate.acquire` 从同一实际普通 reader 裁剪到 `clientCode/status`，不要求配置或 SSO 启用，不另建 Gate payload。
认证 owner 只接收 `/client-snapshot/credentials` 的 `ClientCredentialReader`，返回当前 Secret、凭据 ID 和更新时间。
两个 reader 分别形成观察，不承诺同一个 PostgreSQL 时点。

#182 在同一敏感出口添加 `createClientSecretAuthenticator(reader).authenticate(clientCode, secret)`。
它每次通过敏感 reader 取得缓存观察，以固定长度摘要的 constant-time 比较验证 Secret；成功只返回 Client code、凭据 ID 和
更新时间，错误 Secret 或无凭据返回 null，缓存故障保持原暂态错误。该认证结果固定，不在后续交付时重新 acquisition；
协议 owner 仍负责适用的 Public/托管例外、入口解析及后续操作。该接口不把普通配置与认证提升为同一 PG 时点。

Admin 的 `createClientSnapshotRepository` 使用两项显式窄 SELECT；普通 SELECT 不读取 Secret 或 Internal 凭据。
敏感 SELECT 只读取新代凭据三列，规范化数据库时间到 ISO。模块对冷返回及 warm payload 都执行各自 schema，
额外源字段不会穿过普通输出，控制信息不返回消费者。新代协议 composition 可按相同 source port 注入自己的 repository。

`createClientSsoSnapshotManagement` 将 #180 正式管理 service、REST/tRPC adapter 与真实 Snapshot 失效能力装配在一起。
所有合法 mutation（含 no-op）沿原同行锁、事务审计与 required after-commit；成功失效同时清除普通/敏感 payload。
确认提交后传播失败仍返回 `ADMIN_MUTATION_COMMITTED`，Unknown COMMIT 保留原错误并尝试保守失效；不重放 mutation。
失败传播期间旧 payload 可继续被独立 reader 接受；页面刷新/修复提示仍由 #180 管理入口拥有。

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
#193 已装配 Worker `client-snapshot:repair/verify`、统一退出码及新进程核验，见[维护手册](../../releases/unified-session-maintenance.md)。
完整 verify 使用独立 scan-only capability；不能以 owner 连接测试或 CLI 成功代替真实环境停流、排空与放流验收。

## 行为证据与局部成本

API Core `client-snapshot.integration.test.ts` 经真实 Redis 验证冷/warm 输出、TTL、共同 single-flight、双 reader ABA/晚回填、
冲突重试及耗尽、坏 payload/control、连接故障、定向与全量恢复、部分失败重跑和非目标保留。
普通、Gate、敏感三入口分别覆盖 warm、负缓存、坏 payload 与坏 control：延迟原 Redis 返回，独立连接成功失效后发起新调用，
新调用独立完成并取得当前值，随后放行原在途观察；该矩阵补足仅阻塞 PG 回源不能覆盖的跨进程传播边界。
独立连接使用只允许 SCAN 的 Redis ACL 执行 verify，证明其不需要写权限。
Admin composition 的 `client-sso-snapshot.integration.test.ts` 经真实 PostgreSQL/Redis 验证实际管理写入、敏感投影、
committed-after-effect、实际提交后丢失确认及两个 reader 的晚到源读；真实 I/O 先 await 后同步断言。

2026-09-14 本地 Bun 1.3.14、仓库 Redis 8.8.0 镜像、独立 loopback 连接的采样如下：

| 观察范围 | 实际 socket 请求/响应交换 | source 读取 |
|---|---:|---:|
| 普通 cold（无 control/payload） | 2 | 1 |
| 普通 warm | 1 | 0 |

采样在连接握手与 PING 完成后清零；透明 TCP 代理只转发字节并记录两个方向的实际 data 事件，逐次 await acquisition，
无 pipeline 或并行命令。在该受控小 payload 样本中每次请求、响应各一个 chunk，断言冷 2/2、warm 1/1；
TCP 分片不是一般命令计数算法，不把任意网络中的 chunk 数自动等同 RTT。Secret 成本另计。
回源计数来自同次调用的 source 观察；PG 事务与窄 SELECT 另由真实组合测试证明。
#196 可复用相同采样窗口与字节方向观察，但必须重新测完整端点、串行波次及真实 PG 成本；这里不推导延迟收益。

实际完整验证命令与候选 SHA 保存于 #181 交接记录。代码候选不代表环境已切换；父 Spec 验收及环境部署保持独立责任边界。
