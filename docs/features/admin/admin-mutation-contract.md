# Admin 写入结果与失败恢复

Admin 业务 mutation 返回 `{ changed, result }`；REST 放入现有 envelope 的 data，tRPC 直接返回。
本页拥有调用方可观察的结果及恢复语义；事务与锁序见
[Admin 同对象写入规范](../../architecture/backend-architecture.md#admin-同对象写入规范)、
[Transactions 与 afterCommit](../../architecture/backend-architecture.md#transactions-与-aftercommit)。
决策理由见 [ADR-0025](../../adr/0025-align-admin-mutation-results-with-committed-facts.md)。

## 成功、无变化与领域拒绝

| 操作 | 结果 |
|---|---|
| 创建、Transfer | 保留该操作约定的新资源或资源 ID。 |
| 密码生成/重置 | result 保留明确授权的一次性生成结果，密码哈希不进入响应或审计。 |
| 普通无资源命令 | result 为 null。 |
| 会话管理 | 保留两类实际终止计数、原批次未完成结果与安全摘要。 |
| 解除登录限制 | result.failureStateCleared 表达原子清理完成，changed 只表示有效限制变化。 |

空资料更新返回 400，普通缺失和重复删除返回 404，非法生命周期转换或已知唯一冲突返回 409；
Client 显式删除允许重试其残余会话作用的例外见[会话管理](session-management.md)。
授权与范围判断先于可公开的存在性、冲突信息。

普通同值资料不记变更审计或 dirty；显式生命周期、安全、授权意图的合法 no-op 保留 changed:false 意图审计。
同态命令不改写历史时间，非法转换不伪装成幂等成功。
Internal 委托保持其独立详情/boolean 协议，不套 Admin wire。

## 已提交、未知与作用后失败

| 情况 | 调用方语义 |
|---|---|
| 确认业务已提交，required after-commit/lifecycle 失败 | `ADMIN_MUTATION_COMMITTED`；不能声称数据库回滚，也不能自动重放业务写入。 |
| COMMIT 结果不确定 | 保留未知错误及 owner 的保守处理，不改称成功提交或确定回滚。 |
| Redis 会话/限制作用后审计失败 | `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`；作用可能已发生，读取确认且显式修复。 |

页面读取已提交详情并持续显示修复提示；读取成功不证明缓存传播或审计恢复。
生成密码未交付时先修复再主动重置。**SSO Secret 是独立例外**：
生成/轮换只返回安全结果，管理员可经授权且成功提交审计的窄读取取得当前原文；
读取响应丢失可主动重读，不需要再次轮换。未确认读取审计时不交付原文，
详见[Client 配置](client-sso-configuration.md)。

会话未知作用不计入成功数量，即使 changed 和确认终止数为零，也不能把 unknown-only 当成“没有可能作用”。
本人改密的密码提交与后续会话处理分开报告，见[会话管理](session-management.md)。

## 验证与消费者切换

验证须区分领域拒绝/no-op、确认提交后失败、未知 COMMIT、Redis 作用后审计失败及页面不自动重放，
并按实际副作用选择资源通道，见[架构验证归属](../../architecture/architecture-verification.md)。
前后端、REST 与外部消费者的首次切换记录见[历史结果契约切换](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/admin-mutation-contract-cutover.md)。
本页不维护全库命令数量或固定候选验收表。
