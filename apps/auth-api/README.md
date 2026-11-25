# Auth API

`@iam/auth-api` 提供终端身份认证、人机校验、账号找回和本人安全操作。配置见 [.env.example](.env.example)。默认监听
`30000`，`/health` 探测 Redis，`/ready` 同时检查 Redis 和 PostgreSQL。开发环境在 `/auth/doc` 和 `/sso/doc` 提供 OpenAPI。
外部入口和运行时边界见 [ADR-0057](../../docs/adr/0057-split-public-api-by-trust-and-traffic-boundaries.md)。

## 企微扫码续接

浏览器请求 `/api/iam/auth/wechat-qr` 及其子路径时，保留原续接参数和同一浏览器的绑定 Cookie。`protocol` 决定每次请求携带的参数。

| `protocol`   | 续接参数与绑定 Cookie                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| `custom_sso` | `ssoReturn`、`client`、`redirectUrl`、原 `state`（如有），以及 `custom_sso_continuation` |
| `oidc`       | `oidcReturn` 和 `oidc_interaction_binding`                                               |

桌面请求由可信内网入口转发，移动端继续使用公网 `/sso/wechat-qr/mobile/*`。`auth-api` 和协议服务须使用同一 Redis
逻辑 DB、Session Kernel 命名空间、OIDC 命名空间和入口 origin。OIDC 交互绑定 Cookie 使用 `Path=/`，使桌面端规范路径收到该 Cookie。

扫码请求只能由绑定的浏览器领取一次。OIDC 完成证明只绑定本次扫码创建的根会话实例，原续接期限保持不变。
交付 Cookie 前准备失败时，认证服务撤销本次未交付的根会话。已提交的企微绑定可用于下一次扫码。
状态丢失或领取后 Cookie 未交付时，浏览器需要重新扫码。应用准入和最终协议续接由协议服务处理。

## 验证

```bash
pnpm --filter @iam/auth-api typecheck
pnpm --filter @iam/auth-api lint
pnpm --filter @iam/auth-api test:unit
pnpm test:integration --workspace @iam/auth-api
```
