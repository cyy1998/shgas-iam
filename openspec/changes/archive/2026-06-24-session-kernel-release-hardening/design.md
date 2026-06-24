## Context

Session Kernel 已经在 `packages/api-core/src/session/kernel` 提供 lifecycle object、HMAC lookup、tombstone、索引、revoke summary 和 cleanup adapter；`apps/api`、`apps/admin-api`、`apps/oidc-provider` 也已经接入各自的 adapter 或 revocation port。当前剩余风险集中在发布边界：

- 三个后端 app 都解析 Session Kernel env，但生产必填、previous key 成对校验、idle/absolute TTL 默认值和 byte 长度校验还没有统一入口。
- OIDC 文档仍沿用早期 `global_session` envelope 迁移说明，未完整覆盖 `sess:v2:`、custom SSO legacy key、OIDC runtime/index key 和强制重新登录。
- 系统日志已有基础事件和 admin revoke summary，但 release hardening 需要把 legacy bearer、cleanup failure、schema corrupted、tombstone replay、cleanup dry-run/apply 统一成可检索且不泄密的事件合同。
- 架构测试已经覆盖部分 legacy custom SSO key 和 OIDC raw Kernel key，但还需要跨 API、admin-api、OIDC provider 验证 adapter 不能绕过 Kernel lifecycle API。
- umbrella 最终归档需要一份可复核的 smoke 记录，证明 custom SSO、OIDC、admin revoke 和 Redis cleanup 在开发环境都走过。

## Goals / Non-Goals

**Goals:**

- 统一 Session Kernel 配置解析与生产校验，确保 API、admin-api、OIDC provider 使用相同 namespace、TTL、HMAC rotation 规则。
- 提供可 dry-run 的旧 Redis key 清理方案，并把必须停止登录流量、清理旧 key、强制重新登录和回滚前清理写入 runbook。
- 补齐 Session Kernel 发布相关系统日志事件、字段和敏感数据测试，使运维能按 event、sourceApp、clientCode、targetUserId、reason 和 cleanup counters 查询。
- 加强架构测试，阻止协议 adapter、admin service 或 route handler 直接拼接 `sess:v2:` lifecycle key、legacy custom SSO authority key 或旧 OIDC token index。
- 产出最终 smoke checklist，记录 narrow validation 命令和手工/半自动流程结果。

**Non-Goals:**

- 不重新设计 Session Kernel lifecycle model、Redis schema、token 前缀或 revoke cascade 语义。
- 不引入 PostgreSQL session 表、后台 worker 或新外部依赖。
- 不改变 custom SSO、OIDC、admin REST/tRPC 的外部 API 契约。
- 不实现在线会话管理 UI、设备管理、MFA 或 client protocol config 表迁移。
- 不把生产 Redis 清理做成自动启动任务；清理必须由维护窗口内显式运行或按 runbook 执行。

## Decisions

### 1. 用共享 helper 统一 Session Kernel env 到 config 映射

在 `packages/api-core/src/session/kernel` 或相邻 config helper 中提供从 env-like input 构造 `SessionKernelConfigInput` 的纯函数，并复用现有 `createSessionKernelConfig` 做最终校验。各 app 的 `env.ts` 继续声明 app-local env schema，但只负责读取字符串/秒数；composition 使用共享 helper 生成 Kernel config。

选择原因：`createSessionKernelConfig` 已经校验 namespace、HMAC secret byte length、current/previous key id 与 secret 冲突。把秒到毫秒、默认 TTL、previous key 成对逻辑集中到共享 helper，可以避免三个 app 继续手写相似规则。

备选方案：只复制修正三个 `env.ts` 的 `superRefine`。这个方案改动更少，但后续新增 app 或 TTL 字段时容易再次漂移。

### 2. 清理旧 Redis key 采用 dry-run first 的脚本加 runbook

新增仓库脚本或 package script，按 allowlist pattern 扫描旧 key，并支持 `--dry-run`、`--apply`、`--batch-size` 和连接参数复用现有 Redis env。清理范围只覆盖已明确废弃的 session/runtime key：

- custom SSO/global legacy：`global_session:*`、`auth_code:*`、`local_*_session:*`、`local_session_reverse:*`、`local_session_set:*`
- 旧 OIDC runtime/index：早期 provider session、return handle、authorization code、token payload、user/client token index 等文档明确列出的 namespace

脚本输出只包含 pattern、matched count、deleted count、duration 和错误摘要，不输出 key 中可能包含的 token 明文。runbook 要求维护窗口内停止 login、authorize、callback、token、UserInfo 和 refresh/renewal 流量，dry-run 为 0 或 apply 成功后再部署新版本。

备选方案：只写人工 `SCAN`/`UNLINK` 命令。人工命令透明但不可测试，也更容易在压力下漏掉 namespace 或把明文 key 带入日志。

### 3. 系统日志事件统一放在 `SystemLogEvent`

新增或补齐稳定事件名，例如：

