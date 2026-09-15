# 统一认证与本人安全候选

本文记录 #183 的统一认证能力；#194 已完成生产默认图接线及过渡出口收缩。代码接线不是环境部署完成记录。

## 装配与根登录

API 的 `createRootAuthenticationComposition` 显式接收新 `UnifiedSessionKernel`、账号屏障、Client Snapshot reader、
已发布 Facts reader 和认证出站能力。它复用正式四认证 factory 和
`createRootAuthHandlers`、`createRootSsoHandlers`、`createRootPublicHandlers`。没有运行时选代参数或 bearer fallback。

密码与短信经原凭据解析、限制、风险处理及审计；OA 验签和微信服务端身份交换保持。认证成功后才取得许可并创建
UserSession，HTTP 使用 Redis 返回的剩余秒数写同名 `global_session` Cookie。固定根 TTL 由调用方注入；
正式 API 环境变量提供固定根 TTL。OA 原有替换根退出顺序保持，四认证不同完成形成独立根。

根 UserInfo 仅接受 `Client: iam` 的根用途。根观察与本次账号许可之后，独立取得并验证 IAM Client 的启用状态、
Custom SSO 用途及披露配置。Client 交付拒绝保留根 Cookie；账号或根明确无效按原规则清理，暂态故障保留 Cookie。
投影以本操作许可消费已发布 Facts，不现场查询源业务表，不在响应前重新观察根、许可或配置；只请求稳定主体时
不读完整 Facts。其他协议 Token 由协议 owner 迁移，不能在根候选里尝试解析。

Custom 登录守卫先检查本操作 Client 和 redirect，再检查根。正式页面决策和 HTTP handlers 保留；OIDC 首次完成证明、
重认证拒绝及协议续接由 #187 继续迁移，本票不以 mocked browser 宣称新 OIDC 已运行。Custom 单回调授权和服务器续接见
[#184 候选说明](custom-authorization-candidate.md)。

## 账号代际与本人操作

`createUnifiedSubjectAccessSessionRevocation` 适配同代根与子实例。普通用户撤销先捕获完整根集合和每根子集合，再执行
精确身份，当前根排除不排除其子。Prepared 保持准备时捕获 context 集合、执行时选择这些 context 的语义，并纳入
调用方给出的前代；准备之后落库的旧代根仍可处理，新代根保留。实际执行批次固定，未知与失败原样返回。

Admin 的 `createRootSecurityComposition` 复用正式认证 middleware、session-management 与 User service。根解析、
Subject Access、本人全部下线和本人密码重置使用同一新 Kernel。改密保持同行事务与密码审计，提交后经正式会话
撤销服务处理并记录实际作用审计；作用后审计失败返回已提交错误，不自动再次改密。本人缺少当前根时在改密前拒绝。
一般 Admin 清单与批量工作流已由 #191 扩展同一候选，详见[管理契约](../admin/session-management.md#191-统一会话候选)。

撤销响应使用严格可区分结果：新代为 `generation: unified` 与 `sessions`，包含两类实际终止数、当前根排除数、
失败与未知数，不返回旧 `revoked` 或 `cleanup` 零计数。#191 附加固定 `batch` 和独立实际产物回收尝试；
旧四对象结果已随在线图移除。密码重置附加同样的 `sessions`
反馈；页面分别呈现已确认效果及未知/失败，刷新不触发重放。固定集合不承诺覆盖捕获后的在途写入，也没有后台补齐。

即使实际终止确认数为零，只要有 `unknown`，审计失败仍按“作用可能已生效”返回专用错误，触发刷新与持续修复提示。
`changed` 和终止计数保持零，不把未知作用改写为已确认成功；本人改密仍以密码已提交错误保留后续处理失败语义。

## 验证边界

API `root-authentication.integration.test.ts` 经正式候选 HTTP、真实新 Kernel Redis 和密码凭据算法验证四认证、固定根、
许可与交付、在途完成和守卫/退出。API Core `unified-subject-access.integration.test.ts` 验证当前根例外、prepared
旧代晚到与未知作用；Admin `root-security.integration.test.ts` 结合真实 PG、Redis、正式服务和 middleware 验证本人
撤销、改密提交及作用后审计。外部短信/微信与源资料读取按 seam 替代，不证明真实第三方交付。
登录 browser 验证页面守卫级别，Admin 增补新结果展示；实际命令与候选 SHA 在 #183 交接中登记。

完整协议、一般 Admin 批量、Worker CLI、默认生产图、全系统 E2E 及部署分别由后续票和最终验收承担。
