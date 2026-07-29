# 管理端有效会话与临时登录限制管理开发记录

## 当前状态

- 2026-07-28：需求压力测试、领域语言、长期 Redis 事实来源决策和测试接缝已确认。
- 正式 spec 与 6 张 implementation tickets 已发布。
- Ticket 03 已以 commits `f31548ed`、`f9a74f70` 完成交付并标记为 `resolved`；固定点
  `b5f07c2b268c252f07629cad66ea643a2f1fcb79` 到最终候选 `f9a74f7025469a64d021740f48eb9171bf58008f`
  的第二轮 Standards / Spec 双轴评审均为 0 findings。
- Ticket 04 已以 commits `a01af3dc`、`d574c883` 完成交付并标记为 `resolved`；固定点
  `fc1f174c379dcd1562a334d5bb155ef504ea9fb4` 到最终候选 `d574c88357c03480a0adfb590ab916b9eea5d9fa`
  的第二轮 Standards / Spec 双轴评审均为 0 findings。
- Ticket 05 已以 commits `c9cb86b5`、`1cc01016`、`a4608c42`、`b93b658a` 完成交付并标记为 `resolved`；
  固定点 `a2d8c2ad03edef87af5ec838e4b4255b6e8a7717` 到最终候选
  `b93b658a5950ca5ee2492840d96e8947be6dc354` 的最终 Standards / Spec 双轴评审均为 0 findings。
  Ticket 06 保持 `ready-for-agent`，是下一安全动作。
- 当前功能分支为 `codex/admin-session-management`；Ticket 01 已通过固定点 `0b01f335` 到候选 `11a45f8b` 的三轮
  Standards / Spec 双轴评审并标记为 `resolved`。
- Ticket 02 以 commits `d926b146`、`be3c5797` 完成交付；固定点
  `51c332979fdd23c5a00a3166f310182914f66108` 到最终候选 `be3c57974270affae5278db5302f0173545a0a8a`
  的第二轮 Standards / Spec 双轴评审均为 0 findings。

## 验收与验证计划

- 共享登录状态通过公开 Session Kernel / LoginRestriction seam 测试，并以显式 `test:redis` 补充真实原子性契约。
- Admin API 通过真实 service + shared adapter seam 覆盖四个管理意图，管理前端通过 Playwright 覆盖用户可见交互。
- Ticket 内运行受影响 workspace 的聚焦测试、lint、typecheck、适用 smoke、E2E、`check:architecture`、`check:docs` 与 `git diff --check`。
- 准备本地合入时在最终内容上运行一次完整 `pnpm verify`，并完成 Standards / Spec 双轴评审。

## 事件

- 2026-07-28 `Decision`：规范术语采用 Valid Principal Session、Temporary Login Restriction、Login Restriction Trigger Method、Session Origin 与 Session Revocation。
- 2026-07-28 `Decision`：Redis 是实时登录状态唯一事实来源；不建立 PostgreSQL 会话历史或影子状态。
- 2026-07-28 `Decision`：本次不回填旧 Redis 状态，接受上线后最长约 24 小时的会话列表遗漏窗口。
- 2026-07-28 `Decision`：第一版移除不可靠的 `lastActiveAt`，限制原因与最后触发方式分离。
- 2026-07-28 `Validation`：维护者确认三条最高公开测试 seam；实现前仍需拆分 tickets。
- 2026-07-28 `Decision`：维护者确认 6 张 tracer-bullet tickets；`01`、`02` 无 blocker，`03` 依赖 `02`，`04` 依赖 `03`，`05` 依赖 `04`，`06` 依赖 `01` 与 `03`。
- 2026-07-28 `Authorization`：本轮只授权 `/to-tickets`，未授权实现、提交、合并、推送或部署。
- 2026-07-28 `Authorization`：维护者显式调用 `/implement`，授权按 tickets 实现并创建聚焦提交；本地收尾、合并、推送和部署仍未授权。
- 2026-07-28 `Authorization`：implementation 子代理在固定点 `0b01f335` 认领 Ticket 01；验收项与 `resolved`
  状态保留到双轴评审 findings 清零后的 handoff。
- 2026-07-28 `Implementation`：Ticket 01 将 Temporary Login Restriction 生命周期收口到
  `@iam/api-core/login-restriction`，密码与手机登录只通过 consumer-owned port 使用原子失败迁移、状态读取和清理，
  并新增独立 `test:redis` 通道。
- 2026-07-28 `Validation`：`@iam/contracts`、`@iam/api-core`、`@iam/api` 的受影响 lint、typecheck 和完整普通测试
  通过；根 lint、测试编排契约、API process smoke、Architecture Guard、文档索引、env naming 与 whitespace
  检查通过。
- 2026-07-28 `Validation`：当前环境未提供 `IAM_API_CORE_TEST_REDIS_URL`，因此未执行真实 Redis contract；
  已验证 `pnpm --filter @iam/api-core test:redis` 在约 2 秒内明确失败，不会 skip、回退或自行启动服务。
- 2026-07-28 `Review`：Ticket 01 首轮双轴评审提出 3 项 Standards 与 2 项 Spec findings，implementation 子代理
  逐项复核后确认均成立。
- 2026-07-28 `Implementation`：`LoginRestriction` 改为消费业务语义化 atomic storage port；production Redis
  adapter 独占 Lua 与 key，普通 Fake 直接实现 port，不再解析脚本、KEYS/ARGV 或命令排列。
- 2026-07-28 `Implementation`：Redis adapter 使用服务端 `TIME` 生成和清理到期索引，列表遍历期间不重写 score；
  近同时到期且 caller clock 落后一天的回归从重复/遗漏修复为单页稳定唯一结果，并继续禁止旧限制 lazy backfill。
- 2026-07-28 `Implementation`：密码与手机登录的 consumer-owned ports 收窄到实际消费的 restriction/status 字段，
  clear 返回 `Promise<unknown>`；authentication-scope helper 统一 shared unavailable error、协议审计 callback 与 API
  error 映射，production provider 继续通过 structural typing 满足两个 port。
