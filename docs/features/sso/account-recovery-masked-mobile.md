# 找回密码脱敏手机号接口设计

本文记录 2026-09-17 的设计讨论。维护者已整体确认 Q1–Q4 并授权实施；这些决定是本次修改目标，不代表已实现或部署。

## 范围与基线

- 目标分支：`main`；基线：`0346ce4103e79f95020ba5cdccf771d9453cfd4d`。
- 功能分支：`codex/account-recovery-masked-mobile`。
- 保留 Account Recovery 的输入账号、展示绑定手机、验证短信验证码和设置新密码流程。
- 当前 `GET /open/users/userInfo` 返回 username、name 和脱敏 mobile；本次删除该端点，以仅提供脱敏手机号的新接口替换。
- 领域含义沿用 [Account Recovery](../../../CONTEXT.md)，不将接口细节写入领域词汇表。

## 已确认决定

### Q1：统一无手机号结果

账号不存在与账号未绑定手机号统一返回成功响应，`data` 为 `{ "mobile": null }`。不再通过本接口的这两种结果区分账号是否存在。

存在绑定手机号时仅返回脱敏号码；不返回 username、name 或其他用户资料。保留脱敏号码意味着仍接受部分手机号的匿名披露，本接口不承诺完全阻止账号枚举。

### Q2：资源路径

新接口为 `GET /open/users/{username}/masked-mobile`，username 从路径取得。成功响应沿用仓库现有 envelope，业务数据严格为 `{ mobile: string | null }`。

username 采用两层百分号编码：内层 `encodeURIComponent` 并将点编码为 `%2E`，外层再按路径段进行 `encodeURIComponent`。Hono 解开外层后，参数解析再解开内层。这样 `.`、`..` 不会被浏览器折叠，字面量 `%2E` 也不会与 `.` 混淆；普通字母数字账号仍使用原文本。该约定同步描述在 OpenAPI 中。

原 `GET /open/users/userInfo` 删除，找回密码前端改用新接口。

### Q3：统一页面提示

两种 null 结果均显示“无法获取绑定手机号”。保留原验证步骤及阻止发码、继续重置的行为；相应提示不再声称账号未绑定手机，也不区分 null 原因。

### Q4：保留真实失败

仅明确账号不存在或未绑定手机号时返回 `200`，`data` 为 `{ "mobile": null }`。数据库故障、档案暂不可用、人机验证失败等继续返回对应错误，不转换为 null。

保留现有脱敏格式、人机验证和限流策略。

## 已核对的实现约束

- 当前找回密码页面是仓内唯一实际页面消费者；`apps/sso/src/services/open.ts` 及相关测试 fixture 需要同步迁移。
- 当前 null 会显示“暂未绑定手机号”，并阻止发送验证码及进入设置密码步骤；本次按 Q3 替换提示，保留流程控制。
- 保留当前脱敏算法；后续 Account Recovery 会核对前端回传号码与绑定手机号的精确脱敏结果。
- Cap 使用 `openUserInfoLookup` action，风控按 action 和 IP 计数，不绑定旧 URL；本次保留该内部标识及现有策略，避免重置风险计数或影响已发人机验证 token。
- Gateway 按 open 路径通配和 IP 限流，无需随本次资源路径更名调整。
- 当前 username 无字符白名单。前端构造路径须编码用户名，并在实施验证中核对路径参数解码；特殊字符经过 Gateway 的行为尚未实测，不能仅凭编码宣称兼容。

## 实施状态

Q1–Q4 已整体确认并授权实施，按单会话小型改动交付，无需创建跨会话 Spec。代码已替换接口及前端调用，尚未合入或部署。

查询保留已发布 Profile 作为手机号来源。Profile 不存在时额外核对未删除账号的身份记录，只有账号也不存在才返回 null；已有账号的缺失或损坏 Profile 继续报错，身份核对不按 Enable/Pause/Disable 过滤。

## 验证与切换

- API 与 SSO 的 typecheck、Unit 和 Component Integration 已通过。
- 独立 PostgreSQL 18.4 测试已验证三种账号状态的存在性以及未知、删除账号；临时容器已清理。
- 找回密码 Browser Integration 已验证完整成功流程及 null 时的发码、重置阻断，后端由测试替代，不代表完整 Gateway 联调。
- Hono 路由和前端 service 分别验证中文、空格及 URL 保留字符的编码；未执行真实 Gateway 特殊字符链路验证。
- 新旧前后端接口不兼容，发布时需协调 API 与 SSO 更新，并刷新旧浏览器页面。本次不保留旧接口别名、不操作目标环境。
