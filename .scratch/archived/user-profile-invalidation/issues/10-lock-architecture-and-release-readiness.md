# 10 — 锁定架构边界与发布准备度

**What to build:** 用架构守卫、真实 process smoke 和 Current 文档固定最终 composition，并提供可执行的旧队列排空与 worker-last 发布门禁。

**Blocked by:** 09 — 彻底退役 ExpandUserProfileScope 协议

**Status:** resolved

- [x] 架构守卫禁止业务代码导入 dirty reason、已退役 scope 类型、原始 projection repository、旧 marker 或 job producer。
- [x] 架构测试证明旧 marker 调用、scope job schema、producer 和 worker consumer 在 production exports 中全部归零。
- [x] API process smoke 继续通过真实 Bun entry、环境解析、production composition 和 OpenAPI readiness。
- [x] Admin API 具有同等资源模型的真实 entry smoke，使用唯一端口、独立临时目录、最小环境、不可达外部依赖和 `/admin/doc` readiness probe。
- [x] 后端架构文档说明 `UserProfileInvalidation` seam、transaction lifecycle 注入和 composition ownership。
- [x] 测试架构文档说明 Admin API process-smoke adoption 与本 feature 的公开测试 seam。
- [x] 发布手册要求先停止并证明所有 producer 已停止，再检查 waiting、delayed、active、failed 和 repeatable 旧 job，最后按 API、Admin API、worker 顺序发布。
- [x] 发布手册明确无法证明旧队列为空时阻止新 worker 发布，且不把生产队列清理或部署纳入本地实现动作。
- [x] 相关 package/app 聚焦测试、lint、typecheck、API/Admin process smoke、`pnpm check:docs` 与 `git diff --check` 全部通过。
