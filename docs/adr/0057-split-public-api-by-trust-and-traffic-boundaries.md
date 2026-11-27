---
status: accepted
---

# 按信任边界与流量模型拆分公共 API 运行时

原单体 `@iam/api`（`apps/api`）在同一 Bun/Hono 进程内同时承载终端认证与账号自助、高并发在线协议（Custom SSO / OIDC）与网关 `forward-auth`、M2M 目录搜索、应用委托及历史供应商写入，并集中持有主库读写凭据、OIDC 签名私钥、SM2 解密私钥、企业微信密钥、短信网关密钥与 CAP 密钥等 60 余项环境变量。

决定将原 `apps/api` 拆分为 3 个无状态、可独立部署与扩缩容的运行时服务：`apps/auth-api`（`@iam/auth-api`）、`apps/sso-api`（`@iam/sso-api`）与 `apps/integration-api`（`@iam/integration-api`），整体交付后退役 `apps/api`。本决定沿用 [ADR-0028](0028-extract-session-and-grant-state.md) 的共享业务内核所有权，修订其将根认证与两套在线协议同置单一 API 进程的部署形态。

仅在 `apps/api` 内做逻辑模块化，无法把热路径 `forward-auth` 与重 JSONB 查询、bcrypt 计算隔离开，也无法按服务收窄高敏私钥权限。本次不把 OIDC 或 Client Delegation 继续拆成第 4、5 个服务，以免在当前规模下过早扩大镜像、Compose 与 E2E 运维面；但 `sso-api` 内部保持 `@iam/oidc` 与 `@iam/custom-sso` 装配解耦，以便后续按需拆出独立 `oidc-api`。

## 三服务边界、端口与运行约定

