# 02 — 打通 Independent Authorization Grant

**What to build:** 以准确的 Authorization Grant 领域语言打通 `/sso/authorize → /sso/token` 纵向路径。Authorize 调用方只负责签发一次性 code，Independent 调用方在入口认证后一次性兑现 IAM 管理的 credential；第三方本地会话仍由第三方拥有，同时完整保留现有 `sid` 生命周期与外部契约。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 当前领域词汇与 SSO 对接文档明确区分 Custom SSO Authorization Grant、Independent Client Credential、Gateway Local Session 和第三方本地会话所有权。
- [x] Authorize 路径通过 `issueAuthorizationCode` 完成签发，未登录与成功行为、code 的 client/redirect 绑定及现有外部响应保持不变。
- [x] Independent exchange use case 在任何 code 消费前完成 client 与 secret 校验，随后只调用一次 `redeemIndependentGrant`，并把结果映射为既有 `sid`、`ttl` 和 `userInfo`。
- [x] Independent `sid` 继续由 IAM 验证和撤销，可用于 user-info，并保持全局退出关联与 logout endpoint notification 行为；实现和文档均不声称 IAM 已建立第三方本地会话。
- [x] 一次性 code、已撤销 PrincipalSession、实时用户失效、client metadata 不匹配、payload 失败和审计 request context 的既有语义均由最高相关模块接口测试覆盖。
- [x] Independent consumer port 与 use case 不暴露 Session Kernel 的 artifact、principal session 或其他内部中间模型。
- [x] Use-case 测试只覆盖入口验证、单次委托和结果映射；模块接口测试通过最终 credential 生命周期观察业务结果，不锁定内部调用顺序。
- [x] 若旧两阶段操作尚需为 Gateway 迁移暂存，它们只能保留既有 Gateway production caller，不得新增调用方或 compatibility wrapper。
- [x] 受影响的模块、use-case、route、audit 测试以及 `@iam/api` lint、typecheck、文档检查和 whitespace check 全部通过。
