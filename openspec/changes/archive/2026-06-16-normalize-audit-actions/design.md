## Context

统一审计日志已经把 `action`、`outcome`、actor、target、request context 和 `details` 作为结构化字段保存。
现状审计动作大体分为五类：

- 认证与自助：`auth.login.*.success/failure`、`auth.sms_code.*`、`auth.password.reset`、`self.password.change`、`self.mobile.bind`
- 管理端资源：`admin.user.*`、`admin.organization.*`、`admin.position.*`、`admin.employment.*`、`admin.client.*`
- OIDC client 管理：`admin.client.oidc.configure/enable/disable/remove/rotate_secret`
- internal：`internal.delegation.*`、`internal.purveyor.register`、`internal.purveyor_contact.register`
- 历史兼容：管理端展示中已有 `auth.login.success`，用于无法精确识别登录方式的历史迁移记录

除登录事件外，多数动作已经遵守“`action` 表达动作、`outcome` 表达结果”的模型。例如
`auth.sms_code.verify`、`auth.password.reset`、`self.password.change` 都通过同一 action 搭配不同 outcome 表达成功/失败。
登录事件把结果后缀写进 action，导致管理端 action 筛选与 outcome 筛选重叠，也让后续统计“密码登录次数/失败率”必须知道多组内部 action。

另一个漂移点是动作目录分散：后端 helper 内联 action 字符串，管理端在 `auditLogDisplay.ts` 单独维护标签，OIDC 审计动作只在
`oidc-client-registry` 规格中列出，主 `audit-logging` 规格和前端展示没有同步完整覆盖。

## Goals / Non-Goals

**Goals:**

- 统一规则：`action` 只表达业务动作，`outcome` 只表达执行结果。
- 新写入登录事件使用规范 action：`auth.login.password`、`auth.login.mobile`、`auth.login.local`、`auth.login.oa`、`auth.login.wechat`。
- 保留历史登录 action 的查询和展示兼容能力，避免管理端筛选漏掉旧记录。
- 建立可复用的审计动作目录，覆盖规范 action、历史 alias、标签和动作组。
- 补齐 OIDC client 审计动作在审计日志规格和管理端展示中的覆盖。
- 保持 `audit_log` 表结构、索引和审计脱敏模型不变。

**Non-Goals:**

- 不批量 UPDATE 已存在的 `audit_log` 历史记录。
- 不引入数据库 enum 或 PostgreSQL check 约束来限制 action 值。
- 不改变登录、SSO、OIDC、管理端 mutation 的业务成功/失败判定。
- 不在本变更中新增审计导出、图表统计、归档或告警能力。

## Decisions

### 1. 规范 action / outcome 职责边界

新规则为：

```text
action  = 发生了什么业务动作
outcome = 该动作成功还是失败
details = 失败原因、变更摘要、登录方式上下文、迁移来源等差异化信息
```

登录动作映射：

| 旧 action | 新写入 action | outcome 来源 |
| --- | --- | --- |
| `auth.login.password.success` | `auth.login.password` | `success` |
| `auth.login.password.failure` | `auth.login.password` | `failure` |
| `auth.login.mobile.success` | `auth.login.mobile` | `success` |
| `auth.login.mobile.failure` | `auth.login.mobile` | `failure` |
| `auth.login.local.success` | `auth.login.local` | `success` |
| `auth.login.oa.success` | `auth.login.oa` | `success` |
| `auth.login.wechat.success` | `auth.login.wechat` | `success` |
| `auth.login.success` | `auth.login` | 记录自身 `outcome` |

失败原因继续放在 `details.reason`，如 `user_lookup_failed`、`blacklisted`、`invalid_password`、`invalid_verification_code`。

替代方案：继续保留 `.success/.failure` 后缀，只依靠 `outcome` 做补充。放弃原因是会长期制造两个事实来源，且管理端无法用一个 action 直接表达“密码登录”。

### 2. 不迁移覆写历史审计记录

历史记录保留原始 action。兼容由查询和展示层完成：

- 管理端选择规范登录 action 时，查询条件 SHALL 展开到对应历史 alias。
- 管理端展示历史登录 action 时，标签 SHALL 按规范动作展示，例如旧 `auth.login.password.failure` 显示为“密码登录”，结果仍由 outcome 列展示。
- 明细抽屉继续展示原始 `action` 字符串，便于追溯写入时的真实值。

