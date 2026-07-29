# 03 — 在管理端展示 Valid Principal Session

**What to build:** 打通 Valid Principal Session inventory 到 Admin API 和管理端页面的只读路径，使 `iam:admin` 可以分页查看、按用户筛选并理解每个有效会话的用户状态、登录方式、登录时间、过期时间和登录来源。

**Blocked by:** 02 — 建立 Valid Principal Session inventory 与 Session Origin

**Status:** resolved

- [x] 管理端新增 `/sessions` 路由、“会话管理”菜单和“有效会话”标签页，并继续使用现有管理员访问控制。
- [x] Admin session management application service 提供 `listSessions` 意图，并通过消费方拥有的 inventory 与用户摘要端口工作。
- [x] REST 提供会话查询端点，tRPC 提供 `admin.sessionManagement.listSessions`，两者复用同一 adapter、校验和 VO 映射。
- [x] 列表使用现有分页响应形状，默认每页 20 条、最大 100 条，固定按过期时间倒序。
- [x] 列表支持通过现有用户远程选择器提交精确 user ID 筛选，不提供 IP、设备、登录方式或账号状态服务端筛选。
- [x] 每行显示用户 ID、用户名、姓名，以及正常、暂停、结束、已删除或未知账号状态。
- [x] 暂停、结束、软删除或用户记录缺失的会话仍然显示；基础设施查询错误不得伪装成未知用户。
- [x] 每行显示归一化登录方式、登录时间、过期时间、完整 IP 和粗粒度设备摘要。
- [x] 设备摘要只包含约定的设备、操作系统和浏览器类别；无法识别时显示“未知”，原始 User-Agent 不返回前端。
- [x] 列表不返回或展示 `lastActiveAt`、外部 token、lookup/HMAC 信息、任意 session metadata、cleanup ref 或子凭证。
- [x] 当前管理员根会话和本人其他会话分别通过 `isCurrentSession`、`isCurrentUser` 标记，但本 ticket 不交付撤销动作。
- [x] Redis inventory 不可用时返回 `ADMIN_LOGIN_STATE_UNAVAILABLE`，页面显示服务不可用而不是空列表。
- [x] 页面支持手动刷新；翻页允许请求间数据漂移，不增加轮询、WebSocket、SSE 或快照。
- [x] Admin API 意图 seam 覆盖分页、筛选、账号状态降级、AMR 映射、来源白名单、当前会话标记和 503。
- [x] Playwright 覆盖菜单与路由、表格字段、用户筛选、分页、异常账号、未知来源和空态。
- [x] Port contract、OpenAPI、REST/tRPC parity、architecture guard 和 production composition smoke 覆盖新增 wiring。
- [x] 受影响 Admin API、管理前端、共享模块和文档通过聚焦测试、lint、typecheck、E2E、文档检查和 whitespace 检查。
