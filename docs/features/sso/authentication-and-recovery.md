# 登录、认证续接与账号恢复

本文定义用户登录、已有会话重入、短信验证码和找回密码的现行行为。
Custom 与 OIDC 的协议顺序分别见[Custom SSO 契约](custom-sso-contract.md)、
[OIDC 指南](../oidc/oidc-integration.md)；本人改密和全部下线见[会话管理](../admin/session-management.md)。

## 认证与根会话

API 统一装配密码、短信、OA 验签和微信服务端身份交换。密码/短信沿各自凭据校验、登录限制、人机验证与审计；
认证成功后才取得 Subject Access Permission 并创建 UserSession，使用 Redis 返回的剩余秒数写 `global_session` Cookie。
根期限创建时固定，协议授权与普通访问不续根。OA 同主体有效根可以复用原剩余期限；不同认证完成不自动合并独立根。

根 UserInfo 只接受 `Client: iam` 的根用途：先观察根并取得账号许可，再独立检查 IAM Client 的 Custom SSO 交付配置。
Client 交付拒绝保留根 Cookie；根/账号明确失效按对应 adapter 清理，暂态故障保留。
主体投影使用本操作许可和已发布 Facts，不在响应前重读根、许可或配置，仅稳定主体不读完整 Facts。
协议 Token 交给其 owner，不尝试把它当根 bearer。

## 密码登录凭证