- 2026-07-28 `Implementation`：真实 Redis contract 为每个随机 namespace 建立独立 writer/observer clients，通过
  公开 seam 验证跨连接并发计数、restriction/index 原子可见性、clear 可见性与 clear/failure 线性化，并分别关闭连接。
- 2026-07-28 `Validation`：最终 focused seam 33/33、受影响普通测试 327/327、测试编排契约 16/16 与 API production
  smoke 1/1 通过；受影响 lint/typecheck、root lint、Architecture Guard、文档索引、env naming 与 whitespace 检查
  通过。
- 2026-07-28 `Validation`：最终环境仍未提供 `IAM_API_CORE_TEST_REDIS_URL`；真实 Redis contract 无法执行，命令在约
  1.5 秒内以必需变量说明快速失败，未 skip、回退、启动 Docker 或清空 Redis。
- 2026-07-28 `Review`：Ticket 01 第二轮完整评审的 Spec 为 0 findings；Standards 剩余 1 项 hard finding：
  shared unavailable 审计失败可能遮蔽固定的登录保护 503。
- 2026-07-28 `Implementation`：authentication-scope unavailable helper 在审计 callback 失败时把状态错误与审计错误
  合并到内部 cause，仍固定抛出 `LoginProtectionUnavailableError`；API code、HTTP status 与协议 payload 不受审计失败
  影响。
- 2026-07-28 `Validation`：密码与手机公开 use-case seam 的审计失败回归先复现原始 audit error 遮蔽 503，修复后
  focused 24/24、`@iam/api` 完整普通测试 200/200 通过；API lint、typecheck 与 whitespace 检查通过。
- 2026-07-28 `Review`：Ticket 01 第三轮完整双轴评审清零，Standards 0 findings、Spec 0 findings；完整候选范围为
  `0b01f335...11a45f8b`。
- 2026-07-28 `Handoff`：Ticket 01 以 commits `5328169d`、`04ba8cf6`、`11a45f8b` 完成交付并标记为
  `resolved`。最终 focused/affected、lint、typecheck、编排、API production smoke、Architecture Guard、文档索引、
  env naming 与 whitespace 验证均通过；真实 Redis contract 因未提供 caller-owned
  `IAM_API_CORE_TEST_REDIS_URL` 未执行，但必需变量缺失时的快速失败、无 skip/fallback/Docker/flush 行为已验证。
- 2026-07-28 `Authorization`：implementation 子代理在固定点
  `51c332979fdd23c5a00a3166f310182914f66108` 认领 Ticket 02；验收项与 `resolved` 状态保留到双轴评审 findings
  清零后的 handoff。
- 2026-07-28 `Implementation`：Principal Session v1 增加可选 Session Origin，不提升对象版本；密码、手机验证码、
  OA 与微信登录把服务端 request context 中的清洗后 IP 和最多 512 字符 User-Agent 传入窄创建端口，provider 通过
  structural typing 满足四个 consumer-owned ports。
- 2026-07-28 `Implementation`：Session Kernel 仅为 user 根 Principal Session 维护
  `sess:v2:idx:principal_sessions`；创建、续期和撤销在既有 Redis transaction 内同步索引。Inventory 按
  `expiresAt` 倒序分块读取，支持精确用户索引、确定性同分顺序、过期与悬空清理、跨块补页和清理后计数，不使用
  `SCAN`、读取时回填或 `lastActiveAt`。
- 2026-07-28 `Validation`：最终 Session Kernel focused 22/22、四登录 use-case 33/33；完整普通测试
  `@iam/api-core` 118/118、`@iam/api` 200/200、`@iam/admin-api` 110/110、`@iam/oidc-provider` 65/65 通过，四个
  workspace 的 lint/typecheck 全部通过。
- 2026-07-28 `Validation`：API 与 Admin API production smoke 各 1/1、OIDC production smoke 8/8、
  Architecture Guard、文档索引与 whitespace 检查通过。仓库现有真实 Redis lane 只覆盖 LoginRestriction，本票
  没有可执行的 Session Kernel Redis contract；按 ticket 工作流未运行全仓 `pnpm verify`。
- 2026-07-28 `Review`：Ticket 02 候选实现等待 Standards / Spec 双轴评审；ticket 保持 `claimed`，验收 checkbox
  保持未勾选。
- 2026-07-28 `Review`：Ticket 02 首轮 Spec 为 0 findings；Standards 提出 1 项 P2 hard finding：四个登录
  consumer-owned Principal Session 创建端口复用可选且接受任意字符串的 AMR options，缺失或错误认证方式仍能通过
  typecheck。
- 2026-07-28 `Implementation`：密码、手机、OA 与微信创建端口分别要求 `readonly ["pwd"]`、
  `readonly ["sms"]`、`readonly ["oa"]` 与 `readonly ["wechat"]`；共享模块只保留 Session Origin 类型与构造，
  Custom SSO provider 通过 structural typing 继续满足四个窄端口。
- 2026-07-28 `Validation`：port contract 类型级回归先以 8 个 unused `@ts-expect-error` 证明缺失/错误 AMR 可通过
  typecheck，修复后 API port contract 1/1、四登录 use-case 33/33、`@iam/api` 普通测试 200/200、production
  smoke 1/1、lint 与 typecheck 全部通过。
- 2026-07-28 `Review`：Standards P2 修复候选等待从固定点到修复 `HEAD` 的完整 Standards / Spec 双轴复审；
  ticket 保持 `claimed`，验收 checkbox 保持未勾选。
- 2026-07-28 `Review`：Ticket 02 第二轮完整双轴评审清零，Standards 0 findings、Spec 0 findings；完整候选范围为
  `51c332979fdd23c5a00a3166f310182914f66108...be3c57974270affae5278db5302f0173545a0a8a`。
