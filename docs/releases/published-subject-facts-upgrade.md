# 已发布主体事实读取的保留对象升级

> 本文保留对象流程只适用于原规格单独升级。包含 Spec #163 / ADR-0033 的候选必须优先执行[全体在线状态下线](online-auth-redis-time-cutover.md)：停旧 writer、排空、四 owner 清理及新进程 verify 后统一版本并重新登录，不保留旧 Credential。原规格证据仍保留其历史适用范围，环境未切换。

适用于 [ADR-0032](../adr/0032-consume-published-subject-facts-for-authorization.md) / #156 的读取一致性调整。
本流程尚未在目标环境执行；代码行为证据见[契约](../features/sso/published-subject-facts-contract.md)。

## 适用前提

源环境已使用当前 Subject Facts v3、Catalog/Custom SSO Wire/OIDC Snapshot V2 和当前在线认证格式。
本次字段、披露范围与协议 epoch 不变，Worker publisher 及数据库 schema 不迁移。旧格式环境须先完成自身适用升级，
不能借本流程跳过旧数据门禁。发布负责人确认第三方已知已发布权限可能落后，刷新仍由第三方负责。

## 执行顺序

1. 固定已验收候选与回退候选，记录受影响 API、OIDC 实例及相关配置。准备双方各一组有效根会话、
   Credential/Access Token，以及未过期未消费的 Code；记录对应 Client 配置版本和预期主体/权限。
   敏感凭据只留在受控测试会话中，不写日志或提交到仓库。
2. 暂停受影响协议入口并排空在途操作，冻结验证所用账号、Client 与权限变更，避免把业务变更误判成升级影响。
   保留 PostgreSQL、Redis 和 Worker 发布数据，不清缓存、不推进 epoch，也不调用旧 Catalog 或会话全清命令。
3. 将全部受影响 API 与 OIDC 实例统一升级到同一候选，检查 readiness；不以新旧请求偶然都成功证明语义已统一。
4. 受控 smoke 核验已有根会话和有效 Credential/Token 可用，未过期旧 Code 按原规则仅可消费一次；
   OIDC 原 Snapshot 保持原内容。对测试主体发布新 Facts 后，同一 Custom SSO Credential 取得新权限，
   OIDC 原 Token 保留旧权限，新授权取得新权限；继续核验账号禁用与跨 Client 裁剪。
5. 对照保留集和 Client 版本，确认没有非预期失效或版本变化，再恢复入口和冻结的业务写入，记录实际结果。
   自然过期、已消费或明确撤销的对象不属于应保持可用的对象。

## 失败与回退

任何必要核验失败都保持停流，保留数据和诊断，修复后重新核验。由于格式不变，可在排空后统一回退到已记录的原候选，
但旧候选会恢复请求时 freshness 拒绝，不能继续承诺新行为。回退不会追溯撤回已交付给第三方的权限或改写 OIDC Snapshot，
不删除在线状态来掩盖问题。修复/回退完成后重新执行适用 smoke 才能放流。