- `session_kernel.cleanup_legacy_keys.completed`
- `session_kernel.cleanup_legacy_keys.failed`
- `session_kernel.schema_corrupted`
- `session_kernel.tombstone_replay.detected`
- `session_kernel.revoke.cleanup_failed`
- `sso.legacy_bearer_source.used`
- `admin.session_revoke.*`

日志字段使用低敏摘要：`sourceApp`、`requestId`、`traceId`、`clientCode`、`protocol`、`reason`、`objectType`、`result`、`summary counters`、`cleanup counters`、`patternCounts`。日志和测试都必须证明不会输出 external token、Authorization、Cookie、clientSecret、OIDC code/verifier、private payload 或完整 Redis key。

备选方案：让各 adapter 使用自由文本 logger。自由文本实现快，但不利于 Loki/Grafana 查询，也容易遗漏脱敏测试。

### 4. 架构测试按边界约束，而不是按文件名死锁实现

API 侧继续禁止 custom SSO runtime 写 legacy authority key；OIDC 侧禁止业务/adapter 直接拼接 `sess:v2:` lifecycle key；admin-api 侧继续要求 user/client service 只能通过 Session Revocation port 撤销。新增检查应允许 Kernel 内部 key builder、测试 fixtures、env/default 文本和 release cleanup 脚本中的 allowlist pattern。

选择原因：发布硬化要防止回退到旧 Redis key 或绕过 tombstone-first，但不能阻止 runbook/cleanup 脚本识别旧 key，也不能把 Kernel 内部实现细节暴露给 app。

备选方案：仅依赖 code review。code review 对这类字符串回退不够稳定，尤其后续补丁容易绕过。

### 5. smoke 记录作为 feature 分支最终门禁

在 docs 或 OpenSpec change artifacts 中记录 smoke 结果，至少包含：

- custom SSO 登录、`/sso/authorize`、`/sso/callback` 或 `/sso/token`、`/auth/authz`、`/sso/logout`
- OIDC Discovery/JWKS、authorize、token、UserInfo、authorization code replay、RP-Initiated Logout
- admin 用户禁用/密码重置、client 禁用或协议配置变化触发 revoke
- Redis cleanup dry-run/apply 输出摘要
- 相关 `pnpm --filter` test/typecheck/lint 结果

选择原因：这个 change 是 umbrella 的最后一个 child，验收不只是代码通过，还要证明发布路径、回滚路径和跨协议用户态可被操作。

## Risks / Trade-offs

- [Risk] Redis cleanup pattern 误删非 session key → Mitigation：只允许显式 allowlist pattern，默认 dry-run，apply 前显示 pattern/count 摘要，脚本不接受任意 glob 删除。
- [Risk] HMAC current/previous 配置不一致导致全部 session 失效 → Mitigation：共享 helper + app env tests 覆盖缺失 current、previous 成对、id 冲突、secret 冲突和生产默认值拒绝。
- [Risk] 日志为了可观测性泄露 token 或 Redis key → Mitigation：使用摘要字段、logger redact paths 和单元测试断言敏感字符串不出现。
- [Risk] 架构测试误伤 cleanup 脚本或文档中的 legacy key pattern → Mitigation：测试区分 runtime source 与 release tooling/docs，只约束生产 adapter、service、handler 边界。
- [Risk] smoke 依赖本地环境服务不稳定 → Mitigation：任务拆分为自动命令与手工 smoke 两部分，记录未执行原因和替代证据，但归档前必须补齐关键路径。

## Migration Plan

1. 在 `work/session-kernel-release-hardening` 上完成配置 helper、env tests、日志事件、架构测试、cleanup tooling 和文档更新。
2. 运行受影响 package/app 的 test/typecheck/lint，先验证共享 helper和架构测试，再验证 API/admin-api/OIDC provider。
3. 在开发环境执行 Redis cleanup dry-run，确认旧 key pattern 覆盖正确且不输出明文 key。
4. 维护窗口发布时停止 login、authorize、callback、token、UserInfo 和 session refresh/renewal 流量。
5. 运行 cleanup apply，确认旧 key namespace 清零。
6. 同步部署 API、admin-api、SSO Portal、OIDC provider 和 gateway 配置，恢复登录流量。
7. 执行 custom SSO、OIDC、admin revoke smoke，并记录结果。

Rollback：

1. 如果需要回滚到旧 session 版本，先再次停止登录和协议流量。
2. 清理 `sess:v2:` 相关 active/lookup/revoked/index key 以及新版本 OIDC/custom SSO 私有 payload key，避免新 session 被旧代码误读或残留。
3. 恢复旧应用镜像和 gateway 配置后，再清理旧版本目标 namespace，确保只存在当前运行版本能理解的 session key。
4. 回滚后要求用户重新登录，并观察 API、admin-api、OIDC provider 与 APISIX 错误日志。

## Open Questions

- 旧 OIDC runtime/index key 的最终 allowlist 需要以当前 `apps/oidc-provider` storage/adapter 实现和历史发布版本为准，在实现时复核并写入 runbook。
- smoke 记录放在 `docs/releases/` 还是 umbrella OpenSpec 任务备注中，需要在实现阶段选择一个最终位置，避免验收证据分散。
