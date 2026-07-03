## Context

`docs/releases/` 当前包含 5 份文档：系统日志可观测性运行手册、OIDC Provider 发布与回滚手册、Session Kernel release smoke 记录、SM 加密密码登录发布检查清单和 user-profile dirty queue release runbook。它们已经被 `docs/index.md` 索引，但存在三个问题：

- 颗粒度不一致：OIDC 和系统日志较完整，SM 登录和 user-profile dirty queue 过短，Session Kernel 是一次性历史证据而不是可复用模板。
- 语言不一致：`session-kernel-release-smoke.md` 和 `user-profile-dirty-queue-release.md` 仍以英文为主。
- 覆盖面不完整：角色分配统一与角色管理、APISIX gateway 配置发布、统一审计日志与 `login_log` 退役没有对应 release 手册。

本变更只补齐文档和 OpenSpec 文档治理合同，不改变后端、前端、gateway 或数据库运行时行为。

## Goals / Non-Goals

**Goals:**

- 将 `docs/releases/` 下所有 release 手册正文统一为简体中文，保留命令、路径、配置项、API 名称和必要英文技术术语。
- 把现有短文档补成可执行 runbook，覆盖发布前提、发布顺序、smoke 验收、回滚/恢复、日志或证据留存。
- 新增缺失 release 手册，覆盖角色分配统一与角色管理、APISIX gateway 配置发布、统一审计日志与 `login_log` 退役。
- 明确 historical release record 与 reusable runbook 的边界，避免一次性 smoke 证据被误用为当前流程。
- 同步 `docs/index.md`，确保所有 release 文档都被索引并满足 freshness/status 约定。

**Non-Goals:**

- 不修改 IAM 运行时逻辑、数据库 migration、gateway manifest 或测试代码。
- 不把 `gateway/README.md` 全量迁移到 `docs/releases/`；只抽取发布与回滚交接所需内容。
- 不为每个历史 OpenSpec change 都创建 release 手册，只补当前发布交接风险最高的能力。
- 不在 release 手册中复制完整 feature spec；手册只承载操作、验收和排障入口。

## Decisions

### 1. 以 `docs/releases/` 作为发布交接入口

所有 release 手册继续放在 `docs/releases/`，并在 `docs/index.md` 中列为 `runbook` 或 `release-record`。特性说明仍留在 `docs/features/` 或对应 package README 中，通过链接引用。

选择原因：发布人员需要一个稳定入口；复制 feature 文档会导致事实分叉。

替代方案是把手册分散到各 feature 目录。该方案更贴近能力归属，但不利于发布窗口内快速查找。

### 2. 区分 reusable runbook 和 historical release record

可复用流程标记为 `runbook` 和 `Current`，必须有 `Last verified` 与未来 `Next review`。一次性验收证据标记为 `release-record` 和 `Historical`，正文可保留具体日期、环境和证据摘要，但不得作为唯一当前发布流程。

Session Kernel 现有 smoke 记录保留为 historical record；新增或补充一个可复用 smoke 模板/章节，供后续发布复制填写。

### 3. 中文统一采用“正文中文、标识符原样”

`docs/releases/*.md` 的标题、章节、说明、表格字段说明和操作提示使用简体中文。命令、路径、环境变量、日志 event、API endpoint、HTTP method、OpenSpec 关键字和产品名保持原样。

选择原因：发布手册主要面向中文维护者，但过度翻译技术标识符会降低可执行性。

### 4. 新增三类缺失 release 手册

新增手册应覆盖：

- 角色分配统一与角色管理：`role_assignment` migration、旧三表 backfill/删除、角色聚合一致性、admin `/roles` 页面 smoke、user-profile dirty 验收和回滚边界。
- APISIX gateway 配置发布：validate/diff/apply/dry-run/prune、生产 env、真实 IP/限流、多节点策略、OpenTelemetry/Alloy 交接和 Git 回滚。
- 统一审计日志与 `login_log` 退役：历史迁移 dry-run/apply、pending=0 验收、删除 legacy table 前置条件、审计查询 smoke 和回滚窗口。

### 5. 现有手册按风险补强

现有手册补强重点：

- user-profile dirty queue：补 worker runtime、Bull Board、health、repair/backfill、dirtyVersion 日志、旧 job 清理、回滚/恢复。
- SM 加密密码登录：补密钥/nonce/Cap 联动、前后端同步发布、错误码、日志敏感数据、密钥修复和 rollback matrix。
- 系统日志可观测性：补 APISIX OpenTelemetry、Alloy OTLP receiver、trace smoke 和 trace 证据留存。
- OIDC Provider：补 JWK/HMAC rotation 时序、逐 client 启用矩阵和证据模板。
- Session Kernel smoke：保留历史记录，同时提供后续可复用 smoke 模板。

## Risks / Trade-offs

- [Risk] 文档补得太像 feature spec，后续实现变化时维护成本变高。→ Mitigation：手册只写发布操作、验收证据和排障入口，事实细节链接到 `openspec/specs/`、`docs/features/` 或 `gateway/README.md`。
- [Risk] `Last verified` 被误解为已经重新执行全部生产级 smoke。→ Mitigation：手册中区分“文档核对日期”和“实际 release record 日期”，historical record 不声明当前可复用。
- [Risk] 中文化过程中误改命令、环境变量或日志 event。→ Mitigation：保留代码块和配置标识符原样，检查命令块、路径和环境变量 diff。
- [Risk] 新增手册覆盖面过宽导致一次实现过大。→ Mitigation：按文档分组提交，优先补发布风险最高的 role/gateway/audit 和两份短手册。

## Migration Plan

1. 盘点 `docs/releases/*.md` 和 `docs/index.md`，确认每份 release 文档的目标类型和状态。
2. 中文化英文 release 文档正文，保留命令、路径、配置项和日志 event 原文。
3. 补强现有 5 份 release 文档，必要时新增 Session Kernel smoke 模板。
4. 新增角色分配与角色管理、APISIX gateway、统一审计日志与 `login_log` 退役 release 手册。
5. 同步 `docs/index.md`，为每份新增/调整文档写入 type、status、last verified、next review 和说明。
6. 运行 `pnpm check:docs`，并人工抽查所有 release 文档是否中文、被索引且链接有效。

回滚策略：该变更只改文档。如发现内容错误，回滚对应文档 diff 或将有争议手册在索引中降级为 `Needs Review`，不影响运行时服务。

## Open Questions

暂无。实现阶段如发现某个手册需要生产专有信息，应使用占位符或说明由部署环境提供，不在仓库中写入密钥、真实域名或私有运维数据。