`POST /auth/login/password` 只接受 `credential` 和可选 `capToken`，不接受明文 username/password 请求。
凭证使用 `iam-login-v1`、`SM2-SM4-CBC`、`password-login` 协议标识；前端加密，
API 校验 kid、算法、解密结果、完整性、payload 结构与时间窗口，并通过 Redis nonce 拒绝占用期内的重复凭证。
当前默认 nonce TTL 尚未覆盖完整时间接受窗口，已知限制及待讨论修复见
[时间窗口与已知限制](../../releases/sm-encrypted-password-login-release.md#时间窗口与已知限制)。

| 场景                                                       | 当前结果                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| kid 不存在、算法不支持、解密/完整性校验或 payload 结构失败 | `LOGIN.INVALID_CREDENTIAL`。                               |
| ts 过期或明显晚于服务端时间                                | `LOGIN.INVALID_CREDENTIAL`，提示凭证过期或设备时间不正确。 |
| nonce 仍处于已占用状态                                     | `LOGIN.INVALID_CREDENTIAL`，不继续校验密码或创建根。       |
| Cap token 缺失或无效                                       | 对应人机校验业务码，前端求解后携带 capToken 重试。         |
| 用户名或密码错误                                           | 保持登录失败计数、临时登录限制和审计语义。                 |

密钥/kid 配对、nonce TTL、缓存更新、发布与恢复见
[登录凭证配置与部署](../../releases/sm-encrypted-password-login-release.md)，不在协议契约中重复运维步骤。

## 登录页重入

`/portal/login` 先验证 Custom client/redirectUrl、可选 ssoReturn 或 OIDC oidcReturn 及其浏览器绑定，
再读取登录态；无安全续接请求时不探测根、不呈现凭据表单。检查不签发 Code、不延长根。
找回密码页面不经过该守卫，绑定手机号仍是可跳过的自助动作。

| 请求与会话结果                          | 页面行为                                       | 根 Cookie            |
| --------------------------------------- | ---------------------------------------------- | -------------------- |
| 缺少登录目标                            | 登录地址校验未通过。                           | 不处理。             |
| 请求、handle 或绑定永久无效             | 显示“登录请求已失效，请返回应用重新发起登录”。 | 不因请求无效清理。   |
| 请求有效、已有有效根                    | 自动继续原协议。                               | 保留。               |
| 请求有效、明确无根                      | 显示密码/短信表单。                            | 无需处理。           |
| 请求有效、根过期/撤销或主体明确不可访问 | 由服务端完成失效处理后允许登录。               | 按明确拒绝规则清理。 |
| Client Maintenance、状态未知或依赖故障  | 暂时不可用，仅手动重试。                       | 保留。               |

前端按互斥状态显示页面：

| 状态              | 显示与导航                                             |
| ----------------- | ------------------------------------------------------ |
| `checking`        | 首屏全页加载，不闪现表单。                             |
| `login`           | 显示凭据表单。                                         |
| `invalid_request` | 显示失效提示，不显示表单或提供固定跳转落点。           |
| `unavailable`     | 显示暂态提示和手动重试。                               |
| `continuing`      | 使用 `window.location.replace`，不把登录页留在后退栈。 |

一次检查超时 10 秒；重试开启完整新检查，旧请求迟到结果、已卸载页面或目标变化不能覆盖新状态。
没有自动轮询、forceLogin 绕过或额外跨标签页协调。

Custom 的服务器续接固定已接受地址和用途，普通允许列表编辑不改写它，类型变化要求重新授权。
OIDC 自有 continuation 保存原授权参数；guard 不消费它。
无根且允许首次登录时发放绑定续接的短期 `oidc_login_completion`，resume 校验其摘要后一次消费原续接并签发 Code。
已有有效根但请求要求 `prompt=login` 或未满足的 `max_age` 时，走原协议 `login_required`，
不再次展示表单；前端不解析或伪造新鲜认证要求。普通续接不额外要求 completion。

## 短信验证码冷却

所有验证码发送入口共用 `MobileService.sendCode`，按校验并去除首尾空格后的手机号共享固定 60 秒冷却；
登录、找回密码、绑定手机号及不同实例/IP/浏览器共用额度。普通业务短信 `sendMessage` 不属于验证码发送。
冷却始终启用，独立于验证码用途与生命周期，不增加环境开关。

手机号、人机验证等前置检查通过后，Redis 原子取得发送资格并同时开始计时，随后才调用供应商。
并发只允许一个请求取得资格；前置失败不占用，无法检查或占用资格时拒绝发送。
受限请求不延长冷却、不修改旧验证码；验证码成功消费也不解除冷却。
供应商失败、网络异常或超时都保留已占用冷却。

供应商等待上限为 10 秒，不自动重试；超时后的迟到成功不得保存验证码或继续成功处理。
取消本地等待不保证供应商没有发送或送达。

| 结果                           | HTTP 与页面                                                   |
| ------------------------------ | ------------------------------------------------------------- |
| 手机号冷却拒绝                 | HTTP 429、专用业务错误及 `Retry-After` 剩余秒数；恢复倒计时。 |
| 发送失败/超时，冷却仍可确认    | 同时提示发送失败与剩余倒计时。                                |
| Redis 不可用或无法确认剩余时间 | 暂时不可用；不虚构剩余时间。                                  |

SSO service 保留等待秒数；响应未给出剩余时间时不虚构倒计时。共享倒计时只接受短信冷却/发送失败业务码，
不能把 Gateway 的所有 429 都解释成手机号冷却。
刷新页面不会绕过后端限制，再次发送取得服务端剩余时间；三个页面都消费相同规则。

## 账号恢复与脱敏手机号

`GET /open/users/{username}/masked-mobile` 使用标准响应 envelope，业务数据严格为 `{ mobile: string | null }`；
不返回 username、name 等资料。不存在账号与未绑定手机号统一成功返回 null，页面统一提示“无法获取绑定手机号”，
阻止发码及继续重置。接口执行手机号脱敏、人机验证和限流；返回脱敏号码仍意味着部分手机号匿名披露，
不承诺完全消除账号枚举。

资料来源是已发布 Profile。Profile 缺失时再核对未删除身份记录，不按 Enable/Pause/Disable 过滤；
只有账号也不存在才返回 null，已有账号的缺失/损坏 Profile、数据库故障、人机验证失败仍是对应真实错误。
后续恢复会精确核对前端回传号码与当前绑定手机号的脱敏结果。

username 使用两层路径编码：内层 `encodeURIComponent` 并把点编码为 `%2E`，外层再编码为一个路径段。
Hono 解外层，参数解析解内层；避免 `.`、`..` 被浏览器折叠，字面 `%2E` 不与点混淆。
普通字母数字仍保持原文本。Cap 使用 `openUserInfoLookup` action，风控按 action/IP 计数，不随 URL 改变。
旧 `GET /open/users/userInfo` 已移除。

## 验证与发布边界

验证通道和证明范围见[架构验证归属](../../architecture/architecture-verification.md)；
用户名编码的 HTTP/service 测试不能代替真实 Gateway 特殊字符链路验证。
当前会话恢复见[统一维护手册](../../releases/unified-session-maintenance.md)。
恢复接口与跨实例短信冷却的首次切换说明见
[固定历史版本](https://github.com/cyy1998/shgas-iam/blob/48c2d6cc20e8a3675cbd1269eed2d5612141791d/docs/features/sso/authentication-and-recovery.md#验证与发布边界)。
