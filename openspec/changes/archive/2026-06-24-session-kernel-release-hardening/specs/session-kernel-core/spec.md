## ADDED Requirements

### Requirement: Session Kernel 发布配置必须跨 app 一致
系统 SHALL 为 `apps/api`、`apps/admin-api` 和 `apps/oidc-provider` 使用一致的 Session Kernel 配置规则，并 SHALL 在生产环境对无法稳定 lookup 的配置 fail closed。

#### Scenario: app 使用同一配置映射规则
- **WHEN** 后端 app 从 env 构造 Session Kernel runtime config
- **THEN** namespace、principal idle TTL、principal absolute TTL、tombstone TTL、tombstone grace、current HMAC key 和 previous HMAC key SHALL 使用同一套映射规则
- **AND** 秒级 env 值 SHALL 在进入 Kernel 前转换为毫秒级 config
- **AND** app composition SHALL NOT 手写与共享映射规则冲突的 TTL 或 HMAC 结构

#### Scenario: 生产环境缺少 current HMAC secret
- **WHEN** `NODE_ENV=production` 且未显式配置 `SESSION_LOOKUP_HMAC_CURRENT_SECRET`
- **THEN** app env validation SHALL fail closed
- **AND** app SHALL NOT 以开发默认 secret 启动

#### Scenario: previous HMAC key 配置不成对
- **WHEN** 只配置 `SESSION_LOOKUP_HMAC_PREVIOUS_ID` 或只配置 `SESSION_LOOKUP_HMAC_PREVIOUS_SECRET`
- **THEN** app env validation SHALL fail closed
- **AND** 错误 SHALL 指向缺失的 previous key 配置

#### Scenario: HMAC rotation 配置冲突
- **WHEN** current 与 previous HMAC key id 相同，或 current 与 previous HMAC secret 相同
- **THEN** Session Kernel config creation SHALL fail closed
- **AND** app SHALL NOT 创建可能导致 lookup ambiguity 的 Kernel runtime

### Requirement: 旧 Redis session key 清理必须是发布门禁
系统 SHALL 提供发布前清理旧 Session/SSO/OIDC Redis key 的可验证流程，并 SHALL 避免在清理输出中泄露 bearer token 明文。

#### Scenario: cleanup dry-run 统计旧 key
- **WHEN** 运维在维护窗口前运行旧 Redis key cleanup dry-run
- **THEN** 工具或 runbook SHALL 覆盖 `global_session:*`、`auth_code:*`、`local_*_session:*`、`local_session_reverse:*`、`local_session_set:*` 和旧 OIDC runtime/index key
- **AND** 输出 SHALL 包含每个 allowlist pattern 的匹配数量
- **AND** 输出 MUST NOT 包含完整 Redis key、session token、authorization code、access token 或 cookie 值

#### Scenario: cleanup apply 删除旧 key
- **WHEN** 登录、authorize、callback、token、UserInfo 和 session refresh/renewal 流量已停止，且操作者显式运行 cleanup apply
- **THEN** 系统 SHALL 删除 allowlist pattern 匹配的旧 session key
- **AND** 删除完成后 SHALL 能再次 dry-run 验证旧 key count 为 0
- **AND** 发布说明 SHALL 要求所有用户重新登录

#### Scenario: cleanup pattern 受限
- **WHEN** cleanup 工具执行 apply
- **THEN** 工具 SHALL 只允许仓库内声明的旧 session allowlist pattern
- **AND** 工具 MUST NOT 接受任意外部 glob 或 prefix 作为删除目标

#### Scenario: 回滚跨越 Session Kernel 版本边界
- **WHEN** 发布需要回滚到不理解 `sess:v2:` 的旧版本
- **THEN** 回滚 runbook SHALL 要求先停止登录和协议流量
- **AND** runbook SHALL 要求清理新版本 Session Kernel active、lookup、revoked、index key 和 adapter 私有 payload key
- **AND** 回滚后用户 SHALL 被要求重新登录

### Requirement: Session Kernel runtime 边界必须有架构守卫
系统 SHALL 通过架构测试防止 app runtime 绕过 Session Kernel public API 直接管理 lifecycle key、lookup、tombstone 或旧 authority key。

#### Scenario: custom SSO runtime 不写旧 authority key
- **WHEN** 执行 `@iam/api` 架构测试
- **THEN** custom SSO runtime、route handler 和 adapter SHALL NOT 直接拼接或写入 `global_session:*`、`auth_code:*`、`local_*_session:*`、`local_session_reverse:*` 或 `local_session_set:*` 作为权威 session key
- **AND** release cleanup tooling 或文档中的 allowlist pattern MAY 被测试排除

#### Scenario: OIDC runtime 不绕过 Kernel lifecycle key builder
- **WHEN** 执行 `@iam/oidc-provider` 架构测试
- **THEN** OIDC provider runtime、adapter、storage 和 interaction code SHALL NOT 直接拼接 `sess:v2:` active、lookup、revoked 或 index key
- **AND** 只有 Session Kernel 内部 key builder、测试 fixture、env 默认值和 release cleanup tooling MAY 包含这些 key pattern

#### Scenario: admin service 只通过 revocation port 撤销会话
- **WHEN** 执行 `@iam/admin-api` 架构测试
- **THEN** user 和 client service SHALL 只通过 Session Revocation port 请求 Session Kernel 撤销
- **AND** 它们 SHALL NOT 直接 import Session Kernel key builder、custom SSO adapter、OIDC adapter 或 Redis singleton 执行会话清理

### Requirement: Session Kernel 发布验收必须记录 smoke 证据
系统 SHALL 在 Session Kernel feature 合并前记录发布验收证据，覆盖自动验证、Redis cleanup dry-run 和跨协议 smoke test。

#### Scenario: 自动验证命令有记录
- **WHEN** 本 change 实现完成
- **THEN** 验收记录 SHALL 包含受影响 package 和 app 的 test、typecheck、lint 命令结果
- **AND** 记录 SHALL 标明未执行命令的原因和替代证据

#### Scenario: Redis cleanup dry-run 有记录
- **WHEN** 发布前执行旧 Redis key cleanup dry-run
- **THEN** 验收记录 SHALL 包含每个旧 key pattern 的匹配数量摘要
- **AND** 记录 MUST NOT 包含完整 Redis key 或 bearer token 明文

#### Scenario: 跨协议 smoke 有记录
- **WHEN** 开发环境完成 Session Kernel release smoke
- **THEN** 验收记录 SHALL 覆盖 custom SSO 登录/授权/鉴权/登出、OIDC authorize/token/UserInfo/logout、admin 用户或 client 变更撤销
- **AND** 验收记录 SHALL 包含关键请求结果、撤销结果和系统日志查询证据摘要
