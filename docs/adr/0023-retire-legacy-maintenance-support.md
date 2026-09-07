---
status: accepted
---

# 退役旧代维护支持，保留当前完整性与恢复能力

本次设计统一退役旧版本兼容和迁移操作，保留当前版本的数据完整性检查、恢复与精确清理能力。旧目录中仍有价值的能力迁入当前职责目录，不因文件名含 legacy 或 cutover 而删除。维护者已于 2026-09-07 确认以下边界；本文记录已接受的修改目标：Profile/Employment 迁移、Client Runtime 恢复边界与 Session cleanup 退役已实现；不证明任何环境已完成升级或清理。

## Client Runtime

局部修订 [ADR-0021](0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) 与 [ADR-0022](0022-adopt-snapshot-consistency-for-client-traffic-gate.md) 的恢复支持范围：新候选的 full repair 与独立 verify 只拥有当前 Snapshot namespace，不再清理或验证旧 OIDC、Custom SSO 与 Traffic Gate Runtime namespace。旧部署或旧备份的升级迁移须另行安排，不能用新命令的成功报告证明旧 namespace 已清空。

保留 targeted repair、停流后的 full repair、独立 scan-only verify、部分失败可重跑、完整扫描后零目标 key 才通过的语义。在线 Snapshot acquisition、control generation、三类 payload 与协议 artifact 生命周期不变；namespace 中的 `v1` 是当前存储版本，不能因为名称而删除。

已移除七条旧 pattern，当前 pattern 由 `maintenance-inventory.ts` 拥有。公开 `client-runtime:repair` 和 `client-runtime:verify` 命令保持不变。测试改为证明当前 owner namespace 清空、非 owner key 保留、部分失败恢复及独立进程验证；不再将旧 namespace 的残留算作 verify 失败。

首次旧代 hard-cutover 手册在实施后保留为历史版本参考；当前日常恢复流程需保留独立 Current runbook。旧版工具不能未经评估直接对新环境执行，恢复迁移必须固定适用候选及操作边界。历史版本退役不意味着允许旧 reader/writer 与新候选混跑。

## Profile readiness 与 Employment verifier

Profile 的 PostgreSQL/Redis 双 gate 继续作为当前完整性检查和 Full-system E2E 的生产入口。将 `subject-projection-cutover.guards.ts` 中实际使用的正整数与分页完整性校验移入 `readiness/`，按 Profile inventory 命名，删除无调用的非负整数 helper。

保留 Employment 全库只读诊断，正式命名为 `employment:verify`，删除 `employment:cutover-verify` 入口且不保留兼容 alias。Package verifier/repository 迁入 `employment/`，Worker command、composition、env parser/type、公开 exports 与测试一并改名。继续使用 PostgreSQL-only composition 和只读一致 snapshot，不引入 Redis、queue 或自动修复。

诊断继续覆盖非法状态与期间、未来开始、Open/Ended 的时间边界、重复 Open 组合、多个 Primary Employment 和父对象完整性；Legacy Employment Tombstone 只计数，不推断结束时间。当前 Profile builder 的 fail-closed 守卫继续保留；它只证明其自身范围，不能宣称替代上述全库诊断。[ADR-0011](0011-model-employment-as-an-immutable-tenure-lifecycle.md) 的业务语义不变。

## Session cleanup

退役 `session:cleanup-custom-sso-cutover` 与 `session:cleanup-legacy-keys`、其 legacy implementation、CLI、公开 export 和专属测试。它们是旧迁移工具，allowlist 混有当前 OIDC key，又不覆盖完整当前登录状态，因此不改名为全量 reset，也不在本次新增全体登出或认证状态重置能力。

当前维护继续由 Session Kernel 撤销与 pending cleanup、OIDC cleanup adapters 和现有 `client-protocol:artifacts` 拥有。精确 artifact cleanup 保留 Principal Session，不能描述成旧工具的完整等价替代。旧环境迁移不再由本候选承诺。

移除专属 Redis harness、testing export、`IAM_API_CORE_CLEANUP_TEST_REDIS_URL` 及测试编排配置。API composition 大测试仅移除旧 cleanup 调用与专属断言，保留旧 bearer 拒绝、当前协议、Maintenance 和 Subject Access 行为验证。删除专属 SystemLogEvent 常量前核对消费闭包；它们属于运行日志，不纳入审计 action 数据迁移。

## 实施顺序与验收

以下切片由 [#88](https://github.com/cyy1998/shgas-iam/issues/88) 跟踪；Profile/Employment、Runtime 与 Session 切片已实施，审计切片状态以关联议题为准，不构成合入或部署授权：

1. 迁移 Profile guards 与 Employment verifier，验证既有诊断报告、只读数据库访问、命令退出码、双 readiness gate 和消费者类型兼容。
2. 收窄 Client Runtime inventory，同步恢复合同与手册，运行 Component、真实 Redis 和 Worker CLI process 验证。
3. 退役旧 Session cleanup，清理专属资源配置，运行受影响 API composition、当前 Kernel/OIDC 精确 cleanup 与测试编排测试，确认无连带删除。
4. 按 [#88 中的审计历史规范化决策](https://github.com/cyy1998/shgas-iam/issues/88) 交付迁移工具与别名退役；这是独立的数据前置条件，不能由前三项测试代替。

实现时同步命令入口、Worker README、repository map、backend/contracts/testing architecture、验证归属及涉及的 Current OIDC/SSO/发布手册。混合手册按章节区分当前能力与退役操作，不将仍有效的整篇文档直接标成历史。原有 Historical 和 `openspec/` 记录保持不变。

各切片运行受影响 workspace 的类型检查与行为测试；最终核对 Architecture Guard、Test Collection Guard、文档检查和 diff whitespace。资源测试使用任务独占资源，真实 I/O 先普通 await 再同步断言。设计阶段仅执行文档检查，不将静态调查记录成测试通过或真实环境验收。
