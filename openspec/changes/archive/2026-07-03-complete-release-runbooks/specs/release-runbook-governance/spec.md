## ADDED Requirements

### Requirement: Release 手册必须使用中文并被索引
系统 SHALL 确保 `docs/releases/` 下所有 Markdown release 文档正文使用简体中文，并 SHALL 在 `docs/index.md` 中为每份 release 文档维护索引记录。

#### Scenario: Release 文档正文中文化
- **WHEN** 维护者打开 `docs/releases/*.md`
- **THEN** 标题、章节、操作说明、表格说明和注意事项 SHALL 使用简体中文
- **AND** 命令、路径、环境变量、日志 event、API endpoint、HTTP method、产品名和必要技术术语 MAY 保持英文原文

#### Scenario: Release 文档全部被索引
- **WHEN** 仓库新增、删除或重命名 `docs/releases/*.md`
- **THEN** `docs/index.md` SHALL 同步列出每份 release 文档
- **AND** 每条索引 SHALL 包含 type、status、last verified、next review 和 notes

#### Scenario: 文档新鲜度符合索引约定
- **WHEN** release 文档在索引中标记为 `Current`
- **THEN** 该文档 SHALL 有有效的 `Last verified`
- **AND** 该文档 SHALL 有未来的 `Next review`
- **AND** historical release record MAY 使用 `Next review = n/a`

### Requirement: 可复用 release runbook 必须覆盖发布闭环
系统 SHALL 将可复用 release 手册组织为发布人员可以直接执行的 runbook，而不是只记录背景说明。

#### Scenario: Runbook 覆盖发布前提和顺序
- **WHEN** release 文档的 type 为 `runbook`
- **THEN** 文档 SHALL 说明适用范围、发布前置条件、关键配置、发布顺序和停启顺序

#### Scenario: Runbook 覆盖 smoke 和证据留存
- **WHEN** release 文档的 type 为 `runbook`
- **THEN** 文档 SHALL 说明最小 smoke 验收路径
- **AND** 文档 SHALL 说明需要记录的命令输出摘要、日志查询证据或 UI/API 验收证据

#### Scenario: Runbook 覆盖回滚或恢复
- **WHEN** release 文档的 type 为 `runbook`
- **THEN** 文档 SHALL 说明回滚边界、恢复步骤和不可逆风险
- **AND** 如果回滚涉及清理 Redis key、BullMQ job、数据库表或 gateway 远端对象，文档 SHALL 明确清理对象和安全注意事项

### Requirement: Historical release record 必须区别于当前流程
系统 SHALL 区分一次性历史验收记录和后续可复用 release runbook。

#### Scenario: 历史记录不冒充当前 runbook
- **WHEN** release 文档记录某次具体日期、环境、分支和 smoke 结果
- **THEN** `docs/index.md` SHALL 将其标记为 `release-record` 或其他历史类型
- **AND** 该记录 SHALL 不作为唯一当前发布流程入口

#### Scenario: Session Kernel smoke 具备可复用模板
- **WHEN** 维护者准备执行新的 Session Kernel release smoke
- **THEN** `docs/releases/` SHALL 提供可复用模板或 runbook 章节
- **AND** 历史 smoke 记录 SHALL 保留为证据快照

### Requirement: 现有 release 手册必须按能力风险补强
系统 SHALL 补齐现有 release 文档中缺失的发布、回滚、smoke 和排障内容。

#### Scenario: User-profile dirty queue runbook 补齐 worker 运维
- **WHEN** 维护者查看 user-profile dirty queue release runbook
- **THEN** 文档 SHALL 覆盖 worker consumer 停启、数据库 migration、旧未版本化 job 处理、`user-profile:repair`、`user-profile:backfill`、health、Bull Board、`dirtyVersion` 日志和回滚边界

#### Scenario: SM 加密密码登录 runbook 补齐安全发布面
- **WHEN** 维护者查看 SM 加密密码登录 release 手册
- **THEN** 文档 SHALL 覆盖 API/SSO 同步发布、SM2/SM4 key material、`kid` 匹配、nonce TTL、防重放、Cap 人机校验重试、legacy 明文请求拒绝、错误码和敏感日志检查

#### Scenario: 系统日志可观测性 runbook 补齐 trace 发布面
- **WHEN** 维护者查看系统日志可观测性运行手册
- **THEN** 文档 SHALL 覆盖 APISIX OpenTelemetry、Alloy OTLP receiver、`traceId`、`spanId`、`traceparent`、gateway/backend/audit trace smoke 和证据留存

#### Scenario: OIDC release runbook 补齐轮换和逐 client 验收
- **WHEN** 维护者查看 OIDC Provider 发布与回滚手册
- **THEN** 文档 SHALL 覆盖 JWK rotation、Session Kernel HMAC lookup rotation、逐 client 启用矩阵和证据记录模板

### Requirement: 缺失的高风险 release 手册必须新增
系统 SHALL 为当前缺少 release 交接文档且发布风险较高的能力新增手册。

#### Scenario: 角色分配统一和角色管理 release 手册
- **WHEN** 维护者准备发布角色分配统一与角色管理变更
- **THEN** `docs/releases/` SHALL 提供手册覆盖 `role_assignment` migration、旧三表 backfill/删除、角色聚合一致性、admin `/roles` 页面 smoke、user-profile dirty 验收和回滚边界

#### Scenario: APISIX gateway release 手册
- **WHEN** 维护者准备发布 gateway manifest 或生产 gateway 配置
- **THEN** `docs/releases/` SHALL 提供手册覆盖 validate、diff、apply、dry-run、prune、生产 env、真实 IP/限流、多节点策略、OpenTelemetry/Alloy 交接和 Git 回滚

#### Scenario: 统一审计日志和 login_log 退役 release 手册
- **WHEN** 维护者准备执行统一审计日志迁移或删除 legacy `login_log`
- **THEN** `docs/releases/` SHALL 提供手册覆盖历史迁移 dry-run/apply、pending=0 验收、删除 legacy table 前置条件、审计查询 smoke、敏感字段检查和回滚窗口

### Requirement: Release 文档变更必须通过文档检查
系统 SHALL 在 release 手册新增、删除、重命名或状态调整后执行文档索引检查。

#### Scenario: 文档索引检查通过
- **WHEN** release 文档或 `docs/index.md` 被修改
- **THEN** 维护者 SHALL 运行 `pnpm check:docs`
- **AND** 检查 SHALL 通过或在任务记录中说明失败原因与后续处理

#### Scenario: 链接和命令人工抽查
- **WHEN** release 手册引用其他文档、OpenSpec spec、命令或配置路径
- **THEN** 维护者 SHALL 抽查引用目标存在
- **AND** 命令、环境变量和路径 SHALL 不因中文化而被改写