- 2026-07-28 `Handoff`：Ticket 02 以 commits `d926b146`、`be3c5797` 完成交付并标记为 `resolved`。最终
  Session Kernel focused 22/22、四登录 use-case 33/33、API port contract 与四登录组合 34/34；完整普通测试
  `@iam/api-core` 118/118、`@iam/api` 200/200、`@iam/admin-api` 110/110、`@iam/oidc-provider` 65/65 通过，
  四 workspace lint/typecheck、API/Admin API/OIDC production smoke、Architecture Guard、文档索引与 whitespace
  检查均通过。
- 2026-07-28 `Handoff`：本票接受公开 Session Kernel seam、稳定 Fake、事务失败与跨块回归作为 inventory 的测试
  边界；请求只分块清理当前分页遇到的悬空成员，不为发现后续页面悬空项执行无界遍历。仓库现有真实 Redis lane
  只覆盖 LoginRestriction，没有 Session Kernel `test:redis`；该边界不阻塞本票，最终候选未运行留待本地合入阶段的
  全仓 `pnpm verify`。
- 2026-07-28 `Dependency`：Ticket 02 resolved 后 Ticket 03 已解阻并成为下一票；Ticket 06 的 Ticket 01 依赖已满足，
  但仍被 Ticket 03 阻塞。
- 2026-07-28 `Authorization`：implementation 子代理在固定点
  `b5f07c2b268c252f07629cad66ea643a2f1fcb79` 认领 Ticket 03；本票只交付 Valid Principal Session 的只读 Admin
  API 与管理端路径，不实现撤销或 Temporary Login Restriction 标签页。验收项与 `resolved` 状态保留到双轴评审
  findings 清零后的 handoff。
- 2026-07-28 `Implementation`：Admin session management service 通过消费方拥有的 Session inventory 与批量用户
  摘要 port 提供 `listSessions`，映射异常账号、AMR、粗粒度来源与 current 标记；REST
  `POST /admin/session-management/sessions/search` 和 tRPC `admin.sessionManagement.listSessions` 复用严格校验、
  server-owned actor context 与显式 VO 白名单。Redis inventory 错误映射为
  `503 / ADMIN_LOGIN_STATE_UNAVAILABLE`，用户摘要数据库错误保持 5xx 传播。
- 2026-07-28 `Implementation`：Admin 新增受 `isAdmin` 保护的 `/sessions` 路由、“会话管理”菜单和单一“有效会话”
  标签页，复用用户远程搜索提交 exact numeric user ID，展示安全会话字段并支持分页和手动刷新；本票不包含撤销、
  Temporary Login Restriction、轮询或原始 User-Agent。范围自审以浏览器 RED/GREEN 收紧 503 语义：不可用时显示
  错误与“加载失败”，不会同时伪装成“暂无数据”。
- 2026-07-28 `Validation`：普通测试 `@iam/contracts` 17/17、`@iam/admin-api` 121/121、`@iam/admin` 19/19，
  完整 Admin Playwright 5/5 通过；三个受影响 workspace 的 lint/typecheck 通过，仓库级 `pnpm lint` 16/16
  成功。Lint 仅保留既有 SSO 4 条和 Admin 25 条 warning，本票新增文件无 warning。
- 2026-07-28 `Validation`：API 与 Admin API production smoke 各 1/1、Architecture Guard、文档索引和 whitespace
  检查通过。按 ticket 工作流未运行全仓 `pnpm verify`；候选实现等待从固定点到 candidate commit 的 Standards /
  Spec 双轴评审，ticket 保持 `claimed` 且验收 checkbox 保持未勾选。
- 2026-07-28 `Review`：Ticket 03 首轮双轴评审提出 5 项 findings。Standards 包含 1 项 P2：页面解析 tRPC
  `httpStatus`、`serviceCode` 与内部 message；1 项 P3：session Playwright 重复 input type、batch 解码与 envelope。
  Spec 包含 1 项 P2：成功后刷新 503 可能保留旧行；2 项 P3：缺少 Kernel 顺序保持与 OpenAPI request/safe VO
  schema 契约。
- 2026-07-28 `Implementation`：前端 service wrapper 只用共享
  `ApiErrorCode.AdminLoginStateUnavailable` 归一化稳定 `SessionListError`；页面不读取 transport 字段或内部 message，
  任意其他 503 映射为安全的普通加载失败。页面显式控制安全 VO rows，成功替换、失败清空，避免不可用 Alert 与旧
  会话并存。E2E fixture 新增专用 typed session route helper，复用 wrapper input/result type 与既有 tRPC fulfill，
  集中 batch 解码而不建立通用 mock 框架。
- 2026-07-28 `Implementation`：Admin service seam 用多条 session 锁定 Kernel 的 `expiresAt` 倒序及同分稳定顺序，
  不在 Admin 层重复排序。OpenAPI contract 锁定分页 defaults/max、positive numeric user ID、strict actor exclusion
  与 exact safe VO；session、user、origin response schema 改为 strict，文档不允许额外 raw/secret 字段。
- 2026-07-28 `Validation`：wrapper RED 为稳定错误类型缺失，GREEN 2/2；成功→手动刷新→503 Playwright RED 证明旧
  行仍存在，受控 rows 后 GREEN；safe VO OpenAPI RED 证明 `additionalProperties` 缺失，strict schema 后 GREEN
  3/3。Kernel 顺序是既有正确行为的 characterization，service 文件 6/6；Admin API 相关 focused 15/15、session
  Playwright 4/4 通过。
- 2026-07-28 `Validation`：修复后完整普通测试 `@iam/contracts` 17/17、`@iam/admin-api` 124/124、
  `@iam/admin` 21/21，完整 Admin Playwright 6/6；三个 workspace 的 lint/typecheck、API 与 Admin API production
  smoke 各 1/1、Architecture Guard、文档索引和 whitespace 检查通过。Admin lint 仅保留既有 25 条 warning。
