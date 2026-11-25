# @iam/client-snapshot

`@iam/client-snapshot` 拥有普通配置与凭据缓存。

- **普通配置读取**。一次普通读取固定 Client 状态、单协议配置和应用准入策略。普通 DTO 不含 Secret。
- **敏感凭据认证**。凭据由 `/credentials` 窄接口读取和认证，认证只交付身份。
- **依赖装配**。`/composition` 装配两个 reader、Gate 和统一失效，DB adapter 由各 app 注入。

[DB adapter](../../packages/db/src/client-snapshot.ts)

## 读取与失效

缓存缺失、损坏或普通配置缺少准入字段时回源，Redis 读取故障直接失败。同读取器、Client 和失效观察的回源合并。成功失效阻止旧请求回填及后续读取复用旧观察，
已接受 Snapshot 的请求仍可完成。发布与失效冲突至多重取一次，再冲突报告暂态失败。

## Admin 写入与恢复

Admin 写入提交后统一失效普通与凭据缓存。合法配置、启停等 no-op 仍审计并执行 required 失效，InternalAuthz 缓存自行失效。
传播失败报告已提交，COMMIT 未知时保留原错误并保守失效。SSO Secret 重读只读并记审计，配置、启停和轮换均不自动撤销会话。

`/maintenance` 的 repair 与独立 verify 只处理当前 owner 的目标库存，保留其他布局与未知键族。Redis 备份恢复后须停流排空、全量修复并独立核验。
[Snapshot 修复](../../docs/releases/authentication-and-session.md#client-snapshot-修复) · [并发测试](test-integration/client-snapshot/client-snapshot.integration.test.ts)

## 通用 Client 缓存

`/generic-cache` 保留 `cache:client:code:*` 与 `cache:client:secret:*` 的键和 DTO 表示。消费方注入数据源、DTO schema 和 Redis。任一键查找未命中时回源，
只为存在的 Client 同时回填两键。载荷损坏或查找身份不符时清理所读的键并回源。

Admin 在事务提交后同时失效受影响的新旧键。失效与回填共用同一 Redis 代际，使进行中的旧读取无法重新发布。跨越失效的回填最多重读一次。
传播失败仍按 Admin 已提交错误处理。COMMIT 结果未知时也尝试失效相关键，并保留原数据库错误。
定向修复应重新失效原写入涉及的键，轮换时需要原 Secret 对应的键。
`/maintenance` 的 Snapshot 修复范围仅包含协议缓存。
