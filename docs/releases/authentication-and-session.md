# 登录与会话

Type: runbook
Status: Current
Last verified: 2026-10-25
Next review: 2026-11-25

按[通用约定](README.md#通用约定)确认环境。当前密码登录、OIDC、会话清理和 Snapshot 恢复分别操作；
日常配置更新不自动清空会话。旧代升级先查[独立迁移指引](README.md#一次性迁移与旧版本)。

## 密码登录配置

适用于当前 SM2/SM4 加密凭证配置或密钥配对更新。

| 位置         | 必须核对                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| API          | `IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID` 存在于 `IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON`，值为配对 SM2 私钥               |
| SSO 构建     | `UMI_APP_SSO_LOGIN_CREDENTIAL_KID` 与 API active kid 一致，`UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY` 为配对公钥            |
| 时间与防重放 | `IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS` 为毫秒，`IAM_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS` 为秒；逐副本核对配置和时钟     |
| Cap          | 核对 SSO 的 `UMI_APP_SSO_CAP_ENDPOINT`、`UMI_APP_SSO_CAP_SITE_KEY`、`UMI_APP_SSO_CAP_WASM_URL`、`UMI_APP_SSO_CAP_PAKO_URL` |

当前默认偏移 300000 ms、nonce TTL 360 s 尚未覆盖完整接受期，env 没有交叉校验。
需要完整防重放保证时，先解决并验证[时间窗口缺口](../features/sso/authentication-and-recovery.md#凭证时间窗口与防重放限制)；
只调大 TTL 或即时重复请求被拒绝都不足以证明缺口已解决。

1. 准备兼容的 API/SSO 构建与回退配置，关闭密码登录公共入口、直连和自动重试，排空在途认证。
2. 向全部 API 副本注入私钥映射、active kid 及时间配置，确认配置校验通过；active kid 缺少私钥必须启动失败。
3. 部署以匹配公钥/kid 构建的 SSO，更新 CDN 缓存并确认实际浏览器页面使用新 bundle。
4. 仅开放受控账号和入口检查下表；通过后关闭临时入口，确认配置一致，再恢复公共密码登录。

| 检查           | 完成标准                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| 实际密码路径   | 无有效 UserSession 的浏览器从合法授权目标进入，提交加密凭证，取得新根和 `global_session`，完成原授权续接 |
| 错误密码与 Cap | 错误密码进入失败计数；触发 Cap 时求解后携带 capToken 重试                                                |
| 无效凭证       | 未知 kid、解密/完整性失败、过期、已占用 nonce 和旧明文请求按认证契约拒绝                                 |
| 时间边界       | 隔离环境覆盖未来时间戳、nonce 到期后重放及接受期末端，确认完整接受期内的防重放要求                       |

失败时保持受影响登录关闭，修正 key/kid、时间问题或恢复配对 API/SSO 构建，刷新缓存后重验。
Redis 异常先恢复依赖；`login-credential-nonce:<digest>` 不能批量清空，仅可清理明确的演练测试 key。回退不恢复明文入口。

## OIDC 双入口配置

用于发布或调整内外网 OIDC 入口。API、Gateway、SSO 与接入应用的 origin/issuer 必须匹配：

- API 设置 `IAM_API_SSO_INTERNAL_ORIGIN`、`IAM_API_SSO_EXTERNAL_ORIGIN` 和 `IAM_API_OIDC_CURRENT_JWK_JSON`。
  origin 只允许 HTTP(S) origin，不含用户信息、非根路径、query 或 fragment；规范化后加 `/oidc` 得到 issuer。
  两个 origin 相同即同一 issuer，不同 issuer 共用签名 key。
- Gateway 保留 `/oidc` 路径并按可信 host 覆盖 `X-IAM-Entry-Network`；dev 核对含端口的 authority，prod 核对 host。
  API 不应被外部直连绕过。`IAM_API_OIDC_TRUST_PROXY` 只控制客户端 IP：true 时取 `X-Forwarded-For` 首项，false 或无头取连接地址。
- Client 选择 OIDC，登记 redirect/post-logout URI、scope 与 Public/Confidential 类型；Public 使用 PKCE S256，Confidential 使用 Basic 与 PKCE。
  Secret 通过[授权读取](../features/admin/client-sso-configuration.md)取得，不使用普通详情响应。

按[部署与发布](deployment.md)更新配对配置，再按[网关发布](apisix-gateway-release.md)更新路由。
公共入口保持关闭，仅开放受限验证；`/health`、`/oidc/health` 检查 Redis，`/ready` 检查 PostgreSQL/Redis，不能代替以下业务检查。

在每个受影响入口完成 Discovery、授权回调、Code 兑换、UserInfo 和取消/确认退出；接入应用验证 issuer、签名、audience、nonce 与 expiry。
检查错误 PKCE、Code 重放、错 issuer 拒绝，以及未知 host 拒绝和伪造入口头被覆盖。
变更 hostname 时用真实浏览器检查 Cookie 隔离和相对导航；同 host 的双端口不能证明域隔离。
检查失败时关闭受影响入口并恢复兼容配置，修复后重验；通过后再恢复公共流量。

## OIDC 签名密钥轮换

当前启动时载入 current 与可选 previous，二者都要求完整 RS256 RSA private JWK，kid 唯一非空；仅 current 签名，无热更新。
本流程停止旧 signer 并协调更新全部 API 副本，共用进程的其他入口也纳入维护窗口。

**先判断能否轮换：** 设 current 为 A、已有 previous 为 P、新 key 为 B。P 仍需用于接入应用验签或 IAM 退出 hint 时不能开始，
两槽无法容纳 P/A/B。普通 Token 到期不表示退出 hint 已退役；规则见[密钥兼容边界](../features/oidc/oidc-integration.md#签名密钥兼容边界)。

1. 准备唯一新 kid 的 B、对应公开 JWK 与回退配置，确认所有 API 副本及自动扩容模板。
   关闭 OIDC 授权、兑换、续接、退出及直连/重试入口，停止旧 API signer，排空在途请求。
   保留最后可能由 A 签名的时点上界，用于计算旧 Token 接受期。
2. 仅在 P 已可退役时，将 A 设为 `IAM_API_OIDC_PREVIOUS_JWK_JSON`、B 设为 current，启动全部目标副本。
3. 从受控管理路径逐副本检查配置、readiness、Discovery 和 JWKS，再检查两个实际 Gateway 入口。
   对照从密钥管理端取得的预期公开 JWK，比较完整 `kty/kid/alg/use/n/e` 集合；不得含私钥字段。
   受控直连副本按目标 issuer 发送入口头，Gateway 检查按真实 host，不覆盖入口头。不要仅反复访问负载均衡地址。
4. 将受控兑换分别送至各副本，确认实际签发的 Token 使用 B，接入应用完成签名和 claims 验证。
   逐接入应用刷新 JWKS，或等待其明确的缓存期限后实际验证 B；同时验证仍有效的 A Token 和 A 退出 hint。
5. 全部通过后恢复入口。以后移除 A 是另一次停流配置更新，必须同时满足普通 Token 与退出 hint 的退役条件。

只读端点检查示例（`IAM_OIDC_CHECK_ORIGIN` 是操作者提供的不含 `/oidc` 的实际 Gateway origin）：

```powershell
$oidcOrigin = $env:IAM_OIDC_CHECK_ORIGIN.TrimEnd('/')
Invoke-RestMethod -Uri "$oidcOrigin/oidc/.well-known/openid-configuration" -TimeoutSec 10 -ErrorAction Stop
Invoke-RestMethod -Uri "$oidcOrigin/oidc/jwks" -TimeoutSec 10 -ErrorAction Stop
```

失败时保持维护，核对本轮已实际签名的 key 集合。B 已签发 Token/hint 后，不能直接回退到丢弃 B 的配置。
若无第三个必须保留的 key，可按 A current、B previous 协调恢复并重新核验；否则先解决兼容集合问题，不能擅自移除所需 key。

## 选择会话维护任务

| 目标                                      | 操作                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| 查询、撤销指定用户/根/应用关系            | 使用[会话管理](../features/admin/session-management.md)，不做 namespace 全清 |
| 清空当前 namespace 中全部会话或协议 owner | 按下节 inventory、clear、verify；不能按 Client 筛选                          |
| Client 提交后 Snapshot 传播失败           | 使用定向 repair，不重放数据库写入                                            |
| Redis 备份恢复后的 Snapshot 修复          | 停流执行全量 repair 和独立 verify                                            |

## 会话清理

本操作使所选范围的会话或协议凭据失效。先确认 Redis 实例、DB、namespace 与 owner，使用与 runtime 完全一致的 namespace 字节，
包括末尾冒号。命令不解析 value：匹配前缀内的全部版本、坏记录、孤立索引和未过期记录均删除。

| Owner        | 清理范围                                                           |
| ------------ | ------------------------------------------------------------------ |
| `kernel`     | `<kernel-namespace>:unified:*`：UserSession、ClientSession 及索引  |
| `custom-sso` | `<custom-namespace>:custom-sso:*`：Code、Token、认证续接等协议状态 |
| `oidc`       | `<oidc-namespace>:oidc:*`：Code、Token、续接、退出确认等协议状态   |
| `all`        | 上述三个 owner，仍只操作指定 namespace                             |

不同前缀的旧布局和其他状态不在范围内；不增加任意 pattern，也不顺带清除 nonce、Subject Access、Facts、队列或 Snapshot。
使用 Worker 的显式 `IAM_WORKER_REDIS_*`；脚本默认读取 `apps/worker/.env`，已有进程环境优先。
清点和核验只需 SCAN，清理还需 UNLINK；连接按部署授权 AUTH/SELECT/CLIENT/QUIT。

1. 关闭受影响登录、协议和 Admin 会话入口及直连/重试，停止相关 reader/writer、后台及 one-shot 工作并排空。
   Client Maintenance 或等待 TTL 不能替代停流；`--writers-stopped --drained` 只是操作者声明。
2. 按同一范围依次运行下列独立进程；示例为全部 owner，单 owner 时将三个命令统一改为目标 owner：

   ```bash
   pnpm --filter @iam/worker session:clear:inventory -- --layout unified --owner all --kernel-namespace '<kernel>' --custom-namespace '<custom>' --oidc-namespace '<oidc>' --writers-stopped --drained
   pnpm --filter @iam/worker session:clear -- --layout unified --owner all --kernel-namespace '<kernel>' --custom-namespace '<custom>' --oidc-namespace '<oidc>' --writers-stopped --drained
   pnpm --filter @iam/worker session:clear:verify -- --layout unified --owner all --kernel-namespace '<kernel>' --custom-namespace '<custom>' --oidc-namespace '<oidc>' --writers-stopped --drained
   ```

3. clear 退出 0 且 `status=completed` 后，还须 verify 完整扫描、退出 0、matching 为零。
   此结果只证明目标范围清零；在重新开放 reader/writer 前完成核验，再检查受影响的新登录或协议流程并恢复入口。

退出 2 表示参数无效；退出 1、timeout、中断或结果未知时保持停流，用原范围重新 inventory，修复原因后 clear、verify。
跨 owner 不原子，失败可能已部分删除；不能用 matching 减 removed 推断残留，也不能恢复已消费 Code 或过期/撤销的登录状态。
总 deadline 默认五分钟，`--deadline-ms <1..300000>` 可收紧，未完成扫描不算通过。
IAM 清理不保证第三方本地会话或离线 ID Token 立即失效。

## Client Snapshot 修复

**定向修复**用于 Client 已提交但缓存传播失败，可在当前 runtime 下执行：

```bash
pnpm --filter @iam/worker client-snapshot:repair -- --client-code alpha
```

成功后通过正式入口确认当前 Client 状态/配置和凭据生效。repair 同时失效普通与敏感 payload，不重放 mutation、轮换 Secret 或撤销会话。
失败先恢复 Redis 等依赖，再重跑同一目标；传播失败前后业务写入是否已提交按[写入结果契约](../features/admin/admin-mutation-contract.md)判断。

**全量恢复**用于 Redis restore 后：关闭使用 Snapshot 的协议和管理入口，冻结 Client mutation 及所有 acquisition，排空在途请求和任务后执行：

```bash
pnpm --filter @iam/worker client-snapshot:repair -- --all --writers-stopped --drained
pnpm --filter @iam/worker client-snapshot:verify -- --all --writers-stopped --drained
```

repair 只处理 `client-snapshot:v1:{<clientCode>}` 下的 control、payload:client、payload:credential 三族，未知键族保留。
verify 须独立完整扫描、退出 0 且 matching=0，且发生在 reader 回源前。
随后受限开放，检查当前配置、Secret 认证及 Admin 配置写入后的双 reader 失效，并验证受影响协议；通过后恢复公共入口。
失败或未知时重新关闭并排空，修复后重做适用核验。定向 deadline 默认十秒，全量默认五分钟，均可收紧。

## 恢复边界

- 账号与 Subject Access 恢复使用[数据维护](data-maintenance.md)，不能通过清会话或手工写 Redis 把不确定 Barrier 变成 enabled。
- 精确会话撤销失败时仅重试原捕获集合；集合丢失重新查询发起操作，已终止的根不恢复。
- 作用后审计失败不回滚已生效动作，也不为补审计重放 mutation；按[写入结果契约](../features/admin/admin-mutation-contract.md)处理。
- Redis 实时登录态以服务端时间为准；主从时钟异常先处理时钟与 failover，不能靠续期或恢复登录态备份补偿。
- 入口开放失败或状态未知时，停止继续开放，关闭不确定入口并排空，完成该操作所需核验后再恢复。