- 2026-07-28 `Review`：Ticket 03 focused fix 等待从固定点
  `b5f07c2b268c252f07629cad66ea643a2f1fcb79` 到追加 candidate commit 的完整 Standards / Spec 双轴复审；
  ticket 保持 `claimed`，验收 checkbox 保持未勾选。
- 2026-07-28 `Review`：Ticket 03 完整范围
  `b5f07c2b268c252f07629cad66ea643a2f1fcb79...f9a74f7025469a64d021740f48eb9171bf58008f`
  第二轮双轴评审清零，Standards 0 findings、Spec 0 findings。首轮 Standards 2 项与 Spec 3 项 findings 均已在
  focused fix 中关闭。
- 2026-07-28 `Handoff`：Ticket 03 以 commits `f31548ed`、`f9a74f70` 完成交付并标记为 `resolved`，17 项验收
  checkbox 全部勾选。最终普通测试 `@iam/contracts` 17/17、`@iam/admin-api` 124/124、`@iam/admin` 21/21，
  Admin Playwright 6/6；三个 workspace lint/typecheck、全仓 lint、API/Admin API production smoke、
  Architecture Guard、文档索引与 whitespace 检查均通过。仅保留既有 lint 与 Playwright dev server warning，
  按 ticket 工作流未运行全仓 `pnpm verify`。
- 2026-07-28 `Dependency`：Ticket 03 resolved 后 Ticket 04 与 Ticket 06 均已解阻并保持 `ready-for-agent`；
  同一功能分支下一票按依赖顺序选择 Ticket 04，Ticket 06 不被重新阻塞并继续保持 ready。
- 2026-07-28 `Authorization`：implementation 子代理在固定点
  `fc1f174c379dcd1562a334d5bb155ef504ea9fb4` 认领 Ticket 04；本票只交付单个 Principal Session
  Revocation，不实现用户全部撤销或 Temporary Login Restriction 管理。验收项与 `resolved` 状态保留到双轴评审
  findings 清零后的 handoff。
- 2026-07-28 `Implementation`：Ticket 04 为 Admin session management service 增加消费方拥有的单会话 control、
  audit 与 logger port，使用固定 `admin_revoke` 原因调用既有 Session Kernel 级联。当前管理 Principal Session 在
  control 之前以 `409 / ADMIN_SESSION_CURRENT_PROTECTED` 保护；已失效目标返回 `changed:false`，外围 cleanup
  部分失败仍返回只含计数的成功摘要，Kernel control 不可用固定映射
  `503 / ADMIN_LOGIN_STATE_UNAVAILABLE`。