替代方案：生成 Drizzle migration 更新历史 `audit_log.action`。放弃原因是审计日志是证据型 append-only 数据；为命名清理修改历史事实收益有限，风险更高。

### 3. 审计动作目录放在 `packages/contracts`

新增共享目录建议放在 `packages/contracts/src/audit/actions.ts`，而不是 `packages/domain/src/audit`：

- `packages/contracts` 已用于跨 app 稳定枚举和常量，适合 action ID、legacy alias 和标签映射。
- `packages/domain/src/audit` 当前包含 Zod/OpenAPI 和 `@iam/db/schema` 依赖，前端直接导入会带来不必要耦合。
- 后端 helper、admin-api 查询兼容逻辑、admin 前端 action 选项可以共享同一份轻量常量。

目录应至少提供：

- 规范 action 常量或只读对象。
- `canonical -> legacy aliases` 映射。
- legacy action 到 canonical action 的反向映射。
- 管理端展示标签或可生成 label/options 的元数据。
- `expandAuditActionAliases(actions)` 之类的查询展开 helper。

替代方案：只在前端和后端各自维护映射。放弃原因是这正是当前漂移来源。

### 4. 查询兼容在 admin-api service/repository 边界收敛

`apps/admin-api/src/services/audit` 当前支持 `conditions.action` 和 `conditions.actions`。实现时应在进入 repository 条件构造前，将登录规范 action 展开为包含历史 alias 的 action 集合。

示例：

```text
auth.login.password
=> auth.login.password, auth.login.password.success, auth.login.password.failure
```

多个 actions 的查询使用去重后的并集。非登录 action 不展开。这样无需修改数据库结构，也不要求前端知道历史 alias。

### 5. 管理端 action 选项只暴露规范动作

全局审计页面的 action 筛选项应来自共享动作目录，并默认只展示规范 action。历史 alias 不作为可选项出现，但历史行仍能显示友好标签。

登录类展示建议：

| action | label | outcome 列 |
| --- | --- | --- |
| `auth.login.password` | 密码登录 | 成功/失败 |
| `auth.login.mobile` | 手机登录 | 成功/失败 |
| `auth.login.local` | 本地会话登录 | 成功 |
| `auth.login.oa` | OA 登录 | 成功 |
| `auth.login.wechat` | 微信登录 | 成功 |
| legacy alias | 对应规范 label | 使用记录自身 outcome |

这样表格不再出现“密码登录失败 + 失败”这种重复表述。

### 6. OIDC client 审计动作纳入同一目录

当前实现已经写入：

- `admin.client.oidc.configure`
- `admin.client.oidc.enable`
- `admin.client.oidc.disable`
- `admin.client.oidc.remove`
- `admin.client.oidc.rotate_secret`

本变更不改变这些 action，只要求主审计日志规格和管理端动作目录完整覆盖它们，并将 `oidc-client-registry` 中的 shorthand 表述改成完整 action 名称。

## Risks / Trade-offs

- [Risk] 历史行保留旧 action，数据库内会长期存在两套登录 action 字符串。  
  Mitigation：共享 alias 映射覆盖查询和展示；明细继续显示原始 action，避免误以为历史记录被改写。

- [Risk] 共享动作目录引入后，部分 app 仍可能继续内联字符串。  
  Mitigation：任务中要求替换登录写入、管理端展示和 admin-api 查询路径；测试覆盖常用 action 选项与 alias 展开。

- [Risk] 前端导入共享包可能拉入不适合浏览器的依赖。  
  Mitigation：将动作目录放在 `packages/contracts` 的独立文件，避免从 `packages/domain` 或后端模块导入。

- [Risk] 查询展开可能让精确查询旧登录 action 的调用者得到规范 action 记录。  
  Mitigation：管理端面向语义筛选，规范 action 表示动作族；如未来需要 forensic exact-match，可新增显式 exactAction 条件，而不是复用当前管理端筛选。

## Migration Plan

1. 发布代码后，新登录事件开始写入规范 action。
2. 管理端 action 筛选改用规范 action，并通过 admin-api alias 展开同时覆盖历史记录。
3. 不执行数据库 UPDATE，不生成修改 `audit_log.action` 的迁移。
4. 回滚时旧代码仍可读取规范 action，只是旧前端可能显示原始 action 字符串；审计数据不会丢失。

## Open Questions

- 无。历史记录保留原始 action，新记录规范化；如未来需要彻底重写历史审计数据，应另开专门的数据治理变更并完成审计合规评估。