拆分后的 3 个服务之间**不引入服务间同步 HTTP RPC**，继续通过共享 `packages/*` 直连 Redis 与 PostgreSQL，维持[系统架构](../engineering/system-architecture.md#数据权威来源与恢复责任)既定的数据权威与恢复责任边界，避免在 `forward-auth` 等热路径叠加额外网络跳数与级联超时：

| 服务与包名                                       | 默认容器端口 | 环境变量前缀            | `sourceApp` / 日志标签 | 职责与资源边界                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------ | ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/auth-api`（`@iam/auth-api`）               | `30000`      | `IAM_AUTH_API_*`        | `auth-api`             | 终端用户身份认证（密码、短信、OA、企微及企微跨设备扫码与绑定）、人机风控（CAP 与图片验证码）、短信与账号找回、登录页公开客户端状态、本人改密与绑定手机；独占 SM2 解密私钥、企微密钥、CAP 密钥、`MAGIC_CODE` 与 bcrypt                                         |
| `apps/sso-api`（`@iam/sso-api`）                 | `30002`      | `IAM_SSO_API_*`         | `sso-api`              | Custom SSO 协议（含 `/sso/logout`）、OIDC Provider（含 `/oidc/health`）、网关 `forward-auth` 与 Custom SSO 主体投影交付；独占 OIDC 签名私钥，不碰企微/短信/SM2/bcrypt，不写业务表（仅对业务表执行只读查询并向 `log.audit_logs` 追加 `auth.login.local` 审计） |
| `apps/integration-api`（`@iam/integration-api`） | `30005`      | `IAM_INTEGRATION_API_*` | `integration-api`      | M2M `internal-authz`、用户/组织目录文档查询与 DSL 搜索（持有独立语句超时连接池）、应用委托（收口 M2M 与个人自助委托）、以及 3 个历史内部写接口（供应商组织注册、组织更新、供应商联系人注册）                                                                  |

三服务统一暴露 `/health`（进程与 Redis 探活）和 `/ready`（进程、Redis 与 PostgreSQL 探活），各自维护仅包含本服务必需项的 `env.ts`、独立 `Dockerfile` 与 OpenAPI 文档，并在 Loki/Grafana 中通过各自的 `shgas-iam.logs.service` 标签区分。

## 跨界能力归属与边界取舍

- **企微扫码（WeChat QR）全归 `auth-api`**。原 `/sso/wechat-qr/*` 与 `/oidc/wechat-qr/*` 均依赖企微 API、短信验证码、SM2 解密、bcrypt 验密、写库绑定与人机风控。桌面端与移动端扫码流程统一归属 `auth-api`；`auth-api` 仅消费 `@iam/custom-sso` 与 `@iam/oidc` 的只读 continuation inspect 能力，不持有 OIDC 签名私钥，使 `sso-api` 不再承担第三方外部集成与账号写入。
  - **OIDC 浏览器绑定 Cookie 路径放宽至 `/`**。桌面端 OIDC 企微扫码合并至 `/api/iam/auth/wechat-qr/*` 后，原 `Path=/oidc` 的 `oidc_interaction_binding` 不会被浏览器发送至此路径。`sso-api` 将该 Cookie 路径放宽为 `Path=/`（与 `custom_sso_continuation` 对齐，保留 `HttpOnly`、`SameSite=Lax` 与适用 `Secure` 属性；`oidc_login_completion` 与 `oidc_logout_*` 保持 `/oidc`）。
    放弃在 APISIX 保留 `/oidc/wechat-qr/*` 反向代理到 `auth-api` 的方案，换取前后端与网关上单一规范的桌面扫码入口。
  - **`sso-api` 显式非敏感企微扫码开关**。`sso-api` 不持有企微凭据，但 `/sso/login-guard` 与 `/oidc/login-guard` 仍需告知登录页是否展示扫码入口，因此增加非敏感布尔配置 `IAM_SSO_API_WECHAT_QR_ENABLED`（默认 `false`），与 `X-IAM-Entry-Network: internal` 共同决定 `wechatQr` 开关，并在部署与 E2E 编排中与 `auth-api` 保持一致。
- **`/sso/logout` 归属 `sso-api`**。退出与重定向属于纯 Redis 会话终止操作，与 `/oidc/session/end` 一并放在协议层。
- **个人应用委托 `/api/iam/delegations/*` 仅接受 `Client: iam` 根会话**。原 `/public/delegations/*` 因共用 `publicRouter`，在非 `iam` 的 `Client` 头下会调用 `@iam/custom-sso` 校验 Local Session。
  拆分后个人委托面向 SSO 门户本人自助，收紧为仅接受 `Client: iam` 的 `UserSession`（`global_session` 或对应根会话 Token），拒绝非 `iam` Client 与 Custom SSO Local Session；第三方应用继续经 `/api/iam/internal/delegations/*` 的 `apikey` 通道接入。由此 `integration-api` 只需直连 `@iam/session-kernel` 与 `@iam/subject-access`，不依赖 `@iam/custom-sso`。
- **3 个历史内部写接口留在 `integration-api`**。`POST /internal/users/purveyor/contacts`、`POST /internal/organizations/purveyors` 与 `PUT /internal/organizations/:orgCode` 继续由 `integration-api` 承载（目录查询仍使用独立语句超时连接池），联系人注册的欢迎短信复用独立 SMS 客户端按需注入。本次拆分不把欢迎短信改为 Worker 异步发送，也不为此单拆第 4 个写服务。
- **暂维持统一 PostgreSQL 账号**。本次聚焦服务与路由边界拆分，暂不引入新的 PostgreSQL 专用只读/追加角色与运维授权变更；`sso-api` 在代码层限定为只读业务表加追加 `log.audit_logs`，后续可按需收紧为专用最小权限账号。

## 规范路由前缀与第三方兼容

原有 `/api/iam/auth/*`、`/api/iam/open/*`、`/api/iam/public/*`、`/sso/*`、`/oidc/*` 按认证等级混装了不同服务的能力。拆分按三类路由分别处理，确保已接入第三方平滑过渡：

1. **协议与 M2M 稳定契约保持不变**：`/oidc/*`（遵守 [ADR-0036](0036-bind-oidc-to-internal-and-external-issuers.md) 双 issuer 约定）、`/sso/*` 协议端点（含 [ADR-0038](0038-derive-managed-sso-callback-from-redirect-origin.md) 的 `/sso/callback`）、3 个外部固定回调入口（`/sso/thirdparty/:clientCode`、`/sso/third-party/wx`、`/sso/wechat-qr/mobile/callback`，由 APISIX 显式转发至 `auth-api`），以及全部 `/api/iam/internal/*` 路径原样保留。
2. **IAM 自有前端独占路由直接切换至规范前缀**：
   - `auth-api` 使用 `/api/iam/auth/*`（收纳原 `/auth/login/*`、`/open/*`、`/public/password/change`、`/public/mobile/set`，并将原 `/sso/wechat-qr/*` 与 `/oidc/wechat-qr/*` 桌面端入口合并至 `/api/iam/auth/wechat-qr/*`）；
   - 个人应用委托从 `/api/iam/public/delegations/*` 规范化为 `/api/iam/delegations/*`，直连 `integration-api`；
   - `apps/sso` 随本次交付同步切换上述路径。
3. **3 个第三方跨界历史端点通过 APISIX 双轨兼容**：
   - `sso-api` 提供规范路径 `/api/iam/sso/user-info` 与 `/api/iam/sso/authz`；APISIX 保留 `/api/iam/public/user-info` 与 `/api/iam/auth/authz` 的 `proxy-rewrite` 兼容路由指向 `sso-api`；
   - `integration-api` 提供规范路径 `/api/iam/internal/authz`；APISIX 保留 `/api/iam/auth/internal-authz` 的 `proxy-rewrite` 兼容路由指向 `integration-api`；
   - 旧路径在接入指南中标记为兼容别名，待接入方与业务网关 manifest 迁移完成后择机退役；直接指向原容器内网地址（而非经 APISIX）的业务 `forward-auth.uri`，发布前须在对应业务 manifest 中同步更新目标地址。

## 共享能力下沉与整体交付边界

为避免在 3 个 app 间复制基础设施代码，跨服务共享逻辑按现有 owner 边界下沉，尽量减少新增 package 数量：

- HTTP 认证与协议传输中间件（`publicAuthenticationHandler`、`internalAuthenticationHandler`、Custom SSO cookie/client-code transport、retryable error 映射、HTTP 审计上下文提取）下沉至 `@iam/api-core` 显式子路径；
- 通用 Client 运行时缓存（`cache:client:code:*` / `cache:client:secret:*` 的读取与失效，供 `auth-api`、`integration-api` 与 `admin-api` 共享）归口至 `@iam/client-snapshot` 显式子路径；
- 审计日志持久化 writer 下沉至 `@iam/db/audit`；
- 纯 SMS 签名与 HTTP 发送客户端（不含业务文案）抽为共享包 `@iam/sms`，供 `auth-api` 与 `integration-api` 按需装配，也便于后续 `apps/worker` 复用。

本次拆分以**单次整体切换**交付：在单一集成分支内完成共享能力下沉、3 个新服务上线、`apps/sso` 路径切换、路由兼容配置与 `apps/api` 退役，不保留新旧两套 API 服务长期并存。当前服务边界与实现约定见[仓库地图](../engineering/repository-map.md)、[系统架构视图](../engineering/system-architecture.md)与[后端架构与实现约定](../engineering/backend-architecture.md)。

[会话与协议边界](0028-extract-session-and-grant-state.md) · [OIDC 双入口](0036-bind-oidc-to-internal-and-external-issuers.md) · [托管回调来源](0038-derive-managed-sso-callback-from-redirect-origin.md) · [分离 Ops CLI](0047-separate-operations-cli-from-worker.md)
