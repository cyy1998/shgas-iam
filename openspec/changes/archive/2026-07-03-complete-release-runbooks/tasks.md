## 1. 盘点与分类

- [x] 1.1 盘点 `docs/releases/*.md`、`docs/index.md`、相关 `docs/features/`、`gateway/README.md` 和 OpenSpec specs，确认每份 release 文档的事实来源。
- [x] 1.2 为现有 release 文档确认目标类型：可复用 `runbook` 或历史 `release-record`。
- [x] 1.3 确认新增 release 手册文件名、索引类型、状态、`Last verified` 和 `Next review` 取值。

## 2. 补强现有 release 文档

- [x] 2.1 将 `docs/releases/user-profile-dirty-queue-release.md` 改为中文 runbook，并补齐 worker 停启、migration、旧 job 清理、repair/backfill、health、Bull Board、`dirtyVersion` 日志、回滚和恢复。
- [x] 2.2 将 `docs/releases/sm-encrypted-password-login-release.md` 补成中文 runbook，覆盖 API/SSO 同步发布、SM2/SM4 key、`kid`、nonce、防重放、Cap 重试、legacy 明文拒绝、错误码、日志检查和 rollback matrix。
- [x] 2.3 更新 `docs/releases/observability-system-logs.md`，补充 APISIX OpenTelemetry、Alloy OTLP receiver、trace 字段、gateway/backend/audit trace smoke 和证据留存。
- [x] 2.4 更新 `docs/releases/oidc-release-runbook.md`，补充 JWK rotation、Session Kernel HMAC lookup rotation、逐 client 启用矩阵和证据记录模板。
- [x] 2.5 将 `docs/releases/session-kernel-release-smoke.md` 中文化为 historical release record，并补充或新增可复用 Session Kernel release smoke 模板入口。

## 3. 新增缺失 release 手册

- [x] 3.1 新增角色分配统一与角色管理 release 手册，覆盖 `role_assignment` migration、旧三表 backfill/删除、角色聚合一致性、admin `/roles` 页面 smoke、user-profile dirty 验收和回滚边界。
- [x] 3.2 新增 APISIX gateway release 手册，覆盖 validate、diff、apply、dry-run、prune、生产 env、真实 IP/限流、多节点策略、OpenTelemetry/Alloy 交接和 Git 回滚。
- [x] 3.3 新增统一审计日志与 `login_log` 退役 release 手册，覆盖迁移 dry-run/apply、pending=0、删除 legacy table 前置条件、审计查询 smoke、敏感字段检查和回滚窗口。

## 4. 索引与语言一致性

- [x] 4.1 同步 `docs/index.md`，确保所有 `docs/releases/*.md` 均被索引且 type/status/review 信息正确。
- [x] 4.2 检查 `docs/releases/*.md` 正文语言为简体中文，命令、路径、环境变量、日志 event、API endpoint 和产品名保持原样。
- [x] 4.3 抽查新增和更新手册中的链接、相对路径、命令和配置项，确保没有中文化误改可执行内容。

## 5. 验证

- [x] 5.1 运行 `pnpm check:docs` 并记录结果。
- [x] 5.2 运行 `openspec status --change "complete-release-runbooks"`，确认 proposal、design、specs 和 tasks 状态可追踪。
- [x] 5.3 如文档检查失败或有无法验证的引用，在 `tasks.md` 或实现总结中记录原因和后续处理。
