# @iam/client-snapshot

`@iam/client-snapshot` 拥有普通配置与凭据缓存。

- **普通配置读取**。一次普通读取固定 Client 状态、单协议配置和应用准入策略。普通 DTO 不含 Secret。
- **敏感凭据认证**。凭据由 `/credentials` 窄接口读取和认证，认证只交付身份。
- **依赖装配**。`/composition` 装配两个 reader、Gate 和统一失效，DB adapter 由各 app 注入。

[DB adapter](../../packages/db/src/client-snapshot.ts)

## 读取与失效

当缓存缺失、损坏或普通配置缺少准入字段时回源查询数据库，Redis 读取故障则直接失败。同一读取器、同一 Client 在相同缓存代际下的并发回源请求会自动合并。缓存成功失效后，会阻止在途的旧回源结果写回，并阻止后续读取继续复用旧版本；已取得 Snapshot 的在途请求仍可完成。回填与失效冲突时最多重读一次，再次冲突则报告暂态失败。

## Admin 写入与恢复

Admin 写入提交后统一失效普通配置与凭据缓存。合法的无变更配置保存或启停（no-op）仍会记录审计并执行必需的缓存失效，InternalAuthz 缓存自行失效。
缓存同步失败按“数据库已提交”报告；事务 COMMIT 结果未知时保留原错误并保守失效相关缓存。SSO Secret 重读为只读操作并记录审计；配置修改、启停和凭据轮换均不自动撤销会话。

`/maintenance` 的 `repair` 与独立 `verify` 只处理当前 owner 管辖的缓存键，保留其他布局与未知键族。定向修复仅覆盖协议缓存；遇到 Redis 备份恢复或通用缓存影响范围未知时，须按[Snapshot 修复](../../docs/releases/authentication-and-session.md#client-snapshot-修复)停流排空、全量修复两类缓存并独立核验。
[并发测试](test-integration/client-snapshot/client-snapshot.integration.test.ts)

## 通用 Client 缓存

`/generic-cache` 保留 `cache:client:code:*` 与 `cache:client:secret:*` 的键和 DTO 表示。消费方注入数据源、DTO schema 和 Redis。任一键未命中时回源，
仅在 Client 存在时同时回填两键；载荷损坏或查找身份不符时清理所读的键并回源。

Admin 在事务提交后同时失效受影响的新旧键。失效与回填共用同一 Redis 代际，防止进行中的旧读取重新写回旧数据；跨越失效的回填最多重读一次。
缓存同步失败按 Admin 已提交错误处理；COMMIT 结果未知时也保守失效相关键并保留原数据库错误。
通用缓存传播失败或影响范围未知时，按上述全量修复流程处理；轮换后的旧 Secret 键没有 TTL。
[缓存恢复步骤](../../docs/releases/authentication-and-session.md#client-snapshot-修复)
