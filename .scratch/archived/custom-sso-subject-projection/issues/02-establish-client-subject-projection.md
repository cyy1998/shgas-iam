# 02 — 建立 Client Subject Projection Module

**What to build:** 建立协议中性的 Client Subject Projection 能力，以受控 Catalog 和 Selection 从 Subject Facts 生成当前 client 可见的最小主体信息，并为 Custom SSO 提供唯一的新 wire contract。

**Blocked by:** 01

**Status:** resolved

- [x] 独立 Projection Module 的公开解析接口只接收 Subject Identifier、`clientCode` 和 Subject Claim Selection；它不依赖 Gateway、Independent、OIDC、HTTP、Cookie、Session payload 或协议配置对象。
- [x] Subject Claim Catalog V1 只允许必选 `subjectIdentifier`，以及可选 `profile:username`、`profile:name`、`profile:phone`、`profile:employments`、`iam:authorization`。
- [x] Catalog 对未知版本、未知 claim、重复 claim、缺少必选 claim、DTO 字段名、JSON path 和自由输入字符串全部 fail closed。
- [x] 所有投影明确排除数据库 ID、`wxId`、用户类型、状态、排序号、描述、软删除字段、审计时间与 ORCAS 数据。
- [x] Employment Profile 只含当前有效且未删除的任职、岗位和组织，输出 `isPrimary`、组织 code/name/type/root-to-current path 与岗位 code/name；主任职优先，其余稳定排序，无任职时返回空数组。
- [x] Authorization 以全部有效任职为边界，只读取当前 `clientCode` 的 Effective Roles 及其 privileges；无角色的任职仍保留空数组，任职级与顶层 roles/privileges 均去重并按 code 稳定排序。
- [x] `profile:employments` 和 `iam:authorization` 保持自包含；同时选择时允许重复组织与岗位语义，但任何其他 client 的角色或权限都不得出现。
- [x] Custom SSO V1 wire contract 顶层固定为 `version` 与 `subjectIdentifier`，按选择可含嵌套 `profile`、`authorization`；未选择字段及空父对象省略，选中的数组即使为空仍返回空数组，null 手机号省略。
- [x] Custom SSO wire contract 不提供 `id`、`userInfo` 或任何兼容别名；Projection Module 输出保持协议中性，wire mapping 由协议 adapter 完成。
- [x] Contract suite 覆盖 Selection 校验、字段省略、空数组、稳定排序、两个 client 的交叉授权 fixture、无跨 client 泄漏，并证明未来向 Legacy User Detail 增加字段不会改变投影。
- [x] 架构守卫证明协议 adapter 只能通过 Projection 公开接口取主体投影，Projection Module 不导入任一协议配置或 transport。
