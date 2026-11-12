# @iam/client-snapshot

`@iam/client-snapshot` 拥有普通配置与凭据缓存。一次普通读取固定 Client 状态和单协议配置，凭据由 `/credentials` 窄接口读取和认证，
普通 DTO 不含 Secret，认证只交付身份。`/composition` 装配两个 reader、Gate 和统一失效，DB adapter 由各 app 注入。
[DB adapter](../../packages/db/src/client-snapshot.ts)

## 读取与失效

缓存缺失或损坏才回源，Redis 读取故障直接失败。同读取器、Client 和失效观察的回源合并。成功失效阻止旧请求回填及后续读取复用旧观察，
已接受 Snapshot 的请求仍可完成。发布与失效冲突至多重取一次，再冲突报告暂态失败。

## Admin 写入与恢复

Admin 写入提交后统一失效普通与凭据缓存。合法配置、启停等 no-op 仍审计并执行 required 失效，InternalAuthz 缓存自行失效。
传播失败报告已提交，COMMIT 未知时保留原错误并保守失效。SSO Secret 重读只读并记审计，配置、启停和轮换均不自动撤销会话。

`/maintenance` 的 repair 与独立 verify 只处理当前 owner 的目标库存，保留其他布局与未知键族。Redis 备份恢复后须停流排空、全量修复并独立核验。
[Snapshot 修复](../../docs/releases/authentication-and-session.md#client-snapshot-修复) · [并发测试](test-integration/client-snapshot/client-snapshot.integration.test.ts)