- 2026-07-28 `Implementation`：REST `POST /admin/session-management/sessions/revoke` 与 tRPC
  `admin.sessionManagement.revokeSessions` 复用严格 session-only adapter、server-owned actor/audit context 和
  白名单 VO。新增 `admin.session.revoke`；success、no-op 与 current protection failure 使用内部
  `principalSessionId` 精确审计，不持久化 token、lookup/HMAC、目标来源、metadata、cleanup ref/failure 或原始异常。
  Redis 作用后的审计失败记录结构化系统日志并返回
  `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，mutation 不重试。
- 2026-07-28 `Implementation`：Admin 有效会话行新增“强制下线本次”与无备注确认框，当前会话按钮禁用，明确第三方
  本地会话边界且不展示关联应用清单。页面对成功、无变化、cleanup 警告、当前会话保护、状态不可用和作用后审计失败
  使用稳定提示；成功或作用可能已发生时仅刷新当前页一次。Admin Umi 将 `@iam/contracts` 精确 alias 到 workspace
  source，避免 MFSU 旧 vendor bundle 令新增 runtime enum 成员为 `undefined`；production build 已确认两个新错误码
  进入正式 chunk。
- 2026-07-28 `Validation`：最终普通测试 `@iam/contracts` 18/18、`@iam/api-core` 118/118、
  `@iam/admin-api` 139/139、`@iam/admin` 27/27 通过；完整 Admin Playwright 10/10 通过。单会话 E2E 精确验证
  success、no-op、cleanup 与 audit-after-effect 各 1 次 mutation/1 次 reload，current protection 在目标确认前
  0 mutation/0 reload。
- 2026-07-28 `Validation`：四个受影响 workspace lint/typecheck、全仓 lint 16/16、Admin production build、
  API/Admin API production smoke 各 1/1、Architecture Guard、文档索引、env naming 与 whitespace 检查通过。
  仅保留既有 SSO/Admin lint warnings 与 Playwright Umi dev server MaxListeners warning。本票未修改 Session Kernel
  或 Redis 协议，无适用新增 `test:redis`；按 ticket 工作流未运行全仓 `pnpm verify`。
- 2026-07-28 `Review`：Ticket 04 候选实现等待从固定点
  `fc1f174c379dcd1562a334d5bb155ef504ea9fb4` 到 candidate commit 的 Standards / Spec 双轴评审；Ticket 保持
  `claimed` 且验收 checkbox 保持未勾选。
- 2026-07-28 `Review Fix`：Ticket 04 首轮六项 finding 已在追加 focused fix 中处理。当前会话保护与
  `changed:false` 的审计写入失败统一包装为安全
  `500 / COMMON.INTERNAL_ERROR / 服务器内部错误`，provider message、stack 与扩展字段只保留在内部 `cause`；
  只有 `changed:true` 继续使用 `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`。REST error handler 与 tRPC
  formatter 均新增 pre-effect / no-effect 泄漏回归断言。
- 2026-07-28 `Review Fix`：revoke service tests 复用可覆盖 deps、input、actor 与 audit context 的本地 harness；
  REST/tRPC mutation errors 改为表驱动 transport assertion；四个 session revoke Playwright 流程复用文件内
  setup/action/assertion helper，并精确验证一次 mutation 与一次 reload。确认框补充“强制下线不阻止未来重新登录”
  及疑似凭据泄露时的密码重置、账号暂停或结束处置；cleanup warning 显示脱敏 `cleanup.failed` 数量。
- 2026-07-28 `Validation`：focused fix 后普通测试 `@iam/contracts` 18/18、`@iam/api-core` 118/118、
  `@iam/admin-api` 143/143、`@iam/admin` 27/27，完整 Admin Playwright 10/10。四个受影响 workspace
  lint/typecheck、全仓 lint 16/16、Admin production build、API/Admin API production smoke 各 1/1、
  Architecture Guard、文档索引、env naming 与 whitespace 检查通过；只保留既有 25 条 Admin、4 条 SSO lint
  warning 与 Playwright Umi dev server MaxListeners warning。Ticket 继续保持 `claimed`，17 项验收 checkbox
  保持未勾选，等待从固定点 `fc1f174c379dcd1562a334d5bb155ef504ea9fb4` 到追加 candidate commit 的完整双轴复审。
- 2026-07-28 `Review`：Ticket 04 首轮完整双轴评审提出 Standards 4 项、Spec 2 项 findings；均由 focused fix
  commit `d574c883` 关闭。固定点
  `fc1f174c379dcd1562a334d5bb155ef504ea9fb4...d574c88357c03480a0adfb590ab916b9eea5d9fa`
  的第二轮完整双轴评审清零，Standards 0 findings、Spec 0 findings。
- 2026-07-28 `Handoff`：Ticket 04 以 commits `a01af3dc`、`d574c883` 完成交付并标记为 `resolved`，17 项
  验收 checkbox 全部勾选。最终普通测试 `@iam/contracts` 18/18、`@iam/api-core` 118/118、
  `@iam/admin-api` 143/143、`@iam/admin` 27/27，Admin Playwright 10/10；四个 workspace lint/typecheck、
  全仓 lint 16/16、Admin production build、API/Admin API production smoke、Architecture Guard、文档索引、
  env naming 与 whitespace 检查均通过。仅保留既有 lint 与 Playwright dev server warning，按 ticket 工作流未运行
  全仓 `pnpm verify`。
- 2026-07-28 `Dependency`：Ticket 04 resolved 后 Ticket 05 已解阻；Ticket 05 与 Ticket 06 均保持
  `ready-for-agent`，下一票按依赖顺序选择 Ticket 05。
- 2026-07-28 `Authorization`：implementation 子代理在固定点
  `a2d8c2ad03edef87af5ec838e4b4255b6e8a7717` 认领 Ticket 05；本票只交付用户级 Session Revocation，
  不实现 Temporary Login Restriction、任意批量或全站下线、session generation、revocation epoch 或登录冻结。
  验收项与 `resolved` 状态保留到双轴评审 findings 清零后的 handoff。
- 2026-07-28 `Implementation`：Ticket 05 在既有 `revokeSessions` intent 与 REST/tRPC shared adapter 中增加严格
  `user` target。Admin service 通过消费方拥有的 bulk control 一次处理操作开始时已索引的用户根会话，不预取
  inventory 或逐行调用单会话 control；其他用户全部撤销，actor 本人由服务端注入当前
  `principalSessionId` 例外并继续撤销其 children 与其他 roots，缺少当前 ID 时在 control 前 fail closed。
- 2026-07-28 `Implementation`：新增 `admin.session.revoke_user` 安全审计与 user-scope 白名单 VO，沿用
  `admin_revoke`、幂等 no-op、cleanup 脱敏计数和作用后审计失败语义。Admin 每个会话行使用统一“下线该用户全部”
  操作；本人确认框解释当前根例外，普通与本人确认框都明确点式并发窗口、第三方本地会话边界、未来登录仍允许及
  密码重置、账号暂停或结束的后续处置。本票未增加 batch/global/generation/freeze 能力。
- 2026-07-28 `Validation`：最终普通测试 `@iam/contracts` 18/18、`@iam/api-core` 118/118、
  `@iam/admin-api` 155/155、`@iam/admin` 28/28；完整 Admin Playwright 15/15，Admin production build 通过。
  根 lint 16/16 与根 typecheck 15/15 workspaces 通过；lint 只回放既有 Admin 25 条、SSO 4 条 warning。
- 2026-07-28 `Validation`：API Core Windows Job smoke 与 Admin API production-composition smoke 各 1/1，
  Architecture Guard、文档索引、env naming 与 whitespace 检查通过。Playwright 仅保留既有 Umi dev server
  MaxListeners warning。本票复用既有 Session Kernel 用户级级联事实且未修改 Kernel/Redis 协议，无适用新增
  `test:redis`；按 ticket 工作流未运行全仓 `pnpm verify`。
- 2026-07-28 `Review`：固定点
  `a2d8c2ad03edef87af5ec838e4b4255b6e8a7717` 到 candidate commit 的范围自审未发现 Ticket 06、任意 batch/global、
  generation/epoch/freeze 或冻结 OpenSpec 改动；Ticket 05 保持 `claimed`，15 项验收 checkbox 保持未勾选，
  等待 Standards / Spec 双轴评审。
- 2026-07-28 `Review`：Ticket 05 首轮完整双轴评审为 Spec 0 findings、Standards 5 findings。Standards 要求补齐
  用户级撤销 audit current 边界、把生产必传的 user-control `auditContext` 收紧为 required、去除 audit/service
  重复、压缩 service test fixture 重复，并收口页面安全提示与 E2E helper 命名。
- 2026-07-28 `Review Fix`：`admin.session.revoke_user` current 文档明确 user target、允许的脱敏 details、禁止的
  actor 当前 Principal Session ID/目标来源/cleanup 内容/credential/raw exception，以及 `changed:true` 的
  after-effect error。consumer-owned user control 将 `auditContext` 改为 required；负向类型测试先以 unused
  `@ts-expect-error` 复现旧 port 仍允许缺失，再由收紧后的 port 令 typecheck 通过且 production provider 继续
  structural satisfy。
- 2026-07-28 `Review Fix`：session/user audit builder 复用同一安全 context/details 构造并移除污染 target 字段；
  service 复用 protected-failure helper，保持先审计、审计失败安全包装、成功审计后再抛 protection 的顺序。审计
  target 污染回归先复现 2 项失败，修复后 audit 6/6；service 23/23 保持通过。
- 2026-07-28 `Review Fix`：revoke service tests 扩展单一 harness、user-control call capture、summary fixture 与
  no-op table，删除重复 deps 和完整 Kernel summary 拼装且保留 other/self/missing/no-op/cleanup/audit/unavailable
  断言。页面使用内部公共安全提示 builder 拼装普通/本人确认文案；Playwright helper 更名为
  `setupSessionRevoke`，测试继续以独立 literal 验证外部文案事实。
- 2026-07-28 `Validation`：focused port/audit/service 30/30、sessions Playwright 13/13；最终普通测试
  `@iam/contracts` 18/18、`@iam/api-core` 118/118、`@iam/admin-api` 155/155、`@iam/admin` 28/28，完整 Admin
  Playwright 15/15，Admin production build 通过。
- 2026-07-28 `Validation`：根 lint 16/16、根 typecheck 15/15 workspaces、API Core Windows Job smoke 1/1、
  Admin API production-composition smoke 1/1、Architecture Guard、文档索引、env naming 与 whitespace
  检查通过。仅保留既有 Admin 25 条、SSO 4 条 lint warning 与 Playwright Umi dev server MaxListeners warning；
  未运行全仓 `pnpm verify`。
- 2026-07-28 `Review`：首轮 5 项 Standards finding 已在 focused fix 中处理；Ticket 05 继续保持 `claimed`，
  15 项验收 checkbox 保持未勾选，等待固定点
  `a2d8c2ad03edef87af5ec838e4b4255b6e8a7717` 到追加 candidate commit 的完整 Standards / Spec 双轴复审。
- 2026-07-28 `Review`：Ticket 05 第二轮完整双轴评审为 Spec 0 findings、Standards 1 项 P2 finding：已认证
  actor 缺少当前 Principal Session ID 时，adapter 在 service 前返回 401，使规范要求的 self user protected
  failure audit 在 REST/tRPC production 路径不可达。
- 2026-07-28 `Review Fix`：session-management adapter 继续以缺失或非法 `actorUserId` 判定 401，但把已认证 actor
  缺失、空白或非法的服务端 `principalSessionId` 归一化为 `null` 交给 service。真实 adapter→service seam 先复现
  REST 401，再修复为 REST `409 / ADMIN_SESSION_CURRENT_PROTECTED` 与 tRPC `CONFLICT`；每个请求恰写一条安全
  `admin.session.revoke_user` failure audit，user-control 与单会话 control 均为零 mutation。完全缺失 actor 的
  401 回归继续通过。
- 2026-07-28 `Validation`：修复后 session-management adapter 13/13、`@iam/admin-api` 完整普通测试 155/155，
  Admin API lint/typecheck、根 lint 16/16、根 typecheck 15/15 workspaces、Admin API production-composition
  smoke 1/1、Architecture Guard、文档索引、env naming 与 whitespace 检查通过。根 lint 仅回放既有 Admin 25 条
  与 SSO 4 条 warning；按约定未运行全仓 `pnpm verify`。
- 2026-07-28 `Review`：第二轮 P2 finding 已在独立 focused fix 中处理；Ticket 05 保持 `claimed`，15 项验收
  checkbox 保持未勾选，等待固定点
  `a2d8c2ad03edef87af5ec838e4b4255b6e8a7717` 到追加 candidate commit 的完整 Standards / Spec 双轴复审。
- 2026-07-28 `Review`：Ticket 05 第三轮完整双轴评审为 Spec 0 findings、Standards 2 项 P3 finding：
  adapter transport seam 重复两份 protected-user failure-audit matcher，四个目标 user 43 的 Playwright 场景重复
  用户行定位、确认、精确 mutation request 与 reload 断言。
- 2026-07-28 `Review Fix`：adapter test 提取单一 `expectedProtectedUserAudit` fixture，继续分别断言 REST 后恰一条、
  tRPC 后合计两条 audit，并保留全部安全字段与 Principal Session ID 不泄漏检查。sessions Playwright 提取
  `revokeUserAndExpectReload` helper，共享用户行定位、确认、精确 `{ type: 'user', userId: 43 }` request 与
  单次 reload 断言；各场景的确认文案、success/no-op/cleanup/audit-after-effect 提示及敏感内容不显示断言继续
  使用独立 literal。
- 2026-07-28 `Validation`：session-management adapter focused test 13/13、sessions Playwright 13/13，
  Admin API 与 Admin workspace lint/typecheck 通过；Admin lint 仅回放既有 25 条 warning，Playwright 仅回放
  既有 Umi dev server MaxListeners warning。按约定未运行全仓 `pnpm verify`。
- 2026-07-28 `Review`：第三轮 2 项 P3 finding 已在独立 focused fix 中处理；Ticket 05 保持 `claimed`，15 项
  验收 checkbox 保持未勾选，等待固定点
  `a2d8c2ad03edef87af5ec838e4b4255b6e8a7717` 到追加 candidate commit 的完整 Standards / Spec 双轴复审。
- 2026-07-28 `Review`：Ticket 05 完整范围
  `a2d8c2ad03edef87af5ec838e4b4255b6e8a7717...b93b658a5950ca5ee2492840d96e8947be6dc354`
  最终双轴评审清零，Standards 0 findings、Spec 0 findings。此前三轮 Standards 的 5 项、1 项 P2 与 2 项 P3
  findings 均已由 focused fix 关闭，Spec 始终为 0 findings。
- 2026-07-28 `Handoff`：Ticket 05 以 commits `c9cb86b5`、`1cc01016`、`a4608c42`、`b93b658a` 完成交付并标记为
  `resolved`，15 项验收 checkbox 全部勾选。最终普通测试 `@iam/contracts` 18/18、`@iam/api-core` 118/118、
  `@iam/admin-api` 155/155、`@iam/admin` 28/28，完整 Admin Playwright 15/15，Admin production build 通过；
  最后一轮测试重构后 session-management adapter focused test 与 sessions Playwright 均为 13/13。
- 2026-07-28 `Handoff`：根 lint 16/16、根 typecheck 15/15 workspaces、API Core Windows Job smoke 与
  Admin API production-composition smoke 各 1/1，Architecture Guard、文档索引、env naming 与 whitespace
  检查均通过。仅保留既有 Admin 25 条、SSO 4 条 lint warning 与 Playwright Umi dev server MaxListeners
  warning；按 ticket 工作流未运行全仓 `pnpm verify`。
- 2026-07-28 `Dependency`：Ticket 05 handoff 完成；Ticket 06 继续保持 `ready-for-agent`，下一票需由主会话显式
  调度全新的 implementation 子代理。
- 2026-07-28 `Authorization`：implementation 子代理在固定点
  `26711a1507db6a74614d8f0f99152e0985e63416` 认领 Ticket 06；本票只交付 Temporary Login Restriction 的
  Admin API、共享 REST/tRPC adapter 与管理端第二标签页，不改变限制策略、不回填旧状态且不影响任何 Principal
  Session。验收项与 `resolved` 状态保留到双轴评审 findings 清零后的 handoff。
- 2026-07-28 `Implementation`：Admin session management service 通过消费方拥有的 `loginRestrictions` port
  增加 `listLoginRestrictions` 与 `releaseLoginRestriction`，production `LoginRestriction` 以 structural typing
  直接满足该 port。列表保留共享模块的到期倒序与精确用户筛选，批量补充账号状态；解除只调用共享原子
  `clearLoginState`，返回 `changed` 与 `failureStateCleared:true`，不触碰任何 Session inventory/control。
- 2026-07-28 `Implementation`：REST 限制查询/按 user ID 解除与 tRPC 两个 procedure 复用严格 shared adapter、
  server-owned audit context 和白名单 VO。新增 `admin.login_restriction.release` 安全审计；success/no-op 都记录
  规范 cause、最后 Trigger Method、`changed` 与清理事实，`changed:true` 后审计失败沿用作用后错误且不重试。
  Admin 第二标签页展示用户、账号状态、固定原因、Trigger Method、自动到期和行内本地倒计时，并提供无备注解除确认；
  页面不轮询、不增加策略配置、allowlist、宽限期、通知或 backfill。
- 2026-07-28 `Validation`：TDD RED/GREEN 覆盖 service 两意图、audit catalog、REST/tRPC adapter、OpenAPI、wrapper
  与第二标签页。最终普通测试 `@iam/contracts` 18/18、`@iam/api-core` 118/118、`@iam/admin-api` 173/173、
  `@iam/admin` 35/35；完整 Admin Playwright 21/21，Admin production build 通过。
- 2026-07-28 `Validation`：四个受影响 workspace lint/typecheck、根 lint 16/16、根 typecheck 15/15、API Core
  Windows Job smoke、API 与 Admin API production smoke、Architecture Guard、文档索引、env naming 与 whitespace
  检查均通过。Admin/SSO 只回放既有 warning，Playwright 只回放既有 dev server MaxListeners warning。显式真实
  Redis lane 因未提供 `IAM_API_CORE_TEST_REDIS_URL` 按契约 126ms 快速失败，未 skip、fallback、启动 Docker 或
  flush；按 ticket 工作流未运行全仓 `pnpm verify`。Ticket 保持 `claimed` 且验收 checkbox 未勾选，等待固定点到
  candidate commit 的 Standards / Spec 双轴评审。
- 2026-07-28 `Review`：Ticket 06 首轮完整双轴评审提出 Standards 5 项 P3 findings，要求统一 mutation 作用后审计
  helper、使用限制 cause/Trigger Method 常量、收口 adapter 与 Playwright tRPC transport harness 重复，以及复用
  两个标签页的用户摘要；Spec 提出 2 项 P3，要求锁定解除 REST path 参数与显式证明所有解除路径零 Principal
  Session 副作用。真实 Redis contract 另有 1 项环境 P2：当前仍缺少 caller-owned
  `IAM_API_CORE_TEST_REDIS_URL`，不能把该验收项视为已满足。
- 2026-07-28 `Review Fix`：service 新增共享 mutation audit helper，单会话、用户级撤销与限制解除复用同一
  pre/no-effect 安全包装和 changed-after-effect 日志语义；限制解除日志 fallback 改用
  `AdminLoginRestrictionCause` 与 `AdminLoginRestrictionTriggerMethod` 常量。OpenAPI contract 锁定 DELETE
  `{userId}` 只有一个 required path positive integer 参数及 strict input；service harness 在 changed、no-op、
  inventory/release 503 与两类 audit failure 路径显式断言 Session inventory、单会话 control、用户级 control
  均为零调用。
- 2026-07-28 `Review Fix`：adapter tests 使用 typed generic mutation transport harness 并保留 revoke/release
  薄封装；Playwright fixtures 使用 typed query/mutation 底层 helper 与四个 domain wrapper，集中 batch input、
  success/error envelope 和 failure catalog。两个标签页改为复用页面私有 `UserSummary` 与唯一账号状态展示表，
  对外文案、请求捕获和错误映射保持不变。
- 2026-07-28 `Validation`：review fix 后 Admin API service/adapter/OpenAPI focused 61/61，
  `@iam/admin-api` 普通测试 174/174、`@iam/admin` 普通测试 35/35，完整 Admin Playwright 21/21；Admin
  production build、Admin API production-composition smoke 1/1、受影响 lint/typecheck、根 lint 16/16 与根
  typecheck 15/15 workspaces 通过。Architecture Guard、文档索引、env naming 与 whitespace 检查通过；仅回放
  既有 lint warning 与 Playwright dev server MaxListeners warning。
- 2026-07-28 `Validation`：最终环境仍未提供 `IAM_API_CORE_TEST_REDIS_URL`；实际执行
  `pnpm --filter @iam/api-core test:redis` 在约 1.5 秒内以 caller-owned dedicated Redis 必需变量说明快速失败，
  0 pass/1 fail，未 skip、fallback、启动 Docker 或 flush。按 ticket 工作流未运行全仓 `pnpm verify`；Ticket 06
  继续保持 `claimed` 且 20 项验收 checkbox 保持未勾选，等待固定点到追加 fix candidate 的完整 Standards / Spec
  双轴复审。
- 2026-07-28 `Review`：Ticket 06 固定范围
  `26711a1507db6a74614d8f0f99152e0985e63416...5cd2ac0ba58a62cec6403b1fe4b2e4a97f07577e`
  的完整复审为 Standards 0 findings、代码层 Spec 0 findings。唯一剩余 P2 是环境未提供 caller-owned
  `IAM_API_CORE_TEST_REDIS_URL`，因此 real Redis lane 为 0 pass/1 fail，真实 Redis contract 验收证据仍缺失。
- 2026-07-28 `Blocked Progress`：这不是 resolved handoff；Ticket 06 继续保持 `claimed`，20 项验收 checkbox
  全部未勾选。下一安全动作是调用方设置指向专用 Redis 测试实例的 `IAM_API_CORE_TEST_REDIS_URL`，再运行
  `pnpm --filter @iam/api-core test:redis`；该通道通过后才能补做证据复审并执行 resolved handoff。本轮未修改产品
  代码或 ticket，未运行全仓 `pnpm verify`。
- 2026-07-29 `Diagnosis`：调用方提供专用本地 Redis 后，真实通道首次以 IPv4 运行得到 3 pass/1 fail；首个并发
  contract 在约 10 秒报告 `beforeEach/afterEach hook timed out`，完整命令约 231.6 秒后非零退出。官方单文件
  name-filter 最小 loop 3/3 在 10031ms 复现同一红灯；runner 外同一调用的 create harness、create scope、完整
  body、scope close 与 harness close 分别约 17ms、6ms、8ms、13ms 与 1ms。
- 2026-07-29 `Diagnosis`：临时 runner 把卡点收窄到真实 ioredis promise matcher。保持 25 次并发、writer/
  observer、四个 hooks、timeout、Lua 和业务断言不变时，两个 Redis 结果均先直接 `await` 再同步断言为 10/10
  green，进程均正常退出且 scope/harness 清理完成；只恢复 `getRestriction` 的 Bun
  `.resolves.toMatchObject` 后为 3/10 red，所有红灯都停在该 matcher 并继续阻塞 `scope.close`。根因确定为 Bun
  1.3.12 promise matcher 与真实 ioredis promise 的 flaky hang，而非 Redis Lua、并发线性化或超时预算。
- 2026-07-29 `Review Fix`：真实 Redis contract 中所有 ioredis 调用改为先直接 `await` 结果、再使用同步 matcher；
  原有并发窗口、transition 启动时机、断言字段与数量、hook、timeout、harness 和 production 代码均未改变。官方
  首项 name-filter 修复后连续 10/10 通过并正常退出，运行前后遗留快照均为既有 11 prefixes/33 keys，证明每轮
  随机 namespace 清理完成。
- 2026-07-29 `Validation`：`pnpm --filter @iam/api-core test:redis` 连续 3 次均为 4/4、194 assertions，
  runner 分别用时 508ms、403ms、429ms；API Core 普通测试 118/118、lint、typecheck 通过。根 lint 16/16、根
  typecheck 15/15、Architecture Guard、文档索引、env naming 与 whitespace 检查通过；仅回放既有 Admin/SSO
  lint warning，未运行全仓 `pnpm verify`。
- 2026-07-29 `Cleanup`：确认无 Bun/Node/pnpm 测试进程后，以精确
  `iam:test:login-restriction:<uuid>:` ownership pattern 枚举并 `UNLINK` 诊断失败遗留的 11 个随机 prefix、
  33 个 key，未执行 `FLUSHDB`/`FLUSHALL` 且未触碰其他 key；复查剩余 prefix/key 均为 0。两个临时 debug 文件
  已删除，源码与测试目录不存在临时 instrumentation。
- 2026-07-29 `Review`：真实 Redis contract 的环境 P2 现已有通过证据，但这仍不是 resolved handoff。Ticket 06
  继续保持 `claimed` 且 20 项验收 checkbox 全部未勾选，等待固定范围加入本次独立 fix 后的 Spec evidence
  re-review；复审清零后再执行 resolved handoff。
- 2026-07-29 `Review`：Ticket 06 最终固定范围
  `26711a1507db6a74614d8f0f99152e0985e63416...a081c3036b9d88a40647e4c787ea16e6b0688dc0`
  的双轴评审清零，Standards 0 findings、Spec 0 findings。两位 reviewer 分别在独立 Redis 上复跑真实 contract，
  均为 4/4、194 assertions、exit 0，运行后 owned prefix/key 残留均为 0；Bun 1.3.12 与真实 ioredis promise
  matcher 的 hang 根因及 direct-await 修复证据已纳入最终候选。
- 2026-07-29 `Handoff`：Ticket 06 以实现 commits `7cb454ef`、`5cd2ac0b`、`a081c303` 完成交付；中间
  tracker-only blocked progress commit 为 `2f3a98dd`。最终普通测试、focused contract、完整 Admin Playwright、
  production build/smoke、lint/typecheck、Architecture Guard、文档索引、env naming、whitespace 与真实 Redis
  contract 证据均通过；按 ticket 工作流未运行全仓 `pnpm verify`。
- 2026-07-29 `Handoff`：Ticket 06 已标记为 `resolved`，20 项验收 checkbox 全部勾选。至此本 feature 的
  Ticket 01–06 均为 `resolved`；本条仅完成 tracker handoff，不修改产品代码、推送、部署或执行本地合入。
