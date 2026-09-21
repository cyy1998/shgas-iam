---
status: accepted
---

# 使 Admin 写入结果与已提交事实一致

Admin PostgreSQL 同对象写入在同一 UnitOfWork 内锁定当前目标，再判断前提和业务变化、写入并登记审计及 Profile dirty。
成功业务结果使用 `{ changed, result }`，让调用方区分真实变化与合法 no-op；不把 SQL affected count 当作业务变化。

## 理由与并发边界

统一同行锁，避免各领域同时维护 CAS miss、重读与 fallback 等不同的同对象策略。
锁定拟修改的现存目标及选中级联行；尚不存在的对象由已知数据库唯一约束裁决冲突，查询不存在行不等于锁住空槽。
创建冲突按具体约束映射，不能把全部数据库异常都转成同一业务错误。

普通资料编辑不增加页面版本检查，后保存者可覆盖其明确提交字段；生命周期和 Secret 等关联状态来自锁定后的事实。
公共模块只统一事务与结果，不猜测领域合法转换或业务值相等。代价是显式维护各命令的变化、意图与锁顺序。

同行锁不等于全局锁、跨表强一致或 phantom 防护，不提升跨记录 Primary、只读父条件或请求时 HR 授权保证。
Redis 原子操作、Snapshot 和 Profile publication 的 CAS 继续独立；Internal 委托协调锁由
[ADR-0020](0020-provide-fail-closed-privilege-delegation-resolution.md#按委托人协调写入) 拥有。

## 无变化、已提交与恢复

显式生命周期、安全和授权命令保留 no-op 的意图审计；普通同值资料不写变更审计或 Dirty。
同态不改写历史时间，非法转换不伪装成幂等成功；无变化也不统一取消 owner 规定的 Snapshot 失效或遗留会话处理。

明确数据库已提交而 required 后续作用失败时，必须告诉调用方业务已生效、尚需修复；未知 COMMIT 仍保持未知，
不能改称回滚或成功。页面可以重新读取确认，但不能自动重放写请求；读到新详情不证明缓存或审计传播已经恢复。
Redis 作用后审计失败也不能包装为“没有发生作用”。

生成密码是一次性交付，未交付时先修复再主动重置。当前 SSO Secret 则可经独立授权及成功提交读取审计后获取原文，
读取响应丢失可以主动重读，不要求再次轮换。该后续修订取代旧“所有凭据都无法补领”的描述；
原文不进入普通详情、日志或审计正文。

## 当前契约与历史

结果、领域拒绝及页面恢复见[Admin 写入契约](../features/admin/admin-mutation-contract.md)，
事务与锁序见[后端架构](../architecture/backend-architecture.md#admin-同对象写入规范)，
Secret 边界见[Client 配置](../features/admin/client-sso-configuration.md)。
历史消费者切换与调用方协调见
[固定版本流程](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/admin-mutation-contract-cutover.md)，
不据本次整理推定环境已切换。

历史来源：[ADR-0025 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0025-align-admin-mutation-results-with-committed-facts.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。
