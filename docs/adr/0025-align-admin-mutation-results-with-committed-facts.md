---
status: accepted
---

# 使 Admin 写入结果与已提交事实一致

Admin PostgreSQL 同对象写入由一个 UnitOfWork 持有事务，锁定选中的现存对象后比较业务变化，提交事实、审计与文档 Outbox。
统一采用同行锁，以免各领域分别维护 CAS miss、重读与 fallback。创建竞争由实际数据库约束裁决。
公开 `{ changed, result }` 表达业务变化，数据库受影响行数只用于检查持久化结果。

## 并发与无变化

普通资料按已提交的修改字段覆盖，接受后保存者覆盖同一字段。生命周期与 Secret 等关联状态使用锁定后的事实。
公共模块统一事务与结果，领域仍须明确合法转换、比较规则和锁序。
同行锁只保护选中行，跨表父条件、Primary、空槽及请求时 HR 范围继续使用各自校验，保留跨对象并发窗口。
Internal 委托的协调锁由 [ADR-0020](0020-provide-fail-closed-privilege-delegation-resolution.md#按委托人协调写入) 拥有。

显式生命周期、安全或授权命令保留 no-op 意图审计，普通同值资料无需写变更审计或文档 Outbox。
这个区分保留操作者的安全意图，同时避免把重复资料提交解释为真实变化。
同态保留历史时间，领域非法转换仍明确拒绝。传播与残余会话处理按各 owner 契约判断。

## 提交与恢复

选择分别报告已提交后作用失败、COMMIT 未知与 Redis 作用后审计失败。
调用方据此重读事实并修复剩余作用，避免因错误响应自动重放已发生的业务写入。
一次性密码未交付时按重置流程处理。SSO Secret 具有独立审计读取能力，响应丢失可重读。
[会话与凭据决定](0035-unify-user-and-client-session-lifecycles.md#配置维护与凭据)

[事务与锁序](../engineering/backend-architecture.md#admin-同对象写入规范) · [响应与失败恢复](../engineering/backend-architecture.md#admin-写入结果与失败恢复) ·
[历史消费者切换](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/admin-mutation-contract-cutover.md)

历史来源：[ADR-0025 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0025-align-admin-mutation-results-with-committed-facts.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。

固定历史版本：[整理前 ADR-0025](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0025-align-admin-mutation-results-with-committed-facts.md)。
